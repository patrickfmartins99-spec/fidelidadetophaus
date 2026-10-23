import { parseDataHistorica, dataParaChave } from './relatorios-core.js';

const lista = (valor) => Array.isArray(valor) ? valor : (valor && typeof valor === 'object' ? Object.values(valor) : []);
const numero = (valor) => Number.isFinite(Number(valor)) ? Number(valor) : 0;
const dataEvento = (valor) => {
    if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(valor)) {
        const instante = Date.parse(valor);
        if (Number.isFinite(instante)) return instante;
    }
    const dia = parseDataHistorica(valor);
    if (!dia) return null;
    const hora = typeof valor === 'string' ? valor.match(/(?:às\s*|\s)(\d{1,2}):(\d{2})/) : null;
    return dia.getTime() + (hora ? (Number(hora[1]) * 60 + Number(hora[2])) * 60000 : 0);
};

export const filtrarLogsCliente = (logs, cpf) => {
    const documento = String(cpf || '').replace(/\D/g, '');
    if (documento.length !== 11) return [];
    return lista(logs).filter(log => {
        if (!log || typeof log !== 'object') return false;
        if (String(log.clienteCpf || '').replace(/\D/g, '') === documento) return true;
        // Logs legados às vezes incluem só o CPF no texto. Nome sozinho não
        // identifica um cliente com segurança (homônimos).
        return String(log.detalhes || '').replace(/\D/g, '').includes(documento);
    });
};

export const montarExtratoCliente = (cliente = {}, logs = []) => {
    const abertos = lista(cliente.historico);
    const resgates = lista(cliente.historicoResgates);
    const aniversarios = lista(cliente.historicoAniversarios);
    const atrasados = lista(cliente.historicoAtrasados);
    const conquistas = lista(cliente.historicoConquistas);
    const eventos = [];
    const alertas = [];
    let consumidosDocumentados = 0;

    const adicionar = (tipo, data, descricao, extra = {}) => {
        eventos.push({ tipo, data: String(data || 'Data não informada'), descricao, instante: dataEvento(data), ...extra });
    };

    if (cliente.dataCadastro) adicionar('cadastro', cliente.dataCadastro, `Cadastro registrado${cliente.origemCadastro ? ` via ${cliente.origemCadastro}` : ''}.`);
    abertos.forEach((registro, indice) => {
        adicionar('almoco', registro, 'Almoço no saldo atual (+1).', { indice, saldo: true });
    });
    resgates.forEach((resgate, indice) => {
        const datas = lista(resgate?.datas);
        consumidosDocumentados += datas.length;
        datas.forEach(registro => adicionar('almoco', registro, `Almoço usado no resgate #${indice + 1} (+1).`, { resgate: indice + 1 }));
        adicionar('resgate', resgate?.dataResgate, `Resgate de fidelidade #${indice + 1} (−10).`, {
            protocolo: resgate?.protocolo || '', datasConsumidas: datas
        });
        if (datas.length !== 10) alertas.push(`O resgate #${indice + 1} contém ${datas.length} data(s) de almoço; eram esperadas 10.`);
    });
    aniversarios.forEach((resgate, indice) => adicionar('aniversario', resgate?.dataResgate,
        `Benefício de aniversário #${indice + 1} (não consome almoços).`, { protocolo: resgate?.protocolo || '' }));
    conquistas.forEach((data, indice) => adicionar('conquista', data,
        `Marco de 10 almoços #${indice + 1} (não adiciona crédito).`));
    atrasados.forEach(lancamento => {
        const registro = new Date(lancamento?.dataRegistro || '');
        const data = !Number.isNaN(registro.getTime())
            ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(registro)
            : lancamento?.dataAlmoco;
        adicionar('ajuste', data, `Lançamento retroativo/extra de ${numero(lancamento?.quantidade)} almoço(s) referente a ${lancamento?.dataAlmoco || 'data não informada'}; já incluído nos almoços acima.`, {
            responsavel: lancamento?.responsavel || lancamento?.operador_caixa || ''
        });
    });
    filtrarLogsCliente(logs, cliente.cpf).forEach(log => adicionar('log', log.dataHora || log.timestamp,
        `${log.acao || log.tipo || 'Ação'}: ${log.detalhes || 'Sem detalhes'}`, { usuario: log.usuario || '' }));

    const saldo = numero(cliente.almocos);
    const resgatesDeclarados = numero(cliente.premiosResgatados);
    const totalContabilizado = saldo + resgatesDeclarados * 10;
    const totalDocumentado = abertos.length + consumidosDocumentados;
    const ultimoResgateInstante = Math.max(-Infinity, ...resgates.map(item => dataEvento(item?.dataResgate) ?? -Infinity));
    const visitasAposUltimoResgate = Number.isFinite(ultimoResgateInstante)
        ? abertos.filter(item => (dataEvento(item) ?? -Infinity) > ultimoResgateInstante).length
        : null;
    if (saldo !== abertos.length) alertas.push(`Saldo de ${saldo} almoço(s), mas ${abertos.length} data(s) no histórico em aberto.`);
    if (resgatesDeclarados !== resgates.length) alertas.push(`${resgatesDeclarados} resgate(s) no contador, mas ${resgates.length} registro(s) detalhado(s).`);
    if (saldo < 0 || !Number.isInteger(saldo) || resgatesDeclarados < 0 || !Number.isInteger(resgatesDeclarados)) {
        alertas.push('Um dos contadores está fora da faixa esperada.');
    }
    if (!cliente.dataCadastro) alertas.push('Data de cadastro não informada.');
    if (abertos.some(item => !parseDataHistorica(item)) || resgates.some(item => lista(item?.datas).some(data => !parseDataHistorica(data)))) {
        alertas.push('Há datas de almoço inválidas ou não reconhecidas.');
    }

    eventos.sort((a, b) => (b.instante ?? -Infinity) - (a.instante ?? -Infinity) ||
        ({ resgate: 0, aniversario: 1, conquista: 2, ajuste: 3, almoco: 4, cadastro: 5, log: 6 }[a.tipo] -
         { resgate: 0, aniversario: 1, conquista: 2, ajuste: 3, almoco: 4, cadastro: 5, log: 6 }[b.tipo]));

    const datasVisita = eventos.filter(evento => evento.tipo === 'almoco' && evento.instante !== null);
    return {
        nome: cliente.nome || 'Cliente sem nome', cpf: String(cliente.cpf || ''),
        cadastro: cliente.dataCadastro || 'Não informado', origemCadastro: cliente.origemCadastro || 'Não informada',
        arquivado: !!cliente.arquivado, saldo, resgatesDeclarados, resgatesDocumentados: resgates.length,
        aniversarios: aniversarios.length, totalContabilizado, totalDocumentado,
        abertosDocumentados: abertos.length, consumidosDocumentados,
        visitasAposUltimoResgate,
        ultimaVisita: datasVisita.length ? dataParaChave(parseDataHistorica(datasVisita[0].data)) : '',
        atrasados: atrasados.length, alertas, eventos,
        // Uma visita física sem registro não pode ser provada pela base digital.
        observacao: 'Este extrato confere registros digitais da unidade. Almoços não lançados exigem comprovantes externos; logs antigos sem CPF não são atribuídos automaticamente.'
    };
};
