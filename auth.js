// auth.js
// Módulo 3: Autenticação, Controle de Sessão e Gestão Granular de Permissões

// ==========================================================================
// ESTADO GLOBAL E MATRIZ DE PERMISSÕES
// ==========================================================================
window.usuarioLogado = null;
window.cargoLogado = null;
window.permissoesLogado = null;

// Matriz de permissões padrão para retrocompatibilidade e auto-preenchimento
window.permissoesPadrao = {
    caixa: { dashboard: false, caixa: true, clientes: false, marketing: false, auditoria: false, simulacao: false, reset: false, usuarios: false, totem: true, configuracoes: false },
    gerente: { dashboard: true, caixa: true, clientes: true, marketing: true, auditoria: true, simulacao: false, reset: false, usuarios: false, totem: true, configuracoes: true },
    admin: { dashboard: true, caixa: true, clientes: true, marketing: true, auditoria: true, simulacao: true, reset: true, usuarios: true, totem: true, configuracoes: true }
};

// ==========================================================================
// GESTÃO DE MULTIUNIDADE E CAMADA CENTRAL DE CAMINHOS
// ==========================================================================
window.obterUnidade = () => localStorage.getItem('unidadeAtiva');

window.selecionarUnidadeAtiva = (unidade) => {
    localStorage.setItem('unidadeAtiva', unidade);
    window.location.reload();
};

window.abrirTrocaUnidade = () => {
    if(!window.permissoesLogado || !window.permissoesLogado.configuracoes) {
        return window.mostrarToast("Seu perfil não tem permissão para alterar a unidade.", "erro");
    }
    if(confirm("ATENÇÃO: Deseja realmente alterar a unidade deste dispositivo?\n\nIsso fará logout automático e mudará o banco de dados ativo.")) {
        localStorage.removeItem('unidadeAtiva');
        window.fazerLogout();
        window.location.reload();
    }
};

window.verificarSelecaoUnidade = () => {
    const uni = window.obterUnidade();
    if(!uni) {
        const tela = document.getElementById('tela-selecao-unidade');
        if(tela) {
            tela.classList.remove('hidden');
            tela.classList.add('flex');
        }
        return false;
    }
    
    // Atualiza a UI (selo de unidade)
    const ind = document.getElementById('indicador-unidade');
    const txt = document.getElementById('texto-indicador-unidade');
    if(ind && txt) {
        ind.classList.remove('hidden');
        txt.innerText = uni === 'navegantes' ? 'Navegantes' : 'Piçarras';
    }
    return true;
};

// Camada única responsável por compor os caminhos do Firebase respeitando a unidade ativa
window.obterCaminhoUnidade = (caminhoBase) => {
    const uni = window.obterUnidade();
    return `lojas/${uni}/${caminhoBase}`;
};

// ==========================================================================
// GESTÃO DE SESSÃO COM EXPIRAÇÃO
// ==========================================================================
const TEMPO_SESSAO_HORAS = 12; // A sessão expira obrigatoriamente após 12 horas

window.verificarExpiracaoSessao = () => {
    const loginTime = localStorage.getItem('loginTimestamp');
    if(!loginTime) return false;
    
    const tempoDecorrido = Date.now() - parseInt(loginTime);
    const tempoMaximo = TEMPO_SESSAO_HORAS * 60 * 60 * 1000;
    
    return tempoDecorrido > tempoMaximo;
};

// Verifica ativamente a cada 1 minuto se a sessão estourou o tempo limite enquanto o sistema está aberto
setInterval(() => {
    if(window.usuarioLogado && window.verificarExpiracaoSessao()) {
        if(window.mostrarToast) window.mostrarToast("Sua sessão expirou. Por favor, faça login novamente.", "erro");
        window.fazerLogout();
    }
}, 60000);

