// marketing.js
// Módulo 5: Robô do WhatsApp, Automações e Disparos em Massa (Suporte a Campanhas Recorrentes e Fila)

// ==========================================================================
// CORE DO ROBÔ DE MARKETING: ENVIAR PARA A FILA FIREBASE (MULTIUNIDADE)
// ==========================================================================
window.enviarParaFilaRobo = (cpf, telefone, textoMensagem) => {
    if(!telefone || !textoMensagem) return;
    const telLimpo = telefone.toString().replace(/\D/g, '');
    if(telLimpo.length < 10) return; 
    
    const pathFila = window.obterCaminhoUnidade ? window.obterCaminhoUnidade('fila_mensagens') : 'fila_mensagens';

    window.firebasePush(window.firebaseRef(window.db, pathFila), {
        cpf: cpf,
        telefone: telLimpo,
        texto: textoMensagem,
        timestamp: Date.now(),
        status: 'pendente',
        origem: 'painel'
    }).then(() => {
        console.log("Ordem despachada para o Robô Node.js da unidade.");
    });
};

window.checarEAvisarAlmoco = (c) => {
    const faltam = 10 - (c.almocos || 0);
    if(faltam > 0 && faltam < 10) {
        const primeiroNome = (c.nome || '').trim().split(/\s+/)[0] || 'Cliente';
        const progresso = faltam === 1 ? 'Falta *1 almoço*' : `Faltam *${faltam} almoços*`;
        const msg = `Oi, *${primeiroNome}*! Que bom receber você hoje 😊\nSeu almoço já foi registrado no Top Haus Fidelidade. Você já soma *${c.almocos} de 10 almoços*. ${progresso} para liberar *R$ 50 de desconto* para uma próxima visita.\nAté logo! 🍽️`;
        window.enviarParaFilaRobo(c.cpf, c.telefone, msg);
    } else if (c.almocos === 10) {
        const txtPremio = window.msgsMarketing.premio || "Parabéns [Nome]! Você completou 10 almoços. Na sua próxima visita você poderá utilizar um desconto de R$ 50,00.";
        const msg = txtPremio.replace(/\[Nome\]/g, (c.nome||'').split(' ')[0]).replace(/\[Acumulados\]/g, c.almocos);
        window.enviarParaFilaRobo(c.cpf, c.telefone, msg);
        window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES+`/${c.cpf}/notificadoPremio`), true);
    }
};

// ==========================================================================
// VISUALIZAÇÃO E CONTROLE DA FILA DE ENVIOS
// ==========================================================================
const TAMANHO_PAGINA_FILA = 40;
const estadoFilaMarketing = {
    cancelar: null,
    geracao: 0,
    recentes: new Map(),
    anteriores: new Map(),
    cursor: null,
    temMais: false,
    carregando: false
};

const ordenarMensagensFila = () => {
    const mensagens = new Map([...estadoFilaMarketing.anteriores, ...estadoFilaMarketing.recentes]);
    return [...mensagens.values()].sort((a, b) =>
        (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0) || b.id.localeCompare(a.id)
    );
};

window.pararListenerFila = () => {
    estadoFilaMarketing.geracao++;
    if (estadoFilaMarketing.cancelar) estadoFilaMarketing.cancelar();
    estadoFilaMarketing.cancelar = null;
    estadoFilaMarketing.recentes.clear();
    estadoFilaMarketing.anteriores.clear();
    estadoFilaMarketing.cursor = null;
    estadoFilaMarketing.temMais = false;
    estadoFilaMarketing.carregando = false;
};

window.iniciarListenerFila = () => {
    window.pararListenerFila();
    const geracao = estadoFilaMarketing.geracao;
    const pathFila = window.obterCaminhoUnidade ? window.obterCaminhoUnidade('fila_mensagens') : 'fila_mensagens';
    const consulta = window.firebaseQuery(
        window.firebaseRef(window.db, pathFila),
        window.firebaseOrderByChild('timestamp'),
        window.firebaseLimitToLast(TAMANHO_PAGINA_FILA)
    );
    const area = document.getElementById('area-fila-envio');
    if (area) {
        area.innerHTML = '<p class="text-sm text-gray-500 text-center py-2">Carregando envios recentes...</p>';
        const resumo = document.getElementById('mkt-fila-resumo');
        const btnMais = document.getElementById('mkt-fila-mais');
        const btnLimpar = document.getElementById('btn-limpar-fila');
        if (resumo) resumo.textContent = '';
        if (btnMais) btnMais.classList.add('hidden');
        if (btnLimpar) btnLimpar.classList.add('hidden');
        area.onclick = event => {
            const botao = event.target.closest('[data-fila-acao]');
            if (!botao || !area.contains(botao)) return;
            if (botao.dataset.filaAcao === 'cancelar') window.cancelarMensagemFila(botao.dataset.filaId);
            if (botao.dataset.filaAcao === 'reenviar') window.reenviarMensagemFila(botao.dataset.filaId);
        };
    }

    estadoFilaMarketing.cancelar = window.firebaseOnValue(consulta, snapshot => {
        if (geracao !== estadoFilaMarketing.geracao) return;
        const pagina = [];
        snapshot.forEach(child => { pagina.push({ id: child.key, ...child.val() }); });
        estadoFilaMarketing.recentes = new Map(pagina.map(mensagem => [mensagem.id, mensagem]));
        pagina.forEach(mensagem => {
            if (estadoFilaMarketing.anteriores.has(mensagem.id)) estadoFilaMarketing.anteriores.set(mensagem.id, mensagem);
        });
        if (!estadoFilaMarketing.anteriores.size) {
            const primeira = pagina[0];
            estadoFilaMarketing.cursor = primeira ? { timestamp: primeira.timestamp ?? null, id: primeira.id } : null;
            estadoFilaMarketing.temMais = pagina.length === TAMANHO_PAGINA_FILA;
        }
        window.renderizarFilaEnvios();
    }, erro => {
        if (geracao !== estadoFilaMarketing.geracao) return;
        console.error('Não foi possível consultar os envios recentes:', erro);
        if (area) area.innerHTML = '<p class="text-sm text-red-600 text-center py-2">Não foi possível carregar a fila. Feche e abra a central para tentar novamente.</p>';
    });
};

