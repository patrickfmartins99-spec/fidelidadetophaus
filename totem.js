// totem.js
// Módulo 6: Interface de Autoatendimento (Totem) e Lógica de Ecrã Fullscreen (Alinhado ao index.html original)

window.intervaloContagemTotem = null;

// ==========================================================================
// CONTROLO DE ECRÃ E NAVEGAÇÃO DO TOTEM (COM SEGURANÇA)
// ==========================================================================
window.entrarModoTotemDaTelaLogin = () => {
    document.getElementById('tela-login').classList.add('hidden');
    document.getElementById('app-dashboard').classList.add('hidden');
    
    if(document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(()=>{});
    }
    
    if(window.logAuditoria) window.logAuditoria('Totem', 'Modo Autoatendimento (Totem) iniciado.');
    
    document.getElementById('tela-totem').classList.remove('hidden');
    window.totemVoltarInicio();
};

window.abrirModalSaidaTotem = () => {
    const modal = document.getElementById('modal-totem-saida');
    if(modal) {
        modal.classList.remove('hidden');
        document.getElementById('totem-pin-input').value = '';
        setTimeout(() => document.getElementById('totem-pin-input').focus(), 100);
    }
};

window.verificarPinTotem = () => {
    if(window.vkFechar) window.vkFechar();
    const pin = document.getElementById('totem-pin-input').value;
    
    if(pin === '1234' || pin === 'admin') {
        if(window.logAuditoria) window.logAuditoria('Segurança Totem', 'Saída autorizada do modo totem (PIN Correto).');
        if(window.fecharModal) window.fecharModal('modal-totem-saida');
        window.sairModoTotem();
    } else {
        if(window.logAuditoria) window.logAuditoria('Segurança Totem', 'Tentativa de saída bloqueada (PIN Incorreto).');
        window.mostrarToast("PIN incorreto. Acesso negado.", "erro");
        document.getElementById('totem-pin-input').value = '';
        document.getElementById('totem-pin-input').focus();
    }
};

window.sairModoTotem = () => {
    if(window.vkFechar) window.vkFechar();
    
    if(document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(()=>{});
    }
    document.getElementById('tela-totem').classList.add('hidden');
    clearTimeout(window.timerInatividade);
    clearInterval(window.intervaloContagemTotem);
    
    if (window.usuarioLogado) { 
        document.getElementById('app-dashboard').classList.remove('hidden'); 
        window.mostrarToast("Painel gerencial liberado."); 
    } else { 
        document.getElementById('tela-login').classList.remove('hidden'); 
        document.getElementById('tela-login').classList.add('flex'); 
    }
};

// Retenção de Sessão Inteligente e Prevenção de Abandono
window.resetarTimerTotem = () => {
    clearTimeout(window.timerInatividade);
    if(document.getElementById('tela-totem').classList.contains('hidden')) return;
    
    if(!document.getElementById('totem-tela-busca').classList.contains('hidden')) return;

    const emCadastro = !document.getElementById('totem-tela-cadastro').classList.contains('hidden');
    const tempoInatividade = emCadastro ? 90000 : 45000;
    
    window.timerInatividade = setTimeout(() => {
        if(window.logAuditoria) window.logAuditoria('Totem', 'Sessão abandonada e reiniciada automaticamente por inatividade.');
        window.totemVoltarInicio();
    }, tempoInatividade);
};