// ==========================================================================
// OBSERVADOR DE SESSÃO (Disparado automaticamente ao entrar/sair)
// ==========================================================================
window.firebaseOnAuthStateChanged(window.auth, async (user) => {
    if(!window.verificarSelecaoUnidade()) {
        if(user) window.firebaseSignOut(window.auth); 
        return;
    }

    if (user) {
        if(window.verificarExpiracaoSessao()) {
            window.fazerLogout();
            return;
        }

        window.usuarioLogado = user;
        const username = user.email.split('@')[0];
        
        const pathUsuarios = window.obterCaminhoUnidade(`usuarios/${username}`);
        const snap = await window.firebaseGet(window.firebaseRef(window.db, pathUsuarios));
        
        if (snap.exists()) {
            const data = snap.val();
            window.cargoLogado = data.cargo;
            window.permissoesLogado = data.permissoes || window.permissoesPadrao[window.cargoLogado] || window.permissoesPadrao['caixa'];
        } else {
            window.cargoLogado = (username === 'admin' ? 'admin' : 'caixa');
            window.permissoesLogado = window.permissoesPadrao[window.cargoLogado];
        }
        
        if(window.aplicarRegrasNaInterface) {
            window.aplicarRegrasNaInterface(window.cargoLogado, username, window.permissoesLogado);
        }
        if(window.iniciarListenersProtegidos) window.iniciarListenersProtegidos();
        
        if(window.logAuditoria) window.logAuditoria('Login', `Acesso ao sistema. Perfil: ${window.cargoLogado}`);
    } else {
        if(window.pararListenersProtegidos) window.pararListenersProtegidos();
        window.usuarioLogado = null; 
        window.cargoLogado = null;
        window.permissoesLogado = null;
        localStorage.removeItem('loginTimestamp');
        
        document.getElementById('app-dashboard').classList.add('hidden');
        if (document.getElementById('tela-totem') && document.getElementById('tela-totem').classList.contains('hidden')) {
            document.getElementById('tela-login').classList.remove('hidden');
            document.getElementById('tela-login').classList.add('flex');
            
            const btn = document.getElementById('btn-login');
            const span = document.getElementById('btn-login-text');
            if(btn) btn.disabled = false;
            if(span) span.innerText = 'Acessar sistema';
            
            const inputSenha = document.getElementById('login-senha');
            if(inputSenha) inputSenha.value = '';
        }
    }
});

// ==========================================================================
// FUNÇÕES DISPARADAS PELO HTML (LOGIN E LOGOUT)
// ==========================================================================
window.fazerLogin = (e) => {
    e.preventDefault();

    if(!window.obterUnidade()) {
        return window.mostrarToast("Selecione uma unidade antes de acessar.", "erro");
    }

    const btn = document.getElementById('btn-login'); 
    const span = document.getElementById('btn-login-text');
    
    if(btn) btn.disabled = true; 
    if(span) span.innerText = 'Entrando...';
    
    const user = document.getElementById('login-user').value.trim().toLowerCase();
    const pass = document.getElementById('login-senha').value;
    
    window.firebaseSetPersistence(window.auth, window.firebaseBrowserSessionPersistence)
        .then(() => {
            localStorage.setItem('loginTimestamp', Date.now());
            return window.firebaseSignIn(window.auth, `${user}@tophaus.com.br`, pass);
        })
        .catch(() => {
            localStorage.removeItem('loginTimestamp');
            if(window.mostrarToast) window.mostrarToast("Usuário ou senha incorretos. Verifique e tente novamente.", "erro"); 
            if(btn) btn.disabled = false; 
            if(span) span.innerText = 'Acessar sistema';
        });
};

window.fazerLogout = () => { 
    if(window.logAuditoria && window.usuarioLogado) window.logAuditoria('Logout', 'Saída do sistema'); 
    localStorage.removeItem('loginTimestamp');
    window.firebaseSignOut(window.auth); 
};

