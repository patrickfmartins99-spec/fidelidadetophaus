// marketing.js
// Módulo 5: Robô do WhatsApp, Automações e Disparos em Massa (Suporte a Campanhas Recorrentes e Fila)[span_0](start_span)[span_0](end_span)

// ==========================================================================
// CORE DO ROBÔ DE MARKETING: ENVIAR PARA A FILA FIREBASE
// ==========================================================================
window.enviarParaFilaRobo = (cpf, telefone, textoMensagem) => {
    if(!telefone || !textoMensagem) return;
    const telLimpo = telefone.toString().replace(/\D/g, '');
    if(telLimpo.length < 10) return; 
    
    window.firebasePush(window.firebaseRef(window.db, 'fila_mensagens'), {
        cpf: cpf,
        telefone: telLimpo,
        texto: textoMensagem,
        timestamp: Date.now(),
        status: 'pendente' // Novo status rastreável
    }).then(() => {
        console.log("Ordem despachada para o Robô Node.js");
    });
};

window.checarEAvisarAlmoco = (c) => {
    const faltam = 10 - (c.almocos || 0);
    if(faltam > 0 && faltam < 10) {
        const msg = `Olá *${(c.nome||'').split(' ')[0]}*, seu almoço de hoje foi contabilizado no Top Haus! 🍽️\nVocê tem *${c.almocos} almoço(s)* acumulados.\nFaltam apenas *${faltam}* para você ganhar seus *R$ 50,00 de desconto*!`;
        window.enviarParaFilaRobo(c.cpf, c.telefone, msg);
    } else if (c.almocos === 10) {
        const txtPremio = window.msgsMarketing.premio || "Parabéns [Nome]! Você completou 10 almoços. No próximo você ganha R$ 50 de desconto!";
        const msg = txtPremio.replace(/\[Nome\]/g, (c.nome||'').split(' ')[0]).replace(/\[Acumulados\]/g, c.almocos);
        window.enviarParaFilaRobo(c.cpf, c.telefone, msg);
        window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES+`/${c.cpf}/notificadoPremio`), true);
    }
};

// ==========================================================================
// VISUALIZAÇÃO E CONTROLE DA FILA DE ENVIOS
// ==========================================================================
window.listenerFilaAtivo = false;
window.ultimaFilaSnap = null;

window.iniciarListenerFila = () => {
    if(window.listenerFilaAtivo) return;
    window.listenerFilaAtivo = true;
    window.firebaseOnValue(window.firebaseRef(window.db, 'fila_mensagens'), (snap) => {
        window.ultimaFilaSnap = snap;
        const modal = document.getElementById('modal-marketing');
        if(modal && !modal.classList.contains('hidden')) {
            window.renderizarFilaEnvios(snap);
        }
    });
};

