'use strict';

// Robô do WhatsApp - Top Haus Fidelidade
// Arquitetura multiunidade, fila idempotente e campanhas centralizadas.
//
// Dependências esperadas no mesmo diretório:
//   whatsapp-web.js, qrcode-terminal, firebase-admin, node-cron
//   chave-firebase.json e config.js

const crypto = require('crypto');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const admin = require('firebase-admin');
const cron = require('node-cron');
const serviceAccount = require('./chave-firebase.json');
const config = require('./config.js');

const TIMEZONE = config.timezone || 'America/Sao_Paulo';
process.env.TZ = TIMEZONE;

const ESTADO = {
    INICIANDO: 'INICIANDO',
    AGUARDANDO_QR: 'AGUARDANDO_QR',
    AUTENTICANDO: 'AUTENTICANDO',
    CONECTANDO: 'CONECTANDO',
    PRONTO: 'PRONTO',
    DESCONECTADO: 'DESCONECTADO',
    REINICIANDO: 'REINICIANDO',
    FALHA: 'FALHA'
};

const STATUS = {
    PENDENTE: 'pendente',
    ENVIANDO: 'enviando',
    SUCESSO: 'sucesso',
    ERRO: 'erro',
    CANCELADO: 'cancelado'
};

const INTERVALO_STALE_ENVIANDO = 30 * 60 * 1000;
const INTERVALO_INATIVO_DIAS = 15;
const DIAS_INATIVO = 16;
const ATRASO_RECONEXAO = 15000;

console.log('🚀 Iniciando Robô Top Haus...');
console.log(`🏢 Unidade ativa: ${config.nome} (${config.unidade})`);
console.log(`🕒 Fuso horário: ${TIMEZONE}`);

try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: 'https://fidelidadetophausnavega-default-rtdb.firebaseio.com'
    });
    console.log('✅ Firebase conectado com sucesso.');
} catch (err) {
    console.error('❌ Erro ao conectar Firebase:', err);
    process.exit(1);
}

const db = admin.database();
const basePath = `lojas/${config.unidade}`;
const refFila = db.ref(`${basePath}/fila_mensagens`);
const refMensagens = db.ref(`${basePath}/config/mensagens`);
const refExecucoes = db.ref(`${basePath}/controle_campanhas`);

let estadoAtual = ESTADO.INICIANDO;
let whatsappPronto = false;
let clienteInicializando = false;
let clienteReconectando = false;
let monitoramentoIniciado = false;
let sincronizacaoEmAndamento = false;
let processandoFila = false;
let rotinaCampanhasEmAndamento = false;
let rotinaDiariaEmAndamento = false;
let timerReconexao = null;
let clienteAtual = null;
let sincronizacaoPorCiclo = false;
const filaMemoria = [];

function primeiroNome(nome) {
    return String(nome || '').trim().split(/\s+/)[0] || 'Cliente';
}

function telefoneLimpo(telefone) {
    return String(telefone || '').replace(/\D/g, '');
}

function partesDataLocal(data = new Date()) {
    const partes = new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(data).reduce((acc, item) => {
        acc[item.type] = item.value;
        return acc;
    }, {});
    return { ano: Number(partes.year), mes: Number(partes.month), dia: Number(partes.day) };
}

function dataLocalISO(data = new Date()) {
    const p = partesDataLocal(data);
    return `${p.ano}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`;
}

function minutosLocais(data = new Date()) {
    const partes = new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(data).reduce((acc, item) => {
        acc[item.type] = item.value;
        return acc;
    }, {});
    return Number(partes.hour) * 60 + Number(partes.minute);
}

function hashSeguro(valor) {
    return crypto.createHash('sha256').update(String(valor)).digest('hex');
}

function dataDoTimestamp(timestamp) {
    if (!timestamp) return '';
    const numerico = Number(timestamp);
    const data = Number.isFinite(numerico) ? new Date(numerico) : new Date(String(timestamp));
    return Number.isNaN(data.getTime()) ? '' : dataLocalISO(data);
}

