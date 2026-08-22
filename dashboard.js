// dashboard.js
// Módulo 7: Maestro de Inicialização e Renderização de UI Estática

// ==========================================================================
// VARIÁVEIS GLOBAIS E ESTADO PARTILHADO (A Fonte da Verdade)
// ==========================================================================
window.isSimulationMode = localStorage.getItem('modoSimulacao') === 'true';

window.getDbPath = (base) => {
    let pathFinal = base;
    if (base === 'clientes') pathFinal = window.isSimulationMode ? 'clientes_simulacao' : 'clientes';
    else if (base === 'mensagens') pathFinal = window.isSimulationMode ? 'config/mensagens_simulacao' : 'config/mensagens';
    
    // Integração obrigatória com a camada multiunidade do auth.js
    if (window.obterCaminhoUnidade && window.obterUnidade()) {
        return window.obterCaminhoUnidade(pathFinal);
    }
    return pathFinal;
};

window.PATH_CLIENTES = window.getDbPath('clientes');
window.PATH_MENSAGENS = window.getDbPath('mensagens');

window.usuarioLogado = null;
window.cargoLogado = null;
window.clientesArray = [];
window.clientesMap = {}; 
window.filtroAtual = 'todos';

window.operacoesAtivas = {}; 
window.acaoPendente = null; 
window.tipoAcaoPendente = null; 
window.isProcessing = false;
window.clienteSimulacaoAtual = null;

window.msgsMarketing = {
    aniversario: "Olá, *[Nome]*! Vimos aqui que o *seu aniversário está chegando*! 🎉\nE a equipe Top Haus faz questão de comemorar com você.\nPreparamos um *Desconto de R$ 50,00* exclusivo para você usar no seu almoço.\nPara resgatar, é só apresentar esta mensagem no nosso caixa no dia exato do seu aniversário!\nTe esperamos para celebrar!",
    premio: "🎉 Parabéns, *[Nome]*!\nVocê acaba de completar 10 almoços.\nNa sua próxima visita, você tem direito a *R$ 50,00 de desconto* na sua refeição!",
    inativo: "Olá *[Nome]*, faz tempo que não te vemos por aqui! Que tal almoçar com a gente essa semana?",
    agendadas: [],
    personalizadas: []
};

window.timeoutTotemMsg = null;
window.timerInatividade = null;
window.totemClienteTemp = null;

// ========================================================================
// NORMALIZAÇÃO AUTOMÁTICA DOS CLIENTES DA UNIDADE ATIVA
// ========================================================================
// A normalização de cadastro/edição não corrige registros antigos. Esta rotina
// executa uma vez por carregamento, sempre usando PATH_CLIENTES da unidade ativa.
window._normalizacaoNomesUnidade = {
    emAndamento: false,
    concluida: false
};

window.normalizarNomesDaUnidade = async (clientes) => {
    const estado = window._normalizacaoNomesUnidade;
    if (estado.emAndamento || estado.concluida || typeof window.normalizarNome !== 'function') return;

    const alteracoes = Object.entries(clientes || {}).filter(([, cliente]) => {
        if (!cliente || typeof cliente.nome !== 'string') return false;
        const nomePadronizado = window.normalizarNome(cliente.nome);
        return Boolean(nomePadronizado) && nomePadronizado !== cliente.nome;
    });

    if (!alteracoes.length) {
        estado.concluida = true;
        return;
    }

    estado.emAndamento = true;
    try {
        await Promise.all(alteracoes.map(([chave, cliente]) => {
            const nomePadronizado = window.normalizarNome(cliente.nome);
            const caminhoNome = window.PATH_CLIENTES + '/' + chave + '/nome';
            return window.firebaseSet(window.firebaseRef(window.db, caminhoNome), nomePadronizado);
        }));
        estado.concluida = true;
        console.info(`✅ ${alteracoes.length} nome(s) padronizado(s) na unidade ativa.`);
    } catch (erro) {
        console.error('❌ Não foi possível padronizar todos os nomes da unidade:', erro);
    } finally {
        estado.emAndamento = false;
    }
};

