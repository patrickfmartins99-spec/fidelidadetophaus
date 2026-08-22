// core.js
// Módulo 1: Utilitários, Máscaras, Validações e Controles de UI Genéricos

// ====== ADICIONAR ANTES DA FUNÇÃO logAuditoria ======
window.obterTerminalId = () => {
    let tid = localStorage.getItem('terminal_id');
    if(!tid) {
        tid = 'TERM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        localStorage.setItem('terminal_id', tid);
    }
    return tid;
};

// ====== SUBSTITUIR A FUNÇÃO logAuditoria EXISTENTE ======
window.logAuditoria = (acao, detalhes, extraData = {}) => {
    const user = window.usuarioLogado ? window.usuarioLogado.email.split('@')[0] : 'sistema';
    const cargo = window.cargoLogado || 'sistema';
    const unidade = window.obterUnidade ? window.obterUnidade() : 'desconhecida';
    const terminal = window.obterTerminalId();

    const payload = {
        tipo: acao,
        dataHora: new Date().toLocaleString('pt-BR'),
        timestamp: Date.now(),
        usuario: user,
        cargo: cargo,
        unidade: unidade,
        terminal_id: terminal,
        detalhes: detalhes,
        ...extraData
    };
    
    const pathAuditoria = window.obterCaminhoUnidade ? window.obterCaminhoUnidade('auditoria') : 'auditoria';
    window.firebasePush(window.firebaseRef(window.db, pathAuditoria), payload);
};

// ==========================================================================
// AMBIENTE DE SIMULAÇÃO (LABORATÓRIO) - BASE
// ==========================================================================
window.ativarSimulacao = () => { 
    localStorage.setItem('modoSimulacao', 'true'); 
    window.location.reload(); 
};

window.desativarSimulacao = () => { 
    localStorage.setItem('modoSimulacao', 'false'); 
    window.location.reload(); 
};

// ==========================================================================
// FUNÇÕES UTILITÁRIAS E DE INTERFACE (UI)
// ==========================================================================
window.escapeHTML = (str) => { 
    if(!str) return ''; 
    return str.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); 
};

window.prenderFocoModal = (modalElement) => {
    const todosFocaveis = modalElement.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const elementosFocaveis = Array.from(todosFocaveis).filter(el => !el.disabled && el.offsetParent !== null);
    if (elementosFocaveis.length === 0) return;
    
    const p = elementosFocaveis[0]; 
    const u = elementosFocaveis[elementosFocaveis.length - 1];
    
    if (modalElement._focusTrapListener) {
        modalElement.removeEventListener('keydown', modalElement._focusTrapListener);
    }
    
    modalElement._focusTrapListener = function(e) {
        if (e.key !== 'Tab' && e.keyCode !== 9) return;
        if (e.shiftKey) { 
            if (document.activeElement === p) { u.focus(); e.preventDefault(); } 
        } else { 
            if (document.activeElement === u) { p.focus(); e.preventDefault(); } 
        }
    };
    modalElement.addEventListener('keydown', modalElement._focusTrapListener);
    setTimeout(() => { if(p) p.focus(); }, 50);
};

window.mostrarToast = (msg, tipo = 'sucesso') => {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const toast = document.createElement('div');
    
    const bg = tipo === 'sucesso' ? 'bg-black' : 'bg-gray-800 border-l-4 border-red-500';
    const icone = tipo === 'sucesso' ? 'check-circle' : 'alert-triangle';
    
    toast.className = `${bg} text-white px-5 py-3 rounded-xl shadow-xl transform transition-all duration-300 translate-x-full flex items-center gap-3 font-bold z-[10000]`;
    toast.innerHTML = `<i data-lucide="${icone}" class="w-5 h-5"></i> <span>${window.escapeHTML(msg)}</span>`;
    
    container.appendChild(toast); 
    if (window.lucide) window.lucide.createIcons();
    
    setTimeout(() => toast.classList.remove('translate-x-full'), 10);
    setTimeout(() => { 
        toast.classList.add('translate-x-full'); 
        setTimeout(() => toast.remove(), 3500); 
    }, 3500);
};