function parseHorario(horario) {
    const match = String(horario || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return 9 * 60;
    const hora = Number(match[1]);
    const minuto = Number(match[2]);
    if (hora > 23 || minuto > 59) return 9 * 60;
    return hora * 60 + minuto;
}

function arrayizar(valor) {
    if (Array.isArray(valor)) return valor;
    return valor && typeof valor === 'object' ? Object.values(valor) : [];
}

function criarIdCampanha(campanha, indice) {
    return campanha.id || hashSeguro([
        campanha.tipo || 'unica',
        campanha.titulo || '',
        campanha.texto || '',
        campanha.data || '',
        campanha.horario || campanha.configRecorrencia?.horario || '',
        campanha.frequencia || '',
        indice
    ].join('|')).slice(0, 20);
}

function chaveOcorrenciaCampanha(campanha, indice, hoje) {
    const id = criarIdCampanha(campanha, indice);
    return `${id}|${hoje}`;
}

function chaveEnvio(tipo, identificador, ocorrencia, cpf) {
    return `${config.unidade}|${tipo}|${identificador}|${ocorrencia}|${cpf}`;
}

function podeReaproveitarRegistro(status) {
    return [STATUS.PENDENTE, STATUS.ENVIANDO, STATUS.SUCESSO].includes(status);
}

function registroEquivalente(registro, payload) {
    if (!registro) return false;
    if (registro.dedupeKey && registro.dedupeKey === payload.dedupeKey) return true;

    const cpfIgual = registro.cpf && payload.cpf && String(registro.cpf) === String(payload.cpf);
    const telefoneIgual = telefoneLimpo(registro.telefone) && telefoneLimpo(registro.telefone) === telefoneLimpo(payload.telefone);
    const textoIgual = String(registro.texto || '') === String(payload.texto || '');
    const diaIgual = dataDoTimestamp(registro.timestamp) === payload.ocorrenciaData;

    // Compatibilidade com itens antigos criados pelo painel, sem dedupeKey.
    return (cpfIgual || telefoneIgual) && textoIgual && diaIgual && podeReaproveitarRegistro(registro.status || STATUS.PENDENTE);
}

async function carregarFilaAtual() {
    const snap = await refFila.once('value');
    const registros = [];
    if (snap.exists()) {
        snap.forEach(child => registros.push({ id: child.key, ...child.val() }));
    }
    return registros;
}

// Insere uma mensagem em um caminho determinístico. Firebase transaction garante
// que duas instâncias do robô não criem a mesma ocorrência simultaneamente.
async function enfileirarMensagemUnica(payload, cacheFila = null) {
    const normalizado = {
        cpf: payload.cpf || null,
        telefone: telefoneLimpo(payload.telefone),
        texto: String(payload.texto || '').trim(),
        dedupeKey: payload.dedupeKey,
        ocorrenciaData: payload.ocorrenciaData || dataLocalISO(),
        tipo: payload.tipo || 'manual',
        campanhaId: payload.campanhaId || null,
        timestamp: Date.now(),
        status: STATUS.PENDENTE,
        tentativas: 0
    };

    if (!normalizado.telefone || normalizado.telefone.length < 10 || !normalizado.texto) {
        return { criada: false, motivo: 'dados_invalidos' };
    }

    if (cacheFila && cacheFila.some(registro => registroEquivalente(registro, normalizado))) {
        return { criada: false, motivo: 'duplicada' };
    }

    const idDeterministico = hashSeguro(normalizado.dedupeKey);
    const refMensagem = refFila.child(idDeterministico);
    const resultado = await refMensagem.transaction(atual => {
        if (atual && podeReaproveitarRegistro(atual.status || STATUS.PENDENTE)) return;
        return normalizado;
    });

    if (!resultado.committed) return { criada: false, motivo: 'duplicada' };
    if (cacheFila) cacheFila.push({ id: idDeterministico, ...normalizado });
    return { criada: true, id: idDeterministico };
}

// =========================================================
// CICLO DE VIDA DO WHATSAPP
// =========================================================
function criarClienteWhatsApp() {
    if (clienteAtual) {
        console.warn('⚠️ Cliente WhatsApp já existe. Destrua-o antes de criar outro.');
        return null;
    }

    const client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    configurarEventosCliente(client);
    return client;
}

async function destruirClienteWhatsApp() {
    if (!clienteAtual) return;
    try {
        clienteAtual.removeAllListeners();
        await clienteAtual.destroy();
    } catch (err) {
        console.error('❌ Erro ao destruir cliente WhatsApp:', err.message);
    } finally {
        clienteAtual = null;
        whatsappPronto = false;
        sincronizacaoPorCiclo = false;
        if (estadoAtual === ESTADO.PRONTO || estadoAtual === ESTADO.CONECTANDO) {
            estadoAtual = ESTADO.DESCONECTADO;
        }
    }
}

function configurarEventosCliente(client) {
    client.on('qr', qr => {
        console.log('\n📱 ESCANEIE O QR CODE ABAIXO:\n');
        qrcode.generate(qr, { small: true });
        estadoAtual = ESTADO.AGUARDANDO_QR;
    });

    client.on('loading_screen', (percent, message) => {
        console.log(`⏳ Carregando WhatsApp: ${percent}% - ${message}`);
        estadoAtual = ESTADO.CONECTANDO;
    });

    client.on('authenticated', () => {
        console.log('🔐 WhatsApp autenticado com sucesso.');
        estadoAtual = ESTADO.AUTENTICANDO;
    });

    client.on('auth_failure', msg => {
        console.error('❌ Falha de autenticação:', msg);
        estadoAtual = ESTADO.FALHA;
        iniciarReconexaoSegura();
    });

    client.on('ready', async () => {
        console.log('✅ ROBÔ DO TOP HAUS CONECTADO E PRONTO!');
        whatsappPronto = true;
        estadoAtual = ESTADO.PRONTO;
        clienteReconectando = false;

        if (!sincronizacaoPorCiclo) {
            sincronizacaoPorCiclo = true;
            await sincronizarMensagensPendentes();
        }

        if (!monitoramentoIniciado) iniciarMonitoramentoFila();
        processarFila();
    });

    client.on('disconnected', reason => {
        console.error(`❌ WhatsApp desconectado. Motivo: ${reason}`);
        whatsappPronto = false;
        sincronizacaoPorCiclo = false;
        if (!clienteReconectando && estadoAtual !== ESTADO.REINICIANDO) iniciarReconexaoSegura();
    });
}

function iniciarReconexaoSegura() {
    if (clienteReconectando || clienteInicializando || timerReconexao) return;
    estadoAtual = ESTADO.REINICIANDO;
    clienteReconectando = true;
    console.log(`🔄 Reconexão agendada em ${ATRASO_RECONEXAO / 1000}s...`);
    timerReconexao = setTimeout(async () => {
        timerReconexao = null;
        await reconectarWhatsApp();
    }, ATRASO_RECONEXAO);
}

async function reconectarWhatsApp() {
    if (whatsappPronto && estadoAtual === ESTADO.PRONTO) {
        clienteReconectando = false;
        return;
    }
    if (clienteInicializando) return;

    clienteInicializando = true;
    try {
        await destruirClienteWhatsApp();
        await new Promise(resolve => setTimeout(resolve, 2000));
        const novoCliente = criarClienteWhatsApp();
        if (!novoCliente) throw new Error('Não foi possível criar o cliente WhatsApp.');
        clienteAtual = novoCliente;
        estadoAtual = ESTADO.INICIANDO;
        whatsappPronto = false;
        await clienteAtual.initialize();
    } catch (err) {
        console.error('❌ Erro durante reconexão:', err.message);
        if (!timerReconexao) {
            timerReconexao = setTimeout(() => {
                timerReconexao = null;
                reconectarWhatsApp();
            }, 30000);
        }
    } finally {
        clienteInicializando = false;
        clienteReconectando = false;
    }
}

// =========================================================
// FILA
// =========================================================
async function sincronizarMensagensPendentes() {
    if (sincronizacaoEmAndamento) return;
    sincronizacaoEmAndamento = true;

    try {
        const snap = await refFila.once('value');
        const updates = {};
        const agora = Date.now();

        if (snap.exists()) {
            snap.forEach(child => {
                const id = child.key;
                const msg = child.val() || {};
                let status = msg.status || STATUS.PENDENTE;

                // Mensagem que ficou enviando por muito tempo vira erro manualmente.
                // Não voltamos automaticamente para pendente, pois ela pode ter sido
                // entregue antes da queda do processo.
                if (status === STATUS.ENVIANDO && agora - Number(msg.iniciadoEm || msg.timestamp || agora) > INTERVALO_STALE_ENVIANDO) {
                    status = STATUS.ERRO;
                    updates[`${id}/status`] = STATUS.ERRO;
                    updates[`${id}/erroMensagem`] = 'Processamento interrompido; revise antes de reenviar.';
                    updates[`${id}/finalizadoEm`] = agora;
                }

                if (status === STATUS.PENDENTE && !filaMemoria.some(item => item.id === id)) {
                    filaMemoria.push({ id, ...msg });
                }
            });
        }

        if (Object.keys(updates).length) await refFila.update(updates);
        filaMemoria.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        processarFila();
    } catch (err) {
        console.error('❌ Erro ao sincronizar fila:', err);
    } finally {
        sincronizacaoEmAndamento = false;
    }
}

function iniciarMonitoramentoFila() {
    if (monitoramentoIniciado) return;
    monitoramentoIniciado = true;

    refFila.on('child_added', snapshot => {
        const msg = snapshot.val() || {};
        if ((msg.status || STATUS.PENDENTE) === STATUS.PENDENTE) adicionarNaFila(snapshot.key, msg);
    });

    refFila.on('child_changed', snapshot => {
        const msg = snapshot.val() || {};
        if (msg.status === STATUS.PENDENTE) adicionarNaFila(snapshot.key, msg);
    });
}

function adicionarNaFila(id, msg) {
    if (filaMemoria.some(item => item.id === id)) return;
    filaMemoria.push({ id, ...msg });
    filaMemoria.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    processarFila();
}

async function reivindicarMensagem(msgRef) {
    const resultado = await msgRef.transaction(atual => {
        if (!atual || (atual.status || STATUS.PENDENTE) !== STATUS.PENDENTE) return;
        return {
            ...atual,
            status: STATUS.ENVIANDO,
            iniciadoEm: Date.now(),
            tentativas: Number(atual.tentativas || 0) + 1
        };
    });
    return resultado.committed;
}

async function processarFila() {
    if (!whatsappPronto || estadoAtual !== ESTADO.PRONTO) return;
    if (processandoFila || !filaMemoria.length || clienteReconectando || clienteInicializando) return;

    processandoFila = true;
    try {
        while (filaMemoria.length && whatsappPronto && estadoAtual === ESTADO.PRONTO) {
            const msg = filaMemoria.shift();
            const msgRef = refFila.child(msg.id);
            const reivindicada = await reivindicarMensagem(msgRef);
            if (!reivindicada) continue;

            try {
                const telefone = telefoneLimpo(msg.telefone);
                const texto = String(msg.texto || '').trim();
                if (telefone.length < 10 || !texto) throw new Error('Telefone ou texto vazio/inválido.');
                if (!whatsappPronto || estadoAtual !== ESTADO.PRONTO) throw new Error('WhatsApp desconectado antes do envio.');

                const numero = telefone.startsWith('55') ? telefone : `55${telefone}`;
                const contato = await clienteAtual.getNumberId(numero);
                if (!contato) throw new Error(`Número ${numero} não validado pelo WhatsApp.`);

                console.log(`📤 Enviando ${msg.id} para ${telefone}...`);
                await clienteAtual.sendMessage(contato._serialized, texto);
                await msgRef.update({ status: STATUS.SUCESSO, enviadoEm: Date.now(), erroMensagem: null });
                console.log(`✅ Mensagem ${msg.id} enviada para ${telefone}.`);

                const atraso = Math.floor(Math.random() * 5000) + 5000;
                await new Promise(resolve => setTimeout(resolve, atraso));
            } catch (err) {
                console.error(`❌ Falha no envio ${msg.id}:`, err.message || err);
                await msgRef.update({ status: STATUS.ERRO, finalizadoEm: Date.now(), erroMensagem: String(err.message || err) });
            }
        }
    } finally {
        processandoFila = false;
        if (filaMemoria.length && whatsappPronto && estadoAtual === ESTADO.PRONTO) setImmediate(processarFila);
    }
}

// =========================================================
// CAMPANHAS AGENDADAS
// =========================================================
function horarioDaCampanha(campanha) {
    return campanha.horario || campanha.configRecorrencia?.horario || '09:00';
}

function avaliarCampanha(campanha, indice, agora) {
    if (!campanha) return null;
    const status = String(campanha.status || '').toLowerCase();
    if (['cancelada', 'concluida', 'inativa', 'pausada'].includes(status)) return null;

    const hoje = dataLocalISO(agora);
    const minutosAtual = minutosLocais(agora);
    if (minutosAtual < parseHorario(horarioDaCampanha(campanha))) return null;

    const campanhaUnica = campanha.tipo === 'unica'
        || campanha.tipo === 'agendada'
        || (!campanha.frequencia && campanha.data);
    if (campanhaUnica) {
        if (campanha.data !== hoje) return null;
        return { indice, ocorrencia: chaveOcorrenciaCampanha(campanha, indice, hoje), data: hoje };
    }

    const configRecorrencia = campanha.configRecorrencia || {};
    const frequencia = campanha.frequencia;
    const partes = partesDataLocal(agora);

    if (frequencia === 'diaria') return { indice, ocorrencia: chaveOcorrenciaCampanha(campanha, indice, hoje), data: hoje };
    if (frequencia === 'semanal' && (configRecorrencia.diasSemana || []).map(Number).includes(new Date().getDay())) {
        return { indice, ocorrencia: chaveOcorrenciaCampanha(campanha, indice, hoje), data: hoje };
    }
    if (frequencia === 'mensal' && Number(configRecorrencia.diaMes) === partes.dia) {
        return { indice, ocorrencia: chaveOcorrenciaCampanha(campanha, indice, hoje), data: hoje };
    }
    if (frequencia === 'anual') {
        const [dia, mes] = String(configRecorrencia.diaAno || '').split('/').map(Number);
        if (dia === partes.dia && mes === partes.mes) return { indice, ocorrencia: chaveOcorrenciaCampanha(campanha, indice, hoje), data: hoje };
    }
    if (frequencia === 'data_especifica' && configRecorrencia.dataEspecifica === hoje) {
        return { indice, ocorrencia: chaveOcorrenciaCampanha(campanha, indice, hoje), data: hoje };
    }
    return null;
}

async function reivindicarOcorrencia(ocorrencia) {
    const ref = refExecucoes.child(hashSeguro(ocorrencia));
    const resultado = await ref.transaction(atual => {
        if (atual && atual.status === 'concluida') return;
        if (atual && atual.status === 'processando' && Date.now() - Number(atual.iniciadoEm || 0) < INTERVALO_STALE_ENVIANDO) return;
        return { status: 'processando', iniciadoEm: Date.now(), ocorrencia };
    });
    return { ref, committed: resultado.committed };
}

async function executarCampanhasAgendadas() {
    if (rotinaCampanhasEmAndamento) return;
    rotinaCampanhasEmAndamento = true;

    try {
        const snapMensagens = await refMensagens.once('value');
        const mensagens = snapMensagens.val() || {};
        const campanhas = arrayizar(mensagens.agendadas);
        if (!campanhas.length) return;

        const agora = new Date();
        const filaAtual = await carregarFilaAtual();
        let alterouCampanhas = false;

        for (let indice = 0; indice < campanhas.length; indice++) {
            const campanha = campanhas[indice];
            const devido = avaliarCampanha(campanha, indice, agora);
            if (!devido) continue;

            // O painel antigo pode ter marcado ultimoDisparo, mesmo que tenha sido
            // ele o produtor que já colocou os itens na fila.
            if (campanha.ultimaOcorrencia === devido.ocorrencia) continue;
            if (campanha.ultimoDisparo && dataLocalISO(new Date(campanha.ultimoDisparo)) === devido.data) continue;

            const reivindicacao = await reivindicarOcorrencia(devido.ocorrencia);
            if (!reivindicacao.committed) continue;

            try {
                let enfileiradas = 0;
                const clientesSnap = await db.ref(`${basePath}/clientes`).once('value');
                const clientes = Object.values(clientesSnap.val() || {}).filter(c => c && !c.arquivado && c.telefone);
                const campanhaId = criarIdCampanha(campanha, indice);

                for (const cliente of clientes) {
                    const identificadorCliente = cliente.cpf || telefoneLimpo(cliente.telefone);
                    const texto = String(campanha.texto || '')
                        .replace(/\[Nome\]/g, primeiroNome(cliente.nome))
                        .replace(/\[Acumulados\]/g, cliente.almocos || 0);
                    const resultado = await enfileirarMensagemUnica({
                        cpf: cliente.cpf,
                        telefone: cliente.telefone,
                        texto,
                        tipo: 'campanha',
                        campanhaId,
                        ocorrenciaData: devido.data,
                        dedupeKey: chaveEnvio('campanha', campanhaId, devido.ocorrencia, identificadorCliente)
                    }, filaAtual);
                    if (resultado.criada) enfileiradas++;
                }

                campanha.ultimoDisparo = Date.now();
                campanha.ultimaOcorrencia = devido.ocorrencia;
                if (campanha.tipo === 'unica' || campanha.tipo === 'agendada' || (!campanha.frequencia && campanha.data)) {
                    campanha.status = 'concluida';
                }
                alterouCampanhas = true;
                await reivindicacao.ref.update({ status: 'concluida', concluidaEm: Date.now(), enfileiradas });
                console.log(`📣 Campanha "${campanha.titulo || 'sem título'}": ${enfileiradas} nova(s) mensagem(ns).`);
            } catch (err) {
                await reivindicacao.ref.update({ status: STATUS.ERRO, erroMensagem: String(err.message || err), finalizadoEm: Date.now() });
                console.error('❌ Erro ao executar campanha:', err);
            }
        }

        if (alterouCampanhas) {
            mensagens.agendadas = campanhas;
            await refMensagens.update({ agendadas: campanhas });
        }
    } catch (err) {
        console.error('❌ Erro na rotina de campanhas:', err);
    } finally {
        rotinaCampanhasEmAndamento = false;
    }
}

// =========================================================
// INATIVOS E ANIVERSARIANTES
// =========================================================
function timestampUltimaVisita(cliente) {
    if (cliente.ultimaVisitaTimestamp) {
        const timestamp = Number(cliente.ultimaVisitaTimestamp);
        if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
    }
    const historico = Array.isArray(cliente.historico)
        ? cliente.historico
        : (cliente.historico && typeof cliente.historico === 'object' ? Object.values(cliente.historico) : []);
    const ultimo = historico[historico.length - 1];
    const match = String(ultimo || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const data = match
        ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]))
        : new Date(String(ultimo || ''));
    return Number.isNaN(data.getTime()) ? null : data.getTime();
}

