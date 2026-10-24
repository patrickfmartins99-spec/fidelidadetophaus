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

const UNIDADES_VALIDAS = new Set(['navegantes', 'picarras']);
const PERFIS_LEGADOS = { admin: 'admin', gerente: 'gerente', caixa: 'caixa' };
let loginTimestampMemoria = null;
let versaoSessao = 0;
let loginEmAndamento = false;
let bloquearRestauracao = false;
let operacaoAuthPendente = null;
let observadorIniciado = false;

function comPrazo(operacao, ms, etapa) {
    let timer;
    return Promise.race([
        operacao,
        new Promise((_, rejeitar) => {
            timer = setTimeout(() => rejeitar({ code: 'auth/timeout', etapa }), ms);
        })
    ]).finally(() => clearTimeout(timer));
}

function acompanharOperacaoAuth(operacao) {
    const atual = Promise.resolve(operacao);
    operacaoAuthPendente = atual;
    const liberar = () => {
        if (operacaoAuthPendente === atual) operacaoAuthPendente = null;
    };
    atual.then(liberar, liberar);
    return atual;
}

function auditarSessao(acao, detalhes) {
    // Falha de auditoria não pode impedir um login válido ou um logout.
    try {
        Promise.resolve(window.logAuditoria?.(acao, detalhes)).catch(() => {
            console.warn('Auditoria de sessão indisponível.');
        });
    } catch (_) { console.warn('Auditoria de sessão indisponível.'); }
}

function limparSessaoLocal() {
    window.pararListenersProtegidos?.();
    window.usuarioLogado = null;
    window.cargoLogado = null;
    window.permissoesLogado = null;
    removerPreferencia('loginTimestamp');
    loginTimestampMemoria = null;
    document.getElementById('app-dashboard')?.classList.add('hidden');
    const totem = document.getElementById('tela-totem');
    if (!totem || totem.classList.contains('hidden')) {
        const tela = document.getElementById('tela-login');
        tela?.classList.remove('hidden');
        tela?.classList.add('flex');
    }
    definirCarregamentoLogin(false);
}

function encerrarAutenticacao() {
    bloquearRestauracao = true;
    // O SDK não cancela signIn. Serializar o logout impede que uma resposta
    // atrasada autentique o usuário depois do timeout, ou derrube outra tentativa.
    const encerramento = Promise.resolve(operacaoAuthPendente)
        .catch(() => {})
        .then(() => window.firebaseSignOut(window.auth));
    acompanharOperacaoAuth(encerramento).catch(() => console.warn('Logout remoto indisponível.'));
}

async function lerPerfilLogin(user, caminho) {
    try {
        return await comPrazo(window.firebaseGet(window.firebaseRef(window.db, caminho)), 8000, 'perfil');
    } catch (erro) {
        const codigo = String(erro?.code || '').toLowerCase();
        // Uma negativa de permissão nunca pode ser contornada pelo fallback.
        if (codigo.includes('permission') || codigo.includes('denied')) throw erro;
        if (codigo !== 'auth/timeout' && !codigo.includes('unavailable') && !codigo.includes('network')) throw erro;
    }
    const controller = new AbortController();
    try {
        return await comPrazo((async () => {
            const token = await user.getIdToken();
            const base = window.firebaseApp.options.databaseURL.replace(/\/$/, '');
            const resposta = await fetch(`${base}/${caminho}.json?auth=${encodeURIComponent(token)}`, {
                signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
            });
            if (resposta.status === 401 || resposta.status === 403) throw { code: 'auth/sem-acesso-unidade' };
            if (!resposta.ok) throw { code: 'auth/network-request-failed' };
            const dados = await resposta.json();
            return { exists: () => dados !== null, val: () => dados };
        })(), 10000, 'perfil-alternativo');
    } finally { controller.abort(); }
}

