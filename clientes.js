// Módulo 4: Frente de Caixa, Gestão de Clientes e Fidelidade
import { montarExtratoCliente, filtrarLogsCliente } from './cliente-extrato-core.js';

// ==========================================================================
// FRENTE DE CAIXA: FLUXO DE BUSCA E ROTEAMENTO
// ==========================================================================
window.buscarEContabilizar = () => {
    const inputCpf = document.getElementById('busca-cpf');
    if(!inputCpf) return;
    const cpf = inputCpf.value.replace(/\D/g, ''); 
    
    if(!window.validarCPFReal(cpf)) return window.mostrarToast('CPF inválido. Verifique e tente novamente.', 'erro');
    if(window.operacoesAtivas && window.operacoesAtivas[cpf]) return;
    
    const c = window.clientesMap[cpf]; 
    
    if(!c || c.arquivado) return window.mostrarToast(`Nenhum cliente encontrado para "${window.formatarCPF(cpf)}".`, 'erro');
    
    if (window.diasParaAniversario(c.nascimento) === 0 && c.aniversarioResgatadoAno !== new Date().getFullYear()) { 
        window.acaoPendente = c; 
        window.tipoAcaoPendente = 'busca'; 
        document.getElementById('texto-alerta-aniversario').innerHTML = `Hoje é o aniversário de <br><strong class="text-xl text-black">${window.escapeHTML(window.nomeExibicao(c.nome))}</strong>!`; 
        const m = document.getElementById('modal-alerta-aniversario'); 
        m.classList.remove('hidden'); 
        if(window.prenderFocoModal) window.prenderFocoModal(m); 
        return; 
    }
    
    window.processarFluxoNormal(c);
};

window.processarFluxoNormal = (c) => {
    const ja = window.jaRegistrouHoje(c);
    const p = (c.almocos||0) >= 10;

    if(p) {
        // O benefício precisa vir antes da trava de duplicidade. É comum o cliente
        // completar 10 almoços no totem e solicitar o resgate no caixa no mesmo dia.
        const m = document.getElementById('modal-trava'); 
        m.classList.remove('hidden'); 
        if(window.prenderFocoModal) window.prenderFocoModal(m);
        
        document.getElementById('btn-trava-resgatar').onclick = () => { 
            if(window.fecharModal) window.fecharModal('modal-trava'); 
            window.efetuarResgateEImprimir(c); 
        };
        
        const bA = document.getElementById('btn-trava-acumular');
        const spanAcumular = document.getElementById('btn-trava-acumular-text');
        
        const textoAcumular = ja
            ? "Guardar benefício e registrar almoço extra"
            : "Guardar para outra visita (+1 pago)";
        if(spanAcumular) spanAcumular.innerText = textoAcumular;
        else bA.innerText = textoAcumular; 
        bA.disabled = false; 
        bA.classList.remove('opacity-50'); 
        bA.onclick = () => { 
            if(window.fecharModal) window.fecharModal('modal-trava'); 
            if (ja) window.prepararAlmocoAtrasado(c.cpf, true);
            else window.processarConfirmacao(c); 
        }; 
        return;
    }

    // Sem benefício pendente, uma segunda refeição no mesmo dia continua
    // protegida pela confirmação e pela senha do gerente.
    if (ja) {
        window.confirmacaoDupla(
            "Almoço Duplicado",
            `O cliente ${window.escapeHTML(window.nomeExibicao(c.nome))} já registrou um almoço hoje. Deseja registrar uma refeição EXTRA neste mesmo dia? (Esta ação exigirá a senha do gerente).`,
            () => window.prepararAlmocoAtrasado(c.cpf, true)
        );
        return;
    }

    {
        const btnConfirmar = document.getElementById('btn-confirmar-almoco');
        if(btnConfirmar) btnConfirmar.classList.remove('hidden');

        document.getElementById('texto-confirmacao').innerHTML = `Deseja registrar +1 almoço para <strong>${window.escapeHTML(window.nomeExibicao(c.nome))}</strong>?`;
        const m = document.getElementById('modal-confirmacao'); 
        m.classList.remove('hidden'); 
        if(window.prenderFocoModal) window.prenderFocoModal(m);
        if(window.lucide) window.lucide.createIcons();
        
        document.getElementById('btn-confirmar-almoco').onclick = () => { 
            if(window.fecharModal) window.fecharModal('modal-confirmacao'); 
            window.processarConfirmacao(c); 
        };
    }
};

// ==========================================================================
// FRENTE DE CAIXA: PROCESSAMENTO E BANCO DE DADOS
// ==========================================================================
window.cadastrarCliente = (e) => {
    e.preventDefault(); 
    if(window.isProcessing) return;
    
    const cpf = document.getElementById('cad-cpf').value.replace(/\D/g, ''); 
    if(!window.validarCPFReal(cpf)) return window.mostrarToast('CPF inválido. Verifique e tente novamente.', 'erro');
    if(window.clientesMap[cpf] || (window.operacoesAtivas && window.operacoesAtivas[cpf])) return window.mostrarToast('Cliente já cadastrado no sistema.', 'erro');

    const nome = window.normalizarNome(document.getElementById('cad-nome').value);
    if(!nome) return window.mostrarToast('Informe o nome completo usando apenas letras.', 'erro');
    document.getElementById('cad-nome').value = nome;
    
    const tel = document.getElementById('cad-telefone').value.replace(/\D/g, ''); 
    if(!window.telefoneValido(tel)) return window.mostrarToast('Telefone inválido. Verifique e tente novamente.', 'erro');
    const nasc = document.getElementById('cad-nascimento').value; 
    if(!window.validarDataReal(nasc)) return window.mostrarToast('Data de nascimento inválida.', 'erro');

    window.isProcessing = true; 
    if(window.operacoesAtivas) window.operacoesAtivas[cpf] = true; 
    
    const btn = document.getElementById('btn-caixa-salvar');
    const span = document.getElementById('btn-caixa-salvar-text');
    
    if(btn) btn.disabled = true;
    if(span) span.innerText = 'Salvando...';
    
    setTimeout(() => { 
        window.isProcessing = false; 
        if(window.operacoesAtivas) window.operacoesAtivas[cpf] = false; 
        if(btn) btn.disabled = false; 
        if(span) span.innerText = 'Salvar cadastro';
    }, 8000);

    const nf = nasc.includes('/') ? `${nasc.split('/')[2]}-${nasc.split('/')[1]}-${nasc.split('/')[0]}` : nasc;
    const nc = { 
        cpf, nome, 
        nascimento: nf, telefone: tel, 
        almocos: 0, premiosResgatados: 0, historico: [], 
        origemCadastro: 'Caixa', 
        dataCadastro: new Date().toLocaleDateString('pt-BR'), 
        ultimaVisitaTimestamp: null,
        arquivado: false
    };
    
    window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + cpf), nc).then(() => {
        document.getElementById('form-cadastro').reset(); 
        window.mostrarToast('Cliente cadastrado com sucesso!'); 
        
        if(window.logAuditoria) window.logAuditoria('Cadastro (Caixa)', `Cliente ${nc.nome} cadastrado via painel.`, { clienteCpf: nc.cpf });
        
        window.isProcessing = false; 
        if(window.operacoesAtivas) window.operacoesAtivas[cpf] = false; 
        
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Salvar cadastro';
        
        if(window.diasParaAniversario(nc.nascimento) === 0) { 
            window.acaoPendente = nc; 
            window.tipoAcaoPendente = 'cadastro'; 
            document.getElementById('texto-alerta-aniversario').innerHTML = `Hoje é o aniversário de <br><strong class="text-xl text-black">${window.escapeHTML(nc.nome)}</strong>!`; 
            const m = document.getElementById('modal-alerta-aniversario'); 
            m.classList.remove('hidden'); 
            if(window.prenderFocoModal) window.prenderFocoModal(m); 
        } else {
            const b = document.getElementById('busca-cpf');
            if(b) b.focus();
        }
    }).catch(() => { 
        window.isProcessing = false; 
        if(window.operacoesAtivas) window.operacoesAtivas[cpf] = false; 
        window.mostrarToast('Não foi possível salvar. Tente novamente.', 'erro');
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Salvar cadastro';
    });
};