// ==========================================================================
// GESTÃO DE USUÁRIOS E ACESSOS (HÍBRIDO: CARGO + PERMISSÕES)
// ==========================================================================
window.abrirGerenciadorUsuarios = () => {
    if(!window.permissoesLogado || !window.permissoesLogado.usuarios) {
        return window.mostrarToast("Seu perfil não tem acesso a esta ação.", "erro");
    }
    
    window.injetarCheckboxesPermissoes(); 
    
    const lista = document.getElementById('lista-usuarios-cadastrados');
    if(!lista) return;
    
    lista.innerHTML = '<p class="text-center text-gray-500 py-4">Carregando usuários...</p>';
    
    const pathUsuarios = window.obterCaminhoUnidade('usuarios');
    
    window.firebaseGet(window.firebaseRef(window.db, pathUsuarios)).then(snap => {
        lista.innerHTML = '';
        if(snap.exists()) {
            Object.entries(snap.val()).forEach(([user, data]) => {
                const isCustom = data.permissoes ? '⭐ Custom' : 'Padrão';
                
                lista.innerHTML += `
                    <div class="flex justify-between items-center p-3 bg-gray-50 rounded border border-gray-100">
                        <div>
                            <span class="font-bold text-gray-800">${user}</span> 
                            <span class="px-2 py-0.5 ml-2 bg-gray-200 text-gray-600 rounded text-[10px] font-black uppercase">${data.cargo}</span>
                            <span class="px-2 py-0.5 ml-1 bg-indigo-100 text-indigo-700 rounded text-[10px] font-black uppercase">${isCustom}</span>
                        </div>
                        <div class="flex gap-2">
                            <button type="button" onclick="alterarCargo('${user}', '${data.cargo}')" class="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition" title="Editar perfil"><i data-lucide="edit" class="w-4 h-4"></i></button>
                            <button type="button" onclick="removerAcesso('${user}')" class="text-red-600 hover:bg-red-50 p-1.5 rounded transition" title="Remover acesso"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    </div>`;
            });
            if(window.lucide) window.lucide.createIcons();
        }
    });
    
    const modal = document.getElementById('modal-usuarios'); 
    modal.classList.remove('hidden'); 
    if(window.prenderFocoModal) window.prenderFocoModal(modal);
};

window.injetarCheckboxesPermissoes = () => {
    if(document.getElementById('container-permissoes')) return;
    
    const selectCargo = document.getElementById('novo-cargo');
    if(!selectCargo) return;

    const container = document.createElement('div');
    container.id = 'container-permissoes';
    container.className = 'grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs mt-3 bg-white p-4 rounded-xl border border-indigo-100 shadow-inner';
    
    const chaves = ['dashboard', 'caixa', 'clientes', 'marketing', 'auditoria', 'simulacao', 'reset', 'usuarios', 'totem', 'configuracoes'];
    
    let html = `<div class="col-span-full text-center text-indigo-900 font-bold mb-2 border-b border-indigo-50 pb-2">Permissões individuais (opcional)</div>`;
    
    chaves.forEach(p => {
        html += `
            <label class="flex items-center gap-2 cursor-pointer text-gray-700 hover:text-black">
                <input type="checkbox" id="perm-${p}" class="w-4 h-4 text-indigo-600 rounded border-gray-300">
                <span class="capitalize font-medium">${p}</span>
            </label>`;
    });
    container.innerHTML = html;
    
    selectCargo.parentNode.insertBefore(container, selectCargo.nextSibling);
    
    selectCargo.addEventListener('change', (e) => {
        const cargo = e.target.value;
        const padrao = window.permissoesPadrao[cargo] || window.permissoesPadrao['caixa'];
        chaves.forEach(p => {
            const cb = document.getElementById(`perm-${p}`);
            if(cb) cb.checked = !!padrao[p];
        });
    });
    
    selectCargo.dispatchEvent(new Event('change'));
};