// ==========================================================================
// INICIALIZAÇÃO E LISTENERS (DOMContentLoaded)
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
    if(window.lucide) window.lucide.createIcons();
    
    // Trava de segurança: Se o dispositivo não tem unidade, não inicia as conexões com o banco de dados
    if (window.obterUnidade && !window.obterUnidade()) return;
    
    if(window.isSimulationMode) { 
        const banner = document.getElementById('banner-simulacao');
        if(banner) banner.classList.remove('hidden'); 
        document.body.classList.add('pt-12'); 
    }

    // Listener de Marketing
    window.firebaseOnValue(window.firebaseRef(window.db, window.PATH_MENSAGENS), (snapshot) => {
        const data = snapshot.val();
        if (data) { 
            window.msgsMarketing = {...window.msgsMarketing, ...data}; 
            if(!window.msgsMarketing.personalizadas) window.msgsMarketing.personalizadas = []; 
            if(!window.msgsMarketing.agendadas) window.msgsMarketing.agendadas = []; 
        }
    });

    // Listener Principal de Clientes
    window.firebaseOnValue(window.firebaseRef(window.db, window.PATH_CLIENTES), (snapshot) => {
        const data = snapshot.val() || {};
        window.normalizarNomesDaUnidade(data);
        if (data) { 
            window.clientesMap = data; 
            window.clientesArray = Object.values(data); 
        } else { 
            window.clientesMap = {}; 
            window.clientesArray = []; 
        }
        window.atualizarIndicadores(); 
        window.calcularNotificacoesPainel(); 
        window.filtrarLista(window.filtroAtual);
        
        // Atualiza a lixeira se estiver aberta
        const modalLixeira = document.getElementById('modal-lixeira');
        if(modalLixeira && !modalLixeira.classList.contains('hidden') && window.abrirLixeira) {
            window.abrirLixeira();
        }
    });

    // Listener do Totem (Inatividade)
    const areaTotem = document.getElementById('area-totem-interativa') || document.getElementById('totem-dynamic-area');
    if(areaTotem) {
        areaTotem.addEventListener('mousemove', window.resetarTimerTotem);
        areaTotem.addEventListener('touchstart', window.resetarTimerTotem);
        areaTotem.addEventListener('keydown', window.resetarTimerTotem);
    }
});

// ==========================================================================
// NAVEGAÇÃO DE ABAS
// ==========================================================================
window.alternarAba = (a) => {
    const bc = document.getElementById('btn-aba-caixa');
    const ba = document.getElementById('btn-aba-admin');
    
    if(a === 'caixa'){ 
        document.getElementById('aba-caixa').classList.remove('hidden'); 
        document.getElementById('aba-admin').classList.add('hidden'); 
        bc.classList.add('bg-gray-800'); 
        bc.classList.remove('bg-black'); 
        ba.classList.remove('bg-gray-800'); 
        ba.classList.add('bg-black'); 
        
        const bCpf = document.getElementById('busca-cpf');
        if(bCpf) setTimeout(() => bCpf.focus(), 50);
    } else { 
        document.getElementById('aba-caixa').classList.add('hidden'); 
        document.getElementById('aba-admin').classList.remove('hidden'); 
        ba.classList.add('bg-gray-800'); 
        ba.classList.remove('bg-black'); 
        bc.classList.remove('bg-gray-800'); 
        bc.classList.add('bg-black'); 
        window.filtrarLista('todos'); 
    }
};