window.processarConfirmacao = (c) => {
    if(window.isProcessing) return; 
    window.isProcessing = true; 
    if(window.operacoesAtivas) window.operacoesAtivas[c.cpf] = true; 
    
    const btn = document.getElementById('btn-confirmar-almoco');
    const span = document.getElementById('btn-confirmar-almoco-text');
    if(btn) btn.disabled = true; 
    if(span) span.innerText = 'Salvando...';
    
    setTimeout(()=>{ 
        window.isProcessing = false; 
        if(window.operacoesAtivas) window.operacoesAtivas[c.cpf] = false; 
        if(btn) btn.disabled = false; 
        if(span) span.innerText = 'Confirmar';
    }, 8000);
    
    c.almocos = (c.almocos||0) + 1; 
    if(!c.historico) c.historico = []; 
    c.historico.push(new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})); 
    
    if (c.almocos > 0 && c.almocos % 10 === 0) {
        if(!c.historicoConquistas) c.historicoConquistas = [];
        c.historicoConquistas.push(new Date().toLocaleString('pt-BR'));
    }

    c.ultimaVisitaTimestamp = Date.now(); 
    c.historico = window.limitarHistorico(c.historico);
    
    window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + c.cpf), c).then(() => { 
        window.isProcessing = false; 
        if(window.operacoesAtivas) window.operacoesAtivas[c.cpf] = false; 
        
        if(btn) btn.disabled = false; 
        if(span) span.innerText = 'Confirmar';
        
        const inp = document.getElementById('busca-cpf');
        if(inp) inp.value = ''; 
        
        if(window.logAuditoria) window.logAuditoria('Almoço', `+1 almoço registrado para ${c.nome}. Saldo: ${c.almocos}.`, { clienteCpf: c.cpf });
        
        if (c.almocos % 10 === 0) {
            const m = document.getElementById('modal-celebracao-10');
            if(m) {
                m.classList.remove('hidden');
                if(window.prenderFocoModal) window.prenderFocoModal(m);
            }
        } else {
            window.mostrarToast('Almoço contabilizado com sucesso!'); 
        }
        
        if(window.checarEAvisarAlmoco) window.checarEAvisarAlmoco(c); 
    }).catch(() => {
        window.mostrarToast('Não foi possível concluir a ação. Tente novamente.', 'erro');
        window.isProcessing = false; 
        if(window.operacoesAtivas) window.operacoesAtivas[c.cpf] = false; 
        if(btn) btn.disabled = false; 
        if(span) span.innerText = 'Confirmar';
    });
};

window.efetuarResgateEImprimir = (c) => {
    if(window.isProcessing) return; 
    window.isProcessing = true; 
    if(window.operacoesAtivas) window.operacoesAtivas[c.cpf] = true; 
    
    const btn = document.getElementById('btn-trava-resgatar');
    const span = document.getElementById('btn-trava-resgatar-text');
    if(btn) btn.disabled = true; 
    if(span) span.innerText = 'Gerando Protocolo...';
    
    const unidadeRef = window.obterUnidade() || 'navegantes';
    const prefixo = unidadeRef === 'picarras' ? 'PIC' : 'NAV';
    const dataHjObj = new Date();
    const offset = dataHjObj.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(dataHjObj - offset)).toISOString().split('T')[0].replace(/-/g, '');
    
    const counterPath = window.obterCaminhoUnidade('contadores/protocolo');
    const counterRef = window.firebaseRef(window.db, counterPath);

    window.firebaseRunTransaction(counterRef, (valorAtual) => {
        return (valorAtual || 0) + 1;
    }).then((resultado) => {
        if (!resultado.committed) throw new Error("Falha ao gerar protocolo.");
        
        const numSequencial = String(resultado.snapshot.val()).padStart(6, '0');
        const protocoloGerado = `${prefixo}-${localISOTime}-${numSequencial}`;

        const dts = (c.historico||[]).slice(0,10); 
        c.historico = (c.historico||[]).slice(10); 
        c.almocos -= 10; 
        c.premiosResgatados = (c.premiosResgatados||0) + 1; 
        c.notificadoPremio = false;
        
        const hr = new Date().toLocaleString('pt-BR'); 
        if(!c.historicoResgates) c.historicoResgates = []; 
        c.historicoResgates.push({ dataResgate: hr, datas: dts, protocolo: protocoloGerado });
        
        return window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + c.cpf), c).then(() => {
            window.isProcessing = false; 
            if(window.operacoesAtivas) window.operacoesAtivas[c.cpf] = false; 
            const inp = document.getElementById('busca-cpf');
            if(inp) inp.value = ''; 
            if(btn) btn.disabled = false; 
            if(span) span.innerText = 'Resgatar e imprimir cupom';
            
            window.mostrarToast(`Resgate realizado! Protocolo: ${protocoloGerado}`); 
            
            if(window.logAuditoria) {
                window.logAuditoria('Resgate Prêmio', `Desconto de R$ 50 resgatado por ${c.nome}. Protocolo: ${protocoloGerado}`, {
                    clienteCpf: c.cpf,
                    clienteNome: c.nome,
                    protocolo: protocoloGerado
                });
            }
            window.dispararImpressao(window.nomeExibicao(c.nome), c.cpf, dts, hr, protocoloGerado); 
        });
    }).catch((err) => {
        window.isProcessing = false; 
        if(window.operacoesAtivas) window.operacoesAtivas[c.cpf] = false; 
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Resgatar e imprimir cupom';
        window.mostrarToast('Erro ao gerar protocolo. Tente novamente.', 'erro');
    });
};

// ==========================================================================
// AÇÕES SECUNDÁRIAS (ANIVERSÁRIO E IMPRESSÃO)
// ==========================================================================
window.confirmarCortesiaAniversario = () => {
    if (!window.acaoPendente || window.isProcessing) return; 
    window.efetuarResgateAniversarioEImprimir(window.acaoPendente);
};