window.carregarMaisMensagensFila = async () => {
    if (estadoFilaMarketing.carregando || !estadoFilaMarketing.temMais || !estadoFilaMarketing.cursor) return;
    const geracao = estadoFilaMarketing.geracao;
    const cursor = estadoFilaMarketing.cursor;
    const pathFila = window.obterCaminhoUnidade ? window.obterCaminhoUnidade('fila_mensagens') : 'fila_mensagens';
    estadoFilaMarketing.carregando = true;
    window.renderizarFilaEnvios();
    try {
        const consulta = window.firebaseQuery(
            window.firebaseRef(window.db, pathFila),
            window.firebaseOrderByChild('timestamp'),
            window.firebaseEndBefore(cursor.timestamp, cursor.id),
            window.firebaseLimitToLast(TAMANHO_PAGINA_FILA)
        );
        const snapshot = await window.firebaseGet(consulta);
        if (geracao !== estadoFilaMarketing.geracao) return;
        const pagina = [];
        snapshot.forEach(child => { pagina.push({ id: child.key, ...child.val() }); });
        pagina.forEach(mensagem => estadoFilaMarketing.anteriores.set(mensagem.id, mensagem));
        const primeira = pagina[0];
        if (primeira) estadoFilaMarketing.cursor = { timestamp: primeira.timestamp ?? null, id: primeira.id };
        estadoFilaMarketing.temMais = pagina.length === TAMANHO_PAGINA_FILA;
    } catch (erro) {
        if (geracao !== estadoFilaMarketing.geracao) return;
        console.error('Não foi possível carregar mensagens anteriores:', erro);
        window.mostrarToast('Não foi possível carregar mensagens anteriores.', 'erro');
    } finally {
        if (geracao === estadoFilaMarketing.geracao) {
            estadoFilaMarketing.carregando = false;
            window.renderizarFilaEnvios();
        }
    }
};

window.renderizarFilaEnvios = () => {
    const area = document.getElementById('area-fila-envio');
    const btnLimpar = document.getElementById('btn-limpar-fila');
    const resumo = document.getElementById('mkt-fila-resumo');
    const btnMais = document.getElementById('mkt-fila-mais');
    if(!area) return;
    const msgs = ordenarMensagensFila();
    if (resumo) resumo.textContent = msgs.length ? `${msgs.length} registro(s) carregado(s) desta unidade` : '';
    if (btnMais) {
        btnMais.classList.toggle('hidden', !estadoFilaMarketing.temMais);
        btnMais.disabled = estadoFilaMarketing.carregando;
        btnMais.textContent = estadoFilaMarketing.carregando ? 'Carregando...' : 'Carregar mensagens anteriores';
    }
    if (!msgs.length) {
        area.innerHTML = '<p class="text-sm text-gray-500 text-center py-2">Nenhuma mensagem na fila no momento.</p>';
        if(btnLimpar) btnLimpar.classList.add('hidden');
        return;
    }
    if(btnLimpar) btnLimpar.classList.remove('hidden');

    area.innerHTML = msgs.map(m => {
        const status = m.status || 'pendente';
        let statusHtml = '';
        let bgClass = 'bg-gray-50 border-gray-200';
        
        if (status === 'pendente') {
            statusHtml = '<span class="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded uppercase tracking-wider">⏳ Pendente</span>';
        } else if (status === 'enviado' || status === 'sucesso') {
            statusHtml = '<span class="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded uppercase tracking-wider">✅ Enviado</span>';
            bgClass = 'bg-green-50/30 border-green-100';
        } else if (status === 'erro' || status === 'falha') {
            statusHtml = '<span class="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded uppercase tracking-wider">❌ Falha</span>';
            bgClass = 'bg-red-50 border-red-200';
        } else if (status === 'cancelado') {
            statusHtml = '<span class="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded uppercase tracking-wider">🚫 Cancelado</span>';
        }

        const dataStr = m.timestamp ? new Date(m.timestamp).toLocaleString('pt-BR') : '--';
        
        let botoes = '';
        if(status === 'pendente' || status === 'erro' || status === 'falha') {
            botoes += `<button type="button" data-fila-acao="cancelar" data-fila-id="${window.escapeHTML(m.id)}" class="text-red-400 hover:text-red-600 p-1.5 transition rounded hover:bg-red-50" title="Cancelar envio"><i data-lucide="x-circle" class="w-4 h-4"></i></button>`;
        }
        if(status === 'erro' || status === 'falha' || status === 'cancelado') {
            botoes += `<button type="button" data-fila-acao="reenviar" data-fila-id="${window.escapeHTML(m.id)}" class="text-indigo-400 hover:text-indigo-600 p-1.5 transition rounded hover:bg-indigo-50 ml-1" title="Tentar novamente"><i data-lucide="refresh-cw" class="w-4 h-4"></i></button>`;
        }

        return `
            <div class="p-3 mb-2 rounded-xl border ${bgClass} flex justify-between items-center text-sm shadow-sm transition">
                <div class="flex-1 min-w-0 pr-4">
                    <p class="font-bold text-gray-800">${window.formatarTel(m.telefone) || 'Sem número'} <span class="text-[10px] text-gray-400 font-normal ml-2">${dataStr}</span></p>
                    <p class="text-xs text-gray-500 truncate mt-0.5" title="${window.escapeHTML(m.texto)}">${window.escapeHTML(m.texto)}</p>
                </div>
                <div class="flex flex-col items-end gap-1.5 shrink-0">
                    ${statusHtml}
                    <div class="flex">${botoes}</div>
                </div>
            </div>
        `;
    }).join('');
    if(window.lucide) window.lucide.createIcons();
};