// ==========================================================================
// RENDERIZAÇÃO DO PAINEL E INDICADORES ESTÁTICOS E AVANÇADOS
// ==========================================================================
window.atualizarIndicadores = () => { 
    const ativos = window.clientesArray.filter(c => !c.arquivado);
    
    // Cards Primários Originais
    document.getElementById('card-total').innerText = ativos.length; 
    document.getElementById('card-premios').innerText = ativos.filter(c => (c.almocos||0) >= 10).length; 
    document.getElementById('card-vips').innerText = ativos.filter(c => (c.premiosResgatados||0) > 0).length; 
    document.getElementById('card-niver-central').innerText = ativos.filter(c => window.isNiverMesCheck(c.nascimento)).length; 

    // Cálculo das Métricas Avançadas
    let totalPremiosGerados = 0;
    let totalPremiosResgatados = 0;
    let retencao30d = 0;
    let reativados30d = 0;
    let inativos30d = 0;

    ativos.forEach(c => {
        // Cálculo de Taxa de Resgate (Resgatados vs Total Disponibilizado na história)
        const tr = (c.premiosResgatados || 0);
        totalPremiosResgatados += tr;
        totalPremiosGerados += tr + Math.floor((c.almocos || 0) / 10);

        // Cálculo de Saúde da Base
        const dUltimaVisita = window.diasDesdeUltimaVisita(c);
        
        if (dUltimaVisita <= 30) {
            retencao30d++;
            
            // Lógica para Reativação: Identificar se antes dessa visita de 30d ele esteve inativo
            if (c.historico && c.historico.length >= 2) {
                const strPenultima = c.historico[c.historico.length - 2].split(' às ')[0].split('/');
                const penultimaTime = new Date(strPenultima[2], strPenultima[1] - 1, strPenultima[0]).getTime();
                if (Date.now() - penultimaTime > 30 * 86400000) {
                    reativados30d++;
                }
            } else if (c.historico && c.historico.length === 1 && c.dataCadastro) {
                // Visitou recentemente, só tem 1 visita, mas o cadastro tem mais de 30 dias (era um lead frio)
                const partesCad = c.dataCadastro.split('/');
                if(partesCad.length === 3) {
                    const cadTime = new Date(partesCad[2], partesCad[1]-1, partesCad[0]).getTime();
                    if (Date.now() - cadTime > 30 * 86400000) reativados30d++;
                }
            }
        } else if (dUltimaVisita > 30 && dUltimaVisita !== 999) {
            inativos30d++;
        }
    });

    const txResgate = totalPremiosGerados > 0 ? Math.round((totalPremiosResgatados / totalPremiosGerados) * 100) : 0;
    
    // Atualização dos Cards Avançados
    const cardTaxa = document.getElementById('card-taxa-resgate');
    const cardRetencao = document.getElementById('card-retencao');
    const cardReativacao = document.getElementById('card-reativacao');
    const cardInativosTotal = document.getElementById('card-inativos-total');

    if(cardTaxa) cardTaxa.innerText = `${txResgate}%`;
    if(cardRetencao) cardRetencao.innerText = retencao30d;
    if(cardReativacao) cardReativacao.innerText = reativados30d;
    if(cardInativosTotal) cardInativosTotal.innerText = inativos30d;
};

window.calcularNotificacoesPainel = () => {
    const p = document.getElementById('painel-notificacoes'); 
    p.innerHTML = '';
    
    let nNiv = 0, nPre = 0, nIna = 0; 
    const a = new Date().getFullYear();
    const ativos = window.clientesArray.filter(c => !c.arquivado);
    
    ativos.forEach(c => {
        const dNiv = window.diasParaAniversario(c.nascimento); 
        if (dNiv >= 0 && dNiv <= 7 && c.notificadoAniversarioAno !== a) nNiv++;
        
        if ((c.almocos||0) >= 10 && !c.notificadoPremio) nPre++;
        
        const dSum = window.diasDesdeUltimaVisita(c);
        const dNot = c.notificadoInativoData ? Math.floor((Date.now() - c.notificadoInativoData) / 86400000) : 999;
        
        if (dSum > 15 && dNot > 15) nIna++; 
    });
    
    if(nNiv > 0) {
        p.innerHTML += `
            <div onclick="filtrarLista('alerta_niver')" class="bg-red-50 border border-red-200 p-4 rounded-xl cursor-pointer hover:bg-red-100 transition shadow-sm flex items-center gap-3">
                <i data-lucide="cake" class="w-8 h-8 text-red-500"></i>
                <div><p class="text-sm font-bold text-red-800">Aniversários!</p><p class="text-xs text-red-600"><strong>${nNiv}</strong> pendentes.</p></div>
            </div>`;
    }
    if(nPre > 0) {
        p.innerHTML += `
            <div onclick="filtrarLista('alerta_premio')" class="bg-amber-50 border border-amber-200 p-4 rounded-xl cursor-pointer hover:bg-amber-100 transition shadow-sm flex items-center gap-3">
                <i data-lucide="gift" class="w-8 h-8 text-amber-500"></i>
                <div><p class="text-sm font-bold text-amber-800">Prêmios!</p><p class="text-xs text-amber-600"><strong>${nPre}</strong> pendentes.</p></div>
            </div>`;
    }
    if(nIna > 0) {
        p.innerHTML += `
            <div onclick="filtrarLista('alerta_inativos')" class="bg-blue-50 border border-blue-200 p-4 rounded-xl cursor-pointer hover:bg-blue-100 transition shadow-sm flex items-center gap-3">
                <i data-lucide="user-minus" class="w-8 h-8 text-blue-500"></i>
                <div><p class="text-sm font-bold text-blue-800">Ausentes!</p><p class="text-xs text-blue-600"><strong>${nIna}</strong> (+15 dias).</p></div>
            </div>`;
    }
    if(window.lucide) window.lucide.createIcons();
};