async function concluirSessao(user, versao) {
    const unidade = window.obterUnidade();
    const email = String(user.email || '').toLowerCase();
    const username = email.split('@')[0];
    if (!email.endsWith('@tophaus.com.br') || !/^[a-z0-9_-]{3,40}$/.test(username)) {
        throw { code: 'auth/sem-acesso-unidade' };
    }
    const snap = await lerPerfilLogin(user, `lojas/${unidade}/usuarios/${username}`);
    if (versao !== versaoSessao || unidade !== window.obterUnidade() || window.auth.currentUser?.uid !== user.uid) return;
    let cargo;
    let permissoes;
    if (snap.exists()) {
        const data = snap.val() || {};
        cargo = data.cargo;
        permissoes = data.permissoes || window.permissoesPadrao[cargo];
    } else if (PERFIS_LEGADOS[username]) {
        cargo = PERFIS_LEGADOS[username];
        permissoes = window.permissoesPadrao[cargo];
    } else {
        throw { code: 'auth/sem-acesso-unidade' };
    }
    if (!window.permissoesPadrao[cargo] || !permissoes) throw { code: 'auth/sem-acesso-unidade' };
    window.usuarioLogado = user;
    window.cargoLogado = cargo;
    window.permissoesLogado = permissoes;
    window.aplicarRegrasNaInterface(cargo, username, permissoes);
    window.iniciarListenersProtegidos?.();
    const inputSenha = document.getElementById('login-senha');
    if (inputSenha) inputSenha.value = '';
    auditarSessao('Login', `Acesso ao sistema. Perfil: ${cargo}`);
}

function lerPreferencia(chave) {
    for (const nome of ['localStorage', 'sessionStorage']) {
        try {
            const armazenamento = window[nome];
            const valor = armazenamento.getItem(chave);
            if (valor !== null) return valor;
        } catch (_) {
            // Alguns navegadores móveis bloqueiam storage em modo privado.
        }
    }
    return null;
}

function salvarPreferencia(chave, valor) {
    for (const nome of ['localStorage', 'sessionStorage']) {
        try {
            const armazenamento = window[nome];
            armazenamento.setItem(chave, String(valor));
            return true;
        } catch (_) {
            // Tenta o próximo armazenamento disponível.
        }
    }
    return false;
}

function removerPreferencia(chave) {
    for (const nome of ['localStorage', 'sessionStorage']) {
        try { window[nome].removeItem(chave); } catch (_) { /* sem ação */ }
    }
}

function definirCarregamentoLogin(ativo) {
    const btn = document.getElementById('btn-login');
    const span = document.getElementById('btn-login-text');
    if (btn) btn.disabled = ativo;
    if (span) span.innerText = ativo ? 'Entrando...' : 'Entrar no sistema';
}

function mensagemErroLogin(erro) {
    const codigo = String(erro?.code || erro?.codigo || '').toLowerCase().replaceAll('_', '-');
    if (codigo.includes('timeout')) {
        return 'O serviço de acesso demorou para responder. Verifique a conexão e tente novamente. Se continuar, atualize a página.';
    }
    if (codigo.includes('user-disabled')) return 'Este usuário está desativado. Fale com o administrador.';
    if (codigo.includes('sem-acesso-unidade') || codigo.includes('permission-denied')) {
        return 'Este usuário não possui acesso à unidade selecionada. Troque a unidade e tente novamente.';
    }
    if (codigo.includes('invalid-credential') || codigo.includes('wrong-password') || codigo.includes('user-not-found') || codigo.includes('invalid-email')) {
        return 'Usuário ou senha incorretos. Verifique e tente novamente.';
    }
    if (codigo.includes('too-many-requests')) {
        return 'Acesso temporariamente bloqueado por muitas tentativas. Aguarde alguns minutos e tente novamente.';
    }
    if (codigo.includes('network-request-failed') || codigo.includes('unavailable')) {
        return 'Não foi possível conectar ao serviço de acesso. Verifique a internet e tente novamente.';
    }
    return 'Não foi possível concluir o acesso. Tente novamente ou fale com o administrador.';
}

// ==========================================================================
// GESTÃO DE MULTIUNIDADE E CAMADA CENTRAL DE CAMINHOS
// ==========================================================================
window.obterUnidade = () => {
    const unidade = lerPreferencia('unidadeAtiva');
    return UNIDADES_VALIDAS.has(unidade) ? unidade : null;
};

window.selecionarUnidadeAtiva = (unidade) => {
    if (!UNIDADES_VALIDAS.has(unidade)) return;
    salvarPreferencia('unidadeAtiva', unidade);
    window.location.reload();
};

window.trocarUnidadeNoLogin = async () => {
    removerPreferencia('unidadeAtiva');
    removerPreferencia('loginTimestamp');
    loginTimestampMemoria = null;
    try { await window.firebaseSignOut(window.auth); } catch (_) { /* sessão já encerrada */ }
    window.location.reload();
};