window.totemVoltarInicio = () => {
    if(window.vkFechar) window.vkFechar();
    
    clearTimeout(window.timeoutTotemMsg); 
    clearTimeout(window.timerInatividade);
    clearInterval(window.intervaloContagemTotem);
    
    if (window.totemClienteTemp && window.operacoesAtivas) {
        window.operacoesAtivas[window.totemClienteTemp.cpf] = false;
    }
    
    window.totemClienteTemp = null; 
    window.isProcessing = false;
    
    const btnAvancar = document.getElementById('btn-totem-avancar');
    const spanAvancar = document.getElementById('btn-totem-avancar-text');
    if(btnAvancar) btnAvancar.disabled = false;
    if(spanAvancar) spanAvancar.innerText = 'Avançar';
    
    ['totem-tela-cadastro', 'totem-tela-opcoes', 'totem-tela-mensagem', 'totem-bottom-bar'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
    
    document.getElementById('totem-tela-busca').classList.remove('hidden');
    const inp = document.getElementById('totem-cpf'); 
    if(inp) {
        inp.value = ''; 
        inp.disabled = false;
        inp.blur();
    }
};

// ==========================================================================
// PROCESSAMENTO DA LEITURA DO CPF E FLUXO DE TELAS
// ==========================================================================
window.totemProcessarCPF = () => {
    if(window.isProcessing) return;
    if(window.vkFechar) window.vkFechar();
    
    const cpfNum = document.getElementById('totem-cpf').value.replace(/\D/g, '');
    if(!window.validarCPFReal(cpfNum)) return window.totemMostrarMensagem('erro_cpf');
    
    if(window.operacoesAtivas && window.operacoesAtivas[cpfNum]) return window.mostrarToast('Por favor, aguarde.', 'erro');
    
    window.isProcessing = true; 
    if(window.operacoesAtivas) window.operacoesAtivas[cpfNum] = true; 
    
    const btn = document.getElementById('btn-totem-avancar');
    const span = document.getElementById('btn-totem-avancar-text');
    if(btn) btn.disabled = true; 
    if(span) span.innerText = 'Buscando...';
    
    document.getElementById('totem-cpf').disabled = true;
    if(document.activeElement) document.activeElement.blur(); 
    
    setTimeout(() => { 
        window.isProcessing = false; 
        if(window.operacoesAtivas) window.operacoesAtivas[cpfNum] = false; 
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Avançar';
    }, 8000); 

    const cliente = window.clientesMap[cpfNum];
    
    if(!cliente || cliente.arquivado) {
        document.getElementById('totem-tela-busca').classList.add('hidden');
        document.getElementById('totem-form').reset();
        document.getElementById('totem-cad-cpf').value = window.formatarCPF(cpfNum);
        document.getElementById('totem-tela-cadastro').classList.remove('hidden');
        
        setTimeout(() => {
            const cadNome = document.getElementById('totem-cad-nome');
            if(cadNome) cadNome.focus();
        }, 300);
        
        window.isProcessing = false; 
        if(window.operacoesAtivas) window.operacoesAtivas[cpfNum] = false; 
        
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Avançar';
        
        window.resetarTimerTotem();
    } else {
        window.totemClienteTemp = cliente;
        
        if((cliente.almocos || 0) >= 10) {
            document.getElementById('totem-tela-busca').classList.add('hidden');
            document.getElementById('totem-tela-opcoes').classList.remove('hidden');
            window.isProcessing = false; 
            if(window.operacoesAtivas) window.operacoesAtivas[cpfNum] = false; 
            if(btn) btn.disabled = false;
            if(span) span.innerText = 'Avançar';
            window.resetarTimerTotem();
        } else {
            if(window.jaRegistrouHoje(cliente)) { 
                window.isProcessing = false; 
                if(window.operacoesAtivas) window.operacoesAtivas[cpfNum] = false; 
                if(btn) btn.disabled = false;
                if(span) span.innerText = 'Avançar';
                return window.totemMostrarMensagem('ja_registrado'); 
            }
            window.isProcessing = false; 
            if(window.operacoesAtivas) window.operacoesAtivas[cpfNum] = false; 
            if(btn) btn.disabled = false;
            if(span) span.innerText = 'Avançar';
            window.totemExecutarAcumulo();
        }
    }
};

window.totemSalvarCadastro = (e) => {
    e.preventDefault(); 
    if(window.isProcessing) return;
    if(window.vkFechar) window.vkFechar();
    
    const cpf = document.getElementById('totem-cad-cpf').value.replace(/\D/g, '');
    if(window.operacoesAtivas && window.operacoesAtivas[cpf]) return;
    
    const tel = document.getElementById('totem-cad-tel').value.replace(/\D/g, ''); 
    if(!window.telefoneValido(tel)) return window.mostrarToast('Telefone inválido. Verifique e tente novamente.', 'erro');
    const nasc = document.getElementById('totem-cad-nasc').value; 
    if(!window.validarDataReal(nasc)) return window.mostrarToast('Data de nascimento inválida.', 'erro');

    window.isProcessing = true; 
    if(window.operacoesAtivas) window.operacoesAtivas[cpf] = true; 
    
    const btnSalvar = document.getElementById('btn-totem-salvar');
    const spanSalvar = document.getElementById('btn-totem-salvar-text');
    if(btnSalvar) btnSalvar.disabled = true; 
    if(spanSalvar) spanSalvar.innerText = 'Salvando...';
    
    if(document.activeElement) document.activeElement.blur(); 
    
    setTimeout(() => { 
        window.isProcessing = false; 
        if(window.operacoesAtivas) window.operacoesAtivas[cpf] = false; 
        if(btnSalvar) btnSalvar.disabled = false; 
        if(spanSalvar) spanSalvar.innerText = 'Salvar cadastro';
    }, 8000); 

    const nome = document.getElementById('totem-cad-nome').value.trim();
    let niverF = nasc.includes('/') ? `${nasc.split('/')[2]}-${nasc.split('/')[1]}-${nasc.split('/')[0]}` : nasc;

    const novoCliente = { 
        cpf, nome, nascimento: niverF, telefone: tel, 
        almocos: 1, premiosResgatados: 0, 
        historico: [new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})], 
        origemCadastro: 'Totem', 
        dataCadastro: new Date().toLocaleDateString('pt-BR'), 
        ultimaVisitaTimestamp: Date.now(),
        arquivado: false
    };
    
    window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + cpf), novoCliente).then(() => {
        window.totemClienteTemp = novoCliente; 
        window.isProcessing = false; 
        if(window.operacoesAtivas) window.operacoesAtivas[cpf] = false;
        
        if(window.logAuditoria) window.logAuditoria('Cadastro (Totem)', `Cliente ${novoCliente.nome} realizou o próprio cadastro via Totem.`);
        
        if(window.checarEAvisarAlmoco) window.checarEAvisarAlmoco(novoCliente);
        
        if(window.diasParaAniversario(novoCliente.nascimento) === 0) {
            window.totemMostrarMensagem('aniversario_totem'); 
        } else {
            window.totemMostrarMensagem('cadastro_sucesso');
        }
    }).catch(() => { 
        window.mostrarToast("Não foi possível salvar. Tente novamente.", "erro"); 
        window.isProcessing = false; 
        if(window.operacoesAtivas) window.operacoesAtivas[cpf] = false; 
        if(btnSalvar) btnSalvar.disabled = false; 
        if(spanSalvar) spanSalvar.innerText = 'Salvar cadastro';
    });
};