window.renderizarFilaEnvios = (snapshot) => {
    const area = document.getElementById('area-fila-envio');
    const btnLimpar = document.getElementById('btn-limpar-fila');
    if(!area) return;

    area.innerHTML = '';
    if (!snapshot || !snapshot.exists()) {
        area.innerHTML = '<p class="text-sm text-gray-500 text-center py-2">Nenhuma mensagem na fila no momento.</p>';
        if(btnLimpar) btnLimpar.classList.add('hidden');
        return;
    }

    if(btnLimpar) btnLimpar.classList.remove('hidden');
    
    const msgs = [];
    snapshot.forEach(child => {
        msgs.push({ id: child.key, ...child.val() });
    });
    
    // Ordena as mais recentes primeiro
    msgs.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));

    msgs.forEach(m => {
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
            botoes += `<button onclick="cancelarMensagemFila('${m.id}')" class="text-red-400 hover:text-red-600 p-1.5 transition rounded hover:bg-red-50" title="Cancelar envio"><i data-lucide="x-circle" class="w-4 h-4"></i></button>`;
        }
        if(status === 'erro' || status === 'falha' || status === 'cancelado') {
            botoes += `<button onclick="reenviarMensagemFila('${m.id}')" class="text-indigo-400 hover:text-indigo-600 p-1.5 transition rounded hover:bg-indigo-50 ml-1" title="Tentar Novamente"><i data-lucide="refresh-cw" class="w-4 h-4"></i></button>`;
        }

        area.innerHTML += `
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
    });

    if(window.lucide) window.lucide.createIcons();
};

window.cancelarMensagemFila = (id) => {
    window.firebaseSet(window.firebaseRef(window.db, `fila_mensagens/${id}/status`), 'cancelado');
    if(window.logAuditoria) window.logAuditoria('Marketing', 'Envio de mensagem cancelado na fila.');
};

window.reenviarMensagemFila = (id) => {
    window.firebaseSet(window.firebaseRef(window.db, `fila_mensagens/${id}/status`), 'pendente');
    window.firebaseSet(window.firebaseRef(window.db, `fila_mensagens/${id}/timestamp`), Date.now());
    if(window.logAuditoria) window.logAuditoria('Marketing', 'Mensagem reenviada para a fila de processamento.');
};

window.limparFilaCompleta = () => {
    window.confirmacaoDupla(
        "Limpar Fila de Envios", 
        "Deseja apagar todo o histórico da fila de marketing? Mensagens com status pendente não serão entregues.",
        () => {
            window.firebaseSet(window.firebaseRef(window.db, 'fila_mensagens'), null).then(() => {
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
    if(document.getElementById('mkt-novo-tipo')) return; // Garante injeção única
    
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
        
        <!-- PAINEL DE DISPARO ÚNICO -->
        <div id="painel-mkt-unica" class="flex gap-2">
            <input type="date" id="mkt-nova-data" class="p-2 border border-indigo-200 rounded-lg text-sm w-1/2 outline-none text-center">
            <input type="time" id="mkt-novo-horario-unica" class="p-2 border border-indigo-200 rounded-lg text-sm w-1/2 outline-none text-center" value="09:00">
        </div>

        <!-- PAINEL DE DISPARO RECORRENTE -->
        <div id="painel-mkt-recorrente" class="hidden flex-col gap-3 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
            <div class="flex gap-2">
                <select id="mkt-nova-freq" onchange="alternarFreqCampanha()" class="p-2 border border-indigo-200 rounded-lg text-sm w-1/2 outline-none font-bold text-indigo-900">
                    <option value="semanal">Semanal</option>
                    <option value="mensal">Mensal</option>
                    <option value="anual">Anual</option>
                </select>
                <input type="time" id="mkt-novo-horario-rec" class="p-2 border border-indigo-200 rounded-lg text-sm w-1/2 outline-none text-center font-bold" value="09:00">
            </div>
            
            <div id="freq-semanal" class="flex flex-wrap gap-2 text-xs font-bold text-gray-700">
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
        </div>
    `;
    
    wrapperAntigo.style.display = 'none'; // Esconde os inputs legados sem quebrar o HTML nativo
    wrapperAntigo.parentNode.insertBefore(painel, wrapperAntigo);
};

window.alternarTipoCampanha = () => {
    const t = document.getElementById('mkt-novo-tipo').value;
    document.getElementById('painel-mkt-unica').style.display = (t === 'unica') ? 'flex' : 'none';
    document.getElementById('painel-mkt-recorrente').style.display = (t === 'recorrente') ? 'flex' : 'none';
};

window.alternarFreqCampanha = () => {
    const f = document.getElementById('mkt-nova-freq').value;
    document.getElementById('freq-semanal').style.display = (f === 'semanal') ? 'flex' : 'none';
    document.getElementById('freq-mensal').style.display = (f === 'mensal') ? 'flex' : 'none';
    document.getElementById('freq-anual').style.display = (f === 'anual') ? 'flex' : 'none';
};

// ==========================================================================
// CENTRAL GERENCIAL DE MARKETING (MODAL GLOBAL)
// ==========================================================================
window.abrirCentralMarketing = () => {
    window.injetarUICampanhas(); // Garante que a UI rica esteja carregada
    
    document.getElementById('mkt-msg-niver').value = window.msgsMarketing.aniversario || '';
    document.getElementById('mkt-msg-premio').value = window.msgsMarketing.premio || '';
    document.getElementById('mkt-msg-inativo').value = window.msgsMarketing.inativo || '';
    
    const btnLimpar = document.getElementById('btn-limpar-fila');
    if(btnLimpar) btnLimpar.onclick = window.limparFilaCompleta;

    window.renderizarMensagensCustomizadas();
    
    // Inicia e renderiza os dados da Fila de Envios
    window.iniciarListenerFila();
    if(window.ultimaFilaSnap) {
        window.renderizarFilaEnvios(window.ultimaFilaSnap);
    }
    
    const modal = document.getElementById('modal-marketing'); 
    modal.classList.remove('hidden'); 
    if(window.prenderFocoModal) window.prenderFocoModal(modal);
};

