// Módulo 4: Frente de Caixa, Gestão de Clientes e Fidelidade

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
        document.getElementById('texto-alerta-aniversario').innerHTML = `Hoje é o aniversário de <br><strong class="text-xl text-black">${window.escapeHTML(c.nome)}</strong>!`; 
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
        const m = document.getElementById('modal-trava'); 
        m.classList.remove('hidden'); 
        if(window.prenderFocoModal) window.prenderFocoModal(m);
        
        document.getElementById('btn-trava-resgatar').onclick = () => { 
            if(window.fecharModal) window.fecharModal('modal-trava'); 
            window.efetuarResgateEImprimir(c); 
        };
        
        const bA = document.getElementById('btn-trava-acumular');
        const spanAcumular = document.getElementById('btn-trava-acumular-text');
        
        if(ja) { 
            if(spanAcumular) spanAcumular.innerText = "Já acumulou hoje";
            else bA.innerText = "Já acumulou hoje"; 
            bA.disabled = true; 
            bA.classList.add('opacity-50'); 
        } else { 
            if(spanAcumular) spanAcumular.innerText = "Guardar para outra visita (+1 pago)";
            else bA.innerText = "Guardar para outra visita (+1 pago)"; 
            bA.disabled = false; 
            bA.classList.remove('opacity-50'); 
            bA.onclick = () => { 
                if(window.fecharModal) window.fecharModal('modal-trava'); 
                window.processarConfirmacao(c); 
            }; 
        }
    } else {
        if(ja) return window.mostrarToast('Este cliente já registrou um almoço hoje.', 'erro');
        
        document.getElementById('texto-confirmacao').innerHTML = `Deseja registrar +1 almoço para <strong>${window.escapeHTML(c.nome)}</strong>?`;
        const m = document.getElementById('modal-confirmacao'); 
        m.classList.remove('hidden'); 
        if(window.prenderFocoModal) window.prenderFocoModal(m);
        
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
        cpf, nome: document.getElementById('cad-nome').value.trim(), 
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
        
        if(window.logAuditoria) window.logAuditoria('Cadastro (Caixa)', `Cliente ${nc.nome} cadastrado via painel.`);
        
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
        
        if(window.logAuditoria) window.logAuditoria('Almoço', `+1 almoço registrado para ${c.nome}. Saldo: ${c.almocos}.`);
        
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

    // TRANSAÇÃO ATÔMICA
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
            window.dispararImpressao(c.nome, c.cpf, dts, hr, protocoloGerado); 
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
window.dispararImpressaoAniversario = (c, dataResgate, protocolo) => {
    const secaoImp = document.getElementById('secao-impressao');
    if (!secaoImp) return;

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
            <p style="margin:2px 0;"><strong>Nome:</strong> ${window.escapeHTML((c.nome||'').toUpperCase())}</p>
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

    // TRANSAÇÃO ATÔMICA
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
// MODAL ESTÁTICO DE EDIÇÃO E HISTÓRICO (CHAMADO PELA TABELA)
// ==========================================================================
window.abrirEditar = (cpf) => {
    const c = window.clientesMap[cpf]; 
    if(!c) return;
    
    document.getElementById('edit-cpf-raw').value = c.cpf||''; 
    document.getElementById('edit-cpf-display').value = window.formatarCPF(c.cpf);
    document.getElementById('edit-nome').value = c.nome||''; 
    
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
    
    const tel = document.getElementById('edit-telefone').value.replace(/\D/g, ''); 
    if(!window.telefoneValido(tel)) return window.mostrarToast('Telefone inválido. Verifique e tente novamente.', 'erro');
    const nasc = document.getElementById('edit-nascimento').value; 
    if(!window.validarDataReal(nasc)) return window.mostrarToast('Data de nascimento inválida.', 'erro');
    
    const btn = document.getElementById('btn-editar-salvar');
    const span = document.getElementById('btn-editar-salvar-text');
    if(btn) btn.disabled = true;
    if(span) span.innerText = 'Atualizando...';
    
    const oldNome = c.nome;
    c.nome = document.getElementById('edit-nome').value; 
    c.telefone = tel; 
    c.nascimento = nasc.includes('/') ? `${nasc.split('/')[2]}-${nasc.split('/')[1]}-${nasc.split('/')[0]}` : nasc;
    
    window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + c.cpf), c).then(() => { 
        window.mostrarToast("Cliente atualizado com sucesso."); 
        if(window.logAuditoria) window.logAuditoria('Edição', `Cadastro de ${oldNome} atualizado para ${c.nome}.`);
        
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Salvar alterações';
        if(window.fecharModal) window.fecharModal('modal-editar'); 
    }).catch(() => {
        window.mostrarToast('Não foi possível salvar. Tente novamente.', 'erro');
        if(btn) btn.disabled = false;
        if(span) span.innerText = 'Salvar alterações';
    });
};