function diasDesde(timestamp, agora = Date.now()) {
    return timestamp ? Math.floor((agora - Number(timestamp)) / 86400000) : null;
}

function diasAteAniversario(nascimento, agora = new Date()) {
    const valor = String(nascimento || '').trim();
    const ehISO = valor.includes('-');
    const partes = valor.split(/[/-]/).map(Number);
    if (partes.length !== 3 || !partes.every(Number.isFinite)) return null;

    const mes = partes[1];
    const dia = ehISO ? partes[2] : partes[0];
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    const local = partesDataLocal(agora);
    const inicio = new Date(local.ano, local.mes - 1, local.dia);
    let alvo = new Date(local.ano, mes - 1, dia);
    if (alvo < inicio) alvo = new Date(local.ano + 1, mes - 1, dia);
    return { dias: Math.ceil((alvo - inicio) / 86400000), anoAlvo: alvo.getFullYear() };
}

async function executarRotinaDiaria() {
    if (rotinaDiariaEmAndamento) return;
    rotinaDiariaEmAndamento = true;

    try {
        const [snapClientes, snapMensagens] = await Promise.all([
            db.ref(`${basePath}/clientes`).once('value'),
            refMensagens.once('value')
        ]);

        const clientes = Object.values(snapClientes.val() || {});
        const mensagens = snapMensagens.val() || {};
        const txtInativo = mensagens.inativo || 'Olá [Nome], faz tempo que não te vemos por aqui! Que tal almoçar com a gente essa semana?';
        const txtAniversario = mensagens.aniversario || 'Olá [Nome]! Vimos aqui que o seu aniversário está chegando! 🎉';
        const filaAtual = await carregarFilaAtual();
        const agora = Date.now();
        const hoje = dataLocalISO();

        for (const cliente of clientes) {
            if (!cliente || cliente.arquivado || !cliente.telefone || !cliente.cpf) continue;

            const ultimaVisita = timestampUltimaVisita(cliente);
            const ausente = diasDesde(ultimaVisita, agora);
            const ultimoAvisoInativo = diasDesde(cliente.notificadoInativoData, agora);

            if (ausente !== null && ausente >= DIAS_INATIVO && (ultimoAvisoInativo === null || ultimoAvisoInativo > INTERVALO_INATIVO_DIAS)) {
                const texto = txtInativo.replace(/\[Nome\]/g, primeiroNome(cliente.nome));
                const resultado = await enfileirarMensagemUnica({
                    cpf: cliente.cpf,
                    telefone: cliente.telefone,
                    texto,
                    tipo: 'inativo',
                    ocorrenciaData: hoje,
                    dedupeKey: chaveEnvio('inativo', cliente.cpf, hoje, cliente.cpf)
                }, filaAtual);

                if (resultado.criada || resultado.motivo === 'duplicada') {
                    await db.ref(`${basePath}/clientes/${cliente.cpf}/notificadoInativoData`).set(agora);
                }
            }

            const aniversario = diasAteAniversario(cliente.nascimento);
            if (aniversario && aniversario.dias >= 0 && aniversario.dias <= 7 && Number(cliente.notificadoAniversarioAno) !== aniversario.anoAlvo) {
                const texto = txtAniversario.replace(/\[Nome\]/g, primeiroNome(cliente.nome));
                const resultado = await enfileirarMensagemUnica({
                    cpf: cliente.cpf,
                    telefone: cliente.telefone,
                    texto,
                    tipo: 'aniversario',
                    ocorrenciaData: hoje,
                    dedupeKey: chaveEnvio('aniversario', cliente.cpf, String(aniversario.anoAlvo), cliente.cpf)
                }, filaAtual);

                if (resultado.criada || resultado.motivo === 'duplicada') {
                    await db.ref(`${basePath}/clientes/${cliente.cpf}/notificadoAniversarioAno`).set(aniversario.anoAlvo);
                }
            }
        }

        console.log('✅ Rotina de inativos e aniversariantes concluída.');
    } catch (err) {
        console.error('❌ Erro na rotina diária:', err);
    } finally {
        rotinaDiariaEmAndamento = false;
    }
}

// Campanhas são verificadas a cada minuto para respeitar o horário salvo.
cron.schedule('* * * * *', executarCampanhasAgendadas, { timezone: TIMEZONE });

// Inativos e aniversariantes continuam em uma varredura diária às 15h locais.
cron.schedule('0 15 * * *', executarRotinaDiaria, { timezone: TIMEZONE });

// =========================================================
// ERROS E INICIALIZAÇÃO
// =========================================================
process.on('unhandledRejection', err => console.error('❌ Promise não tratada:', err));
process.on('uncaughtException', err => console.error('❌ Exceção não tratada:', err));

async function inicializarSistema() {
    try {
        const novoCliente = criarClienteWhatsApp();
        if (!novoCliente) throw new Error('Falha ao criar cliente WhatsApp.');
        clienteAtual = novoCliente;
        estadoAtual = ESTADO.INICIANDO;
        whatsappPronto = false;
        await clienteAtual.initialize();
        console.log('✅ Inicialização do cliente concluída.');
    } catch (err) {
        console.error('❌ Erro na inicialização:', err.message);
        if (!timerReconexao) {
            timerReconexao = setTimeout(() => {
                timerReconexao = null;
                inicializarSistema();
            }, 30000);
        }
    }
}

inicializarSistema();