window.criarUsuario = (e) => {
    e.preventDefault();

    if (!window.permissoesLogado || (!window.permissoesLogado.usuarios && !window.permissoesLogado.admin)) {
        return window.mostrarToast("Acesso negado.", "erro");
    }

    const btn = document.getElementById('btn-usuarios-salvar');
    const span = document.getElementById('btn-usuarios-salvar-text');
    
    if(btn) btn.disabled = true;
    if(span) span.innerText = 'Salvando...';

    const user = document.getElementById('novo-user').value.trim().toLowerCase();
    const pass = document.getElementById('novo-senha').value;
    const cargo = document.getElementById('novo-cargo').value;
    const email = `${user}@tophaus.com.br`;

    const objPermissoes = {};
    ['dashboard', 'caixa', 'clientes', 'marketing', 'auditoria', 'simulacao', 'reset', 'usuarios', 'totem', 'configuracoes'].forEach(p => {
        const cb = document.getElementById(`perm-${p}`);
        objPermissoes[p] = cb ? cb.checked : false;
    });

    const pathUsuarioEspecifico = window.obterCaminhoUnidade(`usuarios/${user}`);

    if (!window.authSecundario) {
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Salvar cadastro';
        return window.mostrarToast("Serviço de autenticação secundária indisponível.", "erro");
    }

    window.firebaseCreateUser(window.authSecundario, email, pass)
        .catch(err => {
            if(err.code === 'auth/email-already-in-use') {
                console.log("DIAGNOSTICO: E-mail já em uso no Auth, prosseguindo.");
                return Promise.resolve();
            }
            throw { etapa: "firebaseCreateUser", error: err };
        })
        .then(() => {
            return window.firebaseSet(window.firebaseRef(window.db, pathUsuarioEspecifico), { 
                cargo: cargo, 
                permissoes: objPermissoes 
            }).catch(err => {
                throw { etapa: "firebaseSet", error: err };
            });
        })
        .then(() => {
            window.mostrarToast("Usuário cadastrado com sucesso.", "sucesso");
            if(window.logAuditoria) window.logAuditoria('Gestão de Acessos', `Novo usuário '${user}' criado com perfil '${cargo}'.`);
            
            document.getElementById('novo-user').value = ''; 
            document.getElementById('novo-senha').value = '';
            
            window.abrirGerenciadorUsuarios();
        })
        .catch(errWrapper => {
            const etapa = errWrapper.etapa || "desconhecida";
            const err = errWrapper.error || errWrapper;
            const code = err.code || 'N/A';
            const message = err.message || String(err);
            const stack = err.stack || 'N/A';

            console.error(`DIAGNOSTICO FALHA na etapa [${etapa}]`, { code, message, stack });
            window.mostrarToast(`Erro em [${etapa}] | Code: ${code} | Msg: ${message}`, "erro");
        })
        .finally(() => {
            if(btn) btn.disabled = false;
            if(span) span.innerText = 'Salvar cadastro';
        });
};

window.removerAcesso = (username) => {
    if(username === 'admin') return window.mostrarToast("Não é possível remover o administrador principal.", "erro");
    
    const pathUsuarioEspecifico = window.obterCaminhoUnidade(`usuarios/${username}`);

    if(window.confirmacaoDupla) {
        window.confirmacaoDupla(
            "Remover Acesso", 
            `Deseja remover definitivamente o acesso de "${username}"?\nEsta conta será apagada da unidade atual.`,
            () => {
                window.firebaseSet(window.firebaseRef(window.db, pathUsuarioEspecifico), null).then(() => {
                    window.mostrarToast("Acesso removido com sucesso.", "sucesso");
                    if(window.logAuditoria) window.logAuditoria('Gestão de Acessos', `O acesso do usuário '${username}' foi removido.`);
                    window.abrirGerenciadorUsuarios();
                });
            }
        );
    } else {
        if(confirm(`Deseja remover o acesso de "${username}"?\n\nEsta ação não poderá ser desfeita.`)) {
            window.firebaseSet(window.firebaseRef(window.db, pathUsuarioEspecifico), null).then(() => {
                window.mostrarToast("Acesso removido com sucesso.", "sucesso");
                if(window.logAuditoria) window.logAuditoria('Gestão de Acessos', `O acesso do usuário '${username}' foi removido.`);
                window.abrirGerenciadorUsuarios();
            });
        }
    }
};

window.alterarCargo = (username, cargoAtual) => {
    if(username === 'admin') return window.mostrarToast("Não é possível alterar o perfil do administrador principal.", "erro");
    
    const novoCargo = prompt(`Modificar o perfil de acesso de "${username}".\nOpções válidas: caixa, gerente, admin\n\nAtenção: As permissões individuais serão redefinidas para o padrão do perfil.`, cargoAtual);
    
    if(novoCargo && ['caixa', 'gerente', 'admin'].includes(novoCargo.trim().toLowerCase())) {
        const cargoFinal = novoCargo.trim().toLowerCase();
        const pathUsuarioEspecifico = window.obterCaminhoUnidade(`usuarios/${username}`);
        
        window.firebaseSet(window.firebaseRef(window.db, pathUsuarioEspecifico), { cargo: cargoFinal, permissoes: window.permissoesPadrao[cargoFinal] }).then(() => {
            window.mostrarToast("Perfil atualizado com sucesso.", "sucesso");
            if(window.logAuditoria) window.logAuditoria('Gestão de Acessos', `Perfil do usuário '${username}' alterado para '${cargoFinal}'.`);
            window.abrirGerenciadorUsuarios();
        });
    } else if (novoCargo) {
        window.mostrarToast("Perfil inválido. Operação cancelada.", "erro");
    }
};

