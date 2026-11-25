import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const codigo = await readFile(new URL('../marketing.js', import.meta.url), 'utf8');

function criarCenario() {
  const elementos = new Map();
  for (const id of ['area-fila-envio', 'btn-limpar-fila', 'mkt-fila-resumo', 'mkt-fila-mais', 'area-agendamentos', 'area-mensagens-custom']) {
    let html = '';
    const elemento = {
      id,
      escritas: 0,
      classList: { add() {}, remove() {}, toggle() {} },
      set innerHTML(valor) { html = valor; this.escritas++; },
      get innerHTML() { return html; },
      contains: () => true
    };
    elementos.set(id, elemento);
  }

  const consultas = [];
  const listeners = [];
  let proximaPagina = [];
  const janela = {
    db: {},
    obterCaminhoUnidade: caminho => `lojas/navegantes/${caminho}`,
    firebaseRef: (_db, caminho) => ({ caminho }),
    firebaseOrderByChild: campo => ({ ordenar: campo }),
    firebaseLimitToLast: quantidade => ({ limite: quantidade }),
    firebaseEndBefore: (valor, chave) => ({ antes: [valor, chave] }),
    firebaseQuery: (...partes) => { consultas.push(partes); return partes; },
    firebaseOnValue: (_consulta, sucesso, falha) => {
      const listener = { sucesso, falha, cancelado: false };
      listeners.push(listener);
      return () => { listener.cancelado = true; };
    },
    firebaseGet: async () => snapshot(proximaPagina),
    escapeHTML: valor => String(valor ?? ''),
    formatarTel: valor => String(valor ?? ''),
    mostrarToast() {}
  };
  const contexto = {
    window: janela,
    document: { getElementById: id => elementos.get(id) || null },
    console,
    Date,
    Map
  };
  vm.runInNewContext(codigo, contexto);
  return { janela, elementos, consultas, listeners, definirPagina: pagina => { proximaPagina = pagina; } };
}

function snapshot(mensagens) {
  return {
    forEach(callback) {
      for (const mensagem of mensagens) callback({ key: mensagem.id, val: () => mensagem });
    }
  };
}

function mensagens(inicio, fim) {
  return Array.from({ length: fim - inicio }, (_, indice) => {
    const numero = inicio + indice;
    return { id: `m-${String(numero).padStart(4, '0')}`, timestamp: numero, status: 'sucesso', telefone: '47999999999', texto: `Mensagem ${numero}` };
  });
}

test('a central consulta somente os 40 registros mais recentes e renderiza em uma operação', () => {
  const cenario = criarCenario();
  cenario.janela.iniciarListenerFila();
  assert.equal(cenario.consultas[0][0].caminho, 'lojas/navegantes/fila_mensagens');
  assert.equal(cenario.consultas[0][1].ordenar, 'timestamp');
  assert.equal(cenario.consultas[0][2].limite, 40);

  const area = cenario.elementos.get('area-fila-envio');
  const antes = area.escritas;
  cenario.listeners[0].sucesso(snapshot(mensagens(100, 140)));
  assert.equal(area.escritas - antes, 1);
  assert.match(area.innerHTML, /Mensagem 139/);
  assert.match(area.innerHTML, /Mensagem 100/);
  assert.doesNotMatch(area.innerHTML, /Mensagem 99</);
});

test('mensagens anteriores são paginadas sem reler o histórico inteiro', async () => {
  const cenario = criarCenario();
  cenario.janela.iniciarListenerFila();
  cenario.listeners[0].sucesso(snapshot(mensagens(100, 140)));
  cenario.definirPagina(mensagens(60, 100));
  await cenario.janela.carregarMaisMensagensFila();

  assert.deepEqual(Array.from(cenario.consultas[1][2].antes), [100, 'm-0100']);
  assert.equal(cenario.consultas[1][3].limite, 40);
  const area = cenario.elementos.get('area-fila-envio');
  assert.match(area.innerHTML, /Mensagem 60/);
  assert.equal((area.innerHTML.match(/data-fila-acao=/g) || []).length, 0);
  assert.equal(cenario.elementos.get('mkt-fila-resumo').textContent, '80 registro(s) carregado(s) desta unidade');
});

test('fechar a central cancela o listener e descarta respostas antigas', () => {
  const cenario = criarCenario();
  cenario.janela.iniciarListenerFila();
  cenario.listeners[0].sucesso(snapshot(mensagens(100, 140)));
  const area = cenario.elementos.get('area-fila-envio');
  const antes = area.escritas;
  cenario.janela.pararListenerFila();
  assert.equal(cenario.listeners[0].cancelado, true);
  cenario.listeners[0].sucesso(snapshot(mensagens(140, 180)));
  assert.equal(area.escritas, antes);
});

test('muitas campanhas são renderizadas sem reconstruir o DOM a cada cartão', () => {
  const cenario = criarCenario();
  cenario.janela.msgsMarketing = {
    agendadas: Object.fromEntries(Array.from({ length: 200 }, (_, indice) => [
      `campanha-${indice}`,
      { id: `campanha-${indice}`, titulo: `Campanha ${indice}`, texto: 'Mensagem', data: '2026-12-01', tipo: 'unica', status: 'ativa' }
    ])),
    personalizadas: Array.from({ length: 30 }, (_, indice) => ({ titulo: `Modelo ${indice}`, texto: 'Mensagem' }))
  };
  cenario.janela.renderizarMensagensCustomizadas();
  assert.equal(cenario.elementos.get('area-agendamentos').escritas, 1);
  assert.equal(cenario.elementos.get('area-mensagens-custom').escritas, 1);
  assert.match(cenario.elementos.get('area-agendamentos').innerHTML, /Campanha 199/);
});

test('reenvio manual atualiza status e horário juntos sem manter cópia antiga', async () => {
  const cenario = criarCenario();
  cenario.janela.iniciarListenerFila();
  cenario.listeners[0].sucesso(snapshot(mensagens(100, 140)));
  cenario.definirPagina(mensagens(60, 100).map(item => item.id === 'm-0060' ? { ...item, status: 'erro' } : item));
  await cenario.janela.carregarMaisMensagensFila();

  const gravacoes = [];
  cenario.janela.firebaseUpdate = async (referencia, dados) => { gravacoes.push({ referencia, dados }); };
  await cenario.janela.reenviarMensagemFila('m-0060');
  assert.equal(gravacoes.length, 1);
  assert.equal(gravacoes[0].referencia.caminho, 'lojas/navegantes/fila_mensagens/m-0060');
  assert.equal(gravacoes[0].dados.status, 'pendente');
  assert.equal(typeof gravacoes[0].dados.timestamp, 'number');
  assert.doesNotMatch(cenario.elementos.get('area-fila-envio').innerHTML, /Mensagem 60</);
});
