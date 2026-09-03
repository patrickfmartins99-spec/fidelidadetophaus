import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calcularAnaliseFrequencia,
    calcularRelatorioDiario,
    dataParaChave,
    diasDeVisitaDoCliente,
    parseDataHistorica,
    visitasDoCliente
} from '../relatorios-core.js';

const referencia = new Date(Date.UTC(2026, 8, 3));

test('interpreta datas antigas sem depender do fuso horário', () => {
    assert.equal(dataParaChave(parseDataHistorica('03/09/2026 às 14:35')), '2026-09-03');
    assert.equal(dataParaChave(parseDataHistorica('2026-09-03')), '2026-09-03');
    assert.equal(parseDataHistorica('31/02/2026'), null);
    assert.equal(parseDataHistorica('2026-02-31'), null);
    assert.equal(dataParaChave(parseDataHistorica(Date.parse('2026-09-04T01:00:00Z'))), '2026-09-03');
});

test('reconstrói visitas atuais e visitas consumidas em resgates', () => {
    const cliente = {
        historico: ['03/09/2026 às 12:00'],
        historicoResgates: [{
            dataResgate: '03/09/2026 às 14:00',
            datas: ['01/09/2026 às 12:00', '02/09/2026 às 12:00', '02/09/2026 às 13:00']
        }]
    };
    assert.equal(visitasDoCliente(cliente).length, 4);
    assert.equal(diasDeVisitaDoCliente(cliente).length, 3);
});

test('calcula relatório diário com clientes únicos e tipos de prêmio separados', () => {
    const clientes = [
        {
            cpf: '1', nome: 'Cliente A', dataCadastro: '03/09/2026',
            historico: ['03/09/2026 às 12:00', '03/09/2026 às 13:00'],
            historicoResgates: [{ dataResgate: '03/09/2026 às 14:00', datas: [] }]
        },
        {
            cpf: '2', nome: 'Cliente B', dataCadastro: '02/09/2026',
            historico: ['03/09/2026 às 12:00'],
            historicoAniversarios: [{ dataResgate: '03/09/2026 às 14:10' }]
        },
        {
            cpf: '3', nome: 'Arquivado', arquivado: true, dataCadastro: '03/09/2026',
            historico: ['03/09/2026 às 12:00']
        }
    ];
    assert.deepEqual(calcularRelatorioDiario(clientes, '2026-09-03'), {
        novos: 1,
        visitantes: 2,
        almocos: 3,
        resgatesFidelidade: 1,
        resgatesAniversario: 1,
        resgatesTotal: 2
    });
});

test('segmenta frequência e compara períodos de 30 dias', () => {
    const datas = quantidade => Array.from({ length: quantidade }, (_, indice) => {
        const data = new Date(referencia.getTime() - indice * 86400000);
        return `${String(data.getUTCDate()).padStart(2, '0')}/${String(data.getUTCMonth() + 1).padStart(2, '0')}/${data.getUTCFullYear()} às 12:00`;
    });
    const clientes = [
        { cpf: '1', nome: 'Frequente', dataCadastro: '01/01/2025', historico: datas(8) },
        { cpf: '2', nome: 'Regular', dataCadastro: '01/01/2025', historico: datas(4) },
        { cpf: '3', nome: 'Ocasional', dataCadastro: '01/01/2025', historico: datas(2) },
        { cpf: '4', nome: 'Novo', dataCadastro: '01/09/2026', historico: datas(1) },
        { cpf: '5', nome: 'Inativo', dataCadastro: '01/01/2025', historico: ['01/01/2026 às 12:00'] }
    ];
    const analise = calcularAnaliseFrequencia(clientes, referencia);
    assert.deepEqual(analise.segmentos, { Frequente: 1, Regular: 1, Ocasional: 1, Inativo: 1, Novo: 1 });
    assert.equal(analise.almocos30, 15);
    assert.equal(analise.visitantes30, 4);
    assert.equal(analise.clientes[0].classificacao, 'Frequente');
});