// ==========================================================================
// CONTROLE DE VISIBILIDADE DE INTERFACE POR PERMISSÃO INDIVIDUAL
// ==========================================================================
window.aplicarRegrasNaInterface = (cargo, username, permissoes) => {
    if (!permissoes) permissoes = window.permissoesPadrao[cargo] || window.permissoesPadrao['caixa'];

    document.getElementById('tela-login').classList.add('hidden');
    document.getElementById('tela-login').classList.remove('flex');
    document.getElementById('app-dashboard').classList.remove('hidden');
    
    document.getElementById('nome-usuario-logado').innerText = `(${cargo}) ${username}`;

    const btnAdmin = document.getElementById('btn-aba-admin');
    const btnCaixa = document.getElementById('btn-aba-caixa');
    const btnRelatorios = document.getElementById('btn-aba-relatorios');
    const btnSimulacao = document.getElementById('btn-ativar-simulacao');
    const btnZerar = document.getElementById('btn-zerar-banco');
    const btnAcessos = document.getElementById('btn-gerenciar-acessos');
    const btnAuditoria = document.getElementById('btn-auditoria');
    const btnLixeira = document.getElementById('btn-lixeira');
    const btnMesclar = document.getElementById('btn-mesclar');
    const btnTrocarUnidade = document.getElementById('btn-trocar-unidade');
    const painelMetricas = document.getElementById('painel-metricas-avancadas');
    
    const botoesTotem = document.querySelectorAll('button[onclick="entrarModoTotemDaTelaLogin()"]');
    const btnMarketing = document.querySelector('button[onclick="abrirCentralMarketing()"]');

    if (btnAdmin) permissoes.dashboard ? btnAdmin.classList.remove('hidden') : btnAdmin.classList.add('hidden');
    if (btnCaixa) permissoes.caixa ? btnCaixa.classList.remove('hidden') : btnCaixa.classList.add('hidden');
    if (btnRelatorios) cargo === 'admin' ? btnRelatorios.classList.remove('hidden') : btnRelatorios.classList.add('hidden');
    if (btnSimulacao) permissoes.simulacao ? btnSimulacao.classList.remove('hidden') : btnSimulacao.classList.add('hidden');
    if (btnZerar) permissoes.reset ? btnZerar.classList.remove('hidden') : btnZerar.classList.add('hidden');
    if (btnAcessos) permissoes.usuarios ? btnAcessos.classList.remove('hidden') : btnAcessos.classList.add('hidden');
    if (btnAuditoria) permissoes.auditoria ? btnAuditoria.classList.remove('hidden') : btnAuditoria.classList.add('hidden');
    if (btnLixeira) permissoes.clientes ? btnLixeira.classList.remove('hidden') : btnLixeira.classList.add('hidden');
    if (btnMesclar) permissoes.clientes ? btnMesclar.classList.remove('hidden') : btnMesclar.classList.add('hidden');
    if (btnTrocarUnidade) permissoes.configuracoes ? btnTrocarUnidade.classList.remove('hidden') : btnTrocarUnidade.classList.add('hidden');
    if (painelMetricas) permissoes.dashboard ? painelMetricas.classList.remove('hidden') : painelMetricas.classList.add('hidden');
    
    if (btnMarketing) permissoes.marketing ? btnMarketing.classList.remove('hidden') : btnMarketing.classList.add('hidden');
    
    botoesTotem.forEach(btn => {
        permissoes.totem ? btn.classList.remove('hidden') : btn.classList.add('hidden');
    });

    if (permissoes.dashboard && window.alternarAba) {
        window.alternarAba('admin');
    } else if (permissoes.caixa && window.alternarAba) {
        window.alternarAba('caixa');
    } else {
        window.mostrarToast("Seu perfil não tem acesso a esta ação. Fale com o administrador.", "erro");
    }
};

