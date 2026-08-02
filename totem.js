// totem.js
// Módulo 6: Operação Kiosk Mode, Teclado Virtual Embutido e Fluxo de Autoatendimento

// ==========================================================================
// ESTADO DO TECLADO VIRTUAL E FOCO FALSO
// ==========================================================================
window.totemInputAtual = 'totem-cpf';

window.initTotemKeyboard = () => {
    // Adiciona evento de clique aos inputs para trocar o foco manualmente
    const inputs = ['totem-cpf', 'totem-cad-nome', 'totem-cad-nasc', 'totem-cad-tel'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                window.setTotemFocus(id);
            });
        }
    });
};

window.setTotemFocus = (inputId) => {
    // Remove classe de foco visual de todos os campos
    document.querySelectorAll('.input-focado').forEach(el => el.classList.remove('input-focado'));
    
    const el = document.getElementById(inputId);
    if(el) {
        el.classList.add('input-focado');
        window.totemInputAtual = inputId;
        
        // Alterna entre Numpad e QWERTY conforme o tipo do campo
        if(inputId === 'totem-cad-nome') {
            document.getElementById('keyboard-numpad').classList.add('hidden');
            document.getElementById('keyboard-qwerty').classList.remove('hidden');
        } else {
            document.getElementById('keyboard-qwerty').classList.add('hidden');
            document.getElementById('keyboard-numpad').classList.remove('hidden');
        }
    }
};

window.setVisibilidadeTeclado = (visivel) => {
    const kArea = document.getElementById('totem-keyboard-area');
    const dArea = document.getElementById('totem-dynamic-area');
    
    if(!kArea || !dArea) return;

    if (visivel) {
        kArea.classList.remove('hidden');
        // Devolve o espaço para a área dinâmica dividir com o teclado
        dArea.classList.replace('h-full', 'h-[75dvh]');
    } else {
        kArea.classList.add('hidden');
        // Área dinâmica expande para ocupar 100%
        dArea.classList.replace('h-[75dvh]', 'h-full');
    }
};

// ==========================================================================
// AÇÕES DO TECLADO VIRTUAL
// ==========================================================================
window.vkPress = (char) => {
    window.resetarTimerTotem();
    if(!window.totemInputAtual) return;
    
    const el = document.getElementById(window.totemInputAtual);
    if(!el) return;

    // Regras de limite e máscaras atreladas ao campo
    if(window.totemInputAtual === 'totem-cpf') {
        if(el.value.length >= 14) return;
        el.value += char;
        window.mascaraCPF(el);
    } 
    else if (window.totemInputAtual === 'totem-cad-tel') {
        if(el.value.length >= 15) return;
        el.value += char;
        window.mascaraTelefone(el);
    } 
    else if (window.totemInputAtual === 'totem-cad-nasc') {
        if(el.value.length >= 10) return;
        el.value += char;
        window.mascaraData(el);
    } 
    else {
        // Campo Nome (Aceita letras e espaços sem limite estrito)
        if(el.value.length >= 40) return;
        el.value += char;
    }
};

window.vkApagar = () => {
    window.resetarTimerTotem();
    if(!window.totemInputAtual) return;
    
    const el = document.getElementById(window.totemInputAtual);
    if(!el || el.value.length === 0) return;

    // Remove o último caractere
    el.value = el.value.slice(0, -1);
    
    // Reaplica a máscara no novo valor
    if(window.totemInputAtual === 'totem-cpf') window.mascaraCPF(el);
    if(window.totemInputAtual === 'totem-cad-tel') window.mascaraTelefone(el);
    if(window.totemInputAtual === 'totem-cad-nasc') window.mascaraData(el);
};

window.vkAvancar = () => {
    window.resetarTimerTotem();
    if(!window.totemInputAtual) return;

    // Lógica de avanço condicional baseada no campo focado
    if(window.totemInputAtual === 'totem-cpf') {
        window.totemProcessarCPF();
    } 
    else if (window.totemInputAtual === 'totem-cad-nome') {
        window.setTotemFocus('totem-cad-nasc');
    } 
    else if (window.totemInputAtual === 'totem-cad-nasc') {
        window.setTotemFocus('totem-cad-tel');
    } 
    else if (window.totemInputAtual === 'totem-cad-tel') {
        const btnSubmit = document.getElementById('btn-totem-salvar');
        if(btnSubmit && !btnSubmit.disabled) {
            btnSubmit.click(); // Dispara o salvamento
        }
    }
};

