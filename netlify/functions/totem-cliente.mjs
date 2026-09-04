import { createHash } from 'node:crypto';
import { bancoAdmin } from './_shared/firebase-admin.mjs';
import { json, lerJson, somentePost } from './_shared/http.mjs';

const UNIDADES = new Set(['navegantes', 'picarras']);
const TZ = 'America/Sao_Paulo';

function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

export function cpfValido(valor) {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let tamanho = 9; tamanho <= 10; tamanho++) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i);
    const digito = ((soma * 10) % 11) % 10;
    if (digito !== Number(cpf[tamanho])) return false;
  }
  return true;
}

export function nomePadronizado(valor) {
  const particulas = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
  const palavras = String(valor || '').trim().toLocaleLowerCase('pt-BR').split(/\s+/).filter(Boolean);
  if (palavras.length < 2 || palavras.some(p => !/^[\p{L}'’-]+$/u.test(p))) return '';
  return palavras.map((palavra, indice) => {
    if (indice > 0 && particulas.has(palavra)) return palavra;
    return palavra.split(/(['’-])/).map(parte => /['’-]/.test(parte)
      ? parte
      : (parte ? parte[0].toLocaleUpperCase('pt-BR') + parte.slice(1) : parte)).join('');
  }).join(' ');
}

function partesHoje(data = new Date()) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(data).reduce((acc, item) => ({ ...acc, [item.type]: item.value }), {});
  return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day) };
}

export function nascimentoISO(valor) {
  const bruto = String(valor || '').trim();
  const partes = bruto.split(/[\/-]/).map(Number);
  if (partes.length !== 3 || !partes.every(Number.isInteger)) return '';
  const [ano, mes, dia] = bruto.includes('-') ? partes : [partes[2], partes[1], partes[0]];
  const data = new Date(ano, mes - 1, dia);
  const hoje = partesHoje();
  const limiteAno = hoje.ano - 120;
  if (ano < limiteAno || ano > hoje.ano || data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return '';
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function hojeISO() {
  const p = partesHoje();
  return `${p.ano}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`;
}

function rotuloVisita() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date()).replace(',', ' às');
}

export function registradoHoje(cliente) {
  if (cliente?.ultimaVisitaTimestamp) {
    const data = new Date(Number(cliente.ultimaVisitaTimestamp));
    if (!Number.isNaN(data.getTime())) {
      const p = partesHoje(data);
      return `${p.ano}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}` === hojeISO();
    }
  }
  const historico = Array.isArray(cliente?.historico) ? cliente.historico : Object.values(cliente?.historico || {});
  return String(historico.at(-1) || '').includes(new Intl.DateTimeFormat('pt-BR', { timeZone: TZ }).format(new Date()));
}

export function aniversarioHoje(nascimento) {
  const iso = nascimentoISO(nascimento);
  if (!iso) return false;
  const [, mes, dia] = iso.split('-').map(Number);
  const hoje = partesHoje();
  return hoje.mes === mes && hoje.dia === dia;
}

function clienteMinimo(cpf, cliente) {
  return {
    cpf,
    primeiroNome: String(cliente.nome || '').trim().split(/\s+/)[0] || 'Cliente',
    almocos: Number(cliente.almocos || 0),
    registradoHoje: registradoHoje(cliente),
    aniversarioHoje: aniversarioHoje(cliente.nascimento),
    descontoDisponivel: Number(cliente.almocos || 0) >= 10
  };
}

async function enfileirarAviso(db, unidade, cliente) {
  const quantidade = Number(cliente.almocos || 0);
  if (quantidade <= 0 || quantidade > 10 || !cliente.telefone) return;
  const primeiroNome = String(cliente.nome || '').trim().split(/\s+/)[0] || 'Cliente';
  let texto;
  let tipo;
  if (quantidade === 10) {
    const snap = await db.ref(`lojas/${unidade}/config/mensagens/premio`).get();
    texto = String(snap.val() || 'Parabéns [Nome]! Você completou 10 almoços. Na sua próxima visita você poderá utilizar um desconto de R$ 50,00.')
      .replace(/\[Nome\]/g, primeiroNome).replace(/\[Acumulados\]/g, quantidade);
    tipo = 'premio';
  } else {
    const faltam = 10 - quantidade;
    texto = `Olá *${primeiroNome}*, seu almoço de hoje foi contabilizado no Top Haus! 🍽️\nVocê tem *${quantidade} almoço(s)* acumulados.\nFaltam apenas *${faltam}* para você conquistar o seu *Desconto de R$ 50,00*!`;
    tipo = 'acumulo';
  }
  const chave = createHash('sha256').update(`${unidade}|totem|${tipo}|${cliente.cpf}|${hojeISO()}`).digest('hex');
  const ref = db.ref(`lojas/${unidade}/fila_mensagens/${chave}`);
  await ref.transaction(atual => atual || {
    cpf: cliente.cpf,
    telefone: somenteDigitos(cliente.telefone),
    texto,
    timestamp: Date.now(),
    status: 'pendente',
    origem: 'totem',
    tipo,
    dedupeKey: `${unidade}|totem|${tipo}|${cliente.cpf}|${hojeISO()}`
  });
}

async function consultar(db, unidade, cpf) {
  const snap = await db.ref(`lojas/${unidade}/clientes/${cpf}`).get();
  const cliente = snap.val();
  if (!cliente || cliente.arquivado) return { existe: false };
  return { existe: true, cliente: clienteMinimo(cpf, cliente) };
}

async function cadastrar(db, unidade, cpf, dados) {
  const nome = nomePadronizado(dados.nome);
  const nascimento = nascimentoISO(dados.nascimento);
  const telefone = somenteDigitos(dados.telefone);
  if (!nome || !nascimento || !/^\d{10,11}$/.test(telefone)) {
    throw Object.assign(new Error('Dados cadastrais inválidos.'), { status: 400, codigo: 'dados_invalidos' });
  }

  const ref = db.ref(`lojas/${unidade}/clientes/${cpf}`);
  let gravado;
  const resultado = await ref.transaction(atual => {
    if (atual && !atual.arquivado) return;
    gravado = {
      cpf, nome, nascimento, telefone, almocos: 1, premiosResgatados: 0,
      historico: [rotuloVisita()], origemCadastro: 'Totem',
      dataCadastro: new Intl.DateTimeFormat('pt-BR', { timeZone: TZ }).format(new Date()),
      ultimaVisitaTimestamp: Date.now(), arquivado: false
    };
    return gravado;
  });
  if (!resultado.committed) throw Object.assign(new Error('Cliente já cadastrado.'), { status: 409, codigo: 'cliente_existente' });
  await enfileirarAviso(db, unidade, gravado);
  return clienteMinimo(cpf, gravado);
}

// Uma transação pode receber null antes de o SDK conhecer o estado remoto.
// Manter o listener (não apenas get/once) preserva o cache até o commit.
export async function transacaoComEstadoCarregado(ref, atualizar, limiteMs = 8000) {
  let aoCarregar;
  let temporizador;
  try {
    await new Promise((resolve, reject) => {
      aoCarregar = () => resolve();
      temporizador = setTimeout(() => reject(Object.assign(
        new Error('Consulta demorou além do esperado. Tente novamente.'),
        { status: 503, codigo: 'consulta_timeout' }
      )), limiteMs);
      ref.on('value', aoCarregar, reject);
    });
    clearTimeout(temporizador);
    return await ref.transaction(atualizar, undefined, false);
  } finally {
    clearTimeout(temporizador);
    if (aoCarregar) ref.off('value', aoCarregar);
  }
}

export async function acumular(db, unidade, cpf) {
  const ref = db.ref(`lojas/${unidade}/clientes/${cpf}`);
  let motivo = '';
  const resultado = await transacaoComEstadoCarregado(ref, atual => {
    motivo = '';
    if (!atual || atual.arquivado) { motivo = 'nao_encontrado'; return; }
    if (registradoHoje(atual)) { motivo = 'ja_registrado'; return; }
    const historico = Array.isArray(atual.historico) ? [...atual.historico] : Object.values(atual.historico || {});
    historico.push(rotuloVisita());
    atual.almocos = Number(atual.almocos || 0) + 1;
    atual.historico = historico.slice(-100);
    atual.ultimaVisitaTimestamp = Date.now();
    if (atual.almocos > 0 && atual.almocos % 10 === 0) {
      const conquistas = Array.isArray(atual.historicoConquistas) ? [...atual.historicoConquistas] : Object.values(atual.historicoConquistas || {});
      conquistas.push(new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date()));
      atual.historicoConquistas = conquistas.slice(-100);
    }
    return atual;
  });
  if (!resultado.committed) {
    const codigo = motivo || 'conflito';
    throw Object.assign(new Error(codigo === 'ja_registrado' ? 'Almoço já registrado hoje.' : 'Cliente não encontrado.'), { status: codigo === 'ja_registrado' ? 409 : 404, codigo });
  }
  const cliente = resultado.snapshot.val();
  await enfileirarAviso(db, unidade, cliente);
  return clienteMinimo(cpf, cliente);
}