window.fecharModal = (id) => { 
    const modal = document.getElementById(id);
    if(!modal) return;
    
    modal.classList.add('hidden'); 
    
    // Libera a trava de teclado para evitar memory leaks
    if (modal._focusTrapListener) {
        modal.removeEventListener('keydown', modal._focusTrapListener);
    }

    // Modais que não devem devolver o foco automaticamente para o input de CPF do caixa
    // Atualizado com a inclusão de 'modal-mesclagem' (Nova Funcionalidade)
    const modaisParaNaoFocarCPF = [
        'modal-historico', 'modal-editar', 'modal-marketing', 'modal-whatsapp', 
        'modal-simulacao', 'modal-usuarios', 'modal-lixeira', 'modal-auditoria', 
        'modal-totem-saida', 'modal-alerta-generico', 'modal-mesclagem'
    ];
    
    if(!modaisParaNaoFocarCPF.includes(id)){ 
        const b = document.getElementById('busca-cpf'); 
        const telaTotem = document.getElementById('tela-totem');
        
        // Retorna o foco apenas se o operador de caixa estiver no painel (não no Totem)
        if(b && telaTotem && telaTotem.classList.contains('hidden')) {
            b.focus(); 
        } 
    } 
};

// ==========================================================================
// LISTENER GLOBAL (Melhoria de Acessibilidade: ESC para fechar Modais)
// ==========================================================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modaisAtivos = Array.from(document.querySelectorAll('div[id^="modal-"]:not(.hidden)'));
        if(modaisAtivos.length > 0) {
            // Pega o modal mais recente / de maior hierarquia
            const ultimoModal = modaisAtivos[modaisAtivos.length - 1];
            const id = ultimoModal.id;
            
            // Tratamento especial para fluxos onde o ESC atua como "Pular" ou "Cancelar" explícito
            if(id === 'modal-alerta-aniversario') {
                if(window.continuarPosAniversario) window.continuarPosAniversario();
            } else {
                window.fecharModal(id);
            }
        }
    }
});

// ==========================================================================
// MÁSCARAS E FORMATAÇÕES (Inputs e Display)
// ==========================================================================

