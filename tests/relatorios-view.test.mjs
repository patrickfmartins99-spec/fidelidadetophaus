import assert from 'node:assert/strict';
import test from 'node:test';

const criarElemento = () => ({
    value: '', textContent: '', innerHTML: '', dataset: {},
    style: { setProperty() {} },
    setAttribute() {}
});
const ids = [
    'aba-relatorios', 'relatorio-data', 'relatorio-grafico', 'relatorio-grafico-periodo',
    'relatorio-grafico-legenda', 'relatorio-periodo-legenda', 'relatorio-resumo-legenda',
    'relatorio-perfil-legenda', 'relatorio-tabela-legenda', 'relatorio-perfil-base',
    'relatorio-dia-legenda', 'relatorio-variacao', 'relatorio-comparacao',
    'relatorio-anterior-almocos', 'relatorio-segmentos', 'relatorio-tabela-clientes',
    'relatorio-tabela-contagem', 'relatorio-busca'
];
const elementos = Object.fromEntries(ids.map(id => [id, criarElemento()]));
globalThis.document = {
    getElementById: id => elementos[id] || null,
    querySelector: () => null
};
globalThis.window = {
    cargoLogado: 'admin',
    obterUnidade: () => 'navegantes',
    clientesArray: [{
        cpf: '12345678901', nome: 'Cliente de teste', dataCadastro: '01/01/2025',
        historico: ['03/09/2026 às 12:00']
    }]
};
await import('../relatorios.js');

test('mostra períodos exatos, ausência de base anterior e 14 ou 30 dias no gráfico', () => {
    elementos['relatorio-data'].value = '2026-09-03';
    elementos['relatorio-grafico-periodo'].value = '14';
    window.atualizarRelatorios();

    assert.match(elementos['relatorio-periodo-legenda'].textContent, /05\/08\/2026 a 03\/09\/2026/);
    assert.match(elementos['relatorio-resumo-legenda'].textContent, /06\/07\/2026 a 04\/08\/2026/);
    assert.equal(elementos['relatorio-comparacao'].textContent, 'Sem base anterior');
    assert.equal((elementos['relatorio-grafico'].innerHTML.match(/report-chart-column/g) || []).length, 14);
    assert.match(elementos['relatorio-tabela-clientes'].innerHTML, /data-report-index="0"/);
    assert.doesNotMatch(elementos['relatorio-tabela-clientes'].innerHTML, /12345678901/);

    elementos['relatorio-grafico-periodo'].value = '30';
    window.atualizarRelatorios();
    assert.equal((elementos['relatorio-grafico'].innerHTML.match(/report-chart-column/g) || []).length, 30);
});

test('ao selecionar hoje, a comparação usa apenas dias encerrados', () => {
    const hoje = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const mapa = Object.fromEntries(hoje.map(parte => [parte.type, parte.value]));
    elementos['relatorio-data'].value = `${mapa.year}-${mapa.month}-${mapa.day}`;
    window.atualizarRelatorios();

    assert.match(elementos['relatorio-dia-legenda'].textContent, /dia em andamento/);
    assert.match(elementos['relatorio-periodo-legenda'].textContent, /Hoje aparece somente no resumo do dia acima/);
    assert.notEqual(elementos['relatorio-grafico-legenda'].textContent.slice(-11, -1), `${mapa.day}/${mapa.month}/${mapa.year}`);
});
