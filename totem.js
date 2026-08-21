// totem.js
// Módulo 6: Interface de Autoatendimento (Totem) e Lógica de Ecrã Fullscreen

window.intervaloContagemTotem = null;

// Chamadas do totem passam por Cloud Functions; o navegador não lê a base de clientes.
window.chamarFuncaoTotem = async (nome, dados) => {
    if (!window.firebaseCallable || !window.firebaseFunctions) {
        throw new Error('Serviço seguro do totem indisponível.');
    }
    const chamada = window.firebaseCallable(window.firebaseFunctions, nome);
    const resultado = await chamada(dados);
    return resultado.data;
};


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
    
    // Injeta o QR Code correto da unidade ativa
    const qrImg = document.getElementById('totem-qrcode-img');
    if(qrImg) {
        qrImg.src = window.obterUnidade() === 'picarras' ? './qrcode tophaus piçarras.png' : './qrcode.png';
    }

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
    const pin = document.getElementById('totem-pin-input').value;
    
    // PIN Padrão de segurança administrativa
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

    // Retenção de sessão estendida para o cadastro (90s) em relação a telas normais (45s)
    const emCadastro = !document.getElementById('totem-tela-cadastro').classList.contains('hidden');
    const tempoInatividade = emCadastro ? 90000 : 45000;
    
    window.timerInatividade = setTimeout(() => {
        if(window.logAuditoria) window.logAuditoria('Totem', 'Sessão abandonada e reiniciada automaticamente por inatividade.');
        window.totemVoltarInicio();
    }, tempoInatividade);
};

