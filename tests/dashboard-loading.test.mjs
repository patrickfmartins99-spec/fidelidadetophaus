import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../dashboard.js', import.meta.url), 'utf8');
const flush = async () => { for(let i=0;i<15;i++) await Promise.resolve(); };

function harness(unidade = 'picarras') {
    const elementos = new Map();
    const el = id => {
        if (!elementos.has(id)) {
            const classes = new Set(['hidden']);
            elementos.set(id,{ classList: { toggle(c,on){ if(on) classes.add(c); else classes.delete(c); }, contains:c=>classes.has(c), add:c=>classes.add(c), remove:c=>classes.delete(c) }, setAttribute(){}, textContent:'', inert:false });
        }
        return elementos.get(id);
    };
    const listeners = new Map(), timers = new Map();
    const storage = { removeItem(){},getItem(){return null;} };
    const user = {uid:'teste'};
    const w = { usuarioLogado:user, obterUnidade:()=>unidade, obterCaminhoUnidade:p=>`lojas/${unidade}/${p}`,
        firebaseRef:(_,p)=>p, firebaseOnValue:(p,cb,err)=>{listeners.set(p,{cb,err}); return ()=>{};},
        firebaseGet:async()=>({val:()=>({a:{nome:'Cliente de teste'}})}),
        addEventListener(){}, mostrarToast(){}, db:{} };
    const context = vm.createContext({window:w,document:{getElementById:el,addEventListener(){}},localStorage:storage,sessionStorage:storage,
        console:{error(){},warn(){}},setTimeout:(fn,ms)=>{const id={};timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
    vm.runInContext(source,context);
    w.atualizarIndicadores=()=>{}; w.calcularNotificacoesPainel=()=>{}; w.filtrarLista=()=>{};
    // O diagnóstico nunca normaliza nem grava cadastros.
    w.normalizarNomesDaUnidade=()=>{};
    return {w,el,listeners,timers,clientes:`lojas/${unidade}/clientes`,emit:(path,value)=>listeners.get(path).cb({val:()=>value})};
}

for(const unidade of ['picarras','navegantes']) test(`${unidade}: só exibe painel após conexão e primeiro snapshot`,()=>{
    const h=harness(unidade);h.w.iniciarListenersProtegidos();
    assert.equal(h.el('painel-conteudo').inert,true);
    h.emit('.info/connected',true);assert.equal(h.el('painel-conteudo').inert,true);
    h.emit(h.clientes,{a:{nome:'Teste'}});
    assert.equal(h.el('painel-conteudo').inert,false);assert.equal(h.w.clientesArray.length,1);
});

test('silêncio do banco vira erro recuperável, não painel zerado',()=>{
    const h=harness();h.w.iniciarListenersProtegidos();
    [...h.timers.values()].find(t=>t.ms===15000).fn();
    assert.equal(h.el('painel-conteudo').inert,true);
    assert.match(h.el('painel-status-dados-texto').textContent,/não significa que os cadastros foram apagados/);
    assert.equal(h.el('painel-reconectar').classList.contains('hidden'),false);
});

test('negação de acesso mantém painel bloqueado mesmo com conexão ativa',()=>{
    const h=harness();h.w.iniciarListenersProtegidos();h.listeners.get(h.clientes).err({code:'PERMISSION_DENIED'});
    h.emit('.info/connected',true);h.emit(h.clientes,{a:{}});
    assert.equal(h.el('painel-conteudo').inert,true);assert.match(h.el('painel-status-dados-texto').textContent,/acessar os dados/);
});

test('base realmente vazia só aparece após resposta válida',()=>{
    const h=harness();h.w.iniciarListenersProtegidos();h.emit('.info/connected',true);h.emit(h.clientes,null);
    assert.equal(h.el('painel-conteudo').inert,false);assert.equal(h.w.clientesArray.length,0);
});

test('snapshot inválido não substitui dados válidos por vazio',()=>{
    const h=harness();h.w.iniciarListenersProtegidos();h.emit('.info/connected',true);h.emit(h.clientes,{a:{nome:'Teste'}});
    h.emit(h.clientes,'invalido');assert.equal(h.w.clientesArray.length,1);assert.equal(h.el('painel-conteudo').inert,true);
});

test('desconexão bloqueia operações sem zerar os dados já lidos',()=>{
    const h=harness();h.w.iniciarListenersProtegidos();h.emit('.info/connected',true);h.emit(h.clientes,{a:{}});
    h.emit('.info/connected',false);assert.equal(h.el('painel-conteudo').inert,true);assert.equal(h.w.clientesArray.length,1);
    h.emit('.info/connected',true);assert.equal(h.el('painel-conteudo').inert,false);
});

test('logout e reconexão ignoram callbacks antigos',()=>{
    const h=harness();h.w.iniciarListenersProtegidos();const antigo=h.listeners.get(h.clientes);
    h.w.reconectarDadosPainel();antigo.cb({val:()=>({errado:{}})});
    assert.equal(h.w.clientesArray.length,0);assert.equal(h.el('painel-conteudo').inert,true);
    h.w.pararListenersProtegidos();h.w.usuarioLogado=null;h.emit(h.clientes,{errado:{}});
    assert.equal(h.w.clientesArray.length,0);
});

test('leitura pontual travada libera estado para nova tentativa',async()=>{
    const h=harness();h.w.iniciarListenersProtegidos();h.w.firebaseGet=()=>new Promise(()=>{});
    const p=h.w.sincronizarClientesAgora();await flush();[...h.timers.values()].find(t=>t.ms===12000).fn();
    assert.equal(await p,false);assert.equal(h.w.sincronizacaoClientesEmAndamento,false);assert.equal(h.el('painel-conteudo').inert,true);
});

test('resposta de leitura anterior ao logout não restaura dados',async()=>{
    const h=harness();h.w.iniciarListenersProtegidos();let resolve;
    h.w.firebaseGet=()=>new Promise(r=>{resolve=r;});const p=h.w.sincronizarClientesAgora();
    h.w.pararListenersProtegidos();h.w.usuarioLogado=null;resolve({val:()=>({antigo:{}})});
    assert.equal(await p,false);assert.equal(h.w.clientesArray.length,0);
});

test('CSP permite apenas endpoint de long polling necessário e mantém demais proteções',async()=>{
    const toml=await readFile(new URL('../netlify.toml',import.meta.url),'utf8');
    const csp=toml.match(/Content-Security-Policy = "([^"]+)"/)[1];
    assert.match(csp,/script-src[^;]+https:\/\/\*\.firebaseio\.com\/\.lp;/);
    assert.match(csp,/frame-src 'self' https:\/\/\*\.firebaseio\.com\/\.lp;/);
    assert.match(csp,/frame-ancestors 'none'/);assert.match(csp,/object-src 'none'/);
    assert.doesNotMatch(csp,/unsafe-eval|script-src[^;]+ https:;/);
});