// ==========================================================================
// TRANSIÇÕES DE TELAS E FLUXO DE AUTOATENDIMENTO
// ==========================================================================
window.esconderTelasTotem = () => {
    document.getElementById('totem-tela-busca').classList.add('hidden');
    document.getElementById('totem-tela-cadastro').classList.add('hidden');
    document.getElementById('totem-tela-opcoes').classList.add('hidden');
    document.getElementById('totem-tela-mensagem').classList.add('hidden');
    document.getElementById('totem-bottom-bar').classList.add('hidden');
    
    const barraTimer = document.getElementById('totem-loading-bar');
    if(barraTimer) {
        barraTimer.classList.remove('animate-shrink');
        void barraTimer.offsetWidth; // Força reflow
    }
};

window.totemVoltarInicio = () => {
    if (window.timeoutTotemMsg) clearTimeout(window.timeoutTotemMsg);
    if (window.timerInatividade) clearInterval(window.timerInatividade);
    
    window.totemClienteTemp = null;
    
    const cpfInp = document.getElementById('totem-cpf');
    if(cpfInp) cpfInp.value = '';
    
    const formCad = document.getElementById('totem-form');
    if(formCad) formCad.reset();
    
    window.esconderTelasTotem();
    
    document.getElementById('totem-tela-busca').classList.remove('hidden');
    document.getElementById('totem-tela-busca').classList.add('animate-fade-in');
    
    // Mostra o teclado numérico para a tela de busca
    window.setVisibilidadeTeclado(true);
    window.setTotemFocus('totem-cpf');
};

// ==========================================================================
// PROCESSAMENTO PRINCIPAL (BUSCA DE CPF)
// ==========================================================================
window.totemProcessarCPF = () => {
    const inputCpf = document.getElementById('totem-cpf');
    if(!inputCpf) return;
    
    const cpfVal = inputCpf.value.replace(/\D/g, '');
    
    if (!window.validarCPFReal(cpfVal)) {
        window.mostrarToast("CPF inválido.", "erro");
        inputCpf.value = '';
        return;
    }

    const cliente = window.clientesMap[cpfVal];

    if (!cliente || cliente.arquivado) {
        // Fluxo de Cadastro: Mostra formulário e traz QWERTY
        window.esconderTelasTotem();
        document.getElementById('totem-tela-cadastro').classList.remove('hidden');
        document.getElementById('totem-tela-cadastro').classList.add('animate-fade-in');
        
        document.getElementById('totem-cad-cpf').value = window.formatarCPF(cpfVal);
        
        window.setVisibilidadeTeclado(true);
        window.setTotemFocus('totem-cad-nome');
        window.iniciarTimerSessao(60); 
    } else {
        // Fluxo de Cliente Existente: Oculta o teclado durante a decisão
        window.setVisibilidadeTeclado(false);
        
        if(window.jaRegistrouHoje(cliente)) {
            window.totemMostrarMensagem('ja_registrado', cliente.nome.split(' ')[0], cliente.almocos || 0);
            return;
        }

        if ((cliente.almocos || 0) >= 10) {
            window.totemClienteTemp = cliente;
            window.esconderTelasTotem();
            document.getElementById('totem-tela-opcoes').classList.remove('hidden');
            document.getElementById('totem-tela-opcoes').classList.add('animate-fade-in');
            document.getElementById('totem-bottom-bar').classList.remove('hidden');
            window.iniciarTimerSessao(15);
        } else {
            // Contabilizar direto
            window.totemRegistrarRefeicao(cliente);
        }
    }
};

window.totemRegistrarRefeicao = (cliente) => {
    if(window.isProcessing) return;
    window.isProcessing = true;
    
    cliente.almocos = (cliente.almocos || 0) + 1;
    if(!cliente.historico) cliente.historico = [];
    cliente.historico.push(new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}));
    
    // Registro de Conquistas Permanente
    if (cliente.almocos > 0 && cliente.almocos % 10 === 0) {
        if(!cliente.historicoConquistas) cliente.historicoConquistas = [];
        cliente.historicoConquistas.push(new Date().toLocaleString('pt-BR'));
    }

    cliente.ultimaVisitaTimestamp = Date.now();
    cliente.historico = window.limitarHistorico(cliente.historico);

    window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + cliente.cpf), cliente).then(() => {
        window.isProcessing = false;
        
        if (cliente.almocos % 10 === 0) {
            window.totemMostrarMensagem('premiado', cliente.nome.split(' ')[0], cliente.almocos);
        } else {
            window.totemMostrarMensagem('sucesso', cliente.nome.split(' ')[0], cliente.almocos);
        }
        
        if(window.checarEAvisarAlmoco) window.checarEAvisarAlmoco(cliente);
    }).catch(() => {
        window.isProcessing = false;
        window.totemMostrarMensagem('erro');
    });
};