window.renderizarMensagensCustomizadas = () => {
    // 1. Renderizar Agendamentos e Recorrências
    const areaAg = document.getElementById('area-agendamentos'); 
    if(areaAg) {
        areaAg.innerHTML = '';
        const listaAg = Array.isArray(window.msgsMarketing.agendadas) ? window.msgsMarketing.agendadas : Object.values(window.msgsMarketing.agendadas || {});
        
        listaAg.forEach((m, idx) => {
            // Retrocompatibilidade automática para campanhas criadas anteriormente
            const tipoC = m.tipo || 'unica'; 
            const statusC = m.status || 'ativa'; 
            
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
                if(m.frequencia === 'semanal') {
                    const diasMapa = {0:'Dom', 1:'Seg', 2:'Ter', 3:'Qua', 4:'Qui', 5:'Sex', 6:'Sáb'};
                    const nmDias = (c.diasSemana||[]).map(d => diasMapa[d]).join(', ');
                    det = `Toda Semana (${nmDias})`;
                } else if(m.frequencia === 'mensal') {
                    det = `Todo dia ${c.diaMes} do mês`;
                } else if(m.frequencia === 'anual') {
                    det = `Anualmente em ${c.diaAno}`;
                }
                labelTipo = `<span class="bg-indigo-600 text-white px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shadow-sm">Recorrente: ${m.frequencia}</span>`;
                info = `<i data-lucide="repeat" class="w-3.5 h-3.5"></i> ${det}${hor}`;
            }
            
            const bgStatus = statusC === 'ativa' ? 'bg-green-100 text-green-800 border-green-300' : 
                            (statusC === 'pausada' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-red-100 text-red-800 border-red-300');
            
            areaAg.innerHTML += `
                <div class="bg-white border border-gray-200 p-4 rounded-xl shadow-sm relative mb-3">
                    <button onclick="removerAgendamento(${idx})" class="absolute top-4 right-3 text-red-400 hover:text-red-600 transition" title="Excluir campanha"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    
                    <div class="flex flex-wrap items-center gap-2 mb-3 pr-6">
                        ${labelTipo}
                        <select onchange="alterarStatusCampanha(${idx}, this.value)" class="text-[10px] font-black px-2 py-1 rounded-lg border outline-none cursor-pointer uppercase shadow-sm transition ${bgStatus}">
                            <option value="ativa" class="bg-white text-black" ${statusC === 'ativa' ? 'selected' : ''}>🟢 Ativa</option>
                            <option value="pausada" class="bg-white text-black" ${statusC === 'pausada' ? 'selected' : ''}>🟡 Pausada</option>
                            <option value="encerrada" class="bg-white text-black" ${statusC === 'encerrada' ? 'selected' : ''}>🔴 Encerrada</option>
                        </select>
                    </div>
                    
                    <p class="font-bold text-sm text-gray-900 mb-2">${window.escapeHTML(m.titulo)}</p>
                    <div class="text-xs text-indigo-700 mb-3 flex items-center gap-1 font-bold bg-indigo-50 p-2 rounded-lg border border-indigo-100 inline-flex">${info}</div>
                    <p class="text-xs text-gray-600 text-left bg-gray-50 p-3 rounded-lg border border-gray-100 italic">"${window.escapeHTML(m.texto)}"</p>
                </div>`;
        });
    }

    // 2. Renderizar Mensagens Customizadas (Botões Individuais)
    const areaCs = document.getElementById('area-mensagens-custom'); 
    if(areaCs) {
        areaCs.innerHTML = '';
        const listaCs = Array.isArray(window.msgsMarketing.personalizadas) ? window.msgsMarketing.personalizadas : Object.values(window.msgsMarketing.personalizadas || {});
        
        listaCs.forEach((m, idx) => {
            areaCs.innerHTML += `
                <div class="bg-white border border-gray-200 p-4 rounded-xl shadow-sm relative mb-3">
                    <button onclick="removerMsgCustom(${idx})" class="absolute top-2 right-2 text-red-400 hover:text-red-600 transition" title="Remover botão"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    <input type="text" id="mkt-custom-titulo-${idx}" value="${window.escapeHTML(m.titulo)}" placeholder="Nome do botão" class="font-bold text-sm mb-2 w-3/4 outline-none border-b border-gray-200 text-center">
                    <textarea id="mkt-custom-texto-${idx}" rows="2" placeholder="Texto da mensagem" class="w-full bg-gray-50 border border-gray-100 rounded-lg p-2 text-sm outline-none text-center">${window.escapeHTML(m.texto)}</textarea>
                </div>`;
        });
    }
    
    if(window.lucide) window.lucide.createIcons();
};