window.totemVoltarInicio = () => {
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
    
    // Oculta TODAS as sub-telas do totem
    ['totem-tela-cadastro', 'totem-tela-opcoes', 'totem-tela-mensagem', 'totem-tela-avaliacao', 'totem-bottom-bar'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
    
    document.getElementById('totem-tela-busca').classList.remove('hidden');
    
    // Limpa todos os campos e reabilita o CPF
    ['totem-cpf', 'totem-cad-cpf', 'totem-cad-nome', 'totem-cad-nasc', 'totem-cad-tel'].forEach(id => {
        const inp = document.getElementById(id);
        if(inp) {
            inp.value = '';
            inp.disabled = false;   // reabilita o campo CPF
            inp.blur();
        }
    });

    // Fecha o teclado
    if(typeof window.tecladoFechar === 'function') window.tecladoFechar();
};

// ==========================================================================
// PROCESSAMENTO DA LEITURA DO CPF E FLUXO DE TELAS
// ==========================================================================
window.totemProcessarCPF = async () => {
    if (window.isProcessing) return;
    const cpf = document.getElementById('totem-cpf').value.replace(/\D/g, '');
    if (!window.validarCPFReal(cpf)) return window.totemMostrarMensagem('erro_cpf');

    const btn = document.getElementById('btn-totem-avancar');
    const span = document.getElementById('btn-totem-avancar-text');
    window.isProcessing = true;
    if (btn) btn.disabled = true;
    if (span) span.innerText = 'Buscando...';

    try {
        const resposta = await window.chamarFuncaoTotem('lookupTotemClient', {
            unit: window.obterUnidade(),
            cpf
        });

        if (!resposta.found) {
            document.getElementById('totem-tela-busca').classList.add('hidden');
            document.getElementById('totem-form').reset();
            document.getElementById('totem-cad-cpf').value = window.formatarCPF(cpf);
            document.getElementById('totem-tela-cadastro').classList.remove('hidden');
            setTimeout(() => document.getElementById('totem-cad-nome')?.focus(), 250);
            window.resetarTimerTotem();
            return;
        }

        window.totemClienteTemp = {
            cpf,
            nome: resposta.firstName,
            almocos: resposta.rewardAvailable ? 10 : 0
        };
        if (resposta.alreadyCheckedIn) return window.totemMostrarMensagem('ja_registrado');

        document.getElementById('totem-tela-busca').classList.add('hidden');
        if (resposta.rewardAvailable) {
            document.getElementById('totem-tela-opcoes').classList.remove('hidden');
            return window.resetarTimerTotem();
        }
        await window.totemExecutarAcumulo();
    } catch (erro) {
        console.error('Erro seguro do totem:', erro);
        window.mostrarToast('Não foi possível consultar o cadastro. Tente novamente.', 'erro');
    } finally {
        window.isProcessing = false;
        if (btn) btn.disabled = false;
        if (span) span.innerText = 'Avançar';
    }
};

window.totemSalvarCadastro = async (e) => {
    e.preventDefault();
    if (window.isProcessing) return;

    const cpf = document.getElementById('totem-cad-cpf').value.replace(/\D/g, '');
    const nome = document.getElementById('totem-cad-nome').value.trim();
    const nascimento = document.getElementById('totem-cad-nasc').value;
    const telefone = document.getElementById('totem-cad-tel').value;
    if (!nome) return window.mostrarToast('Digite seu nome completo.', 'erro');

    const btn = document.getElementById('btn-totem-salvar');
    const span = document.getElementById('btn-totem-salvar-text');
    window.isProcessing = true;
    if (btn) btn.disabled = true;
    if (span) span.innerText = 'Salvando...';

    try {
        const resposta = await window.chamarFuncaoTotem('registerTotemClient', {
            unit: window.obterUnidade(), cpf, nome, nascimento, telefone
        });
        window.totemClienteTemp = { cpf, nome: resposta.firstName, almocos: 1 };
        window.totemMostrarMensagem(resposta.birthdayToday ? 'aniversario_totem' : 'cadastro_sucesso');
    } catch (erro) {
        window.mostrarToast(erro.message || 'Não foi possível salvar. Tente novamente.', 'erro');
    } finally {
        window.isProcessing = false;
        if (btn) btn.disabled = false;
        if (span) span.innerText = 'Salvar cadastro';
    }
};

window.totemExecutarAcumulo = async () => {
    if (window.isProcessing || !window.totemClienteTemp) return;

    const btn = document.getElementById('btn-totem-acumular');
    const span = document.getElementById('btn-totem-acumular-text');
    window.isProcessing = true;
    if (btn) btn.disabled = true;
    if (span) span.innerText = 'Atualizando...';

    try {
        const resposta = await window.chamarFuncaoTotem('checkInTotemClient', {
            unit: window.obterUnidade(),
            cpf: window.totemClienteTemp.cpf,
            action: 'accumulate'
        });
        window.totemClienteTemp.nome = resposta.firstName || window.totemClienteTemp.nome;
        window.totemClienteTemp.almocos = resposta.lunches || window.totemClienteTemp.almocos;

        if (resposta.state === 'already_checked_in') return window.totemMostrarMensagem('ja_registrado');
        if (resposta.state === 'reward_earned') return window.totemMostrarMensagem('meta_atingida');
        return window.totemMostrarMensagem('sucesso_acumulo');
    } catch (erro) {
        window.mostrarToast(erro.message || 'Não foi possível registrar o almoço.', 'erro');
    } finally {
        window.isProcessing = false;
        if (btn) btn.disabled = false;
        if (span) span.innerText = 'Guardar para outra visita';
    }
};

// ==========================================================================
// FUNÇÕES AUXILIARES DE MENSAGENS E TEMPORIZAÇÃO DO TOTEM
// ==========================================================================
window.totemMostrarMensagem = (tipo) => {
    // Fecha o teclado antes de exibir a mensagem
    if(typeof window.tecladoFechar === 'function') window.tecladoFechar();

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

    // Flag para saber se envia para Avaliação QR Code ou volta direto para o Início
    let sucessoParaAvaliar = true;

    if(tipo === 'erro_cpf') { 
        if(ic) ic.innerHTML = `<i data-lucide="x" class="w-12 h-12"></i>`; 
        if(ti) ti.innerText = "Não conseguimos identificar esse CPF."; 
        if(te) te.innerText = "Confira os números e tente novamente."; 
        tempo = 6000; 
        sucessoParaAvaliar = false; // Erro volta direto para o início
    } else if(tipo === 'ja_registrado') { 
        if(ic) ic.innerHTML = `<i data-lucide="check-check" class="w-12 h-12"></i>`; 
        if(ti) ti.innerText = `Olá, ${nomeC}!`; 
        if(te) te.innerText = "Seu almoço de hoje já está registrado. Obrigado por voltar!"; 
        sucessoParaAvaliar = false; // Já estava resolvido, não incomodar
    } else if(tipo === 'aviso_caixa') { 
        if(ic) ic.innerHTML = `<i data-lucide="info" class="w-12 h-12"></i>`; 
        if(ti) ti.innerText = "Desconto utilizado com sucesso! ✅"; 
        if(te) te.innerHTML = `${nomeC}, você optou por usar seu desconto de R$ 50,00 agora. Por favor, informe o caixa para finalizar.`;
        tempo = 12000; 
    } else if(tipo === 'sucesso_acumulo') { 
        if(ic) ic.innerHTML = `<i data-lucide="check" class="w-12 h-12"></i>`; 
        if(ti) ti.innerText = `Almoço registrado, ${nomeC}! 🍽️`; 
        const almoços = window.totemClienteTemp.almocos || 0;
        const faltam = almoços < 10 ? 10 - almoços : 0;
        let msgExtra = '';
        if (faltam > 0) {
            msgExtra = `Faltam apenas ${faltam} para ganhar seu desconto de R$ 50,00.`;
        } else {
            msgExtra = 'Você já acumulou 10 almoços e ganhou seu desconto!';
        }
        te.innerHTML = `Você já acumulou <strong>${almoços}</strong> almoço(s). ${msgExtra}`;
        tempo = 8000;
    } else if(tipo === 'cadastro_sucesso') { 
        if(ic) ic.innerHTML = `<i data-lucide="check" class="w-12 h-12"></i>`; 
        if(ti) ti.innerText = `Cadastro realizado, ${nomeC}! 🎉`; 
        te.innerHTML = "Seu primeiro almoço já foi contabilizado. Bem-vindo ao Top Haus Fidelidade!";
        tempo = 8000;
    } else if(tipo === 'meta_atingida') { 
        if(ic) ic.innerHTML = `<i data-lucide="star" class="w-12 h-12"></i>`; 
        if(ti) ti.innerText = `Parabéns, ${nomeC}! 🎉`; 
        te.innerHTML = "Você acaba de conquistar seu benefício de R$ 50,00. Na próxima visita, é só escolher entre usar agora ou guardar para depois.";
        tempo = 12000; 
    } else if(tipo === 'aniversario_totem') { 
        if(ic) ic.innerHTML = `<i data-lucide="cake" class="w-12 h-12"></i>`; 
        if(ti) ti.innerText = `Feliz aniversário, ${nomeC}! 🎂`; 
        te.innerHTML = "Toda a equipe Top Haus deseja um dia muito especial para você. Seu benefício de aniversário é válido somente hoje. Consulte o caixa para utilizá-lo.";
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
    
    window.timeoutTotemMsg = setTimeout(() => {
        if(sucessoParaAvaliar) {
            window.totemMostrarAvaliacao();
        } else {
            window.totemVoltarInicio();
        }
    }, tempo);
};

// Nova função para transicionar para o QR Code de Avaliação
window.totemMostrarAvaliacao = () => {
    ['totem-tela-mensagem'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });

    const tAvaliacao = document.getElementById('totem-tela-avaliacao');
    if(tAvaliacao) tAvaliacao.classList.remove('hidden');

    const lb = document.getElementById('totem-loading-bar');
    const counterEl = document.getElementById('totem-timer-count');
    
    let tempoAvaliacao = 12000; // 12 segundos para a pessoa ler e escanear

    if(lb) {
        lb.classList.remove('animate-shrink');
        void lb.offsetWidth; 
        lb.style.animationDuration = `${tempoAvaliacao}ms`; 
        lb.classList.add('animate-shrink');
    }
    
    let segundosRestantes = Math.floor(tempoAvaliacao / 1000);
    if(counterEl) counterEl.innerText = segundosRestantes;
    
    clearInterval(window.intervaloContagemTotem);
    window.intervaloContagemTotem = setInterval(() => {
        segundosRestantes--;
        if(counterEl) counterEl.innerText = Math.max(0, segundosRestantes);
        if(segundosRestantes <= 0) {
            clearInterval(window.intervaloContagemTotem);
        }
    }, 1000);

    clearTimeout(window.timeoutTotemMsg);
    window.timeoutTotemMsg = setTimeout(() => {
        window.totemVoltarInicio();
    }, tempoAvaliacao);
};