window.continuarPosAniversario = () => { 
    document.getElementById('modal-alerta-aniversario').classList.add('hidden'); 
    if(window.tipoAcaoPendente === 'busca') {
        window.processarFluxoNormal(window.acaoPendente); 
    } else {
        const b = document.getElementById('busca-cpf');
        if(b) b.focus(); 
    }
    window.acaoPendente = null; 
};

// Impressão: 10 Almoços
window.dispararImpressao = (nome, cpf, dts, hr, protocolo = 'S/N') => {
    let l = ''; 
    (dts||[]).forEach(d => l += `<li>[+] ${window.escapeHTML(d)}</li>`);
    
    const secaoImp = document.getElementById('secao-impressao');
    if(!secaoImp) return;
    secaoImp.classList.remove('print-extrato');

    const isPic = window.obterUnidade() === 'picarras';
    const razaoSocial = isPic ? 'PIZZARIA TOP HAUS LTDA' : 'ESPAÇO TOP HAUS LTDA';
    const cnpj = isPic ? '05.991.972/0001-09' : '26.845.124/0001-61';
    const ie = isPic ? '258350393' : 'ISENTO';
    const endereco = isPic ? 'Avenida Nereu Ramos, 299<br>Balneário Piçarras - SC 88380-000' : 'Avenida Pref. Jose Juvenal Mafra, 7155<br>Navegantes - SC 88372-506';
    
    secaoImp.innerHTML = `
        <div style="text-align:center;margin-bottom:5px;line-height:1.2;">
            <strong style="font-size:15px;color:#000;">${razaoSocial}</strong><br>
            CNPJ: ${cnpj} | IE: ${ie}<br>
            ${endereco}<br>
        </div>
        <div class="linha-tracejada"></div>
        <div style="text-align:center;margin-bottom:5px;">
            <strong style="font-size:14px;color:#000;">COMPROVANTE DE RESGATE</strong><br>
            <span style="font-size:11px;">${hr}</span><br>
            <strong style="font-size:11px;color:#000;">PROT: ${protocolo}</strong>
        </div>
        <div class="linha-tracejada"></div>
        <div style="margin-bottom:5px;font-size:12px;color:#000;">
            <p style="margin:2px 0;"><strong>Cliente:</strong> ${window.escapeHTML((nome||'').toUpperCase())}</p>
            <p style="margin:2px 0;"><strong>CPF:</strong> ${window.formatarCPF(cpf)}</p>
        </div>
        <div class="linha-tracejada"></div>
        <div style="margin-bottom:5px;">
            <p style="font-weight:bold;margin:2px 0;color:#000;">ALMOÇOS CONTABILIZADOS:</p>
            <ol style="padding-left:15px;margin:0;font-size:11px;color:#000;">${l}</ol>
        </div>
        <div class="linha-tracejada"></div>
        <div style="text-align:center;margin-top:5px;">
            <p style="font-weight:900;margin:0;font-size:16px;color:#000;">DESCONTO LIBERADO</p>
            <p style="font-size:11px;margin:2px 0;">Válido: R$ 50,00 de desconto na refeição.</p>
        </div>`; 
    
    window.print();
};