window.totemExecutarAcumulo = () => {
    if(window.isProcessing) return;
    const cliente = window.totemClienteTemp; 
    if(!cliente) return;
    if(window.jaRegistrouHoje(cliente)) return window.totemMostrarMensagem('ja_registrado');
    
    window.isProcessing = true; 
    if(window.operacoesAtivas) window.operacoesAtivas[cliente.cpf] = true; 
    
    const btn = document.getElementById('btn-totem-acumular'); 
    const span = document.getElementById('btn-totem-acumular-text');
    if(btn) btn.disabled = true;
    if(span) span.innerText = 'Atualizando...';
    
    setTimeout(() => { 
        window.isProcessing = false; 
        if(window.operacoesAtivas) window.operacoesAtivas[cliente.cpf] = false; 
        if(btn) btn.disabled = false; 
        if(span) span.innerText = 'Guardar para a próxima visita';
    }, 8000); 

    cliente.almocos = (cliente.almocos || 0) + 1;
    if(!cliente.historico) cliente.historico = [];
    cliente.historico.push(new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}));
    cliente.ultimaVisitaTimestamp = Date.now(); 
    if(window.limitarHistorico) cliente.historico = window.limitarHistorico(cliente.historico);

    window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + cliente.cpf), cliente).then(() => {
        window.isProcessing = false; 
        if(window.operacoesAtivas) window.operacoesAtivas[cliente.cpf] = false; 
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Guardar para a próxima visita';
        
        const a = new Date().getFullYear();
        if(window.checarEAvisarAlmoco) window.checarEAvisarAlmoco(cliente);
        
        if (window.diasParaAniversario(cliente.nascimento) === 0 && cliente.aniversarioResgatadoAno !== a) {
            window.totemMostrarMensagem('aniversario_totem');
        } else if(cliente.almocos === 10) {
            window.totemMostrarMensagem('meta_atingida'); 
        } else {
            window.totemMostrarMensagem('sucesso_acumulo');
        }
    }).catch(() => { 
        window.isProcessing = false; 
        if(window.operacoesAtivas) window.operacoesAtivas[cliente.cpf] = false; 
        if(btn) btn.disabled = false; 
        if(span) span.innerText = 'Guardar para a próxima visita';
    });
};