const atualizarMensagemFilaLocal = (id, alteracoes) => {
    for (const grupo of [estadoFilaMarketing.recentes, estadoFilaMarketing.anteriores]) {
        if (grupo.has(id)) grupo.set(id, { ...grupo.get(id), ...alteracoes });
    }
    window.renderizarFilaEnvios();
};

window.cancelarMensagemFila = async (id) => {
    const pathFila = window.obterCaminhoUnidade ? window.obterCaminhoUnidade(`fila_mensagens/${id}/status`) : `fila_mensagens/${id}/status`;
    try {
        await window.firebaseSet(window.firebaseRef(window.db, pathFila), 'cancelado');
        atualizarMensagemFilaLocal(id, { status: 'cancelado' });
        if(window.logAuditoria) window.logAuditoria('Marketing', 'Envio de mensagem cancelado na fila.');
    } catch (erro) {
        console.error('Não foi possível cancelar a mensagem:', erro);
        window.mostrarToast('Não foi possível cancelar a mensagem.', 'erro');
    }
};

window.reenviarMensagemFila = async (id) => {
    const pathFila = window.obterCaminhoUnidade ? window.obterCaminhoUnidade(`fila_mensagens/${id}`) : `fila_mensagens/${id}`;
    const alteracoes = { status: 'pendente', timestamp: Date.now() };
    try {
        await window.firebaseUpdate(window.firebaseRef(window.db, pathFila), alteracoes);
        // O listener dos recentes refletirá o estado final do robô. Remover a
        // cópia antiga evita que um erro reapareça ao sair da janela recente.
        estadoFilaMarketing.anteriores.delete(id);
        window.renderizarFilaEnvios();
        if(window.logAuditoria) window.logAuditoria('Marketing', 'Mensagem reenviada para a fila de processamento.');
    } catch (erro) {
        console.error('Não foi possível reenviar a mensagem:', erro);
        window.mostrarToast('Não foi possível reenviar a mensagem.', 'erro');
    }
};

window.limparFilaCompleta = () => {
    window.confirmacaoDupla(
        "Limpar Fila de Envios", 
        "Deseja apagar todo o histórico da fila de marketing desta unidade?",
        () => {
            const pathFila = window.obterCaminhoUnidade ? window.obterCaminhoUnidade('fila_mensagens') : 'fila_mensagens';
            window.firebaseSet(window.firebaseRef(window.db, pathFila), null).then(() => {
                window.iniciarListenerFila();
                window.mostrarToast("Fila de envios limpa com sucesso.");
                if(window.logAuditoria) window.logAuditoria('Marketing', 'O histórico da fila de envios foi completamente apagado.');
            });
        }
    );
};

