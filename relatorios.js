import {
    calcularAnaliseFrequencia,
    calcularRelatorioDiario,
    dataParaChave
} from './relatorios-core.js';

let analiseAtual = null;

const escapar = (valor) => String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const formatarData = (data) => data
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(data)
    : 'Sem registro';

const dataLocalParaUtc = (chave) => {
    const [ano, mes, dia] = String(chave || '').split('-').map(Number);
    if (!ano || !mes || !dia) return new Date();
    return new Date(Date.UTC(ano, mes - 1, dia));
};

const hojeLocalComoChave = () => {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const mapa = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
    return `${mapa.year}-${mapa.month}-${mapa.day}`;
};

const textoUnidade = () => {
    const unidade = typeof window.obterUnidade === 'function' ? window.obterUnidade() : '';
    return unidade ? unidade.charAt(0).toUpperCase() + unidade.slice(1) : 'unidade atual';
};

const definirTexto = (id, valor) => {
    const elemento = document.getElementById(id);
    if (elemento) elemento.textContent = String(valor);
};

const classePerfil = (perfil) => `report-badge report-badge--${perfil.toLowerCase()}`;

const renderizarGrafico = (serie) => {
    const grafico = document.getElementById('relatorio-grafico');
    if (!grafico) return;
    const ultimos14 = serie.slice(-14);
    const maximo = Math.max(1, ...ultimos14.map(item => item.total));
    grafico.innerHTML = ultimos14.map(item => {
        const altura = item.total === 0 ? 3 : Math.max(8, Math.round((item.total / maximo) * 100));
        const rotulo = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' }).format(item.data);
        return `<div class="report-chart-column" title="${rotulo}: ${item.total} almoço(s)">
            <span class="report-chart-value">${item.total}</span>
            <span class="report-chart-bar" style="height:${altura}%"></span>
            <span class="report-chart-label">${rotulo.slice(0, 2)}</span>
        </div>`;
    }).join('');
};

const renderizarSegmentos = (segmentos) => {
    const area = document.getElementById('relatorio-segmentos');
    if (!area) return;
    const ordem = ['Frequente', 'Regular', 'Ocasional', 'Novo', 'Inativo'];
    const total = Math.max(1, ordem.reduce((soma, perfil) => soma + (segmentos[perfil] || 0), 0));
    area.innerHTML = ordem.map(perfil => {
        const quantidade = segmentos[perfil] || 0;
        const percentual = Math.round((quantidade / total) * 100);
        return `<div class="report-segment-card">
            <div><span class="report-dot report-dot--${perfil.toLowerCase()}"></span><strong>${perfil}</strong></div>
            <b>${quantidade}</b><small>${percentual}% da base</small>
            <span class="report-segment-track"><i class="report-segment-fill report-segment-fill--${perfil.toLowerCase()}" style="width:${percentual}%"></i></span>
        </div>`;
    }).join('');
};

const renderizarTabela = () => {
    const corpo = document.getElementById('relatorio-tabela-clientes');
    const busca = document.getElementById('relatorio-busca');
    if (!corpo || !analiseAtual) return;
    const termo = (busca?.value || '').trim().toLocaleLowerCase('pt-BR');
    const clientes = analiseAtual.clientes.filter(cliente => cliente.nome.toLocaleLowerCase('pt-BR').includes(termo));

    if (!clientes.length) {
        corpo.innerHTML = '<tr><td colspan="8" class="report-empty">Nenhum cliente encontrado.</td></tr>';
    } else {
        corpo.innerHTML = clientes.map(cliente => `<tr>
            <td data-label="Cliente"><strong>${escapar(cliente.nome)}</strong></td>
            <td data-label="Última visita">${formatarData(cliente.ultimaVisita)}</td>
            <td data-label="30 dias"><b>${cliente.visitas30}</b></td>
            <td data-label="90 dias">${cliente.visitas90}</td>
            <td data-label="Média mensal">${cliente.mediaMensal}</td>
            <td data-label="Intervalo médio">${cliente.intervaloMedio === null ? '—' : `${cliente.intervaloMedio} dias`}</td>
            <td data-label="Dia preferido">${cliente.diaPreferido}</td>
            <td data-label="Perfil"><span class="${classePerfil(cliente.classificacao)}">${cliente.classificacao}</span></td>
        </tr>`).join('');
    }
    definirTexto('relatorio-tabela-contagem', `${clientes.length} de ${analiseAtual.clientes.length} clientes`);
};

window.atualizarRelatorios = () => {
    const secao = document.getElementById('aba-relatorios');
    const campoData = document.getElementById('relatorio-data');
    if (!secao || !campoData || window.cargoLogado !== 'admin') return;
    if (!campoData.value) campoData.value = hojeLocalComoChave();

    const chave = campoData.value;
    const referencia = dataLocalParaUtc(chave);
    const diario = calcularRelatorioDiario(window.clientesArray || [], chave);
    analiseAtual = calcularAnaliseFrequencia(window.clientesArray || [], referencia);

    definirTexto('relatorio-dia-legenda', `${formatarData(referencia)} · ${textoUnidade()}`);
    definirTexto('relatorio-novos', diario.novos);
    definirTexto('relatorio-visitantes', diario.visitantes);
    definirTexto('relatorio-almocos', diario.almocos);
    definirTexto('relatorio-resgates', diario.resgatesTotal);
    definirTexto('relatorio-resgates-detalhe', `${diario.resgatesFidelidade} fidelidade · ${diario.resgatesAniversario} aniversário`);
    definirTexto('relatorio-fluxo-almocos', analiseAtual.almocos30);
    definirTexto('relatorio-fluxo-clientes', analiseAtual.visitantes30);
    definirTexto('relatorio-media-dia', analiseAtual.mediaDiaria.toLocaleString('pt-BR'));

    const sinal = analiseAtual.variacao > 0 ? '+' : '';
    const comparacao = `${sinal}${analiseAtual.variacao}%`;
    definirTexto('relatorio-variacao', comparacao);
    definirTexto('relatorio-comparacao', comparacao);
    const tendencia = document.getElementById('relatorio-variacao');
    if (tendencia) tendencia.dataset.trend = analiseAtual.variacao < 0 ? 'down' : (analiseAtual.variacao > 0 ? 'up' : 'neutral');

    renderizarGrafico(analiseAtual.serieDiaria);
    renderizarSegmentos(analiseAtual.segmentos);
    renderizarTabela();
    if (window.lucide) window.lucide.createIcons();
};

const montarRelatorios = () => {
    const template = document.getElementById('template-aba-relatorios');
    const principal = document.querySelector('#app-dashboard main');
    if (!template || !principal || document.getElementById('aba-relatorios')) return;
    principal.appendChild(template.content.cloneNode(true));
    template.remove();

    const campoData = document.getElementById('relatorio-data');
    const busca = document.getElementById('relatorio-busca');
    if (campoData) {
        campoData.value = hojeLocalComoChave();
        campoData.addEventListener('change', window.atualizarRelatorios);
    }
    if (busca) busca.addEventListener('input', renderizarTabela);
};

montarRelatorios();

export { calcularAnaliseFrequencia, calcularRelatorioDiario, dataParaChave };