// ==========================================================================
// FILTROS E TABELAS
// ==========================================================================
window.filtrarLista = (t, dI=null, dF=null) => {
    window.filtroAtual = t; 
    const tf = document.getElementById('filtro-atual-texto');
    const sf = document.getElementById('sub-filtros-niver'); 
    let l = [];
    
    if (t.startsWith('niver')) {
        sf.classList.remove('hidden'); 
    } else {
        sf.classList.add('hidden');
    }
    
    const a = new Date().getFullYear();
    const ativos = window.clientesArray.filter(c => !c.arquivado);
    
    if (t === 'todos') { 
        tf.innerText = 'Exibindo: Todos os clientes'; 
        l = ativos; 
    } else if (t === 'premios') { 
        tf.innerText = 'Exibindo: Prêmios a resgatar'; 
        l = ativos.filter(c => (c.almocos||0) >= 10); 
    } else if (t === 'vips') { 
        tf.innerText = 'Exibindo: Clientes VIP'; 
        l = ativos.filter(c => (c.premiosResgatados||0) > 0).sort((x,y) => (y.premiosResgatados||0) - (x.premiosResgatados||0)); 
    } else if (t === 'niver_mes') { 
        tf.innerText = 'Exibindo: Aniversariantes do mês'; 
        l = ativos.filter(c => window.isNiverMesCheck(c.nascimento)); 
    } else if (t === 'niver_periodo') { 
        tf.innerText = `Exibindo: Aniversariantes no período`; 
        l = ativos.filter(c => window.isNiverInPeriod(c.nascimento, dI, dF)); 
    } else if (t === 'alerta_niver') { 
        tf.innerText = 'Exibindo: Aniversários aguardando aviso'; 
        l = ativos.filter(c => {
            const d = window.diasParaAniversario(c.nascimento);
            return d >= 0 && d <= 7 && c.notificadoAniversarioAno !== a;
        }); 
    } else if (t === 'alerta_premio') { 
        tf.innerText = 'Exibindo: Prêmios aguardando aviso'; 
        l = ativos.filter(c => (c.almocos||0) >= 10 && !c.notificadoPremio); 
    } else if (t === 'alerta_inativos') { 
        tf.innerText = 'Exibindo: Inativos (Alerta +15 dias)'; 
        l = ativos.filter(c => {
            const dSum = window.diasDesdeUltimaVisita(c);
            const dNot = c.notificadoInativoData ? Math.floor((Date.now() - c.notificadoInativoData)/86400000) : 999; 
            return dSum > 15 && dNot > 15;
        }); 
    } else if (t === 'inativos_30d') { 
        tf.innerText = 'Exibindo: Inativos (Visão Geral +30 dias)'; 
        l = ativos.filter(c => window.diasDesdeUltimaVisita(c) > 30 && window.diasDesdeUltimaVisita(c) !== 999); 
    }
    
    window.renderizarTabela(l);
};

window.filtrarPorPeriodo = () => { 
    const i = document.getElementById('filtro-data-inicio').value;
    const f = document.getElementById('filtro-data-fim').value; 
    if(!i || !f) return; 
    window.filtrarLista('niver_periodo', i, f); 
};

window.filtrarPorTexto = (v) => { 
    const b = v.toLowerCase(); 
    const ativos = window.clientesArray.filter(c => !c.arquivado);
    window.renderizarTabela(ativos.filter(c => 
        (c.nome||'').toLowerCase().includes(b) || 
        (c.cpf||'').includes(b) || 
        (c.telefone||'').includes(b)
    )); 
};