// ==========================================================================
// INJEÇÃO VIRTUAL DA INTERFACE DE CAMPANHAS AVANÇADAS
// ==========================================================================
window.injetarUICampanhas = () => {
    if(document.getElementById('mkt-novo-tipo')) return;
    
    const wrapperAntigo = document.getElementById('mkt-agenda-data').parentNode;
    
    const painel = document.createElement('div');
    painel.className = "flex flex-col gap-3 mb-3 w-full bg-white p-4 rounded-xl border border-indigo-100 shadow-sm";
    painel.innerHTML = `
        <div class="flex gap-2">
            <select id="mkt-novo-tipo" onchange="alternarTipoCampanha()" class="p-2 bg-gray-50 border border-indigo-200 rounded-lg text-sm font-bold w-1/3 outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="unica">Disparo único</option>
                <option value="recorrente">Campanha recorrente</option>
            </select>
            <input type="text" id="mkt-novo-titulo" placeholder="Título interno (Ex: Promoção Terça)" class="p-2 border border-indigo-200 rounded-lg text-sm w-2/3 outline-none focus:ring-2 focus:ring-indigo-500">
        </div>
        
        <div id="painel-mkt-unica" class="flex gap-2">
            <input type="date" id="mkt-nova-data" class="p-2 border border-indigo-200 rounded-lg text-sm w-1/2 outline-none text-center">
            <input type="time" id="mkt-novo-horario-unica" class="p-2 border border-indigo-200 rounded-lg text-sm w-1/2 outline-none text-center" value="09:00">
        </div>

        <div id="painel-mkt-recorrente" class="hidden flex-col gap-3 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
            <div class="flex gap-2">
                <select id="mkt-nova-freq" onchange="alternarFreqCampanha()" class="p-2 border border-indigo-200 rounded-lg text-sm w-1/2 outline-none font-bold text-indigo-900">
                    <option value="diaria">Diária</option>
                    <option value="semanal">Semanal</option>
                    <option value="mensal">Mensal</option>
                    <option value="anual">Anual</option>
                    <option value="data_especifica">Data específica</option>
                </select>
                <input type="time" id="mkt-novo-horario-rec" class="p-2 border border-indigo-200 rounded-lg text-sm w-1/2 outline-none text-center font-bold" value="09:00">
            </div>
            
            <div id="freq-diaria" class="text-sm text-gray-500 text-center">Executa todos os dias no horário definido.</div>

            <div id="freq-semanal" class="hidden flex flex-wrap gap-2 text-xs font-bold text-gray-700">
                <label class="bg-white p-1.5 rounded border border-gray-200 cursor-pointer hover:bg-indigo-100"><input type="checkbox" value="1" class="chk-dia mr-1"> Seg</label>
                <label class="bg-white p-1.5 rounded border border-gray-200 cursor-pointer hover:bg-indigo-100"><input type="checkbox" value="2" class="chk-dia mr-1"> Ter</label>
                <label class="bg-white p-1.5 rounded border border-gray-200 cursor-pointer hover:bg-indigo-100"><input type="checkbox" value="3" class="chk-dia mr-1"> Qua</label>
                <label class="bg-white p-1.5 rounded border border-gray-200 cursor-pointer hover:bg-indigo-100"><input type="checkbox" value="4" class="chk-dia mr-1"> Qui</label>
                <label class="bg-white p-1.5 rounded border border-gray-200 cursor-pointer hover:bg-indigo-100"><input type="checkbox" value="5" class="chk-dia mr-1"> Sex</label>
                <label class="bg-white p-1.5 rounded border border-gray-200 cursor-pointer hover:bg-indigo-100"><input type="checkbox" value="6" class="chk-dia mr-1"> Sáb</label>
                <label class="bg-white p-1.5 rounded border border-gray-200 cursor-pointer hover:bg-indigo-100"><input type="checkbox" value="0" class="chk-dia mr-1 text-red-500"> Dom</label>
            </div>
            
            <div id="freq-mensal" class="hidden gap-2 items-center text-sm font-bold text-indigo-900">
                <span>Executar todo dia:</span>
                <input type="number" id="mkt-dia-mes" min="1" max="31" class="p-1 border border-indigo-200 rounded w-16 text-center bg-white" placeholder="Ex: 5">
            </div>
            
            <div id="freq-anual" class="hidden gap-2 items-center text-sm font-bold text-indigo-900">
                <span>Todo ano em:</span>
                <input type="text" id="mkt-dia-ano" class="p-1 border border-indigo-200 rounded w-20 text-center bg-white" placeholder="DD/MM" maxlength="5" oninput="this.value = this.value.replace(/[^0-9/]/g, '').replace(/^(\\d{2})(\\d)/, '$1/$2').substring(0,5)">
            </div>

            <div id="freq-data-especifica" class="hidden gap-2 items-center text-sm font-bold text-indigo-900">
                <span>Data:</span>
                <input type="date" id="mkt-data-especifica" class="p-1 border border-indigo-200 rounded text-center bg-white">
            </div>
        </div>
    `;
    
    wrapperAntigo.style.display = 'none';
    wrapperAntigo.parentNode.insertBefore(painel, wrapperAntigo);
};

// ==========================================================================
// ALTERAÇÃO CAMPANHAS RECORRENTES: substituir style.display por classList
// ==========================================================================
window.alternarTipoCampanha = () => {
    const t = document.getElementById('mkt-novo-tipo').value;
    const painelUnica = document.getElementById('painel-mkt-unica');
    const painelRecorrente = document.getElementById('painel-mkt-recorrente');

    // Correção: usar classList.toggle em vez de style.display
    painelUnica.classList.toggle('hidden', t !== 'unica');
    painelRecorrente.classList.toggle('hidden', t !== 'recorrente');
};

window.alternarFreqCampanha = () => {
    const f = document.getElementById('mkt-nova-freq').value;

    // Correção: usar classList.toggle para cada elemento de frequência
    document.getElementById('freq-diaria').classList.toggle('hidden', f !== 'diaria');
    document.getElementById('freq-semanal').classList.toggle('hidden', f !== 'semanal');
    document.getElementById('freq-mensal').classList.toggle('hidden', f !== 'mensal');
    document.getElementById('freq-anual').classList.toggle('hidden', f !== 'anual');
    document.getElementById('freq-data-especifica').classList.toggle('hidden', f !== 'data_especifica');
};