window.abrirHistorico = (cpf) => {
    const c = window.clientesMap[cpf];
    const div = document.getElementById('lista-historico'); 
    if(!div) return;
    
    div.innerHTML = ''; 
    if(!c) return;

    if(c.historicoConquistas && c.historicoConquistas.length > 0) {
        div.innerHTML += `<h4 class="font-bold text-sm mb-2 text-black border-b pb-1">Conquistas (10 Almoços Alcançados)</h4>`;
        c.historicoConquistas.forEach((r, i) => {
            div.innerHTML += `
                <div class="bg-amber-50 p-3 rounded-lg border border-amber-200 flex justify-between items-center mb-2">
                    <div><p class="text-xs font-bold text-amber-800">Conquista #${i+1}</p><p class="text-xs text-amber-700">${r}</p></div>
                    <i data-lucide="award" class="w-4 h-4 text-amber-500"></i>
                </div>`;
        });
    }
    
    if(c.historicoResgates && c.historicoResgates.length > 0) { 
        div.innerHTML += `<h4 class="font-bold text-sm mb-2 mt-4 text-black border-b pb-1">Resgates de Prêmio Realizados</h4>`; 
        c.historicoResgates.forEach((r, i) => { 
            const protStr = r.protocolo ? `<br><span class="text-indigo-600">Prot: ${r.protocolo}</span>` : '';
            div.innerHTML += `
                <div class="bg-gray-50 p-3 rounded-lg border flex justify-between items-center mb-2">
                    <div><p class="text-xs font-bold text-gray-800">Resgate #${i+1}</p><p class="text-xs text-gray-600">${r.dataResgate}${protStr}</p></div>
                    <button onclick="reimprimirCupomPorCpf('${c.cpf}', ${i})" class="bg-black text-white px-3 py-1.5 rounded-lg text-xs font-bold transition hover:bg-gray-800">
                        <i data-lucide="printer" class="w-3.5 h-3.5 inline"></i> Reimprimir
                    </button>
                </div>`; 
        }); 
    }
    
    if(c.historicoAniversarios && c.historicoAniversarios.length > 0) { 
        div.innerHTML += `<h4 class="font-bold text-sm mb-2 mt-4 text-black border-b pb-1">Aniversários</h4>`; 
        c.historicoAniversarios.forEach(r => { 
            const protStr = r.protocolo ? `<br><span class="text-indigo-600">Prot: ${r.protocolo}</span>` : '';
            div.innerHTML += `
                <div class="bg-indigo-50 p-3 rounded-lg border border-indigo-100 flex justify-between items-center mb-2">
                    <div><p class="text-xs font-bold text-indigo-900">Aniv. ${r.ano}</p><p class="text-xs text-indigo-700">${r.dataResgate}${protStr}</p></div>
                </div>`; 
        }); 
    }
    
    if(div.innerHTML === '') {
        div.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Nenhum histórico encontrado para este cliente.</p>';
    }
    
    const m = document.getElementById('modal-historico'); 
    m.classList.remove('hidden'); 
    if(window.prenderFocoModal) window.prenderFocoModal(m); 
    if(window.lucide) window.lucide.createIcons();
};

window.reimprimirCupomPorCpf = (c, i) => { 
    if(window.fecharModal) window.fecharModal('modal-historico'); 
    const cl = window.clientesMap[c]; 
    if(cl && cl.historicoResgates && cl.historicoResgates[i]) {
        if(window.logAuditoria) window.logAuditoria('Reimpressão', `Cupom de resgate reimpresso para ${cl.nome}.`);
        window.dispararImpressao(cl.nome, cl.cpf, cl.historicoResgates[i].datas, cl.historicoResgates[i].dataResgate + " (REIMPRESSÃO)", cl.historicoResgates[i].protocolo); 
    }
};