window.totemSalvarCadastro = (e) => {
    e.preventDefault();
    if(window.isProcessing) return;

    const cpf = document.getElementById('totem-cad-cpf').value.replace(/\D/g, '');
    const nome = document.getElementById('totem-cad-nome').value.trim();
    const nasc = document.getElementById('totem-cad-nasc').value;
    const tel = document.getElementById('totem-cad-tel').value.replace(/\D/g, '');

    if (!window.validarDataReal(nasc)) {
        window.mostrarToast("Data de nascimento inválida.", "erro");
        window.setTotemFocus('totem-cad-nasc');
        return;
    }
    if (!window.telefoneValido(tel)) {
        window.mostrarToast("Telefone inválido.", "erro");
        window.setTotemFocus('totem-cad-tel');
        return;
    }

    const btn = document.getElementById('btn-totem-salvar');
    const span = document.getElementById('btn-totem-salvar-text');
    if(btn) btn.disabled = true;
    if(span) span.innerText = 'Salvando...';
    
    window.isProcessing = true;

    const nf = nasc.includes('/') ? `${nasc.split('/')[2]}-${nasc.split('/')[1]}-${nasc.split('/')[0]}` : nasc;
    
    const novoCliente = {
        cpf, nome, nascimento: nf, telefone: tel,
        almocos: 1, premiosResgatados: 0,
        historico: [new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})],
        origemCadastro: 'Totem',
        dataCadastro: new Date().toLocaleDateString('pt-BR'),
        ultimaVisitaTimestamp: Date.now(),
        arquivado: false
    };

    window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + cpf), novoCliente).then(() => {
        window.isProcessing = false;
        if(btn) btn.disabled = false;
        
        // Remove o teclado para mostrar a mensagem limpa
        window.setVisibilidadeTeclado(false);
        
        window.totemMostrarMensagem('sucesso_cadastro', nome.split(' ')[0], 1);
        if(window.checarEAvisarAlmoco) window.checarEAvisarAlmoco(novoCliente);
    }).catch(() => {
        window.isProcessing = false;
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Salvar';
        window.mostrarToast("Erro ao cadastrar. Tente novamente.", "erro");
    });
};

// ==========================================================================
// AÇÕES SECUNDÁRIAS (ACUMULAR OU AVISO DE CAIXA)
// ==========================================================================
window.totemExecutarAcumulo = () => {
    if(!window.totemClienteTemp) return;
    
    const btn = document.getElementById('btn-totem-acumular');
    const span = document.getElementById('btn-totem-acumular-text');
    if(btn) btn.disabled = true;
    if(span) span.innerText = 'Guardando...';
    
    window.totemRegistrarRefeicao(window.totemClienteTemp);
};

window.totemMostrarMensagem = (tipo, primeiroNome = '', acumulados = 0) => {
    window.esconderTelasTotem();
    window.setVisibilidadeTeclado(false);
    
    if (window.timeoutTotemMsg) clearTimeout(window.timeoutTotemMsg);
    if (window.timerInatividade) clearInterval(window.timerInatividade);
    
    const divMsg = document.getElementById('totem-tela-mensagem');
    const icone = document.getElementById('totem-icone-msg');
    const titulo = document.getElementById('totem-titulo-msg');
    const texto = document.getElementById('totem-texto-msg');
    const bottomBar = document.getElementById('totem-bottom-bar');
    
    let tempo = 10; // Tempo padrão das mensagens de feedback

    if (tipo === 'sucesso') {
        icone.innerHTML = `<i data-lucide="check" class="w-16 h-16 text-green-500"></i>`;
        titulo.innerText = `Registrado com sucesso, ${primeiroNome}!`;
        texto.innerText = `Você possui agora ${acumulados} almoço(s) acumulado(s).`;
    } 
    else if (tipo === 'sucesso_cadastro') {
        icone.innerHTML = `<i data-lucide="party-popper" class="w-16 h-16 text-indigo-500"></i>`;
        titulo.innerText = `Bem-vindo ao clube, ${primeiroNome}!`;
        texto.innerText = `Seu cadastro e seu primeiro almoço foram registrados.`;
    }
    else if (tipo === 'premiado') {
        icone.innerHTML = `<i data-lucide="award" class="w-16 h-16 text-amber-500"></i>`;
        titulo.innerText = `Uau, você atingiu 10 almoços!`;
        texto.innerText = `Seu prêmio de R$ 50,00 de desconto foi liberado para sua próxima visita. Avisaremos você no WhatsApp!`;
    }
    else if (tipo === 'ja_registrado') {
        icone.innerHTML = `<i data-lucide="alert-circle" class="w-16 h-16 text-amber-500"></i>`;
        titulo.innerText = `Olá, ${primeiroNome}!`;
        texto.innerText = `Seu almoço de hoje já foi contabilizado em nosso sistema.\nVocê possui ${acumulados} almoço(s).`;
    }
    else if (tipo === 'erro') {
        icone.innerHTML = `<i data-lucide="x" class="w-16 h-16 text-red-500"></i>`;
        titulo.innerText = `Ops!`;
        texto.innerText = `Ocorreu um erro ao processar sua solicitação. Por favor, avise o caixa.`;
    }
    else if (tipo === 'aviso_caixa') {
        tempo = 20; // Dá mais tempo para o cliente ler a instrução
        icone.innerHTML = `<i data-lucide="arrow-right-circle" class="w-16 h-16 text-indigo-500 animate-pulse"></i>`;
        titulo.innerText = `Finalize no Caixa`;
        texto.innerHTML = `Por favor, dirija-se ao caixa para validarmos o seu desconto e imprimirmos o seu cupom.<br><br><span class="text-lg">Você possui R$ 50,00 disponíveis.</span>`;
    }

    divMsg.classList.remove('hidden');
    divMsg.classList.add('animate-fade-in');
    bottomBar.classList.remove('hidden');
    
    if(window.lucide) window.lucide.createIcons();
    window.iniciarTimerSessao(tempo);
};

