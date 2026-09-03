const DIA_MS = 86400000;
const FUSO_NEGOCIO = 'America/Sao_Paulo';

const inicioDoDiaUtc = (data) => new Date(Date.UTC(
    data.getUTCFullYear(),
    data.getUTCMonth(),
    data.getUTCDate()
));

export const dataParaChave = (data) => {
    if (!(data instanceof Date) || Number.isNaN(data.getTime())) return '';
    return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}-${String(data.getUTCDate()).padStart(2, '0')}`;
};

export const parseDataHistorica = (valor) => {
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) return inicioDoDiaUtc(valor);
    if (typeof valor === 'number' && Number.isFinite(valor)) {
        const partes = new Intl.DateTimeFormat('en-CA', {
            timeZone: FUSO_NEGOCIO, year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date(valor));
        const mapa = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
        return new Date(Date.UTC(Number(mapa.year), Number(mapa.month) - 1, Number(mapa.day)));
    }
    if (typeof valor !== 'string') return null;

    const br = valor.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (br) {
        const dia = Number(br[1]);
        const mes = Number(br[2]);
        const ano = Number(br[3]);
        const data = new Date(Date.UTC(ano, mes - 1, dia));
        if (data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia) return data;
        return null;
    }

    const iso = valor.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (!iso) return null;
    const ano = Number(iso[1]);
    const mes = Number(iso[2]);
    const dia = Number(iso[3]);
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia ? data : null;
};

const lista = (valor) => Array.isArray(valor) ? valor : (valor && typeof valor === 'object' ? Object.values(valor) : []);

export const visitasDoCliente = (cliente = {}) => {
    const registros = [...lista(cliente.historico)];
    lista(cliente.historicoResgates).forEach(resgate => registros.push(...lista(resgate?.datas)));

    return registros
        .map(parseDataHistorica)
        .filter(Boolean)
        .sort((a, b) => a - b);
};

export const diasDeVisitaDoCliente = (cliente = {}) => {
    const unicos = new Map();
    visitasDoCliente(cliente).forEach(data => unicos.set(dataParaChave(data), data));
    return [...unicos.values()].sort((a, b) => a - b);
};

export const resgatesDoCliente = (cliente = {}) => [
    ...lista(cliente.historicoResgates).map(item => ({ tipo: 'fidelidade', data: parseDataHistorica(item?.dataResgate) })),
    ...lista(cliente.historicoAniversarios).map(item => ({ tipo: 'aniversario', data: parseDataHistorica(item?.dataResgate) }))
].filter(item => item.data);

const ativos = (clientes) => lista(clientes).filter(cliente => cliente && !cliente.arquivado);

export const calcularRelatorioDiario = (clientes, chaveData) => {
    const base = ativos(clientes);
    const visitantes = new Set();
    let almocos = 0;
    let novos = 0;
    let resgatesFidelidade = 0;
    let resgatesAniversario = 0;

    base.forEach((cliente, indice) => {
        if (dataParaChave(parseDataHistorica(cliente.dataCadastroTimestamp || cliente.dataCadastro)) === chaveData) novos++;

        const identificador = cliente.cpf || cliente.id || `cliente-${indice}`;
        visitasDoCliente(cliente).forEach(data => {
            if (dataParaChave(data) !== chaveData) return;
            almocos++;
            visitantes.add(identificador);
        });

        resgatesDoCliente(cliente).forEach(resgate => {
            if (dataParaChave(resgate.data) !== chaveData) return;
            if (resgate.tipo === 'fidelidade') resgatesFidelidade++;
            else resgatesAniversario++;
        });
    });

    return {
        novos,
        visitantes: visitantes.size,
        almocos,
        resgatesFidelidade,
        resgatesAniversario,
        resgatesTotal: resgatesFidelidade + resgatesAniversario
    };
};

const dentroDoPeriodo = (data, inicio, fim) => data >= inicio && data <= fim;

const diaDaSemanaPreferido = (datas) => {
    if (!datas.length) return '—';
    const nomes = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const contagem = Array(7).fill(0);
    datas.forEach(data => contagem[data.getUTCDay()]++);
    const maior = Math.max(...contagem);
    return nomes[contagem.indexOf(maior)];
};

const intervaloMedio = (datas) => {
    if (datas.length < 2) return null;
    let total = 0;
    for (let i = 1; i < datas.length; i++) total += Math.round((datas[i] - datas[i - 1]) / DIA_MS);
    return Math.round(total / (datas.length - 1));
};

export const classificarFrequencia = ({ visitas30, cadastro, referencia }) => {
    const cadastroRecente = cadastro && dentroDoPeriodo(cadastro, new Date(referencia.getTime() - 29 * DIA_MS), referencia);
    if (cadastroRecente && visitas30 <= 3) return 'Novo';
    if (visitas30 >= 8) return 'Frequente';
    if (visitas30 >= 4) return 'Regular';
    if (visitas30 >= 1) return 'Ocasional';
    return 'Inativo';
};

export const calcularAnaliseFrequencia = (clientes, referenciaEntrada = new Date()) => {
    const referencia = inicioDoDiaUtc(referenciaEntrada);
    const inicio30 = new Date(referencia.getTime() - 29 * DIA_MS);
    const inicio60 = new Date(referencia.getTime() - 59 * DIA_MS);
    const fimAnterior = new Date(inicio30.getTime() - DIA_MS);
    const inicio90 = new Date(referencia.getTime() - 89 * DIA_MS);
    const segmentos = { Frequente: 0, Regular: 0, Ocasional: 0, Inativo: 0, Novo: 0 };
    let almocos30 = 0;
    let almocosAnteriores = 0;
    let visitantes30 = 0;

    const clientesAnalisados = ativos(clientes).map((cliente, indice) => {
        const visitas = visitasDoCliente(cliente).filter(data => data <= referencia);
        const diasUnicos = diasDeVisitaDoCliente(cliente).filter(data => data <= referencia);
        const visitas30 = visitas.filter(data => dentroDoPeriodo(data, inicio30, referencia)).length;
        const visitas90 = visitas.filter(data => dentroDoPeriodo(data, inicio90, referencia)).length;
        const visitasPeriodoAnterior = visitas.filter(data => dentroDoPeriodo(data, inicio60, fimAnterior)).length;
        const dias90 = diasUnicos.filter(data => dentroDoPeriodo(data, inicio90, referencia));
        const cadastro = parseDataHistorica(cliente.dataCadastroTimestamp || cliente.dataCadastro);
        const classificacao = classificarFrequencia({ visitas30, cadastro, referencia });

        segmentos[classificacao]++;
        almocos30 += visitas30;
        almocosAnteriores += visitasPeriodoAnterior;
        if (visitas30 > 0) visitantes30++;

        return {
            id: cliente.cpf || cliente.id || `cliente-${indice}`,
            nome: cliente.nome || 'Cliente sem nome',
            ultimaVisita: diasUnicos.at(-1) || null,
            visitas30,
            visitas90,
            mediaMensal: Number((visitas90 / 3).toFixed(1)),
            intervaloMedio: intervaloMedio(dias90),
            diaPreferido: diaDaSemanaPreferido(dias90),
            classificacao
        };
    }).sort((a, b) => b.visitas30 - a.visitas30 || b.visitas90 - a.visitas90 || a.nome.localeCompare(b.nome, 'pt-BR'));

    const variacao = almocosAnteriores > 0
        ? Math.round(((almocos30 - almocosAnteriores) / almocosAnteriores) * 100)
        : (almocos30 > 0 ? 100 : 0);

    const serieDiaria = Array.from({ length: 30 }, (_, indice) => {
        const data = new Date(inicio30.getTime() + indice * DIA_MS);
        return { data, chave: dataParaChave(data), total: 0, clientes: new Set() };
    });
    const porChave = new Map(serieDiaria.map(item => [item.chave, item]));
    ativos(clientes).forEach((cliente, indice) => {
        const id = cliente.cpf || cliente.id || `cliente-${indice}`;
        visitasDoCliente(cliente).forEach(data => {
            const item = porChave.get(dataParaChave(data));
            if (!item) return;
            item.total++;
            item.clientes.add(id);
        });
    });

    return {
        referencia,
        almocos30,
        visitantes30,
        mediaDiaria: Number((almocos30 / 30).toFixed(1)),
        variacao,
        segmentos,
        clientes: clientesAnalisados,
        serieDiaria: serieDiaria.map(item => ({ data: item.data, chave: item.chave, total: item.total, visitantes: item.clientes.size }))
    };
};