// ==========================================================================
// IDENTIFICADORES ESTÁVEIS DE CAMPANHAS
// ==========================================================================
// O ID não pode depender da posição da campanha na lista, pois a lista pode
// ser reorganizada/removida sem criar uma nova ocorrência de disparo.
window.gerarIdCampanha = () => {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return `camp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

// O robô sempre monitora a configuração real da unidade. Campanhas nunca
// devem ser desviadas para mensagens_simulacao, mesmo quando o laboratório
// estiver aberto no painel.
window.obterCaminhoMarketingReal = () => window.obterCaminhoUnidade
    ? window.obterCaminhoUnidade('config/mensagens')
    : 'config/mensagens';

window.campanhasParaMapa = (colecao) => {
    const entradas = Array.isArray(colecao)
        ? colecao.map((campanha, indice) => [String(indice), campanha])
        : Object.entries(colecao || {});
    const mapa = {};

    entradas.forEach(([chaveAtual, campanha]) => {
        if (!campanha || typeof campanha !== 'object') return;
        let id = String(campanha.id || campanha.robotCampaignId || chaveAtual || '');
        if (!id || /^\d+$/.test(id) || !/^[a-zA-Z0-9_-]+$/.test(id)) {
            id = window.gerarIdCampanha();
        }
        mapa[id] = { ...campanha, id };
    });
    return mapa;
};

// Compatibilidade com o agendador instalado no robô:
// - diária é persistida como semanal em todos os dias;
// - data específica é persistida como disparo único.
// A frequência original continua registrada apenas para exibição no painel.
window.normalizarCampanhaParaRobo = (campanha) => {
    const normalizada = {
        ...campanha,
        configRecorrencia: { ...(campanha.configRecorrencia || {}) }
    };

    if (normalizada.tipo === 'recorrente' && normalizada.frequencia === 'diaria') {
        normalizada.frequenciaExibicao = 'diaria';
        normalizada.frequencia = 'semanal';
        normalizada.configRecorrencia.diasSemana = [0, 1, 2, 3, 4, 5, 6];
    } else if (normalizada.tipo === 'recorrente' && normalizada.frequencia === 'data_especifica') {
        normalizada.frequenciaExibicao = 'data_especifica';
        normalizada.tipo = 'unica';
        normalizada.data = normalizada.configRecorrencia.dataEspecifica;
        normalizada.horario = normalizada.configRecorrencia.horario || '09:00';
    }

    return normalizada;
};

window.mesclarControlesDoRobo = (campanhaLocal, campanhaServidor) => {
    if (!campanhaServidor) return campanhaLocal;
    const mesclada = { ...campanhaLocal };
    [
        'robotCampaignId', 'execucoes', 'ultimaExecucaoEm',
        'ultimaExecucaoChave', 'ultimaExecucaoStatus', 'encerradaEm'
    ].forEach(campo => {
        if (campanhaServidor[campo] !== undefined) mesclada[campo] = campanhaServidor[campo];
    });

    // Uma tela aberta não pode reativar acidentalmente uma campanha que o robô
    // acabou de concluir enquanto o usuário editava outras configurações.
    if (['encerrada', 'concluida'].includes(String(campanhaServidor.status || '').toLowerCase())
        && String(campanhaLocal.status || '').toLowerCase() === 'ativa') {
        mesclada.status = campanhaServidor.status;
    }
    return mesclada;
};

// ==========================================================================
// CENTRAL GERENCIAL DE MARKETING
// ==========================================================================
window.abrirCentralMarketing = async () => {
    window.injetarUICampanhas();

    try {
        const caminhoReal = window.obterCaminhoMarketingReal();
        const snapshot = await window.firebaseGet(window.firebaseRef(window.db, caminhoReal));
        const dadosReais = snapshot.val() || {};
        window.msgsMarketing = {
            ...window.msgsMarketing,
            ...dadosReais,
            // Nunca exibir como salva uma campanha que só existe nesta aba.
            agendadas: window.campanhasParaMapa(dadosReais.agendadas)
        };
        if(!window.msgsMarketing.personalizadas) window.msgsMarketing.personalizadas = [];
    } catch (erro) {
        console.error('Não foi possível carregar as campanhas reais:', erro);
        return window.mostrarToast('Não foi possível carregar as campanhas desta unidade.', 'erro');
    }
    
    document.getElementById('mkt-msg-niver').value = window.msgsMarketing.aniversario || '';
    document.getElementById('mkt-msg-premio').value = window.msgsMarketing.premio || '';
    document.getElementById('mkt-msg-inativo').value = window.msgsMarketing.inativo || '';
    
    const btnLimpar = document.getElementById('btn-limpar-fila');
    if(btnLimpar) btnLimpar.onclick = window.limparFilaCompleta;

    window.renderizarMensagensCustomizadas();
    
    const modal = document.getElementById('modal-marketing'); 
    modal.classList.remove('hidden'); 
    if(window.prenderFocoModal) window.prenderFocoModal(modal);
    window.iniciarListenerFila();
};

window.renderizarMensagensCustomizadas = () => {
    const areaAg = document.getElementById('area-agendamentos'); 
    if(areaAg) {
        const mapaAg = window.campanhasParaMapa(window.msgsMarketing.agendadas);
        window.msgsMarketing.agendadas = mapaAg;
        const listaAg = Object.entries(mapaAg);
        
        areaAg.innerHTML = listaAg.map(([idCampanha, m]) => {
            const tipoC = m.tipo || 'unica'; 
            const statusC = m.status === 'encerrada' ? 'cancelada' : (m.status || 'ativa'); 
            
            let labelTipo = '';
            let info = '';
            
            if (tipoC === 'unica') {
                const dataFormatada = m.data ? m.data.split('-').reverse().join('/') : 'S/D';
                const horarioFormatado = m.horario ? ` às ${m.horario}` : '';
                labelTipo = `<span class="bg-gray-200 text-gray-800 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">Disparo Único</span>`;
                info = `<i data-lucide="calendar" class="w-3.5 h-3.5"></i> Execução em: ${dataFormatada}${horarioFormatado}`;
            } else {
                const c = m.configRecorrencia || {};
                const hor = c.horario ? ` às ${c.horario}` : '';
                let det = '';
                const frequenciaVisual = m.frequenciaExibicao || m.frequencia;
                if (frequenciaVisual === 'diaria') {
                    det = `Todos os dias`;
                } else if (frequenciaVisual === 'semanal') {
                    const diasMapa = {0:'Dom', 1:'Seg', 2:'Ter', 3:'Qua', 4:'Qui', 5:'Sex', 6:'Sáb'};
                    const nmDias = (c.diasSemana||[]).map(d => diasMapa[d]).join(', ');
                    det = `Toda Semana (${nmDias})`;
                } else if (frequenciaVisual === 'mensal') {
                    det = `Todo dia ${c.diaMes} do mês`;
                } else if (frequenciaVisual === 'anual') {
                    det = `Anualmente em ${c.diaAno}`;
                } else if (frequenciaVisual === 'data_especifica') {
                    const dataEsp = c.dataEspecifica ? c.dataEspecifica.split('-').reverse().join('/') : 'S/D';
                    det = `Data específica: ${dataEsp}`;
                }
                labelTipo = `<span class="bg-indigo-600 text-white px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shadow-sm">Recorrente: ${frequenciaVisual}</span>`;
                info = `<i data-lucide="repeat" class="w-3.5 h-3.5"></i> ${det}${hor}`;
            }
            
            const bgStatus = statusC === 'ativa' ? 'bg-green-100 text-green-800 border-green-300' : 
                            (statusC === 'pausada' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-red-100 text-red-800 border-red-300');
            
            return `
                <div class="bg-white border border-gray-200 p-4 rounded-xl shadow-sm relative mb-3">
                    <button onclick="removerAgendamento('${idCampanha}')" class="absolute top-4 right-3 text-red-400 hover:text-red-600 transition" title="Excluir campanha"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    
                    <div class="flex flex-wrap items-center gap-2 mb-3 pr-6">
                        ${labelTipo}
                        <select onchange="alterarStatusCampanha('${idCampanha}', this.value)" class="text-[10px] font-black px-2 py-1 rounded-lg border outline-none cursor-pointer uppercase shadow-sm transition ${bgStatus}">
                            <option value="ativa" class="bg-white text-black" ${statusC === 'ativa' ? 'selected' : ''}>🟢 Ativa</option>
                            <option value="pausada" class="bg-white text-black" ${statusC === 'pausada' ? 'selected' : ''}>🟡 Pausada</option>
                            <option value="cancelada" class="bg-white text-black" ${statusC === 'cancelada' ? 'selected' : ''}>🔴 Encerrada</option>
                            <option value="concluida" class="bg-white text-black" ${statusC === 'concluida' ? 'selected' : ''}>✅ Concluída</option>
                        </select>
                    </div>
                    
                    <p class="font-bold text-sm text-gray-900 mb-2">${window.escapeHTML(m.titulo)}</p>
                    <div class="text-xs text-indigo-700 mb-3 flex items-center gap-1 font-bold bg-indigo-50 p-2 rounded-lg border border-indigo-100 inline-flex">${info}</div>
                    <p class="text-xs text-gray-600 text-left bg-gray-50 p-3 rounded-lg border border-gray-100 italic">"${window.escapeHTML(m.texto)}"</p>
                </div>`;
        }).join('');
    }

    const areaCs = document.getElementById('area-mensagens-custom'); 
    if(areaCs) {
        const listaCs = Array.isArray(window.msgsMarketing.personalizadas) ? window.msgsMarketing.personalizadas : Object.values(window.msgsMarketing.personalizadas || {});
        
        areaCs.innerHTML = listaCs.map((m, idx) => `
                <div class="bg-white border border-gray-200 p-4 rounded-xl shadow-sm relative mb-3">
                    <button onclick="removerMsgCustom(${idx})" class="absolute top-2 right-2 text-red-400 hover:text-red-600 transition" title="Remover botão"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    <input type="text" id="mkt-custom-titulo-${idx}" value="${window.escapeHTML(m.titulo)}" placeholder="Nome do botão" class="font-bold text-sm mb-2 w-3/4 outline-none border-b border-gray-200 text-center">
                    <textarea id="mkt-custom-texto-${idx}" rows="2" placeholder="Texto da mensagem" class="w-full bg-gray-50 border border-gray-100 rounded-lg p-2 text-sm outline-none text-center">${window.escapeHTML(m.texto)}</textarea>
                </div>`).join('');
    }
    
    if(window.lucide) window.lucide.createIcons();
};

window.adicionarAgendamento = async () => {
    const uiAtiva = !!document.getElementById('mkt-novo-tipo');
    let novaCampanha = {};
    const texto = document.getElementById('mkt-agenda-texto').value;

    if (uiAtiva) {
        const tipo = document.getElementById('mkt-novo-tipo').value;
        const titulo = document.getElementById('mkt-novo-titulo').value;
        
        if(!titulo || !texto) return window.mostrarToast("Preencha o título e o texto da campanha para continuar.", "erro");
        
        novaCampanha = {
            id: window.gerarIdCampanha(),
            titulo: titulo,
            texto: texto,
            tipo: tipo,
            status: 'ativa'
        };
        
        if (tipo === 'unica') {
            const data = document.getElementById('mkt-nova-data').value;
            const horario = document.getElementById('mkt-novo-horario-unica').value;
            if(!data) return window.mostrarToast("Selecione a data do disparo.", "erro");
            
            novaCampanha.data = data;
            novaCampanha.horario = horario || "09:00";
        } else {
            const freq = document.getElementById('mkt-nova-freq').value;
            const horario = document.getElementById('mkt-novo-horario-rec').value;
            
            novaCampanha.frequencia = freq;
            novaCampanha.configRecorrencia = { horario: horario || "09:00" };
            
            if (freq === 'diaria') {
                // nenhum campo extra
            } else if (freq === 'semanal') {
                const chks = document.querySelectorAll('.chk-dia:checked');
                if(chks.length === 0) return window.mostrarToast("Selecione pelo menos um dia da semana.", "erro");
                novaCampanha.configRecorrencia.diasSemana = Array.from(chks).map(c => parseInt(c.value));
            } else if (freq === 'mensal') {
                const diaM = document.getElementById('mkt-dia-mes').value;
                if(!diaM || diaM < 1 || diaM > 31) return window.mostrarToast("Informe um dia do mês válido (entre 1 e 31).", "erro");
                novaCampanha.configRecorrencia.diaMes = parseInt(diaM);
            } else if (freq === 'anual') {
                const diaA = document.getElementById('mkt-dia-ano').value;
                if(!diaA || diaA.length !== 5) return window.mostrarToast("Informe uma data anual válida no formato DD/MM.", "erro");
                novaCampanha.configRecorrencia.diaAno = diaA;
            } else if (freq === 'data_especifica') {
                const dataEsp = document.getElementById('mkt-data-especifica').value;
                if(!dataEsp) return window.mostrarToast("Selecione a data específica.", "erro");
                novaCampanha.configRecorrencia.dataEspecifica = dataEsp;
            }
        }
    } else {
        const data = document.getElementById('mkt-agenda-data').value;
        const titulo = document.getElementById('mkt-agenda-titulo').value;
        if(!data || !titulo || !texto) return window.mostrarToast("Preencha todos os campos para continuar.", "erro");
        novaCampanha = { id: window.gerarIdCampanha(), data: data, titulo: titulo, texto: texto, tipo: 'unica', status: 'ativa' };
    }
    
    novaCampanha = window.normalizarCampanhaParaRobo(novaCampanha);
    if(novaCampanha.tipo === 'unica') {
        const partes = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).formatToParts(new Date()).map(parte => [parte.type, parte.value]));
        const agoraLocal = `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
        if(`${novaCampanha.data}T${novaCampanha.horario}` <= agoraLocal) {
            return window.mostrarToast('Escolha uma data e um horário futuros para a campanha.', 'erro');
        }
    }
    const botao = document.getElementById('btn-mkt-agendar');
    const rotuloBotao = botao?.textContent;
    if(botao) {
        botao.disabled = true;
        botao.textContent = 'Salvando campanha...';
    }

    try {
        const caminho = `${window.obterCaminhoMarketingReal()}/agendadas/${novaCampanha.id}`;
        const referencia = window.firebaseRef(window.db, caminho);
        const resultado = await window.firebaseRunTransaction(referencia, atual => atual || novaCampanha);
        const gravada = resultado.snapshot.val();
        if(!resultado.committed || gravada?.id !== novaCampanha.id) {
            throw new Error('O Firebase não confirmou o agendamento.');
        }
        window.msgsMarketing.agendadas = window.campanhasParaMapa(window.msgsMarketing.agendadas);
        window.msgsMarketing.agendadas[novaCampanha.id] = gravada;
    } catch (erro) {
        console.error('Não foi possível agendar a campanha:', erro);
        window.mostrarToast('Não foi possível salvar a campanha. Confira a conexão e tente novamente.', 'erro');
        return;
    } finally {
        if(botao) {
            botao.disabled = false;
            botao.textContent = rotuloBotao;
        }
    }
    
    document.getElementById('mkt-agenda-texto').value = '';
    if (uiAtiva) {
        document.getElementById('mkt-novo-titulo').value = '';
        document.querySelectorAll('.chk-dia').forEach(c => c.checked = false);
        document.getElementById('mkt-data-especifica').value = '';
    } else {
        document.getElementById('mkt-agenda-data').value = '';
        document.getElementById('mkt-agenda-titulo').value = '';
    }
    
    window.renderizarMensagensCustomizadas();
    window.mostrarToast('Campanha salva e agendada para esta unidade.');
};

