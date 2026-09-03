// totem.js
// Módulo 6: Interface de Autoatendimento (Totem) e Lógica de Ecrã Fullscreen

window.intervaloContagemTotem = null;

const TOTEM_QR_POR_UNIDADE = Object.freeze({
    navegantes: { src: './qrcode.png', nome: 'Navegantes' },
    picarras: { src: './qrcode tophaus piçarras.png', nome: 'Balneário Piçarras' }
});

let alturaBaseTotem = 0;
let listenersViewportTotemAtivos = false;
let timerViewportTotem = null;

function campoEditavelDoTotem(elemento) {
    return Boolean(elemento?.matches?.('#tela-totem input:not([readonly]):not([disabled])'));
}

function manterCampoNativoVisivel() {
    const campo = document.activeElement;
    const conteudo = document.getElementById('totem-dynamic-area');
    if (!campoEditavelDoTotem(campo) || !conteudo) return;

    const campoRect = campo.getBoundingClientRect();
    const conteudoRect = conteudo.getBoundingClientRect();
    const margem = 12;
    if (campoRect.bottom > conteudoRect.bottom - margem) {
        conteudo.scrollBy({ top: campoRect.bottom - conteudoRect.bottom + margem, behavior: 'smooth' });
    } else if (campoRect.top < conteudoRect.top + margem) {
        conteudo.scrollBy({ top: campoRect.top - conteudoRect.top - margem, behavior: 'smooth' });
    }
}

window.atualizarViewportTotem = () => {
    const tela = document.getElementById('tela-totem');
    if (!tela || tela.classList.contains('hidden')) return;

    const viewport = window.visualViewport;
    const alturaAtual = Math.round(viewport ? viewport.height : window.innerHeight);
    const campoEmFoco = campoEditavelDoTotem(document.activeElement);
    if (!alturaBaseTotem || !campoEmFoco) {
        alturaBaseTotem = Math.max(Math.round(window.innerHeight), alturaAtual);
    } else if (alturaAtual > alturaBaseTotem) {
        alturaBaseTotem = alturaAtual;
    }

    document.documentElement.style.setProperty('--totem-viewport-height', alturaAtual + 'px');
    const reducaoMinima = Math.max(120, alturaBaseTotem * 0.18);
    const tecladoAberto = campoEmFoco && (alturaBaseTotem - alturaAtual >= reducaoMinima);
    tela.classList.toggle('totem-native-keyboard-open', tecladoAberto);
    if (tecladoAberto) window.setTimeout(manterCampoNativoVisivel, 80);
};

function agendarAtualizacaoViewportTotem() {
    window.clearTimeout(timerViewportTotem);
    timerViewportTotem = window.setTimeout(window.atualizarViewportTotem, 60);
}

window.iniciarViewportTotem = () => {
    alturaBaseTotem = Math.max(Math.round(window.innerHeight), Math.round(window.visualViewport?.height || 0));
    window.atualizarViewportTotem();
    if (listenersViewportTotemAtivos) return;
    listenersViewportTotemAtivos = true;

    window.addEventListener('resize', agendarAtualizacaoViewportTotem, { passive: true });
    window.addEventListener('orientationchange', agendarAtualizacaoViewportTotem, { passive: true });
    window.visualViewport?.addEventListener('resize', agendarAtualizacaoViewportTotem, { passive: true });
    window.visualViewport?.addEventListener('scroll', agendarAtualizacaoViewportTotem, { passive: true });

    document.addEventListener('focusin', (event) => {
        if (!campoEditavelDoTotem(event.target)) return;
        window.setTimeout(window.atualizarViewportTotem, 80);
        window.setTimeout(window.atualizarViewportTotem, 320);
    });

    document.addEventListener('focusout', (event) => {
        if (!event.target?.closest?.('#tela-totem')) return;
        window.setTimeout(() => {
            window.atualizarViewportTotem();
            if (!campoEditavelDoTotem(document.activeElement)) {
                document.getElementById('tela-totem')?.classList.remove('totem-native-keyboard-open');
            }
        }, 180);
    });
};