window.renderizarTabela = (l) => {
    const tb = document.getElementById('tabela-clientes'); 
    tb.innerHTML = '';
    
    const termoInput = document.getElementById('busca-admin');
    const termo = termoInput ? termoInput.value.trim() : '';

    if(!l || l.length === 0){ 
        const msgVazio = termo ? `Nenhum cliente encontrado para "${window.escapeHTML(termo)}".` : "Nenhum resultado para o filtro atual.";
        tb.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-400 font-medium">${msgVazio}</td></tr>`; 
        return; 
    }
    
    l.forEach(c => {
        const bHist = ((c.premiosResgatados||0) > 0 || (c.historicoAniversarios && c.historicoAniversarios.length > 0) || (c.historicoConquistas && c.historicoConquistas.length > 0)) ? 
            `<button onclick="abrirHistorico('${c.cpf}')" class="text-gray-500 hover:text-black p-1.5 transition" title="Ver histórico"><i data-lucide="history" class="w-4 h-4"></i></button>` : ``;
        const bEdit = `<button onclick="abrirEditar('${c.cpf}')" class="text-gray-500 hover:text-indigo-600 p-1.5 transition" title="Editar cadastro"><i data-lucide="edit-3" class="w-4 h-4"></i></button>`;
        const bZap = `<button onclick="abrirModalWhatsApp('${c.cpf}')" class="text-green-600 hover:text-green-700 p-1.5 transition" title="Enviar WhatsApp"><i data-lucide="message-circle" class="w-4 h-4"></i></button>`;
        const bSim = (window.isSimulationMode && window.permissoesLogado && window.permissoesLogado.simulacao) ? 
            `<button onclick="abrirSimulador('${c.cpf}')" class="text-orange-600 hover:text-orange-700 p-1.5 transition" title="Simular dados"><i data-lucide="flask-conical" class="w-4 h-4"></i></button>` : ``;
        const bArq = (window.permissoesLogado && window.permissoesLogado.clientes) ? 
            `<button onclick="arquivarCliente('${c.cpf}')" class="text-red-400 hover:text-red-600 p-1.5 transition" title="Arquivar cliente"><i data-lucide="archive-x" class="w-4 h-4"></i></button>` : ``;
        
        const tr = document.createElement('tr'); 
        tr.className = 'border-b hover:bg-gray-50 transition';
        tr.innerHTML = `
            <td class="py-3 px-6 text-center font-bold">${window.escapeHTML(window.nomeExibicao(c.nome))}</td>
            <td class="py-3 px-6 text-center text-xs font-mono text-gray-500">${window.formatarCPF(c.cpf)}<br>${window.formatarTel(c.telefone)}</td>
            <td class="py-3 px-6 text-center font-bold text-base ${(c.almocos||0) >= 10 ? 'text-black' : 'text-gray-500'}">${c.almocos||0}</td>
            <td class="py-3 px-6 text-center font-bold text-gray-500">${c.premiosResgatados||0}</td>
            <td class="py-3 px-6 text-right"><div class="flex justify-end items-center gap-1">${bSim}${bZap}${bEdit}${bHist}${bArq}</div></td>`;
        tb.appendChild(tr);
    }); 
    if(window.lucide) window.lucide.createIcons();
};

// ==========================================================================
// EXPORTAÇÃO E RESET DO SISTEMA (Aprimorado)
// ==========================================================================
window.exportarExcel = () => { 
    if(!window.permissoesLogado || !window.permissoesLogado.clientes) {
        return window.mostrarToast("Seu perfil não tem acesso a esta ação.", "erro");
    }

    let csvContent = "\ufeffNome;CPF;Nascimento;WhatsApp;Acumulados;Resgates;Status;Ultima Visita\n"; 
    const ativos = window.clientesArray.filter(c => !c.arquivado);
    
    ativos.forEach(c => {
        const dUltima = c.historico && c.historico.length > 0 ? c.historico[c.historico.length-1].split(' às ')[0] : 'Nunca';
        const inativo = window.diasDesdeUltimaVisita(c) > 30 ? 'Inativo (+30d)' : 'Ativo';
        
        csvContent += `${window.nomeExibicao(c.nome)};${c.cpf};${c.nascimento};${c.telefone};${c.almocos || 0};${c.premiosResgatados || 0};${inativo};${dUltima}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `TopHaus_Clientes_Operacional_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    if(window.logAuditoria) window.logAuditoria('Exportação', 'Base de clientes exportada para Excel/CSV (Layout Expandido).');
};

window.resetarSistema = () => { 
    if(!window.permissoesLogado || !window.permissoesLogado.reset) {
        return window.mostrarToast("Seu perfil não tem acesso a esta ação.", "erro");
    }

    const msgAlerta = window.isSimulationMode 
        ? "Resetar SIMULAÇÃO? Digite APAGAR:" 
        : "ALERTA CRÍTICO! Digite APAGAR para excluir TODA a base de clientes da unidade atual:";

    if(prompt(msgAlerta) === "APAGAR") {
        window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES), null).then(() => {
            window.mostrarToast("Banco de dados resetado com sucesso.");
            if(window.logAuditoria) window.logAuditoria('Reset', 'A base de dados de clientes foi completamente apagada.');
        }).catch(() => {
            window.mostrarToast("Não foi possível concluir a ação. Tente novamente.", "erro");
        }); 
    } else {
        window.mostrarToast("Ação cancelada pelo usuário.", "erro");
    }
};