window.alterarStatusCampanha = (idCampanha, novoStatus) => {
    window.msgsMarketing.agendadas = window.campanhasParaMapa(window.msgsMarketing.agendadas);
    if(window.msgsMarketing.agendadas[idCampanha]) {
        window.msgsMarketing.agendadas[idCampanha].status = novoStatus;
        window.renderizarMensagensCustomizadas();
        window.mostrarToast("Status alterado. Salve as alterações para confirmar.", "sucesso");
    }
};

window.removerAgendamento = (idCampanha) => { 
    window.msgsMarketing.agendadas = window.campanhasParaMapa(window.msgsMarketing.agendadas);
    delete window.msgsMarketing.agendadas[idCampanha];
    window.renderizarMensagensCustomizadas(); 
};

window.adicionarMsgCustom = () => { 
    if(!Array.isArray(window.msgsMarketing.personalizadas)) window.msgsMarketing.personalizadas = Object.values(window.msgsMarketing.personalizadas||{}); 
    window.msgsMarketing.personalizadas.push({ titulo: "", texto: "" }); 
    window.renderizarMensagensCustomizadas(); 
};

window.removerMsgCustom = (idx) => { 
    window.msgsMarketing.personalizadas.splice(idx, 1); 
    window.renderizarMensagensCustomizadas(); 
};

