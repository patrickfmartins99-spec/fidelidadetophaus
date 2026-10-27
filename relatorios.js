import {
    calcularAnaliseFrequencia,
    calcularRelatorioDiario,
    dataParaChave
} from './relatorios-core.js';

let analiseAtual = null;
let clientesVisiveis = [];
const DIA_MS = 86400000;

const escapar = (valor) => String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const formatarData = (data) => data
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(data)
    : 'Sem registro';
const formatarPeriodo = periodo => `${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}`;

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
    const quantidade = document.getElementById('relatorio-grafico-periodo')?.value === '30' ? 30 : 14;
    const dias = serie.slice(-quantidade);
    const maximo = Math.max(1, ...dias.map(item => item.total));
    grafico.style.setProperty('--report-chart-days', quantidade);
    definirTexto('relatorio-grafico-legenda', `Almoços por dia · ${formatarData(dias[0].data)} a ${formatarData(dias.at(-1).data)}.`);
    grafico.setAttribute('aria-label', `Movimento diário de ${formatarData(dias[0].data)} a ${formatarData(dias.at(-1).data)}`);
    grafico.innerHTML = dias.map(item => {
        const altura = item.total === 0 ? 3 : Math.max(8, Math.round((item.total / maximo) * 100));
        const rotulo = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' }).format(item.data);
        return `<div class="report-chart-column" role="listitem" aria-label="${rotulo}: ${item.total} almoço(s)" title="${rotulo}: ${item.total} almoço(s)">
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
    clientesVisiveis = analiseAtual.clientes.filter(cliente => cliente.nome.toLocaleLowerCase('pt-BR').includes(termo));

    if (!clientesVisiveis.length) {
        corpo.innerHTML = '<tr><td colspan="9" class="report-empty">Nenhum cliente encontrado.</td></tr>';
    } else {
        corpo.innerHTML = clientesVisiveis.map((cliente, indice) => `<tr>
            <td data-label="Cliente"><strong>${escapar(cliente.nome)}</strong></td>
            <td data-label="Última visita registrada">${formatarData(cliente.ultimaVisita)}</td>
            <td data-label="Almoços · 30 dias"><b>${cliente.visitas30}</b></td>
            <td data-label="Almoços · 90 dias">${cliente.visitas90}</td>
            <td data-label="Média mensal · 90 dias">${cliente.mediaMensal}</td>
            <td data-label="Intervalo médio · 90 dias">${cliente.intervaloMedio === null ? '—' : `${cliente.intervaloMedio} dias`}</td>
            <td data-label="Dia mais comum · 90 dias">${cliente.diaPreferido}</td>
            <td data-label="Perfil · 30 dias"><span class="${classePerfil(cliente.classificacao)}">${cliente.classificacao}</span></td>
            <td data-label="Ação">${cliente.cpf ? `<button type="button" class="report-profile-action" data-report-index="${indice}" aria-label="Ver ficha de ${escapar(cliente.nome)}">Ver ficha</button>` : '—'}</td>
        </tr>`).join('');
    }
    definirTexto('relatorio-tabela-contagem', `${clientesVisiveis.length} de ${analiseAtual.clientes.length} clientes não arquivados`);
};

const atualizarVisaoGeral = () => {
    if (!document.getElementById('overview-novos')) return;
    const clientes = window.clientesArray || [];
    const hoje = hojeLocalComoChave();
    const diario = calcularRelatorioDiario(clientes, hoje);
    const ontemData = new Date(dataLocalParaUtc(hoje).getTime() - 86400000);
    const ontem = calcularRelatorioDiario(clientes, dataParaChave(ontemData));
    const analise = calcularAnaliseFrequencia(clientes, dataLocalParaUtc(hoje));
    definirTexto('overview-data-hoje', new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date()));
    definirTexto('overview-novos', diario.novos);
    definirTexto('overview-almocos', diario.almocos);
    definirTexto('overview-resgates', diario.resgatesTotal);
    definirTexto('overview-disponiveis', clientes.filter(cliente => !cliente.arquivado && Number(cliente.almocos || 0) >= 10).length);
    [['novos', diario.novos, ontem.novos], ['almocos', diario.almocos, ontem.almocos], ['resgates', diario.resgatesTotal, ontem.resgatesTotal]].forEach(([campo, atual, anterior]) => {
        const elemento = document.getElementById(`overview-${campo}-comparacao`);
        if (!elemento) return;
        const variacao = anterior ? Math.round((atual - anterior) / anterior * 100) : null;
        elemento.textContent = variacao === null ? 'Sem base de comparação ontem' : `${variacao > 0 ? '+' : ''}${variacao}% em relação a ontem`;
        elemento.dataset.trend = variacao === null ? 'neutral' : (variacao > 0 ? 'up' : (variacao < 0 ? 'down' : 'neutral'));
    });

    const grafico = document.getElementById('overview-fluxo');
    if (grafico) {
        const semana = analise.serieDiaria.slice(-7);
        const maximo = Math.max(1, ...semana.map(dia => dia.total));
        grafico.innerHTML = semana.map(dia => {
            const altura = dia.total ? Math.max(7, Math.round(dia.total / maximo * 100)) : 2;
            const rotulo = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'short' }).format(dia.data).replace('.', '');
            return `<div class="dashboard-flow-day" title="${dia.chave}: ${dia.total} almoço(s)"><strong>${dia.total}</strong><span class="dashboard-flow-track"><i style="height:${altura}%"></i></span><small>${rotulo}</small></div>`;
        }).join('');
    }
    const frequencia = document.getElementById('overview-frequencia');
    if (frequencia) {
        const saldos = clientes.filter(c => c && !c.arquivado).map(c => Number(c.almocos || 0));
        const grupos = [
            ['Mais de 20 almoços', n => n > 20],
            ['Entre 11 e 20', n => n >= 11 && n <= 20],
            ['Entre 6 e 10', n => n >= 6 && n <= 10],
            ['Entre 2 e 5', n => n >= 2 && n <= 5],
            ['Apenas 1 almoço', n => n === 1]
        ];
        const quantidades = grupos.map(([, filtro]) => saldos.filter(filtro).length);
        const maximo = Math.max(1, ...quantidades);
        frequencia.innerHTML = grupos.map(([rotulo], indice) => `<div class="dashboard-frequency-row"><span class="dashboard-frequency-rank">${indice + 1}</span><span class="dashboard-frequency-info"><span>${rotulo}<strong>${quantidades[indice]}</strong></span><i><b style="width:${Math.round(quantidades[indice] / maximo * 100)}%"></b></i></span></div>`).join('');
    }
};

window.atualizarRelatorios = () => {
    atualizarVisaoGeral();
    const secao = document.getElementById('aba-relatorios');
    const campoData = document.getElementById('relatorio-data');
    if (!secao || !campoData || window.cargoLogado !== 'admin') return;
    const hoje = hojeLocalComoChave();
    campoData.max = hoje;
    if (!campoData.value || campoData.value > hoje) campoData.value = hoje;

    const chave = campoData.value;
    const referencia = dataLocalParaUtc(chave);
    // O resumo do dia pode estar em andamento; a comparação usa apenas dias completos.
    const referenciaFluxo = chave === hoje ? new Date(referencia.getTime() - DIA_MS) : referencia;
    const diario = calcularRelatorioDiario(window.clientesArray || [], chave);
    analiseAtual = calcularAnaliseFrequencia(window.clientesArray || [], referenciaFluxo);

    definirTexto('relatorio-dia-legenda', `${formatarData(referencia)} · ${textoUnidade()}${chave === hoje ? ' · dia em andamento' : ''}`);
    definirTexto('relatorio-periodo-legenda', `30 dias completos: ${formatarPeriodo(analiseAtual.periodoAtual)}.${chave === hoje ? ' Hoje aparece somente no resumo do dia acima.' : ''}`);
    definirTexto('relatorio-resumo-legenda', `${formatarPeriodo(analiseAtual.periodoAtual)} versus ${formatarPeriodo(analiseAtual.periodoAnterior)}.`);
    definirTexto('relatorio-perfil-legenda', `Cadastros não arquivados por almoços registrados de ${formatarPeriodo(analiseAtual.periodoAtual)}. Resgates não reiniciam esta contagem.`);
    definirTexto('relatorio-tabela-legenda', `30 dias: ${formatarPeriodo(analiseAtual.periodoAtual)} · 90 dias: ${formatarPeriodo(analiseAtual.periodo90)}.`);
    definirTexto('relatorio-novos', diario.novos);
    definirTexto('relatorio-visitantes', diario.visitantes);
    definirTexto('relatorio-almocos', diario.almocos);
    definirTexto('relatorio-resgates', diario.resgatesTotal);
    definirTexto('relatorio-resgates-detalhe', `${diario.resgatesFidelidade} fidelidade · ${diario.resgatesAniversario} aniversário`);
    definirTexto('relatorio-fluxo-almocos', analiseAtual.almocos30);
    definirTexto('relatorio-fluxo-clientes', analiseAtual.visitantes30);
    definirTexto('relatorio-media-dia', analiseAtual.mediaDiaria.toLocaleString('pt-BR'));
    definirTexto('relatorio-anterior-almocos', analiseAtual.almocosAnteriores);
    definirTexto('relatorio-perfil-base', `Base: ${analiseAtual.clientes.length} cadastros não arquivados da unidade. “Novo” tem prioridade sobre “Ocasional” e “Inativo”. Percentuais arredondados.`);

    const sinal = analiseAtual.variacao > 0 ? '+' : '';
    const comparacao = analiseAtual.variacao === null ? 'Sem base anterior' : `${sinal}${analiseAtual.variacao}%`;
    definirTexto('relatorio-variacao', comparacao);
    definirTexto('relatorio-comparacao', comparacao);
    const tendencia = document.getElementById('relatorio-variacao');
    if (tendencia) tendencia.dataset.trend = analiseAtual.variacao === null ? 'neutral' : (analiseAtual.variacao < 0 ? 'down' : (analiseAtual.variacao > 0 ? 'up' : 'neutral'));

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
    const graficoPeriodo = document.getElementById('relatorio-grafico-periodo');
    const corpo = document.getElementById('relatorio-tabela-clientes');
    if (campoData) {
        campoData.value = hojeLocalComoChave();
        campoData.max = campoData.value;
        campoData.addEventListener('change', window.atualizarRelatorios);
    }
    if (busca) busca.addEventListener('input', renderizarTabela);
    if (graficoPeriodo) graficoPeriodo.addEventListener('change', () => analiseAtual && renderizarGrafico(analiseAtual.serieDiaria));
    if (corpo) corpo.addEventListener('click', evento => {
        const botao = evento.target.closest('[data-report-index]');
        if (!botao || !corpo.contains(botao)) return;
        const cliente = clientesVisiveis[Number(botao.dataset.reportIndex)];
        if (cliente?.cpf && typeof window.abrirFichaCliente === 'function') window.abrirFichaCliente(cliente.cpf);
    });
};

montarRelatorios();

export { calcularAnaliseFrequencia, calcularRelatorioDiario, dataParaChave };

