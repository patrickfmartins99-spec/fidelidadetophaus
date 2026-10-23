import test from 'node:test';
import assert from 'node:assert/strict';
import { montarExtratoCliente, filtrarLogsCliente } from '../cliente-extrato-core.js';

const criarCliente = (alteracoes = {}) => ({
    nome: 'Cliente Teste', cpf: '11122233344', dataCadastro: '01/01/2026',
    almocos: 3, premiosResgatados: 2,
    historico: ['20/10/2026 às 12:00', '21/10/2026 às 12:00', '22/10/2026 às 12:00'],
    historicoResgates: [
        { dataResgate: '10/02/2026 às 13:00', protocolo: 'NAV-1', datas: Array(10).fill('01/02/2026 às 12:00') },
        { dataResgate: '10/09/2026 às 13:00', protocolo: 'NAV-2', datas: Array(10).fill('01/09/2026 às 12:00') }
    ],
    ...alteracoes
});

test('extrato reconcilia saldo, 20 almoços consumidos e total 23 sem duplicar lançamentos retroativos', () => {
    const extrato = montarExtratoCliente(criarCliente({ historicoAtrasados: [
        { dataRegistro: '2026-10-23T13:00:00.000Z', dataAlmoco: '2026-10-20', quantidade: 1 }
    ] }));
    assert.equal(extrato.saldo, 3);
    assert.equal(extrato.totalContabilizado, 23);
    assert.equal(extrato.totalDocumentado, 23);
    assert.equal(extrato.consumidosDocumentados, 20);
    assert.equal(extrato.visitasAposUltimoResgate, 3);
    assert.equal(extrato.alertas.length, 0);
    assert.equal(extrato.eventos.filter(evento => evento.tipo === 'almoco').length, 23);
    assert.equal(extrato.eventos.filter(evento => evento.tipo === 'ajuste').length, 1);
});

test('extrato sinaliza contador divergente e resgate sem dez comprovantes digitais', () => {
    const cliente = criarCliente({ almocos: 13, premiosResgatados: 3 });
    cliente.historicoResgates[0].datas = cliente.historicoResgates[0].datas.slice(0, 9);
    const extrato = montarExtratoCliente(cliente);
    assert.equal(extrato.totalContabilizado, 43);
    assert.equal(extrato.totalDocumentado, 22);
    assert.equal(extrato.alertas.length, 3);
});

test('logs são vinculados por CPF exato, nunca apenas por nome', () => {
    const logs = [
        { clienteCpf: '111.222.333-44', tipo: 'Almoço' },
        { detalhes: 'CPF 111.222.333-44 resgatou' },
        { clienteCpf: '00000000000', detalhes: 'Cliente Teste' },
        { detalhes: 'Cliente Teste fez um almoço' }
    ];
    assert.equal(filtrarLogsCliente(logs, '11122233344').length, 2);
});

test('resgate de aniversário não consome créditos', () => {
    const extrato = montarExtratoCliente(criarCliente({ historicoAniversarios: [{ dataResgate: '23/10/2026 às 12:00' }] }));
    assert.equal(extrato.totalContabilizado, 23);
    assert.equal(extrato.eventos.filter(evento => evento.tipo === 'aniversario').length, 1);
});