export default async (request) => {
  const rejeicao = somentePost(request);
  if (rejeicao) return rejeicao;
  try {
    const corpo = await lerJson(request);
    const unidade = String(corpo.unidade || '');
    const cpf = somenteDigitos(corpo.cpf);
    if (!UNIDADES.has(unidade) || !cpfValido(cpf)) {
      return json(400, { ok: false, codigo: 'dados_invalidos', erro: 'Unidade ou CPF inválido.' });
    }
    const db = bancoAdmin();
    let resposta;
    if (corpo.acao === 'consultar') resposta = await consultar(db, unidade, cpf);
    else if (corpo.acao === 'cadastrar') resposta = { existe: true, cliente: await cadastrar(db, unidade, cpf, corpo) };
    else if (corpo.acao === 'acumular') resposta = { existe: true, cliente: await acumular(db, unidade, cpf) };
    else return json(400, { ok: false, codigo: 'acao_invalida', erro: 'Ação inválida.' });
    return json(200, { ok: true, ...resposta });
  } catch (erro) {
    console.error('Falha na operação do totem:', erro.message);
    return json(erro.status || 500, {
      ok: false,
      codigo: erro.codigo || 'erro_interno',
      erro: erro.status && erro.status < 500 ? erro.message : 'Não foi possível concluir. Tente novamente.'
    });
  }
};

export const config = { path: '/api/totem/cliente' };