window.fecharTecladoNativoTotem = () => {
    if (campoEditavelDoTotem(document.activeElement)) document.activeElement.blur();
    document.getElementById('tela-totem')?.classList.remove('totem-native-keyboard-open');
    window.setTimeout(window.atualizarViewportTotem, 180);
};

window.configurarQrCodeTotem = () => {
    const unidade = window.obterUnidade ? window.obterUnidade() : '';
    const configuracao = TOTEM_QR_POR_UNIDADE[unidade];
    const imagem = document.getElementById('totem-qrcode-img');
    const wrapper = document.querySelector('.totem-qrcode-wrapper');
    const unidadeTexto = document.getElementById('totem-qrcode-unit');
    const instrucao = document.getElementById('totem-qrcode-label');
    if (!imagem || !wrapper || !unidadeTexto || !instrucao) return false;

    if (!configuracao) {
        imagem.removeAttribute('src');
        imagem.alt = '';
        wrapper.classList.add('qr-unavailable');
        unidadeTexto.textContent = 'Unidade não identificada';
        instrucao.textContent = 'Peça ajuda à nossa equipe';
        return false;
    }

    wrapper.classList.remove('qr-unavailable');
    unidadeTexto.textContent = 'Avaliação — ' + configuracao.nome;
    instrucao.textContent = 'Aponte a câmera para o QR Code';
    imagem.alt = 'QR Code de avaliação da unidade ' + configuracao.nome;
    imagem.dataset.unidade = unidade;
    imagem.onerror = () => {
        wrapper.classList.add('qr-unavailable');
        instrucao.textContent = 'QR Code temporariamente indisponível';
    };
    imagem.onload = () => wrapper.classList.remove('qr-unavailable');
    if (imagem.getAttribute('src') !== configuracao.src) imagem.src = configuracao.src;
    return true;
};