window.salvarCentralMarketing = async () => {
    const btn = document.getElementById('btn-marketing-salvar');
    const span = document.getElementById('btn-marketing-salvar-text');
    
    if(btn) btn.disabled = true;
    if(span) span.innerText = 'Salvando...';

    window.msgsMarketing.aniversario = document.getElementById('mkt-msg-niver').value;
    window.msgsMarketing.premio = document.getElementById('mkt-msg-premio').value;
    window.msgsMarketing.inativo = document.getElementById('mkt-msg-inativo').value;
    
    const campanhasLocais = window.campanhasParaMapa(window.msgsMarketing.agendadas);
    Object.keys(campanhasLocais).forEach(id => {
        campanhasLocais[id] = window.normalizarCampanhaParaRobo(campanhasLocais[id]);
        if (campanhasLocais[id].status === 'encerrada') campanhasLocais[id].status = 'cancelada';
        campanhasLocais[id].atualizadaEm = Date.now();
    });
    window.msgsMarketing.agendadas = campanhasLocais;
    
    const lista = Array.isArray(window.msgsMarketing.personalizadas) ? window.msgsMarketing.personalizadas : Object.values(window.msgsMarketing.personalizadas||{});
    lista.forEach((m, idx) => { 
        m.titulo = document.getElementById(`mkt-custom-titulo-${idx}`).value; 
        m.texto = document.getElementById(`mkt-custom-texto-${idx}`).value; 
    });
    window.msgsMarketing.personalizadas = lista;
    
    const caminhoReal = window.obterCaminhoMarketingReal();
    const referenciaReal = window.firebaseRef(window.db, caminhoReal);

    try {
        const resultado = await window.firebaseRunTransaction(referenciaReal, atual => {
            const servidor = atual || {};
            const campanhasServidor = servidor.agendadas || {};
            const campanhasPorIdServidor = {};
            Object.entries(campanhasServidor).forEach(([chave, campanha]) => {
                if (!campanha || typeof campanha !== 'object') return;
                campanhasPorIdServidor[String(campanha.id || chave)] = campanha;
                if (campanha.robotCampaignId) {
                    campanhasPorIdServidor[String(campanha.robotCampaignId)] = campanha;
                }
            });

            const campanhasMescladas = {};
            Object.entries(campanhasLocais).forEach(([id, campanha]) => {
                campanhasMescladas[id] = window.mesclarControlesDoRobo(
                    campanha,
                    campanhasPorIdServidor[String(campanha.id || id)]
                );
            });

            return { ...servidor, ...window.msgsMarketing, agendadas: campanhasMescladas };
        });

        if (!resultado.committed) throw new Error('A gravação da campanha não foi confirmada.');
        window.msgsMarketing = resultado.snapshot.val() || window.msgsMarketing;
        window.mostrarToast("Central de marketing salva com sucesso."); 
        
        if(window.logAuditoria) window.logAuditoria('Marketing', 'As configurações da Central de Marketing foram atualizadas.');
        
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Salvar alterações';
        if(window.fecharModal) window.fecharModal('modal-marketing'); 
    } catch (erro) {
        console.error('Não foi possível salvar as campanhas:', erro);
        window.mostrarToast("Não foi possível salvar. Tente novamente.", "erro");
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Salvar alterações';
    }
};