// Impressão: Aniversário
window.dispararImpressaoAniversario = (c, dataResgate, protocolo = 'S/N') => {
    const secaoImp = document.getElementById('secao-impressao');
    if (!secaoImp) return;
    secaoImp.classList.remove('print-extrato');

    const isPic = window.obterUnidade() === 'picarras';
    const razaoSocial = isPic ? 'PIZZARIA TOP HAUS LTDA' : 'ESPAÇO TOP HAUS LTDA';
    const cnpj = isPic ? '05.991.972/0001-09' : '26.845.124/0001-61';
    const ie = isPic ? '258350393' : 'ISENTO';
    const endereco = isPic ? 'Avenida Nereu Ramos, 299<br>Balneário Piçarras - SC 88380-000' : 'Avenida Pref. Jose Juvenal Mafra, 7155<br>Navegantes - SC 88372-506';

    let nascFormatado = c.nascimento || '';
    if (nascFormatado.includes('-')) {
        const partes = nascFormatado.split('-');
        nascFormatado = `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    const dataCadastroFormatada = c.dataCadastro || 'Não informada';

    secaoImp.innerHTML = `
        <div style="text-align:center;margin-bottom:5px;line-height:1.2;">
            <strong style="font-size:15px;color:#000;">${razaoSocial}</strong><br>
            CNPJ: ${cnpj} | IE: ${ie}<br>
            ${endereco}<br>
        </div>
        <div class="linha-tracejada"></div>
        <div style="text-align:center;margin-bottom:5px;">
            <strong style="font-size:14px;color:#000;">COMPROVANTE DE RESGATE — ANIVERSÁRIO</strong><br>
            <span style="font-size:11px;">${dataResgate}</span><br>
            <strong style="font-size:11px;color:#000;">PROT: ${protocolo}</strong>
        </div>
        <div class="linha-tracejada"></div>
        <div style="margin-bottom:5px;font-size:12px;color:#000;">
            <p style="margin:2px 0;"><strong>CLIENTE</strong></p>
            <p style="margin:2px 0;"><strong>Nome:</strong> ${window.escapeHTML(window.nomeExibicao(c.nome).toUpperCase())}</p>
            <p style="margin:2px 0;"><strong>CPF:</strong> ${window.formatarCPF(c.cpf)}</p>
            <p style="margin:2px 0;"><strong>Data de nascimento:</strong> ${nascFormatado}</p>
            <p style="margin:2px 0;"><strong>Data de cadastro:</strong> ${dataCadastroFormatada}</p>
        </div>
        <div class="linha-tracejada"></div>
        <div style="margin-bottom:5px;">
            <p style="font-weight:bold;margin:2px 0;color:#000;">BENEFÍCIO RESGATADO</p>
            <p style="margin:2px 0;font-size:11px;color:#000;"><strong>Motivo:</strong> Aniversário</p>
            <p style="margin:2px 0;font-size:11px;color:#000;"><strong>Desconto liberado:</strong> R$ 50,00</p>
        </div>
        <div class="linha-tracejada"></div>
        <div style="text-align:center;margin-top:5px;">
            <p style="font-weight:900;margin:0;font-size:12px;color:#000;">CONTROLE INTERNO</p>
            <p style="font-size:10px;margin:2px 0;">Válido somente na data do aniversário.</p>
        </div>`;

    window.print();
};

window.efetuarResgateAniversarioEImprimir = (c) => {
    if (window.isProcessing) return;
    window.isProcessing = true;
    if (window.operacoesAtivas) window.operacoesAtivas[c.cpf] = true;

    const btn = document.getElementById('btn-alerta-aniversario-confirmar');
    const span = document.getElementById('btn-alerta-aniversario-confirmar-text');
    if (btn) btn.disabled = true;
    if (span) span.innerText = 'Processando Protocolo...';

    const unidadeRef = window.obterUnidade() || 'navegantes';
    const prefixo = unidadeRef === 'picarras' ? 'PIC' : 'NAV';
    const dataHjObj = new Date();
    const offset = dataHjObj.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(dataHjObj - offset)).toISOString().split('T')[0].replace(/-/g, '');

    const counterPath = window.obterCaminhoUnidade('contadores/protocolo');
    const counterRef = window.firebaseRef(window.db, counterPath);

    window.firebaseRunTransaction(counterRef, (valorAtual) => {
        return (valorAtual || 0) + 1;
    }).then((resultado) => {
        if (!resultado.committed) throw new Error("Falha ao gerar protocolo.");
        
        const numSequencial = String(resultado.snapshot.val()).padStart(6, '0');
        const protocoloGerado = `${prefixo}-${localISOTime}-${numSequencial}`;

        const hr = new Date().toLocaleString('pt-BR');
        const anoAtual = new Date().getFullYear();
        
        c.aniversarioResgatadoAno = anoAtual;
        
        if (!c.historicoAniversarios) c.historicoAniversarios = [];
        c.historicoAniversarios.push({
            dataResgate: hr,
            ano: anoAtual,
            protocolo: protocoloGerado
        });
        
        return window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + c.cpf), c).then(() => {
            window.isProcessing = false;
            if (window.operacoesAtivas) window.operacoesAtivas[c.cpf] = false;
            
            if (btn) btn.disabled = false;
            if (span) span.innerText = 'Confirmar resgate';
            
            window.mostrarToast(`Resgate de aniversário realizado! Protocolo: ${protocoloGerado}`);
            
            if (window.logAuditoria) {
                window.logAuditoria('Resgate Aniversário', `Desconto de aniversário validado para ${c.nome}. Protocolo: ${protocoloGerado}`, {
                    clienteCpf: c.cpf,
                    clienteNome: c.nome,
                    protocolo: protocoloGerado
                });
            }
            
            window.dispararImpressaoAniversario(c, hr, protocoloGerado);
            window.continuarPosAniversario();
        });
    }).catch((err) => {
        window.isProcessing = false;
        if (window.operacoesAtivas) window.operacoesAtivas[c.cpf] = false;
        if (btn) btn.disabled = false;
        if (span) span.innerText = 'Confirmar resgate';
        window.mostrarToast('Erro ao processar resgate de aniversário. Tente novamente.', 'erro');
    });
};

// ==========================================================================
// MODAL ESTÁTICO DE EDIÇÃO, HISTÓRICO E ATALHOS (CHAMADOS PELA TABELA)
// ==========================================================================
window.abrirEditar = (cpf) => {
    const c = window.clientesMap[cpf]; 
    if(!c) return;
    
    document.getElementById('edit-cpf-raw').value = c.cpf||''; 
    document.getElementById('edit-cpf-display').value = window.formatarCPF(c.cpf);
    document.getElementById('edit-nome').value = window.nomeExibicao(c.nome); 
    
    document.getElementById('edit-nascimento').value = c.nascimento && c.nascimento.includes('-') ? 
        `${c.nascimento.split('-')[2]}/${c.nascimento.split('-')[1]}/${c.nascimento.split('-')[0]}` : c.nascimento||'';
    
    document.getElementById('edit-telefone').value = window.formatarTel(c.telefone);
    
    const m = document.getElementById('modal-editar'); 
    m.classList.remove('hidden'); 
    if(window.prenderFocoModal) window.prenderFocoModal(m);
};

window.salvarEdicao = (e) => {
    e.preventDefault(); 
    const c = window.clientesMap[document.getElementById('edit-cpf-raw').value]; 
    if(!c) return;

    const nome = window.normalizarNome(document.getElementById('edit-nome').value);
    if(!nome) return window.mostrarToast('Informe o nome completo usando apenas letras.', 'erro');
    document.getElementById('edit-nome').value = nome;
    
    const tel = document.getElementById('edit-telefone').value.replace(/\D/g, ''); 
    if(!window.telefoneValido(tel)) return window.mostrarToast('Telefone inválido. Verifique e tente novamente.', 'erro');
    const nasc = document.getElementById('edit-nascimento').value; 
    if(!window.validarDataReal(nasc)) return window.mostrarToast('Data de nascimento inválida.', 'erro');
    
    const btn = document.getElementById('btn-editar-salvar');
    const span = document.getElementById('btn-editar-salvar-text');
    if(btn) btn.disabled = true;
    if(span) span.innerText = 'Atualizando...';
    
    const oldNome = c.nome;
    c.nome = nome; 
    c.telefone = tel; 
    c.nascimento = nasc.includes('/') ? `${nasc.split('/')[2]}-${nasc.split('/')[1]}-${nasc.split('/')[0]}` : nasc;
    
    window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + c.cpf), c).then(() => { 
        window.mostrarToast("Cliente atualizado com sucesso."); 
        if(window.logAuditoria) window.logAuditoria('Edição', `Cadastro de ${oldNome} atualizado para ${c.nome}.`, { clienteCpf: c.cpf });
        
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Salvar alterações';
        if(window.fecharModal) window.fecharModal('modal-editar'); 
    }).catch(() => {
        window.mostrarToast('Não foi possível salvar. Tente novamente.', 'erro');
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Salvar alterações';
    });
};

// PREPARA O MODAL DE ALMOÇO ATRASADO (com suporte para pré-preencher a data de hoje se for extra)
window.prepararAlmocoAtrasado = (cpf, isExtraHoje = false) => {
    if(window.fecharModal) window.fecharModal('modal-historico');

    const form = document.getElementById('form-almoco-atrasado');
    if(form) form.reset();
    
    const inputCpf = document.getElementById('atrasado-cpf');
    if(inputCpf && cpf) {
        inputCpf.value = window.formatarCPF(cpf);
    }
    
    const inputData = document.getElementById('atrasado-data');
    if (inputData && isExtraHoje) {
        const dataAtual = new Date();
        const offset = dataAtual.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(dataAtual - offset)).toISOString().split('T')[0];
        inputData.value = localISOTime;
    }
    
    const isGerente = (window.cargoLogado === 'gerente' || window.cargoLogado === 'admin');
    const divAuth = document.getElementById('atrasado-auth-caixa');
    
    if (divAuth) {
        if (isGerente) {
            divAuth.classList.add('hidden');
            document.getElementById('atrasado-senha').required = false;
        } else {
            divAuth.classList.remove('hidden');
            document.getElementById('atrasado-senha').required = true;
        }
    }

    const m = document.getElementById('modal-almoco-atrasado');
    if (m) {
        m.classList.remove('hidden');
        if (window.prenderFocoModal) window.prenderFocoModal(m);
    } else {
        window.mostrarToast('Painel de almoço atrasado não encontrado no sistema.', 'erro');
    }
};

let fichaClienteAtual = null;
let fichaUnidadeAtual = null;
let fichaLogs = [];
let fichaAuditoriaCompleta = false;
let fichaConsultaSequencia = 0;
const podeConsultarFichaCliente = () => (window.cargoLogado === 'admin' || window.cargoLogado === 'gerente') && !!window.usuarioLogado;
const htmlFicha = valor => window.escapeHTML(String(valor ?? ''));
const listaFicha = valor => Array.isArray(valor) ? valor : (valor && typeof valor === 'object' ? Object.values(valor) : []);

const renderizarFichaCliente = () => {
    const c = fichaClienteAtual;
    const alvo = document.getElementById('lista-historico');
    if (!c || !alvo) return;
    const extrato = montarExtratoCliente(c, fichaLogs);
    const cpf = String(c.cpf || '').replace(/\D/g, '');
    const unidade = fichaUnidadeAtual === 'picarras' ? 'Piçarras' : 'Navegantes';
    const avisos = extrato.alertas.length
        ? `<div class="ficha-alerta"><strong>Conferência pendente</strong><ul>${extrato.alertas.map(aviso => `<li>${htmlFicha(aviso)}</li>`).join('')}</ul></div>`
        : '<div class="ficha-ok">Os contadores conferem com as datas digitais disponíveis.</div>';
    const eventos = extrato.eventos.map(evento => `
        <li class="ficha-evento">
            <span class="ficha-evento-data">${htmlFicha(evento.data)}</span>
            <div><strong>${htmlFicha(evento.descricao)}</strong>${evento.protocolo ? `<small>Protocolo: ${htmlFicha(evento.protocolo)}</small>` : ''}${evento.usuario ? `<small>Usuário: ${htmlFicha(evento.usuario)}</small>` : ''}${evento.responsavel ? `<small>Responsável: ${htmlFicha(evento.responsavel)}</small>` : ''}</div>
        </li>`).join('');
    const resgates = listaFicha(c.historicoResgates).map((resgate, indice) => `
        <div class="ficha-resgate"><span>#${indice + 1} · ${htmlFicha(resgate.dataResgate || 'Sem data')} · ${listaFicha(resgate.datas).length} almoço(s)${resgate.protocolo ? ` · ${htmlFicha(resgate.protocolo)}` : ''}</span>
        <button type="button" onclick="reimprimirCupomPorCpf('${cpf}', ${indice})">Reimprimir cupom</button></div>`).join('');
    const aniversarios = listaFicha(c.historicoAniversarios).map((resgate, indice) => `
        <div class="ficha-resgate"><span>Aniversário · ${htmlFicha(resgate.dataResgate || 'Sem data')}</span>
        <button type="button" onclick="reimprimirAniversarioPorCpf('${cpf}', ${indice})">Reimprimir cupom</button></div>`).join('');

    document.getElementById('ficha-cliente-titulo').textContent = window.nomeExibicao(c.nome || 'Cliente sem nome');
    document.getElementById('ficha-cliente-subtitulo').textContent = `${unidade} · CPF ${window.formatarCPF(cpf)} · Cadastro ${extrato.cadastro}`;
    document.getElementById('ficha-auditoria-botao')?.classList.toggle('hidden', !podeConsultarFichaCliente() || !window.permissoesLogado?.auditoria);
    alvo.innerHTML = `
        <div class="ficha-metricas">
            <div><span>Saldo atual</span><strong>${extrato.saldo}</strong></div>
            <div><span>Resgates</span><strong>${extrato.resgatesDeclarados}</strong></div>
            <div><span>Almoços contabilizados</span><strong>${extrato.totalContabilizado}</strong></div>
            <div><span>Datas documentadas</span><strong>${extrato.totalDocumentado}</strong></div>
        </div>
        <details class="ficha-detalhes"><summary>Dados cadastrais</summary><div class="ficha-dados"><p><strong>Nome:</strong> ${htmlFicha(window.nomeExibicao(c.nome))}</p><p><strong>CPF:</strong> ${htmlFicha(window.formatarCPF(cpf))}</p><p><strong>WhatsApp:</strong> ${htmlFicha(window.formatarTel(c.telefone || '')) || 'Não informado'}</p><p><strong>Nascimento:</strong> ${htmlFicha(c.nascimento || 'Não informado')}</p><p><strong>Cadastro:</strong> ${htmlFicha(extrato.cadastro)}</p><p><strong>Status:</strong> ${extrato.arquivado ? 'Arquivado' : 'Ativo'}</p></div></details>
        <p class="ficha-contexto">${htmlFicha(extrato.totalContabilizado)} = ${htmlFicha(extrato.saldo)} no saldo + ${htmlFicha(extrato.resgatesDeclarados)} resgate(s) × 10. Última visita documentada: ${htmlFicha(extrato.ultimaVisita || 'não informada')}. ${extrato.visitasAposUltimoResgate === null ? 'Não há resgate anterior.' : `${extrato.visitasAposUltimoResgate} data(s) de almoço no saldo posteriores ao último resgate.`} Origem do cadastro: ${htmlFicha(extrato.origemCadastro)}.</p>
        ${avisos}
        <p class="ficha-limite">${htmlFicha(extrato.observacao)}</p>
        ${fichaAuditoriaCompleta ? `<p class="ficha-auditoria-status">Auditoria solicitada: cadastro relido no banco agora; ${window.isSimulationMode ? 'modo de simulação — logs reais não incluídos' : `${fichaLogs.length} log(s) vinculados a este CPF`}. Histórico digital disponível abaixo.</p>` : '<p class="ficha-auditoria-status">Extrato baseado no cadastro carregado. Use “Auditar agora” para reler o banco e incluir logs vinculados ao CPF.</p>'}
        <details class="ficha-detalhes" open><summary>Linha do tempo · ${extrato.eventos.length} eventos</summary><ol>${eventos || '<li>Nenhum evento documentado.</li>'}</ol></details>
        <details class="ficha-detalhes"><summary>Resgates e reimpressão</summary>${resgates || '<p>Nenhum resgate de fidelidade documentado.</p>'}${aniversarios}</details>
        ${window.permissoesLogado?.clientes ? `<button type="button" class="ficha-lancar" onclick="prepararAlmocoAtrasado('${cpf}')">Lançar almoço anterior (gerência)</button>` : ''}`;
};

window.abrirFichaCliente = cpfEntrada => {
    if (!podeConsultarFichaCliente() || !window.permissoesLogado?.dashboard) return window.mostrarToast('Acesso não autorizado.', 'erro');
    const cpf = String(cpfEntrada || '').replace(/\D/g, '');
    const c = window.clientesMap?.[cpf];
    if (!c) return window.mostrarToast('Cliente não encontrado na unidade atual.', 'erro');
    fichaClienteAtual = c;
    fichaConsultaSequencia++;
    fichaUnidadeAtual = window.obterUnidade();
    fichaLogs = [];
    fichaAuditoriaCompleta = false;
    renderizarFichaCliente();
    const modal = document.getElementById('modal-historico');
    modal.classList.remove('hidden');
    if (window.prenderFocoModal) window.prenderFocoModal(modal);
};
window.abrirHistorico = window.abrirFichaCliente;

const consultarRegistroAtual = async (caminho, token, signal) => {
    const base = window.firebaseApp.options.databaseURL.replace(/\/$/, '');
    const resposta = await fetch(`${base}/${caminho}.json?auth=${encodeURIComponent(token)}`, {
        signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
    });
    if (!resposta.ok) throw new Error(resposta.status === 401 || resposta.status === 403
        ? 'Acesso ao banco negado.' : `Banco indisponível (${resposta.status}).`);
    return resposta.json();
};

window.solicitarAuditoriaCliente = async () => {
    if (!podeConsultarFichaCliente() || !window.permissoesLogado?.auditoria || !fichaClienteAtual) return;
    if (fichaUnidadeAtual !== window.obterUnidade()) return window.mostrarToast('Unidade alterada. Abra a ficha novamente.', 'erro');
    const botao = document.getElementById('ficha-auditoria-botao');
    const cpf = String(fichaClienteAtual.cpf).replace(/\D/g, '');
    const consulta = fichaConsultaSequencia;
    const caminhoCliente = `${window.PATH_CLIENTES}/${cpf}`;
    const caminhoLogs = window.obterCaminhoUnidade('auditoria');
    const controlador = new AbortController();
    const prazo = setTimeout(() => controlador.abort(), 20000);
    if (botao) { botao.disabled = true; botao.textContent = 'Conferindo banco…'; }
    try {
        const token = await window.usuarioLogado.getIdToken();
        const [cadastro, logs] = await Promise.all([
            consultarRegistroAtual(caminhoCliente, token, controlador.signal),
            window.isSimulationMode ? Promise.resolve(null) : consultarRegistroAtual(caminhoLogs, token, controlador.signal)
        ]);
        if (consulta !== fichaConsultaSequencia || fichaUnidadeAtual !== window.obterUnidade() || !window.usuarioLogado) return;
        if (!cadastro) throw new Error('Cadastro não encontrado no banco da unidade.');
        fichaClienteAtual = cadastro;
        fichaLogs = filtrarLogsCliente(logs, cpf);
        fichaAuditoriaCompleta = true;
        renderizarFichaCliente();
        if (!window.isSimulationMode) window.logAuditoria?.('Consulta de auditoria', `Ficha do cliente de CPF final ${cpf.slice(-4)} consultada.`, { clienteCpf: cpf });
        window.mostrarToast('Conferência concluída. O relatório está pronto para imprimir ou salvar em PDF.');
    } catch (erro) {
        if (consulta === fichaConsultaSequencia) window.mostrarToast(`Auditoria não concluída: ${erro.name === 'AbortError' ? 'tempo de resposta excedido' : erro.message || 'falha na leitura dos dados'}`, 'erro');
    } finally {
        clearTimeout(prazo);
        if (consulta === fichaConsultaSequencia && botao) { botao.disabled = false; botao.textContent = 'Auditar agora'; }
    }
};

window.imprimirExtratoCliente = () => {
    if (!podeConsultarFichaCliente() || !window.permissoesLogado?.dashboard || !fichaClienteAtual) return;
    if (fichaUnidadeAtual !== window.obterUnidade()) return window.mostrarToast('Unidade alterada. Abra a ficha novamente.', 'erro');
    const c = fichaClienteAtual;
    const extrato = montarExtratoCliente(c, fichaLogs);
    const secao = document.getElementById('secao-impressao');
    if (!secao) return;
    const cpfFinal = String(c.cpf || '').replace(/\D/g, '').slice(-4);
    const unidade = fichaUnidadeAtual === 'picarras' ? 'Piçarras' : 'Navegantes';
    const agora = new Date().toLocaleString('pt-BR');
    const solicitante = String(window.usuarioLogado.email || '').split('@')[0];
    secao.classList.add('print-extrato');
    secao.innerHTML = `<article class="extrato-impresso">
        <header><h1>TOP HAUS · ${fichaAuditoriaCompleta ? 'AUDITORIA DO CLIENTE' : 'EXTRATO DO CLIENTE'}</h1><p>Unidade ${unidade} · Gerado em ${agora} · Solicitado por ${htmlFicha(solicitante)} · Uso interno${window.isSimulationMode ? ' · SIMULAÇÃO' : ''}</p></header>
        <h2>${htmlFicha(window.nomeExibicao(c.nome))}</h2><p>CPF final ${htmlFicha(cpfFinal)} · Cadastro ${htmlFicha(extrato.cadastro)} · Origem ${htmlFicha(extrato.origemCadastro)}</p>
        <table><tbody><tr><th>Saldo atual</th><th>Resgates</th><th>Almoços contabilizados</th><th>Datas documentadas</th></tr><tr><td>${extrato.saldo}</td><td>${extrato.resgatesDeclarados}</td><td>${extrato.totalContabilizado}</td><td>${extrato.totalDocumentado}</td></tr></tbody></table>
        <p>Conciliação: ${extrato.saldo} no saldo + ${extrato.resgatesDeclarados} × 10 resgatados = ${extrato.totalContabilizado} almoços contabilizados. ${extrato.visitasAposUltimoResgate === null ? 'Sem resgate anterior.' : `${extrato.visitasAposUltimoResgate} data(s) de almoço no saldo posteriores ao último resgate.`}</p>
        <h3>Resultado da conferência</h3>${extrato.alertas.length ? `<ul>${extrato.alertas.map(aviso => `<li>${htmlFicha(aviso)}</li>`).join('')}</ul>` : '<p>Os contadores conferem com as datas digitais disponíveis.</p>'}
        <p>${htmlFicha(extrato.observacao)}</p>
        <p>Fonte: cadastro digital ${fichaAuditoriaCompleta ? `${window.isSimulationMode ? 'da simulação; logs reais não incluídos' : `e ${fichaLogs.length} log(s) associados ao CPF`}, relido nesta solicitação` : 'carregado no painel; logs não consultados'}.</p>
        <h3>Linha do tempo (${extrato.eventos.length} eventos)</h3>
        <table><tbody>${extrato.eventos.map(evento => `<tr><td>${htmlFicha(evento.data)}</td><td>${htmlFicha(evento.descricao)}${evento.protocolo ? ` · Protocolo ${htmlFicha(evento.protocolo)}` : ''}</td></tr>`).join('')}</tbody></table>
    </article>`;
    window.print();
};

window.addEventListener('afterprint', () => document.getElementById('secao-impressao')?.classList.remove('print-extrato'));

window.reimprimirCupomPorCpf = (c, i) => { 
    if (!podeConsultarFichaCliente()) return;
    if(window.fecharModal) window.fecharModal('modal-historico'); 
    const cl = window.clientesMap[c]; 
    if(cl && cl.historicoResgates && cl.historicoResgates[i]) {
        if(window.logAuditoria) window.logAuditoria('Reimpressão', `Cupom de resgate reimpresso para ${cl.nome}.`);
        const protocolo = cl.historicoResgates[i].protocolo || 'S/N';
        window.dispararImpressao(cl.nome, cl.cpf, cl.historicoResgates[i].datas, cl.historicoResgates[i].dataResgate + " (REIMPRESSÃO)", protocolo); 
    }
};

window.reimprimirAniversarioPorCpf = (c, i) => { 
    if (!podeConsultarFichaCliente()) return;
    if(window.fecharModal) window.fecharModal('modal-historico'); 
    const cl = window.clientesMap[c]; 
    if(cl && cl.historicoAniversarios && cl.historicoAniversarios[i]) {
        if(window.logAuditoria) window.logAuditoria('Reimpressão', `Cupom de aniversário reimpresso para ${cl.nome}.`);
        const protocolo = cl.historicoAniversarios[i].protocolo || 'S/N';
        window.dispararImpressaoAniversario(
            cl, 
            cl.historicoAniversarios[i].dataResgate + " (REIMPRESSÃO)", 
            protocolo
        ); 
    }
};

// ==========================================================================
// SEGURANÇA E AUDITORIA (MULTILIVRE)
// ==========================================================================
window.logAuditoria = (acao, detalhes, extraData = {}) => {
    if (!window.usuarioLogado || !window.db || !window.firebaseRef || !window.firebasePush) return;

    const user = window.usuarioLogado ? window.usuarioLogado.email.split('@')[0] : 'sistema';
    const cargo = window.cargoLogado || 'sistema';
    const unidade = window.obterUnidade ? window.obterUnidade() : 'desconhecida';
    const terminal = window.obterTerminalId ? window.obterTerminalId() : 'desconhecido';

    const log = {
        tipo: acao,
        acao: acao,
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
    window.firebasePush(window.firebaseRef(window.db, pathAuditoria), log).catch(() => {});
};

window.abrirAuditoria = () => {
    if(!window.permissoesLogado || !window.permissoesLogado.auditoria) {
        return window.mostrarToast("Seu perfil não tem acesso a esta ação. Fale com o administrador.", "erro");
    }
    const tb = document.getElementById('tabela-auditoria');
    if(!tb) return;
    tb.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-gray-500">Carregando logs...</td></tr>';
    
    const modal = document.getElementById('modal-auditoria');
    modal.classList.remove('hidden');
    
    const pathAuditoria = window.obterCaminhoUnidade ? window.obterCaminhoUnidade('auditoria') : 'auditoria';

    window.firebaseGet(window.firebaseRef(window.db, pathAuditoria)).then(snap => {
        tb.innerHTML = '';
        if(snap.exists()) {
            const logs = Object.values(snap.val()).sort((a,b) => b.timestamp - a.timestamp).slice(0, 50);
            logs.forEach(l => {
                tb.innerHTML += `
                    <tr class="border-b border-gray-100 hover:bg-gray-50 transition">
                        <td data-label="Data / Usuário" class="py-3 px-4 text-xs whitespace-nowrap">${l.dataHora}<br><span class="text-indigo-600 font-bold uppercase">@${l.usuario}</span></td>
                        <td data-label="Ação" class="py-3 px-4 text-xs font-bold text-gray-800">${l.acao || l.tipo}</td>
                        <td data-label="Detalhes" class="py-3 px-4 text-xs text-gray-600">${window.escapeHTML(l.detalhes)}</td>
                    </tr>
                `;
            });
        } else {
            tb.innerHTML = '<tr><td colspan="3" class="text-center py-6 text-gray-500">Nenhum registro de auditoria encontrado na unidade ativa.</td></tr>';
        }
    });
};

window.confirmacaoDupla = (titulo, texto, callbackConfirma) => {
    document.getElementById('alerta-generico-titulo').innerText = titulo;
    document.getElementById('alerta-generico-texto').innerText = texto;
    const modal = document.getElementById('modal-alerta-generico');
    modal.classList.remove('hidden');
    if(window.prenderFocoModal) window.prenderFocoModal(modal);
    
    const btn = document.getElementById('btn-alerta-generico-confirmar');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.onclick = () => {
        window.fecharModal('modal-alerta-generico');
        callbackConfirma();
    };
};

window.arquivarCliente = (cpf) => {
    if(!window.permissoesLogado || !window.permissoesLogado.clientes) {
        return window.mostrarToast("Seu perfil não tem acesso a esta ação.", "erro");
    }

    const c = window.clientesMap[cpf];
    if(!c) return;

    window.confirmacaoDupla(
        "Arquivar Cliente", 
        `Deseja arquivar o cliente ${c.nome}? Ele deixará de aparecer no painel e no caixa.`,
        () => {
            c.arquivado = true;
            c.dataArquivamento = Date.now();
            window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + cpf), c).then(() => {
                window.mostrarToast("Cliente arquivado com sucesso.");
                if(window.logAuditoria) window.logAuditoria('Arquivamento', `Cliente ${c.nome} (${window.formatarCPF(cpf)}) foi movido para a lixeira.`);
                if(window.filtrarLista) window.filtrarLista(window.filtroAtual);
            }).catch(() => {
                window.mostrarToast("Não foi possível salvar. Tente novamente.", "erro");
            });
        }
    );
};

window.abrirLixeira = () => {
    if(!window.permissoesLogado || !window.permissoesLogado.clientes) {
        return window.mostrarToast("Seu perfil não tem acesso a esta ação.", "erro");
    }
    
    const tb = document.getElementById('tabela-lixeira');
    if(!tb) return;
    
    const arquivados = window.clientesArray.filter(c => c.arquivado);
    tb.innerHTML = '';
    
    if(arquivados.length === 0) {
        tb.innerHTML = '<tr><td colspan="3" class="text-center py-6 text-gray-500">Nenhum cliente arquivado no momento.</td></tr>';
    } else {
        arquivados.forEach(c => {
            tb.innerHTML += `
                <tr class="border-b border-gray-100 hover:bg-gray-50 transition">
                    <td data-label="Nome" class="py-3 px-4 text-xs font-bold text-gray-800">${window.escapeHTML(window.nomeExibicao(c.nome))}</td>
                    <td data-label="CPF" class="py-3 px-4 text-xs text-center text-gray-500 font-mono">${window.formatarCPF(c.cpf)}</td>
                    <td data-label="Ação" class="py-3 px-4 text-right">
                        <button onclick="restaurarCliente('${c.cpf}')" class="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 transition shadow-sm">
                            <i data-lucide="refresh-cw" class="w-3.5 h-3.5 inline"></i> Restaurar
                        </button>
                    </td>
                </tr>
            `;
        });
    }
    
    const modal = document.getElementById('modal-lixeira');
    modal.classList.remove('hidden');
    if(window.prenderFocoModal) window.prenderFocoModal(modal);
    if(window.lucide) window.lucide.createIcons();
};

window.restaurarCliente = (cpf) => {
    const c = window.clientesMap[cpf];
    if(!c) return;
    
    c.arquivado = false;
    c.dataArquivamento = null;
    
    window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + cpf), c).then(() => {
        window.mostrarToast("Cliente restaurado com sucesso.");
        if(window.logAuditoria) window.logAuditoria('Restauração', `Cliente ${c.nome} (${window.formatarCPF(cpf)}) foi restaurado da lixeira.`);
        window.abrirLixeira(); 
        if(window.filtrarLista) window.filtrarLista(window.filtroAtual);
    }).catch(() => {
        window.mostrarToast("Não foi possível salvar. Tente novamente.", "erro");
    });
};

// REGISTRA O ALMOÇO COM A SENHA DO GERENTE/ADMIN
window.registrarAlmocoAtrasado = () => {
    const inputData = document.getElementById('atrasado-data');
    if(!inputData) return window.mostrarToast('Erro interno: Campo de data não encontrado.', 'erro');
    
    const cpfNum = document.getElementById('atrasado-cpf').value.replace(/\D/g, '');
    const dataAtrasada = inputData.value;
    const qtd = parseInt(document.getElementById('atrasado-qtd').value, 10);
    const isGerente = (window.cargoLogado === 'gerente' || window.cargoLogado === 'admin');
    
    if(!window.validarCPFReal(cpfNum)) return window.mostrarToast('CPF inválido.', 'erro');
    if(!dataAtrasada || isNaN(qtd) || qtd < 1) return window.mostrarToast('Preencha a data e quantidade.', 'erro');

    // Validação da Senha do Gerente/Admin apenas para operadores de Caixa
    if (!isGerente) {
        const senhaMaster = document.getElementById('atrasado-senha').value;
        if(senhaMaster !== 'tophaus123') {
            return window.mostrarToast('Senha de liberação incorreta.', 'erro');
        }
    }

    const c = window.clientesMap[cpfNum];
    if(!c) return window.mostrarToast('Cliente não encontrado.', 'erro');

    const emailAtual = window.usuarioLogado.email.split('@')[0];
    const dataFormatada = dataAtrasada.split('-').reverse().join('/');
    
    c.almocos = (c.almocos || 0) + qtd;
    
    if(!c.historico) c.historico = [];
    for(let i = 0; i < qtd; i++) {
        c.historico.push(`${dataFormatada} às 12:00 (Atrasado/Extra)`);
    }
    c.historico = window.limitarHistorico(c.historico);

    if(!c.historicoAtrasados) c.historicoAtrasados = [];
    c.historicoAtrasados.push({
        dataRegistro: new Date().toISOString(),
        dataAlmoco: dataAtrasada,
        quantidade: qtd,
        responsavel: isGerente ? emailAtual : 'Autorizado via Senha do Gerente/Admin',
        operador_caixa: emailAtual
    });

    if (c.almocos > 0 && c.almocos % 10 === 0) {
        if(!c.historicoConquistas) c.historicoConquistas = [];
        c.historicoConquistas.push(new Date().toLocaleString('pt-BR'));
    }

    window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + c.cpf), c).then(() => {
        window.mostrarToast(`Sucesso! +${qtd} almoço(s) extra(s) contabilizado(s).`);
        
        if(window.logAuditoria) {
            window.logAuditoria('Almoço Extra/Atrasado', `+${qtd} refeição (${dataFormatada}) registrada para ${c.nome}.`, {
                clienteCpf: c.cpf,
                clienteNome: c.nome,
                quantidade: qtd,
                dataAlmocoOriginal: dataAtrasada,
                operador: emailAtual
            });
        }
        
        document.getElementById('form-almoco-atrasado').reset();
        window.fecharModal('modal-almoco-atrasado');
        if(window.filtrarLista) window.filtrarLista(window.filtroAtual);
        
        const inp = document.getElementById('busca-cpf');
        if(inp) inp.value = ''; 
    }).catch(() => {
        window.mostrarToast('Não foi possível salvar no banco. Tente novamente.', 'erro');
    });
};

window.abrirModalMesclagem = () => {
    if(!window.permissoesLogado || !window.permissoesLogado.clientes) {
        return window.mostrarToast("Seu perfil não tem acesso a esta ação.", "erro");
    }
    document.getElementById('mescla-cpf-origem').value = '';
    document.getElementById('mescla-cpf-destino').value = '';
    const modal = document.getElementById('modal-mesclagem');
    modal.classList.remove('hidden');
    if(window.prenderFocoModal) window.prenderFocoModal(modal);
};

window.executarMesclagem = () => {
    const cpfOrigemRaw = document.getElementById('mescla-cpf-origem').value.replace(/\D/g, '');
    const cpfDestinoRaw = document.getElementById('mescla-cpf-destino').value.replace(/\D/g, '');

    if(!window.validarCPFReal(cpfOrigemRaw) || !window.validarCPFReal(cpfDestinoRaw)) {
        return window.mostrarToast("Verifique os CPFs informados. Ambos devem ser válidos.", "erro");
    }
    if(cpfOrigemRaw === cpfDestinoRaw) {
        return window.mostrarToast("Os CPFs de origem e destino não podem ser iguais.", "erro");
    }

    const cOrigem = window.clientesMap[cpfOrigemRaw];
    const cDestino = window.clientesMap[cpfDestinoRaw];

    if(!cOrigem || !cDestino) {
        return window.mostrarToast("Um ou ambos os clientes não foram encontrados na base ativa.", "erro");
    }

    window.confirmacaoDupla(
        "Confirmar Mesclagem",
        `Tem certeza que deseja transferir os dados de ${cOrigem.nome} para ${cDestino.nome}? O cadastro de origem será arquivado permanentemente.`,
        () => {
            const btn = document.getElementById('btn-mesclar-salvar');
            const span = document.getElementById('btn-mesclar-salvar-text');
            if(btn) btn.disabled = true;
            if(span) span.innerText = 'Mesclando...';

            cDestino.almocos = (cDestino.almocos || 0) + (cOrigem.almocos || 0);
            cDestino.premiosResgatados = (cDestino.premiosResgatados || 0) + (cOrigem.premiosResgatados || 0);

            if(cOrigem.historico) {
                cDestino.historico = [...(cDestino.historico || []), ...cOrigem.historico];
                if(window.limitarHistorico) cDestino.historico = window.limitarHistorico(cDestino.historico);
            }
            if(cOrigem.historicoResgates) {
                cDestino.historicoResgates = [...(cDestino.historicoResgates || []), ...cOrigem.historicoResgates];
            }
            if(cOrigem.historicoAniversarios) {
                cDestino.historicoAniversarios = [...(cDestino.historicoAniversarios || []), ...cOrigem.historicoAniversarios];
            }
            if(cOrigem.historicoConquistas) {
                cDestino.historicoConquistas = [...(cDestino.historicoConquistas || []), ...cOrigem.historicoConquistas];
            }

            if (cOrigem.ultimaVisitaTimestamp && (!cDestino.ultimaVisitaTimestamp || cOrigem.ultimaVisitaTimestamp > cDestino.ultimaVisitaTimestamp)) {
                cDestino.ultimaVisitaTimestamp = cOrigem.ultimaVisitaTimestamp;
            }

            cOrigem.arquivado = true;
            cOrigem.dataArquivamento = Date.now();
            cOrigem.motivoArquivamento = `Conta mesclada no CPF ${window.formatarCPF(cpfDestinoRaw)}`;

            Promise.all([
                window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + cpfDestinoRaw), cDestino),
                window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + cpfOrigemRaw), cOrigem)
            ]).then(() => {
                window.mostrarToast("Cadastros mesclados com sucesso!");
                if(window.logAuditoria) window.logAuditoria('Mesclagem de Contas', `Os dados do CPF ${window.formatarCPF(cpfOrigemRaw)} foram transferidos com sucesso para o CPF ${window.formatarCPF(cpfDestinoRaw)}.`);
                
                if(btn) btn.disabled = false;
                if(span) span.innerText = 'Confirmar Mesclagem';
                if(window.fecharModal) window.fecharModal('modal-mesclagem');
                if(window.filtrarLista) window.filtrarLista(window.filtroAtual);
            }).catch(() => {
                window.mostrarToast("Erro ao processar mesclagem. Tente novamente.", "erro");
                if(btn) btn.disabled = false;
                if(span) span.innerText = 'Confirmar Mesclagem';
            });
        }
    );
};