window.chamarApiTotem = async (recurso, dados) => {
    const unidade = window.obterUnidade ? window.obterUnidade() : '';
    if (!['navegantes', 'picarras'].includes(unidade)) {
        throw Object.assign(new Error('Unidade não identificada.'), { codigo: 'unidade_invalida' });
    }

    let resposta;
    try {
        resposta = await fetch(`/api/totem/${recurso}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            cache: 'no-store',
            signal: AbortSignal.timeout(15000),
            body: JSON.stringify({ ...dados, unidade })
        });
    } catch {
        throw Object.assign(new Error('Não foi possível conectar. Verifique a internet e tente novamente.'), { codigo: 'sem_conexao' });
    }

    const retorno = await resposta.json().catch(() => ({}));
    if (!resposta.ok || !retorno.ok) {
        throw Object.assign(new Error(retorno.erro || 'Não foi possível concluir.'), {
            codigo: retorno.codigo || 'erro_api',
            status: resposta.status
        });
    }
    return retorno;
};

function clienteMinimoDoTotem(dados) {
    return {
        cpf: dados.cpf,
        nome: dados.primeiroNome || 'Cliente',
        almocos: Number(dados.almocos || 0),
        _registradoHoje: Boolean(dados.registradoHoje),
        _aniversarioHoje: Boolean(dados.aniversarioHoje),
        _descontoDisponivel: Boolean(dados.descontoDisponivel)
    };
}

// ==========================================================================
// CONTROLO DE ECRÃ E NAVEGAÇÃO DO TOTEM (COM SEGURANÇA)
// ==========================================================================
window.entrarModoTotemDaTelaLogin = () => {
    document.getElementById('tela-login').classList.add('hidden');
    document.getElementById('app-dashboard').classList.add('hidden');
    document.body.classList.add('totem-active');
    
    if(document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(()=>{});
    }
    
    if(window.logAuditoria) window.logAuditoria('Totem', 'Modo Autoatendimento (Totem) iniciado.');
    
    document.getElementById('tela-totem').classList.remove('hidden');
    window.iniciarViewportTotem();
    window.configurarQrCodeTotem();
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

window.verificarPinTotem = async () => {
    const pin = document.getElementById('totem-pin-input').value;
    const botao = document.querySelector('#modal-totem-saida .totem-btn-primary');
    if (botao) botao.disabled = true;

    try {
        await window.chamarApiTotem('pin', { pin });
        if(window.logAuditoria) window.logAuditoria('Segurança Totem', 'Saída autorizada do modo totem (PIN Correto).');
        if(window.fecharModal) window.fecharModal('modal-totem-saida');
        window.sairModoTotem();
    } catch (erro) {
        if(window.logAuditoria) window.logAuditoria('Segurança Totem', 'Tentativa de saída bloqueada (PIN Incorreto).');
        window.mostrarToast(erro.status === 503 ? erro.message : "PIN incorreto. Acesso negado.", "erro");
        document.getElementById('totem-pin-input').value = '';
        document.getElementById('totem-pin-input').focus();
    } finally {
        if (botao) botao.disabled = false;
    }
};

window.sairModoTotem = () => {
    if(document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(()=>{});
    }
    window.fecharTecladoNativoTotem();
    document.body.classList.remove('totem-active');
    document.getElementById('tela-totem').classList.add('hidden');
    document.documentElement.style.removeProperty('--totem-viewport-height');
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

    const conteudoTotem = document.getElementById('totem-dynamic-area');
    if(conteudoTotem) conteudoTotem.scrollTop = 0;
    
    // Limpa todos os campos e reabilita o CPF
    ['totem-cpf', 'totem-cad-cpf', 'totem-cad-nome', 'totem-cad-nasc', 'totem-cad-tel'].forEach(id => {
        const inp = document.getElementById(id);
        if(inp) {
            inp.value = '';
            inp.disabled = false;   // reabilita o campo CPF
            inp.blur();
        }
    });

    window.fecharTecladoNativoTotem();
};

// ==========================================================================
// PROCESSAMENTO DA LEITURA DO CPF E FLUXO DE TELAS
// ==========================================================================
window.totemProcessarCPF = async () => {
    if(window.isProcessing) return;
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
    
    // Fecha o teclado nativo do dispositivo
    if(document.activeElement) document.activeElement.blur(); 
    
    try {
        const resposta = await window.chamarApiTotem('cliente', { acao: 'consultar', cpf: cpfNum });

        if(!resposta.existe) {
            document.getElementById('totem-tela-busca').classList.add('hidden');
            document.getElementById('totem-form').reset();
            document.getElementById('totem-cad-cpf').value = window.formatarCPF(cpfNum);
            document.getElementById('totem-tela-cadastro').classList.remove('hidden');

            setTimeout(() => {
                const cadNome = document.getElementById('totem-cad-nome');
                if (cadNome) cadNome.focus({ preventScroll: true });
            }, 300);

            window.resetarTimerTotem();
            return;
        }

        const cliente = clienteMinimoDoTotem(resposta.cliente);
        window.totemClienteTemp = cliente;

        if(cliente._descontoDisponivel) {
            document.getElementById('totem-tela-busca').classList.add('hidden');
            document.getElementById('totem-tela-opcoes').classList.remove('hidden');
            window.resetarTimerTotem();
        } else if(cliente._registradoHoje) {
            window.totemMostrarMensagem('ja_registrado');
        } else {
            window.isProcessing = false;
            if(window.operacoesAtivas) window.operacoesAtivas[cpfNum] = false;
            await window.totemExecutarAcumulo();
        }
    } catch (erro) {
        console.error('Falha na consulta do totem:', erro.codigo || erro.message);
        window.mostrarToast(erro.message, 'erro');
        document.getElementById('totem-cpf').disabled = false;
        document.getElementById('totem-cpf').focus({ preventScroll: true });
    } finally {
        window.isProcessing = false;
        if(window.operacoesAtivas) window.operacoesAtivas[cpfNum] = false;
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Avançar';
    }
};

window.totemSalvarCadastro = async (e) => {
    e.preventDefault(); 
    if(window.isProcessing) return;
    
    const cpf = document.getElementById('totem-cad-cpf').value.replace(/\D/g, '');
    if(window.operacoesAtivas && window.operacoesAtivas[cpf]) return;
    
    // Padroniza o nome antes de gravar, independentemente de como foi digitado.
    const inputNome = document.getElementById('totem-cad-nome');
    const nome = window.normalizarNome(inputNome.value);
    if (!nome) {
        window.mostrarToast('Digite seu nome completo usando apenas letras.', 'erro');
        return;
    }
    inputNome.value = nome;
    
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
    
    let niverF = nasc.includes('/') ? `${nasc.split('/')[2]}-${nasc.split('/')[1]}-${nasc.split('/')[0]}` : nasc;

    try {
        const resposta = await window.chamarApiTotem('cliente', {
            acao: 'cadastrar', cpf, nome, nascimento: niverF, telefone: tel
        });
        const novoCliente = clienteMinimoDoTotem(resposta.cliente);
        window.totemClienteTemp = novoCliente;

        if(novoCliente._aniversarioHoje) {
            window.totemMostrarMensagem('aniversario_totem'); 
        } else {
            window.totemMostrarMensagem('cadastro_sucesso');
        }
    } catch (erro) {
        window.mostrarToast(erro.codigo === 'cliente_existente' ? 'CPF já cadastrado. Volte e tente novamente.' : erro.message, 'erro');
    } finally {
        window.isProcessing = false;
        if(window.operacoesAtivas) window.operacoesAtivas[cpf] = false;
        if(btnSalvar) btnSalvar.disabled = false;
        if(spanSalvar) spanSalvar.innerText = 'Salvar cadastro';
    }
};

window.totemExecutarAcumulo = async () => {
    if(window.isProcessing) return;
    const cliente = window.totemClienteTemp; 
    if(!cliente) return;
    if(cliente._registradoHoje) return window.totemMostrarMensagem('ja_registrado');
    
    window.isProcessing = true; 
    if(window.operacoesAtivas) window.operacoesAtivas[cliente.cpf] = true; 
    
    const btn = document.getElementById('btn-totem-acumular'); 
    const span = document.getElementById('btn-totem-acumular-text');
    if(btn) btn.disabled = true;
    if(span) span.innerText = 'Atualizando...';
    
    try {
        const resposta = await window.chamarApiTotem('cliente', { acao: 'acumular', cpf: cliente.cpf });
        const atualizado = clienteMinimoDoTotem(resposta.cliente);
        window.totemClienteTemp = atualizado;

        if (atualizado._aniversarioHoje) {
            window.totemMostrarMensagem('aniversario_totem');
        } else if (atualizado.almocos > 0 && atualizado.almocos % 10 === 0) {
            window.totemMostrarMensagem('meta_atingida'); 
        } else {
            window.totemMostrarMensagem('sucesso_acumulo');
        }
    } catch (erro) {
        if (erro.codigo === 'ja_registrado') window.totemMostrarMensagem('ja_registrado');
        else window.mostrarToast(erro.message, 'erro');
    } finally {
        window.isProcessing = false;
        if(window.operacoesAtivas) window.operacoesAtivas[cliente.cpf] = false;
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Guardar para outra visita';
    }
};

// ==========================================================================
// FUNÇÕES AUXILIARES DE MENSAGENS E TEMPORIZAÇÃO DO TOTEM
// ==========================================================================
window.totemMostrarMensagem = (tipo) => {
    // Fecha o teclado nativo antes de exibir a mensagem final.
    window.fecharTecladoNativoTotem();

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
    const nomeExibicao = window.totemClienteTemp && window.totemClienteTemp.nome
        ? (window.nomeExibicao ? window.nomeExibicao(window.totemClienteTemp.nome) : window.totemClienteTemp.nome)
        : '';
    const nomeC = window.escapeHTML(nomeExibicao.split(' ')[0]);

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
    window.fecharTecladoNativoTotem();
    window.configurarQrCodeTotem();

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