window.abrirModalWhatsApp = (cpf) => {
    const cliente = window.clientesMap[cpf]; 
    if(!cliente) return;
    
    document.getElementById('whats-cliente-nome').innerText = (cliente.nome || 'Cliente').split(' ')[0];
    const area = document.getElementById('lista-opcoes-whats'); 
    if(!area) return;
    area.innerHTML = '';

    const ehNiverSemana = window.diasParaAniversario(cliente.nascimento) >= 0 && window.diasParaAniversario(cliente.nascimento) <= 7;

    if(ehNiverSemana) {
        area.innerHTML += `<button onclick="dispararWhatsApp('${cpf}', 'aniversario')" class="flex items-center gap-3 p-3 rounded-xl border border-green-200 bg-green-50 hover:bg-green-100 w-full text-left transition"><div class="bg-red-500 text-white p-2 rounded-lg"><i data-lucide="cake" class="w-4 h-4"></i></div><div class="flex-1"><p class="text-sm font-bold text-gray-800">Forçar aviso de aniversário</p><p class="text-xs text-gray-600">Disparar agora</p></div></button>`;
    } 

    const listaMkt = Array.isArray(window.msgsMarketing.personalizadas) ? window.msgsMarketing.personalizadas : Object.values(window.msgsMarketing.personalizadas || {});
    listaMkt.forEach((m, idx) => { 
        if(m.titulo) area.innerHTML += `<button onclick="dispararWhatsApp('${cpf}', 'custom', ${idx})" class="flex items-center gap-3 p-3 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 w-full text-left mt-2 transition"><div class="bg-indigo-500 text-white p-2 rounded-lg"><i data-lucide="send" class="w-4 h-4"></i></div><div class="flex-1"><p class="text-sm font-bold text-gray-800">${window.escapeHTML(m.titulo)}</p></div></button>`; 
    });

    if(area.innerHTML === '') {
        area.innerHTML = '<p class="text-sm text-gray-500 text-center py-2">Nenhum botão de disparo rápido configurado na Central de Marketing.</p>';
    }

    const modal = document.getElementById('modal-whatsapp'); 
    modal.classList.remove('hidden'); 
    if(window.prenderFocoModal) window.prenderFocoModal(modal); 
    if(window.lucide) window.lucide.createIcons();
};

window.dispararWhatsApp = (cpf, tipo, idx = -1) => {
    const cliente = window.clientesMap[cpf]; 
    if(!cliente || !cliente.telefone) {
        return window.mostrarToast("O cliente não possui um número de telefone válido cadastrado.", "erro");
    }
    
    let t = ""; 
    
    if (tipo === 'aniversario') { 
        t = window.msgsMarketing.aniversario; 
    } else if (tipo === 'custom') { 
        const l = Array.isArray(window.msgsMarketing.personalizadas) ? window.msgsMarketing.personalizadas : Object.values(window.msgsMarketing.personalizadas||{}); 
        t = l[idx].texto; 
    }

    t = t.replace(/\[Nome\]/g, (cliente.nome||'').split(' ')[0]).replace(/\[Acumulados\]/g, (cliente.almocos||0));
    
    window.enviarParaFilaRobo(cliente.cpf, cliente.telefone, t);
    
    window.mostrarToast("Mensagem adicionada à fila.");
    if(window.logAuditoria) window.logAuditoria('Disparo Manual', `Mensagem manual enviada para ${cliente.nome}.`);
    
    if(window.fecharModal) window.fecharModal('modal-whatsapp'); 
};

// ==========================================================================
// EXECUÇÃO DE CAMPANHAS AGENDADAS
// ==========================================================================
// As campanhas agendadas são executadas exclusivamente pelo robô Node.js.
// O painel apenas grava e exibe as configurações; não existe mais um segundo
// timer no navegador que possa duplicar os disparos.
window.campanhasAgendadasExecutadasNoServidor = true;