window.adicionarAgendamento = () => {
    const uiAtiva = !!document.getElementById('mkt-novo-tipo');
    let novaCampanha = {};
    const texto = document.getElementById('mkt-agenda-texto').value;

    if (uiAtiva) {
        const tipo = document.getElementById('mkt-novo-tipo').value;
        const titulo = document.getElementById('mkt-novo-titulo').value;
        
        if(!titulo || !texto) return window.mostrarToast("Preencha o título e o texto da campanha para continuar.", "erro");
        
        // Estrutura Base Escalável
        novaCampanha = {
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
            
            if (freq === 'semanal') {
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
            }
        }
    } else {
        // Fallback de retrocompatibilidade para o HTML original cego
        const data = document.getElementById('mkt-agenda-data').value;
        const titulo = document.getElementById('mkt-agenda-titulo').value;
        if(!data || !titulo || !texto) return window.mostrarToast("Preencha todos os campos para continuar.", "erro");
        novaCampanha = { data: data, titulo: titulo, texto: texto, tipo: 'unica', status: 'ativa' };
    }
    
    if(!Array.isArray(window.msgsMarketing.agendadas)) window.msgsMarketing.agendadas = Object.values(window.msgsMarketing.agendadas||{}); 
    window.msgsMarketing.agendadas.push(novaCampanha);
    
    // Limpeza de UI
    document.getElementById('mkt-agenda-texto').value = '';
    if (uiAtiva) {
        document.getElementById('mkt-novo-titulo').value = '';
        document.querySelectorAll('.chk-dia').forEach(c => c.checked = false);
    } else {
        document.getElementById('mkt-agenda-data').value = '';
        document.getElementById('mkt-agenda-titulo').value = '';
    }
    
    window.renderizarMensagensCustomizadas(); 
};

// Modificação de Status em Tempo Real
window.alterarStatusCampanha = (idx, novoStatus) => {
    if(Array.isArray(window.msgsMarketing.agendadas) && window.msgsMarketing.agendadas[idx]) {
        window.msgsMarketing.agendadas[idx].status = novoStatus;
        window.renderizarMensagensCustomizadas();
        window.mostrarToast("Status alterado. Salve as alterações para confirmar.", "sucesso");
    }
};

window.removerAgendamento = (idx) => { 
    window.msgsMarketing.agendadas.splice(idx, 1); 
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

window.salvarCentralMarketing = () => {
    const btn = document.getElementById('btn-marketing-salvar');
    const span = document.getElementById('btn-marketing-salvar-text');
    
    if(btn) btn.disabled = true;
    if(span) span.innerText = 'Salvando...';

    window.msgsMarketing.aniversario = document.getElementById('mkt-msg-niver').value;
    window.msgsMarketing.premio = document.getElementById('mkt-msg-premio').value;
    window.msgsMarketing.inativo = document.getElementById('mkt-msg-inativo').value;
    
    window.msgsMarketing.agendadas = Array.isArray(window.msgsMarketing.agendadas) ? window.msgsMarketing.agendadas : Object.values(window.msgsMarketing.agendadas||{});
    
    const lista = Array.isArray(window.msgsMarketing.personalizadas) ? window.msgsMarketing.personalizadas : Object.values(window.msgsMarketing.personalizadas||{});
    lista.forEach((m, idx) => { 
        m.titulo = document.getElementById(`mkt-custom-titulo-${idx}`).value; 
        m.texto = document.getElementById(`mkt-custom-texto-${idx}`).value; 
    });
    window.msgsMarketing.personalizadas = lista;
    
    window.firebaseSet(window.firebaseRef(window.db, window.PATH_MENSAGENS), window.msgsMarketing).then(() => { 
        window.mostrarToast("Campanha agendada com sucesso."); 
        
        if(window.logAuditoria) window.logAuditoria('Marketing', 'As configurações da Central de Marketing foram atualizadas.');
        
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Salvar alterações';
        if(window.fecharModal) window.fecharModal('modal-marketing'); 
    }).catch(() => {
        window.mostrarToast("Não foi possível salvar. Tente novamente.", "erro");
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Salvar alterações';
    });
};

// ==========================================================================
// DISPARO INDIVIDUAL NA TABELA (MODAL WHATSAPP)
// ==========================================================================
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
        window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES+`/${cpf}/notificadoAniversarioAno`), new Date().getFullYear()); 
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