// ==========================================================================
// FUNÇÕES DE AMBIENTE DE SIMULAÇÃO (LABORATÓRIO)
// ==========================================================================
window.abrirSimulador = (cpf) => {
    window.clienteSimulacaoAtual = window.clientesMap[cpf];
    if(!window.clienteSimulacaoAtual) return;
    document.getElementById('sim-cliente-nome').innerText = window.clienteSimulacaoAtual.nome.split(' ')[0];
    document.getElementById('sim-qtd-atual').innerText = window.clienteSimulacaoAtual.almocos || 0;
    document.getElementById('sim-input-almocos').value = window.clienteSimulacaoAtual.almocos || 0;
    const modal = document.getElementById('modal-simulacao'); 
    modal.classList.remove('hidden'); 
    if(window.prenderFocoModal) window.prenderFocoModal(modal);
};

window.salvarSimulacaoAlmocos = (event) => {
    if(!window.clienteSimulacaoAtual) return;
    
    let btn = null;
    let textoOriginal = "Salvar";
    if(event && event.target) {
        btn = event.target;
        textoOriginal = btn.innerText;
        btn.disabled = true;
        btn.innerText = 'Salvando...';
    }

    window.clienteSimulacaoAtual.almocos = parseInt(document.getElementById('sim-input-almocos').value) || 0;
    window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + window.clienteSimulacaoAtual.cpf), window.clienteSimulacaoAtual).then(() => { 
        window.mostrarToast("Cliente atualizado com sucesso."); 
        if(window.fecharModal) window.fecharModal('modal-simulacao'); 
    }).finally(() => {
        if(btn) {
            btn.disabled = false;
            btn.innerText = textoOriginal;
        }
    });
};

window.simularAniversarioHoje = (event) => {
    if(!window.clienteSimulacaoAtual) return;
    
    let btn = null;
    let textoOriginal = "";
    if(event && event.currentTarget) {
        btn = event.currentTarget;
        textoOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = 'Atualizando...';
    }

    const hoje = new Date(); 
    const dia = String(hoje.getDate()).padStart(2, '0'); 
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    
    window.clienteSimulacaoAtual.nascimento = `${hoje.getFullYear() - 30}-${mes}-${dia}`;
    window.clienteSimulacaoAtual.aniversarioResgatadoAno = null;
    if(window.clienteSimulacaoAtual.historicoAniversarios) {
        window.clienteSimulacaoAtual.historicoAniversarios = window.clienteSimulacaoAtual.historicoAniversarios.filter(h => h.ano !== hoje.getFullYear());
    }
    
    window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + window.clienteSimulacaoAtual.cpf), window.clienteSimulacaoAtual).then(() => { 
        window.mostrarToast("Cliente atualizado com sucesso."); 
        if(window.fecharModal) window.fecharModal('modal-simulacao'); 
    }).finally(() => {
        if(btn) {
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
        }
    });
};

window.simularInatividade = (event) => {
    if(!window.clienteSimulacaoAtual) return;

    let btn = null;
    let textoOriginal = "";
    if(event && event.currentTarget) {
        btn = event.currentTarget;
        textoOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = 'Atualizando...';
    }

    window.clienteSimulacaoAtual.ultimaVisitaTimestamp = Date.now() - (16 * 24 * 60 * 60 * 1000); 
    window.clienteSimulacaoAtual.notificadoInativoData = null;
    
    window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + window.clienteSimulacaoAtual.cpf), window.clienteSimulacaoAtual).then(() => { 
        window.mostrarToast("Cliente atualizado com sucesso."); 
        if(window.fecharModal) window.fecharModal('modal-simulacao'); 
    }).finally(() => {
        if(btn) {
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
        }
    });
};