// ==========================================================================
// SEGURANÇA E AUDITORIA (MULTILIVRE)
// ==========================================================================
window.logAuditoria = (acao, detalhes, extraData = {}) => {
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
    window.firebasePush(window.firebaseRef(window.db, pathAuditoria), log);
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
                        <td class="py-3 px-4 text-xs whitespace-nowrap">${l.dataHora}<br><span class="text-indigo-600 font-bold uppercase">@${l.usuario}</span></td>
                        <td class="py-3 px-4 text-xs font-bold text-gray-800">${l.acao || l.tipo}</td>
                        <td class="py-3 px-4 text-xs text-gray-600">${window.escapeHTML(l.detalhes)}</td>
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
                    <td class="py-3 px-4 text-xs font-bold text-gray-800">${window.escapeHTML(c.nome)}</td>
                    <td class="py-3 px-4 text-xs text-center text-gray-500 font-mono">${window.formatarCPF(c.cpf)}</td>
                    <td class="py-3 px-4 text-right">
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

window.registrarAlmocoAtrasado = () => {
    if(window.cargoLogado !== 'gerente' && window.cargoLogado !== 'admin') {
        return window.mostrarToast('Acesso negado. Apenas gerentes e administradores.', 'erro');
    }

    const inputData = document.getElementById('atrasado-data');
    if(!inputData) return window.mostrarToast('Erro interno: Campo de data não encontrado.', 'erro');
    
    const cpfNum = document.getElementById('atrasado-cpf').value.replace(/\D/g, '');
    const dataAtrasada = inputData.value;
    const qtd = parseInt(document.getElementById('atrasado-qtd').value, 10);
    const senha = document.getElementById('atrasado-senha').value;

    if(!window.validarCPFReal(cpfNum)) return window.mostrarToast('CPF inválido.', 'erro');
    if(!dataAtrasada || isNaN(qtd) || qtd < 1) return window.mostrarToast('Preencha a data e quantidade.', 'erro');
    if(!senha) return window.mostrarToast('A senha do administrador é obrigatória.', 'erro');

    const c = window.clientesMap[cpfNum];
    if(!c) return window.mostrarToast('Cliente não encontrado.', 'erro');

    const emailAtual = window.usuarioLogado.email;
    
    window.firebaseSignIn(window.auth, emailAtual, senha).then(() => {
        const dataFormatada = dataAtrasada.split('-').reverse().join('/');
        
        c.almocos = (c.almocos || 0) + qtd;
        
        if(!c.historico) c.historico = [];
        for(let i = 0; i < qtd; i++) {
            c.historico.push(`${dataFormatada} às 12:00 (Atrasado)`);
        }
        c.historico = window.limitarHistorico(c.historico);

        if(!c.historicoAtrasados) c.historicoAtrasados = [];
        c.historicoAtrasados.push({
            dataRegistro: new Date().toISOString(),
            dataAlmoco: dataAtrasada,
            quantidade: qtd,
            responsavel: emailAtual.split('@')[0]
        });

        if (c.almocos > 0 && c.almocos % 10 === 0) {
            if(!c.historicoConquistas) c.historicoConquistas = [];
            c.historicoConquistas.push(new Date().toLocaleString('pt-BR'));
        }

        window.firebaseSet(window.firebaseRef(window.db, window.PATH_CLIENTES + '/' + c.cpf), c).then(() => {
            window.mostrarToast(`Sucesso! +${qtd} almoço(s) retroativos.`);
            
            if(window.logAuditoria) {
                window.logAuditoria('Almoço Atrasado', `+${qtd} refeição referente a ${dataFormatada} registrada para ${c.nome}.`, {
                    clienteCpf: c.cpf,
                    clienteNome: c.nome,
                    quantidade: qtd,
                    dataAlmocoOriginal: dataAtrasada
                });
            }
            
            document.getElementById('form-almoco-atrasado').reset();
            window.fecharModal('modal-almoco-atrasado');
            if(window.filtrarLista) window.filtrarLista(window.filtroAtual);
        });
    }).catch((err) => {
        window.mostrarToast('Senha incorreta. Ação não autorizada.', 'erro');
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