window.totemMostrarMensagem = (tipo) => {
    if(window.vkFechar) window.vkFechar();
    clearTimeout(window.timerInatividade);
    clearInterval(window.intervaloContagemTotem);
    
    ['totem-tela-busca', 'totem-tela-cadastro', 'totem-tela-opcoes'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
    
    const ic = document.getElementById('totem-icone-msg');
    const ti = document.getElementById('totem-titulo-msg');
    const te = document.getElementById('totem-texto-msg');
    const lb = document.getElementById('totem-loading-bar');
    const counterEl = document.getElementById('totem-timer-count');
    
    if(lb) lb.classList.remove('animate-shrink'); 
    let tempo = 10000;
    const nomeC = window.totemClienteTemp && window.totemClienteTemp.nome ? window.escapeHTML(window.totemClienteTemp.nome.split(' ')[0]) : '';

    if(tipo === 'erro_cpf') { 
        if(ic) ic.innerHTML = `<i data-lucide="x" class="w-12 h-12"></i>`; 
        if(ti) ti.innerText = "CPF Inválido"; 
        if(te) te.innerText = "Por favor, verifique se os 11 números foram digitados corretamente."; 
        tempo = 6000; 
    } else if(tipo === 'ja_registrado') { 
        if(ic) ic.innerHTML = `<i data-lucide="check-check" class="w-12 h-12"></i>`; 
        if(ti) ti.innerText = `Tudo certo, ${nomeC}!`; 
        if(te) te.innerText = "Seu almoço de hoje já foi contabilizado com sucesso."; 
    } else if(tipo === 'aviso_caixa') { 
        if(ic) ic.innerHTML = `<i data-lucide="info" class="w-12 h-12"></i>`; 
        if(ti) ti.innerText = "Resgate solicitado"; 
        if(te) te.innerHTML = `<strong>${nomeC}</strong>, avise o operador de caixa para validar seu desconto de <strong>R$ 50,00</strong>.`;
        tempo = 15000; 
    } else if(tipo === 'sucesso_acumulo' || tipo === 'cadastro_sucesso') { 
        if(ic) ic.innerHTML = `<i data-lucide="check" class="w-12 h-12"></i>`; 
        if(ti) ti.innerText = `Registrado com sucesso, ${nomeC}!`; 
        if(te) te.innerHTML = `Você possui agora <strong>${window.totemClienteTemp.almocos||1}</strong> almoço(s) acumulado(s).`; 
    } else if(tipo === 'meta_atingida') { 
        if(ic) ic.innerHTML = `<i data-lucide="star" class="w-12 h-12"></i>`; 
        if(ti) ti.innerText = `Parabéns, ${nomeC}!`; 
        if(te) te.innerHTML = `Você completou 10 almoços.<br>No próximo almoço, o desconto de <strong>R$ 50,00</strong> é seu.`; 
        tempo = 15000; 
    } else if(tipo === 'aniversario_totem') { 
        if(ic) ic.innerHTML = `<i data-lucide="cake" class="w-12 h-12"></i>`; 
        if(ti) ti.innerText = `Feliz Aniversário, ${nomeC}!`; 
        if(te) te.innerHTML = `🎁 Hoje é seu aniversário e você tem <strong>R$ 50,00 de desconto</strong> liberado!<br><br>Avise o caixa agora mesmo para resgatar.`; 
        tempo = 15000; 
    }

    const tMsg = document.getElementById('totem-tela-mensagem');
    const tBot = document.getElementById('totem-bottom-bar');
    if(tMsg) tMsg.classList.remove('hidden'); 
    if(tBot) tBot.classList.remove('hidden');
    
    if(window.lucide) window.lucide.createIcons(); 
    
    if(lb) {
        void lb.offsetWidth; 
        lb.style.animationDuration = `${tempo}ms`; 
        lb.classList.add('animate-shrink');
    }
    
    let segundosRestantes = Math.floor(tempo / 1000);
    if(counterEl) counterEl.innerText = segundosRestantes;
    
    window.intervaloContagemTotem = setInterval(() => {
        segundosRestantes--;
        if(counterEl) counterEl.innerText = Math.max(0, segundosRestantes);
        if(segundosRestantes <= 0) {
            clearInterval(window.intervaloContagemTotem);
        }
    }, 1000);
    
    clearTimeout(window.timeoutTotemMsg); 
    window.timeoutTotemMsg = setTimeout(() => window.totemVoltarInicio(), tempo);
};

// ==========================================================================
// TECLADO VIRTUAL PROPRIETÁRIO (Virtual Keyboard - VK) - REFINADO
// ==========================================================================
window.vkAtivo = null;
window.vkIsShift = false;
window.vkBackspaceTimer = null;
window.vkBackspaceInterval = null;

window.vkInicializar = () => {
    // Renderização Dinâmica do Layout QWERTY Alfabético (Compacto)
    const row1 = ['q','w','e','r','t','y','u','i','o','p'];
    const row2 = ['a','s','d','f','g','h','j','k','l','ç'];
    const row3 = ['z','x','c','v','b','n','m'];

    const buildRow = (keys, containerId) => {
        const container = document.getElementById(containerId);
        if(!container) return;
        container.innerHTML = '';
        keys.forEach(k => {
            container.innerHTML += `<button type="button" class="vk-btn-alpha bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white w-8 sm:w-10 h-12 rounded-xl shadow-sm font-bold text-lg active:scale-[0.96] transition-all duration-150 ease-out focus:outline-none flex items-center justify-center" data-vk-val="${k}">${k}</button>`;
        });
    };

    buildRow(row1, 'vk-row-1');
    buildRow(row2, 'vk-row-2');

    const row3Container = document.getElementById('vk-row-3');
    if(row3Container) {
        row3Container.innerHTML = `<button type="button" class="vk-btn-action bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white w-10 sm:w-14 h-12 rounded-xl shadow-sm font-bold flex items-center justify-center active:scale-[0.96] transition-all duration-150 ease-out focus:outline-none" data-vk-action="shift"><i data-lucide="arrow-up" class="w-4 h-4 pointer-events-none"></i></button>`;
        row3.forEach(k => {
            row3Container.innerHTML += `<button type="button" class="vk-btn-alpha bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white w-8 sm:w-10 h-12 rounded-xl shadow-sm font-bold text-lg active:scale-[0.96] transition-all duration-150 ease-out focus:outline-none flex items-center justify-center" data-vk-val="${k}">${k}</button>`;
        });
        row3Container.innerHTML += `<button type="button" class="vk-btn-action bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-gray-300 w-10 sm:w-14 h-12 rounded-xl shadow-sm font-bold flex items-center justify-center active:scale-[0.96] transition-all duration-150 ease-out focus:outline-none" data-vk-action="backspace"><i data-lucide="delete" class="w-5 h-5 pointer-events-none"></i></button>`;
    }

    if(window.lucide) window.lucide.createIcons();

    // Listener Global de Foco para abrir o teclado automaticamente
    document.addEventListener('focusin', (e) => {
        if(e.target && e.target.hasAttribute('data-vk-type')) {
            window.vkAbrir(e.target);
        }
    });

    const vkEl = document.getElementById('virtual-keyboard');
    if(!vkEl) return;

    const handleBtnPress = (e) => {
        e.preventDefault(); 
        const btnVal = e.target.closest('[data-vk-val]');
        const btnAction = e.target.closest('[data-vk-action]');

        if(btnVal) {
            window.vkInserir(btnVal.getAttribute('data-vk-val'));
        } else if (btnAction) {
            const action = btnAction.getAttribute('data-vk-action');
            if(action === 'shift') window.vkToggleShift();
            if(action === 'space') window.vkInserir(' ');
            if(action === 'confirm') window.vkConfirmar();
        }
    };

    vkEl.addEventListener('mousedown', (e) => {
        if(e.target.closest('button') && !e.target.closest('[data-vk-action="backspace"]')) {
            handleBtnPress(e);
        } else if (!e.target.closest('button')) {
            e.preventDefault();
        }
    });

    vkEl.addEventListener('touchstart', (e) => {
        if(e.target.closest('button') && !e.target.closest('[data-vk-action="backspace"]')) {
            handleBtnPress(e);
        } else if (!e.target.closest('button')) {
            e.preventDefault();
        }
    }, {passive: false});

    const setupBackspace = (btn) => {
        let isHolding = false;
        
        const startDelete = (e) => {
            e.preventDefault();
            if(isHolding) return;
            isHolding = true;
            window.vkApagar();
            window.vkBackspaceTimer = setTimeout(() => {
                window.vkBackspaceInterval = setInterval(window.vkApagar, 100);
            }, 400);
        };
        const stopDelete = (e) => {
            if(e) e.preventDefault();
            isHolding = false;
            clearTimeout(window.vkBackspaceTimer);
            clearInterval(window.vkBackspaceInterval);
        };
        
        btn.addEventListener('touchstart', startDelete, {passive: false});
        btn.addEventListener('mousedown', startDelete);
        
        btn.addEventListener('touchend', stopDelete);
        btn.addEventListener('touchcancel', stopDelete);
        btn.addEventListener('mouseup', stopDelete);
        btn.addEventListener('mouseleave', stopDelete);
    };

    const bsButtons = vkEl.querySelectorAll('[data-vk-action="backspace"]');
    bsButtons.forEach(setupBackspace);
};

window.vkAbrir = (input) => {
    // Remove o foco visual de outros inputs e adiciona no ativo
    document.querySelectorAll('.vk-field-focused').forEach(el => el.classList.remove('vk-field-focused'));
    input.classList.add('vk-field-focused');

    window.vkAtivo = input;
    const type = input.getAttribute('data-vk-type') || 'text';
    const kb = document.getElementById('virtual-keyboard');
    const numLayout = document.getElementById('vk-layout-numeric');
    const alphaLayout = document.getElementById('vk-layout-alpha');
    const emailShortcuts = document.getElementById('vk-email-shortcuts');
    const label = document.getElementById('vk-field-label');
    const dynamicArea = document.getElementById('totem-dynamic-area');

    if(label) label.innerText = input.placeholder || 'Preencha o campo';

    numLayout.classList.add('hidden');
    alphaLayout.classList.add('hidden');
    if(emailShortcuts) emailShortcuts.classList.add('hidden');

    if(type === 'numeric' || type === 'pin') {
        numLayout.classList.remove('hidden');
        numLayout.classList.add('grid');
    } else {
        alphaLayout.classList.remove('hidden');
        alphaLayout.classList.add('flex');
        if(type === 'email' && emailShortcuts) {
            emailShortcuts.classList.remove('hidden');
        }
    }

    // Faz o container principal do totem subir suavemente para não cobrir a interface
    if(dynamicArea) dynamicArea.classList.add('vk-open-padding');

    kb.classList.remove('translate-y-full');

    setTimeout(() => {
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
};

window.vkFechar = () => {
    const kb = document.getElementById('virtual-keyboard');
    const dynamicArea = document.getElementById('totem-dynamic-area');
    
    if(kb) kb.classList.add('translate-y-full');
    if(dynamicArea) dynamicArea.classList.remove('vk-open-padding');

    document.querySelectorAll('.vk-field-focused').forEach(el => el.classList.remove('vk-field-focused'));

    if(window.vkAtivo) {
        window.vkAtivo.blur();
        window.vkAtivo = null;
    }
};

window.vkConfirmar = () => {
    const input = window.vkAtivo;
    if(input && input.id === 'totem-cpf') {
        window.totemProcessarCPF();
    } else if (input && input.id === 'totem-pin-input') {
        window.verificarPinTotem();
    } else {
        window.vkFechar();
    }
};

window.vkInserir = (char) => {
    if(!window.vkAtivo) return;
    const input = window.vkAtivo;
    
    let start = input.selectionStart;
    let end = input.selectionEnd;
    let valBefore = input.value;

    if (input.maxLength > 0 && valBefore.length >= input.maxLength && start === end) return;

    let charToInsert = window.vkIsShift ? char.toUpperCase() : char.toLowerCase();
    const finalChar = (char.length > 1 || !isNaN(char) || char === '@' || char === '_' || char === '.' || char === ',') ? char : charToInsert;
    
    input.value = valBefore.substring(0, start) + finalChar + valBefore.substring(end);
    
    input.dispatchEvent(new Event('input', { bubbles: true }));

    setTimeout(() => {
        const valAfter = input.value;
        if(input.getAttribute('data-vk-type') === 'numeric') {
            input.setSelectionRange(valAfter.length, valAfter.length);
        } else {
            const newPos = start + finalChar.length;
            input.setSelectionRange(newPos, newPos);
        }
    }, 10);
};

window.vkApagar = () => {
    if(!window.vkAtivo) return;
    const input = window.vkAtivo;
    
    let start = input.selectionStart;
    let end = input.selectionEnd;
    let val = input.value;

    if (start === end && start > 0) {
        input.value = val.substring(0, start - 1) + val.substring(end);
        start--;
    } else if (start !== end) {
        input.value = val.substring(0, start) + val.substring(end);
    } else {
        return; 
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));

    setTimeout(() => {
        if(input.getAttribute('data-vk-type') === 'numeric') {
            input.setSelectionRange(input.value.length, input.value.length);
        } else {
            input.setSelectionRange(start, start);
        }
    }, 10);
};

window.vkToggleShift = () => {
    window.vkIsShift = !window.vkIsShift;
    const keys = document.querySelectorAll('.vk-btn-alpha');
    keys.forEach(k => {
        const val = k.getAttribute('data-vk-val');
        k.innerText = window.vkIsShift ? val.toUpperCase() : val.toLowerCase();
    });
    const shiftBtn = document.querySelector('[data-vk-action="shift"]');
    if(shiftBtn) {
        if(window.vkIsShift) {
            shiftBtn.classList.replace('bg-gray-700', 'bg-indigo-600');
        } else {
            shiftBtn.classList.replace('bg-indigo-600', 'bg-gray-700');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.vkInicializar();
});