// ==========================================================================
// CONTROLE DE SESSÃO E TIMEOUT DO TOTEM
// ==========================================================================
window.tempoInativoCount = 0;
window.tempoInativoLimite = 15;

window.iniciarTimerSessao = (segundos) => {
    if (window.timerInatividade) clearInterval(window.timerInatividade);
    
    window.tempoInativoLimite = segundos;
    window.tempoInativoCount = segundos;
    
    const pCount = document.getElementById('totem-timer-count');
    const barraTimer = document.getElementById('totem-loading-bar');
    
    if(pCount) pCount.innerText = segundos;
    
    if(barraTimer) {
        barraTimer.classList.remove('animate-shrink');
        void barraTimer.offsetWidth;
        barraTimer.style.animationDuration = `${segundos}s`;
        barraTimer.classList.add('animate-shrink');
    }

    window.timerInatividade = setInterval(() => {
        window.tempoInativoCount--;
        if(pCount) pCount.innerText = window.tempoInativoCount;
        
        if (window.tempoInativoCount <= 0) {
            clearInterval(window.timerInatividade);
            window.totemVoltarInicio();
        }
    }, 1000);
};

window.resetarTimerTotem = () => {
    // Só reseta o timer se o teclado estiver visível (ou seja, está no meio de um formulário)
    // Se o teclado estiver escondido, significa que está na tela de "Prêmio/Mensagem" e o tempo deve correr
    const kArea = document.getElementById('totem-keyboard-area');
    if(kArea && !kArea.classList.contains('hidden')) {
        window.iniciarTimerSessao(60); // 60 segundos inativo enquanto digita reseta tudo
    }
};

// ==========================================================================
// INICIALIZAÇÃO, ENTRADA E SAÍDA DO MODO KIOSK
// ==========================================================================
window.entrarModoTotemDaTelaLogin = () => {
    document.getElementById('tela-login').classList.add('hidden');
    window.entrarModoTotem();
};

window.entrarModoTotem = () => {
    // Esconde qualquer toast ou barra de alerta
    document.getElementById('toast-container').innerHTML = '';
    const banner = document.getElementById('banner-simulacao');
    if(banner) banner.classList.add('hidden');
    
    // Mostra interface limpa
    document.getElementById('tela-totem').classList.remove('hidden');
    
    window.initTotemKeyboard();
    window.totemVoltarInicio();
    
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen().catch(() => {});
    }
};

window.abrirModalSaidaTotem = () => {
    const modal = document.getElementById('modal-totem-saida');
    modal.classList.remove('hidden');
    
    const inp = document.getElementById('totem-pin-input');
    inp.value = '';
    setTimeout(() => inp.focus(), 100);
};

window.verificarPinTotem = () => {
    const p = document.getElementById('totem-pin-input').value;
    if (p === '1234') { 
        document.getElementById('modal-totem-saida').classList.add('hidden');
        document.getElementById('tela-totem').classList.add('hidden');
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen().catch(() => {});
        }
        
        if(window.isSimulationMode) {
            const banner = document.getElementById('banner-simulacao');
            if(banner) banner.classList.remove('hidden'); 
        }
    } else {
        window.mostrarToast("PIN Incorreto", "erro");
        document.getElementById('totem-pin-input').value = '';
    }
};