// Padroniza nomes sem apagar partículas usuais da língua portuguesa.
window.normalizarNome = (valor) => {
    const particulas = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
    const palavras = String(valor || '').trim().toLocaleLowerCase('pt-BR').split(/\s+/).filter(Boolean);
    if (palavras.length < 2 || palavras.some(p => !/^[\p{L}'’-]+$/u.test(p))) return '';

    return palavras.map((palavra, indice) => {
        if (indice > 0 && particulas.has(palavra)) return palavra;
        return palavra.split(/(['’-])/).map(parte => {
            if (/['’-]/.test(parte)) return parte;
            return parte ? parte[0].toLocaleUpperCase('pt-BR') + parte.slice(1) : parte;
        }).join('');
    }).join(' ');
};

// Normaliza apenas para leitura da interface; não altera o cadastro já salvo.
window.nomeExibicao = (valor) => window.normalizarNome(valor) || String(valor || '').trim();

window.mascaraCPF = (i) => { 
    let v = (i.value||"").replace(/\D/g,""); 
    v = v.replace(/(\d{3})(\d)/, "$1.$2"); 
    v = v.replace(/(\d{3})(\d)/, "$1.$2"); 
    i.value = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2"); 
};

window.mascaraTelefone = (i) => { 
    let v = (i.value||"").replace(/\D/g,""); 
    v = v.replace(/^(\d{2})(\d)/g, "($1) $2"); 
    i.value = v.replace(/(\d)(\d{4})$/, "$1-$2"); 
};

window.mascaraData = (i) => { 
    let v = (i.value||"").replace(/\D/g,""); 
    v = v.replace(/(\d{2})(\d)/, "$1/$2"); 
    v = v.replace(/(\d{2})(\d)/, "$1/$2"); 
    i.value = v.substring(0, 10); 
};

window.formatarCPF = (c) => { 
    return c ? c.toString().replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : ''; 
};

window.formatarTel = (t) => { 
    return t ? t.toString().replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3") : ''; 
};

// ==========================================================================
// MOTOR DE VALIDAÇÕES MATEMÁTICAS E DATAS
// ==========================================================================
window.validarCPFReal = (cpf) => {
    cpf = (cpf||'').replace(/\D/g, ''); 
    if(cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    let s=0, r; 
    for(let i=1; i<=9; i++) s += parseInt(cpf.substring(i-1, i)) * (11-i); 
    r = (s*10)%11; 
    if(r===10 || r===11) r=0; 
    if(r!==parseInt(cpf.substring(9, 10))) return false;
    s=0; 
    for(let i=1; i<=10; i++) s += parseInt(cpf.substring(i-1, i)) * (12-i); 
    r = (s*10)%11; 
    if(r===10 || r===11) r=0; 
    return r===parseInt(cpf.substring(10, 11));
};

window.telefoneValido = (tel) => { 
    const n = (tel||'').replace(/\D/g, ''); 
    return n.length === 11 && !/^(\d)\1{10}$/.test(n); 
};

window.validarDataReal = (d) => {
    if(!d) return false; 
    if(d.includes('-')) d=`${d.split('-')[2]}/${d.split('-')[1]}/${d.split('-')[0]}`;
    if (!/^(\d{2})\/(\d{2})\/(\d{4})$/.test(d)) return false;
    const [_, di, m, a] = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const dn = parseInt(di,10), mn = parseInt(m,10), an = parseInt(a,10);
    if (an < 1900 || an > new Date().getFullYear()+1 || mn < 1 || mn > 12) return false;
    return dn >= 1 && dn <= new Date(an, mn, 0).getDate();
};

window.obterInfoNascimento = (n) => {
    if(!n) return null;
    if(n.includes('-')) return { dia: parseInt(n.split('-')[2], 10), mes: parseInt(n.split('-')[1], 10) - 1 };
    if(n.includes('/')) return { dia: parseInt(n.split('/')[0], 10), mes: parseInt(n.split('/')[1], 10) - 1 }; 
    return null;
};

window.diasParaAniversario = (n) => {
    const inf = window.obterInfoNascimento(n); 
    if(!inf) return -1;
    const hj = new Date(); hj.setHours(0,0,0,0);
    const nv = new Date(hj.getFullYear(), inf.mes, inf.dia); 
    if (nv < hj) nv.setFullYear(hj.getFullYear() + 1);
    return Math.ceil((nv - hj) / 86400000);
};

window.isNiverMesCheck = (n) => { 
    const i = window.obterInfoNascimento(n); 
    return i && i.mes === new Date().getMonth(); 
};

window.isNiverInPeriod = (n, di, df) => {
    const i = window.obterInfoNascimento(n); 
    if(!i) return false;
    const d1 = new Date(di+'T12:00:00'), d2 = new Date(df+'T12:00:00');
    const nv1 = new Date(d1.getFullYear(), i.mes, i.dia, 12,0,0), nv2 = new Date(d2.getFullYear(), i.mes, i.dia, 12,0,0);
    return (nv1 >= d1 && nv1 <= d2) || (nv2 >= d1 && nv2 <= d2);
};

window.jaRegistrouHoje = (c) => {
    if (c.ultimaVisitaTimestamp) {
        const hj = new Date(), u = new Date(c.ultimaVisitaTimestamp);
        return hj.getDate()===u.getDate() && hj.getMonth()===u.getMonth() && hj.getFullYear()===u.getFullYear();
    }
    return c.historico && c.historico.length > 0 && c.historico[c.historico.length-1].includes(new Date().toLocaleDateString('pt-BR'));
};

window.diasDesdeUltimaVisita = (c) => {
    if(c.ultimaVisitaTimestamp) {
        return Math.floor((Date.now() - c.ultimaVisitaTimestamp) / 86400000);
    }
    if(!c.historico || c.historico.length===0) return 999;
    const d = c.historico[c.historico.length-1].split(' às ')[0].split('/');
    return Math.floor((Date.now() - new Date(d[2], d[1]-1, d[0]).getTime()) / 86400000);
};

window.limitarHistorico = (h) => { 
    // Ampliado de 50 para 100 devido à funcionalidade de mesclagem (pode gerar arrays maiores subitamente)
    return h && h.length > 100 ? h.slice(-100) : (h||[]); 
};


// Mantém os arquivos essenciais disponíveis no tablet e atualizados entre versões.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((registration) => {
            registration.update().catch(() => {});
        }).catch(() => {
            // O sistema continua funcionando on-line mesmo se o cache não puder ser ativado.
        });
    }, { once: true });
}