window.abrirTrocaUnidade = async () => {
    if(!window.permissoesLogado || !window.permissoesLogado.configuracoes) {
        return window.mostrarToast("Seu perfil não tem permissão para alterar a unidade.", "erro");
    }
    if(confirm("ATENÇÃO: Deseja realmente alterar a unidade deste dispositivo?\n\nIsso fará logout automático e mudará o banco de dados ativo.")) {
        removerPreferencia('unidadeAtiva');
        await window.fazerLogout();
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
    const unidadeLogin = document.getElementById('login-unidade-atual');
    if (unidadeLogin) unidadeLogin.innerText = uni === 'navegantes' ? 'Navegantes' : 'Balneário Piçarras';
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
    const loginTime = lerPreferencia('loginTimestamp') || loginTimestampMemoria;
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
window.iniciarObservadorSessao = () => {
    if (observadorIniciado) return;
    observadorIniciado = true;
    window.verificarSelecaoUnidade();
    window.firebaseOnAuthStateChanged(window.auth, async (user) => {
        // O submit conclui seu próprio login, inclusive quando o usuário não
        // mudou e o SDK não emite um novo evento de autenticação.
        if (loginEmAndamento || (user && bloquearRestauracao)) return;
        if (user && window.usuarioLogado?.uid === user.uid) return;
        const versao = ++versaoSessao;
        if (!user) { limparSessaoLocal(); return; }
        if (!window.verificarSelecaoUnidade()) { encerrarAutenticacao(); return; }
        if (window.verificarExpiracaoSessao()) { window.fazerLogout(); return; }
        definirCarregamentoLogin(true);
        try {
            await concluirSessao(user, versao);
        } catch (erro) {
            if (versao !== versaoSessao) return;
            console.warn('Restauração de sessão:', erro?.code || 'erro-desconhecido');
            limparSessaoLocal();
            encerrarAutenticacao();
            window.mostrarToast?.(mensagemErroLogin(erro), 'erro');
        } finally {
            if (versao === versaoSessao) definirCarregamentoLogin(false);
        }
    });
};

// ==========================================================================
// FUNÇÕES DISPARADAS PELO HTML (LOGIN E LOGOUT)
// ==========================================================================
async function configurarPersistenciaLogin() {
    // initializeAuth escolhe a persistência antes do login. Alterá-la a cada
    // submit fazia a autenticação esperar por migrações de armazenamento.
    await comPrazo(acompanharOperacaoAuth(window.auth.authStateReady()), 8000, 'inicializacao');
}

window.fazerLogin = async (e) => {
    e.preventDefault();
    if (!observadorIniciado) {
        return window.mostrarToast('O sistema está terminando de carregar. Tente novamente em instantes.', 'erro');
    }
    if (loginEmAndamento) return;
    if (operacaoAuthPendente) {
        return window.mostrarToast('A tentativa anterior ainda está sendo encerrada. Atualize a página antes de tentar novamente.', 'erro');
    }

    if(!window.obterUnidade()) {
        return window.mostrarToast("Selecione uma unidade antes de acessar.", "erro");
    }

    const user = document.getElementById('login-user').value.trim().toLowerCase();
    const pass = document.getElementById('login-senha').value;

    if (!/^[a-z0-9_-]{3,40}$/.test(user)) {
        return window.mostrarToast('Informe um nome de usuário válido, sem espaços, pontos ou acentos.', 'erro');
    }

    const versao = ++versaoSessao;
    loginEmAndamento = true;
    bloquearRestauracao = true;
    definirCarregamentoLogin(true);
    try {
        await configurarPersistenciaLogin();
        if (versao !== versaoSessao) return;
        const credencial = await comPrazo(acompanharOperacaoAuth(
            window.firebaseSignIn(window.auth, `${user}@tophaus.com.br`, pass)
        ), 15000, 'credenciais');
        if (versao !== versaoSessao) return;
        loginTimestampMemoria = Date.now();
        salvarPreferencia('loginTimestamp', loginTimestampMemoria);
        await concluirSessao(credencial.user, versao);
        if (versao === versaoSessao) bloquearRestauracao = false;
    } catch (erro) {
        if (versao !== versaoSessao) return;
        console.warn('Falha de autenticação:', erro?.code || 'erro-desconhecido', erro?.etapa || 'login');
        limparSessaoLocal();
        encerrarAutenticacao();
        if(window.mostrarToast) window.mostrarToast(mensagemErroLogin(erro), 'erro');
    } finally {
        loginEmAndamento = false;
        if (versao === versaoSessao) definirCarregamentoLogin(false);
    }
};

window.fazerLogout = async () => {
    ++versaoSessao;
    if(window.usuarioLogado) auditarSessao('Logout', 'Saída do sistema');
    limparSessaoLocal();
    removerPreferencia('modoSimulacao');
    encerrarAutenticacao();
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
                            <button type="button" onclick="redefinirSenhaUsuario('${user}')" class="text-amber-600 hover:bg-amber-50 p-1.5 rounded transition" title="Redefinir senha"><i data-lucide="key-round" class="w-4 h-4"></i></button>
                            <button type="button" onclick="alterarCargo('${user}', '${data.cargo}')" class="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition" title="Editar perfil"><i data-lucide="edit" class="w-4 h-4"></i></button>
                            <button type="button" onclick="removerAcesso('${user}')" class="text-red-600 hover:bg-red-50 p-1.5 rounded transition" title="Remover acesso"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    </div>`;
            });
            if(window.lucide) window.lucide.createIcons();
        }
    }).catch(erro => {
        console.error('Falha ao listar usuários:', erro?.code || erro?.message || erro);
        lista.innerHTML = '<p class="text-center text-red-600 py-4">Não foi possível carregar os usuários desta unidade.</p>';
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

async function chamarGestaoUsuario(dados) {
    const usuarioAtual = window.auth?.currentUser;
    if (!usuarioAtual) throw { codigo: 'sessao_expirada', message: 'Sessão expirada.' };
    const token = await usuarioAtual.getIdToken();
    const resposta = await fetch('/api/admin/usuario', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...dados, unidade: window.obterUnidade() })
    });
    const retorno = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw { status: resposta.status, codigo: retorno.codigo, message: retorno.erro };
    return retorno;
}

window.criarUsuario = async (e) => {
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

    if (!/^[a-z0-9_-]{3,40}$/.test(user)) {
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Salvar cadastro';
        return window.mostrarToast('Use de 3 a 40 letras, números, hífen ou sublinhado. Não use espaços, pontos ou acentos.', 'erro');
    }

    const objPermissoes = {};
    ['dashboard', 'caixa', 'clientes', 'marketing', 'auditoria', 'simulacao', 'reset', 'usuarios', 'totem', 'configuracoes'].forEach(p => {
        const cb = document.getElementById(`perm-${p}`);
        objPermissoes[p] = cb ? cb.checked : false;
    });

    try {
        await chamarGestaoUsuario({ acao: 'criar', username: user, senha: pass, cargo, permissoes: objPermissoes });
        window.mostrarToast('Usuário cadastrado com sucesso.', 'sucesso');
        if(window.logAuditoria) window.logAuditoria('Gestão de Acessos', `Novo usuário '${user}' criado com perfil '${cargo}'.`);
        document.getElementById('novo-user').value = '';
        document.getElementById('novo-senha').value = '';
        window.abrirGerenciadorUsuarios();
    } catch (erro) {
        if (erro.codigo === 'usuario_existente') {
            const vincular = confirm(`O usuário "${user}" já possui uma conta.\n\nDeseja liberar essa conta na unidade atual? A senha existente será mantida.`);
            if (vincular) {
                try {
                    await chamarGestaoUsuario({ acao: 'vincular', username: user, cargo, permissoes: objPermissoes });
                    window.mostrarToast('Conta existente vinculada à unidade. A senha anterior foi mantida.', 'sucesso');
                    document.getElementById('novo-user').value = '';
                    document.getElementById('novo-senha').value = '';
                    window.abrirGerenciadorUsuarios();
                } catch (erroVinculo) {
                    window.mostrarToast(erroVinculo.message || 'Não foi possível vincular o usuário.', 'erro');
                }
            }
        } else {
            console.error('Falha ao cadastrar acesso:', erro.codigo || erro.message || erro);
            window.mostrarToast(erro.message || 'Não foi possível cadastrar o usuário.', 'erro');
        }
    } finally {
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Salvar cadastro';
    }
};

window.redefinirSenhaUsuario = async (username) => {
    const senha = prompt(`Digite a nova senha de "${username}" (mínimo de 6 caracteres):`);
    if (senha === null) return;
    if (senha.length < 6) return window.mostrarToast('A senha precisa ter pelo menos 6 caracteres.', 'erro');
    if (!confirm(`Confirma a redefinição da senha de "${username}"?`)) return;
    try {
        await chamarGestaoUsuario({ acao: 'redefinir_senha', username, senha });
        window.mostrarToast('Senha redefinida com sucesso.', 'sucesso');
        if(window.logAuditoria) window.logAuditoria('Gestão de Acessos', `Senha do usuário '${username}' redefinida.`);
    } catch (erro) {
        window.mostrarToast(erro.message || 'Não foi possível redefinir a senha.', 'erro');
    }
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
    const btnClientesNav = document.getElementById('btn-nav-clientes');
    const btnMarketingNav = document.getElementById('btn-nav-marketing');
    const btnGestaoNav = document.getElementById('nav-gestao');
    const btnTotemNav = document.getElementById('btn-sidebar-totem');
    const btnSimulacao = document.getElementById('btn-ativar-simulacao');
    const btnZerar = document.getElementById('btn-zerar-banco');
    const btnAcessos = document.getElementById('btn-gerenciar-acessos');
    const btnAuditoria = document.getElementById('btn-auditoria');
    const btnLixeira = document.getElementById('btn-lixeira');
    const btnMesclar = document.getElementById('btn-mesclar');
    const btnTrocarUnidade = document.getElementById('btn-trocar-unidade');
    const painelMetricas = document.getElementById('painel-metricas-avancadas');
    
    const botoesTotem = document.querySelectorAll('button[onclick="entrarModoTotemDaTelaLogin()"]');
    const botoesMarketing = document.querySelectorAll('button[onclick="abrirCentralMarketing()"]');

    if (btnAdmin) permissoes.dashboard ? btnAdmin.classList.remove('hidden') : btnAdmin.classList.add('hidden');
    if (btnCaixa) permissoes.caixa ? btnCaixa.classList.remove('hidden') : btnCaixa.classList.add('hidden');
    if (btnRelatorios) cargo === 'admin' ? btnRelatorios.classList.remove('hidden') : btnRelatorios.classList.add('hidden');
    if (btnClientesNav) btnClientesNav.classList.toggle('hidden', !permissoes.dashboard);
    if (btnMarketingNav) btnMarketingNav.classList.toggle('hidden', !permissoes.marketing);
    if (btnGestaoNav) btnGestaoNav.classList.toggle('hidden', !permissoes.dashboard);
    if (btnTotemNav) btnTotemNav.classList.toggle('hidden', !permissoes.totem);
    document.getElementById('btn-mobile-admin')?.classList.toggle('hidden', !permissoes.dashboard);
    document.getElementById('btn-mobile-caixa')?.classList.toggle('hidden', !permissoes.caixa);
    document.getElementById('btn-mobile-clientes')?.classList.toggle('hidden', !permissoes.dashboard);
    document.getElementById('dashboard-ver-relatorios')?.classList.toggle('hidden', cargo !== 'admin');
    document.getElementById('dashboard-atalho-caixa')?.classList.toggle('hidden', !permissoes.caixa);
    document.getElementById('dashboard-atalho-marketing')?.classList.toggle('hidden', !permissoes.marketing);
    if (btnSimulacao) permissoes.simulacao ? btnSimulacao.classList.remove('hidden') : btnSimulacao.classList.add('hidden');
    if (btnZerar) permissoes.reset ? btnZerar.classList.remove('hidden') : btnZerar.classList.add('hidden');
    if (btnAcessos) permissoes.usuarios ? btnAcessos.classList.remove('hidden') : btnAcessos.classList.add('hidden');
    if (btnAuditoria) permissoes.auditoria ? btnAuditoria.classList.remove('hidden') : btnAuditoria.classList.add('hidden');
    if (btnLixeira) permissoes.clientes ? btnLixeira.classList.remove('hidden') : btnLixeira.classList.add('hidden');
    if (btnMesclar) permissoes.clientes ? btnMesclar.classList.remove('hidden') : btnMesclar.classList.add('hidden');
    if (btnTrocarUnidade) permissoes.configuracoes ? btnTrocarUnidade.classList.remove('hidden') : btnTrocarUnidade.classList.add('hidden');
    if (painelMetricas) permissoes.dashboard ? painelMetricas.classList.remove('hidden') : painelMetricas.classList.add('hidden');
    
    botoesMarketing.forEach(btn => btn.classList.toggle('hidden', !permissoes.marketing));
    
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
