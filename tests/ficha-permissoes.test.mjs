import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const codigo = (await readFile(new URL('../clientes.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/m, '');

function preparar(cargo) {
    const elementos = new Map();
    const elemento = id => {
        if (!elementos.has(id)) elementos.set(id, {
            innerHTML: '', textContent: '', classList: { add() {}, remove() {}, toggle() {} }
        });
        return elementos.get(id);
    };
    let impresso = false;
    let aviso = '';
    const window = {
        cargoLogado: cargo, usuarioLogado: { email: 'teste@tophaus.com.br' },
        permissoesLogado: { dashboard: true, auditoria: true, clientes: true },
        clientesMap: { '11122233344': { cpf: '11122233344', nome: 'Cliente Teste', almocos: 0 } },
        obterUnidade: () => 'navegantes',
        mostrarToast: texto => { aviso = texto; },
        escapeHTML: texto => texto,
        nomeExibicao: texto => texto,
        formatarCPF: texto => texto,
        formatarTel: texto => texto,
        addEventListener() {},
        print: () => { impresso = true; }
    };
    const extrato = {
        alertas: [], eventos: [], saldo: 0, resgatesDeclarados: 0,
        totalContabilizado: 0, totalDocumentado: 0, cadastro: '01/01/2026',
        origemCadastro: 'Caixa', ultimaVisita: '', visitasAposUltimoResgate: null,
        observacao: 'Somente registros digitais.', arquivado: false
    };
    vm.runInNewContext(codigo, {
        window, document: { getElementById: elemento },
        montarExtratoCliente: () => extrato, filtrarLogsCliente: () => [],
        console, setTimeout, clearTimeout, Date, Promise, fetch() { throw new Error('não deve buscar'); }
    });
    return { window, elemento, get impresso() { return impresso; }, get aviso() { return aviso; } };
}

test('caixa com permissão personalizada de painel não abre ficha nem extrato', async () => {
    const app = preparar('caixa');
    app.window.abrirFichaCliente('11122233344');
    app.window.imprimirExtratoCliente();
    await app.window.solicitarAuditoriaCliente();
    assert.equal(app.aviso, 'Acesso não autorizado.');
    assert.equal(app.impresso, false);
    assert.equal(app.elemento('lista-historico').innerHTML, '');
});

for (const cargo of ['admin', 'gerente']) {
    test(`${cargo} pode abrir a ficha com permissão de painel`, () => {
        const app = preparar(cargo);
        app.window.abrirFichaCliente('11122233344');
        assert.match(app.elemento('lista-historico').innerHTML, /Dados cadastrais/);
    });
}
