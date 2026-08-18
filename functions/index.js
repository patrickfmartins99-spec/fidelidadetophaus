"use strict";

const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ region: "southamerica-east1", maxInstances: 10 });

const db = admin.database();
const UNITS = new Set(["navegantes", "picarras"]);
const PARTICLES = new Set(["da", "das", "de", "do", "dos", "e"]);

function assertUnit(unit) {
  if (!UNITS.has(unit)) throw new HttpsError("invalid-argument", "Unidade inválida.");
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function validCpf(cpf) {
  cpf = onlyDigits(cpf);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length) => {
    let sum = 0;
    for (let i = 0; i < length - 1; i += 1) sum += Number(cpf[i]) * (length - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(10) === Number(cpf[9]) && digit(11) === Number(cpf[10]);
}

function validPhone(phone) {
  return /^\d{10,11}$/.test(onlyDigits(phone));
}

function validBirthDate(value) {
  const date = String(value || "");
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : /^\d{2}\/\d{2}\/\d{4}$/.test(date)
      ? `${date.slice(6)}-${date.slice(3, 5)}-${date.slice(0, 2)}`
      : "";
  if (!iso) return false;
  const parsed = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === iso;
}

function normalizeName(value) {
  const words = String(value || "").trim().toLocaleLowerCase("pt-BR").split(/\s+/);
  if (words.length < 2 || words.some((word) => !/^[\p{L}'’-]+$/u.test(word))) {
    throw new HttpsError("invalid-argument", "Informe nome e sobrenome usando apenas letras.");
  }
  return words.map((word, index) => {
    if (index > 0 && PARTICLES.has(word)) return word;
    return word.split(/(['’-])/).map((part) => {
      if (/['’-]/.test(part)) return part;
      return part ? part[0].toLocaleUpperCase("pt-BR") + part.slice(1) : part;
    }).join("");
  }).join(" ");
}

function brazilDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(now);
}

function firstName(name) {
  return String(name || "Cliente").trim().split(/\s+/)[0];
}

function totemError(message, code = "failed-precondition") {
  throw new HttpsError(code, message);
}

function requireStaff(request) {
  const role = request.auth?.token?.role;
  if (!request.auth || !["admin", "gerente"].includes(role)) {
    throw new HttpsError("permission-denied", "Ação restrita à gestão.");
  }
}

exports.lookupTotemClient = onCall({ enforceAppCheck: true }, async (request) => {
  const { unit, cpf } = request.data || {};
  assertUnit(unit);
  const cleanCpf = onlyDigits(cpf);
  if (!validCpf(cleanCpf)) totemError("CPF inválido.", "invalid-argument");

  const snapshot = await db.ref(`lojas/${unit}/clientes/${cleanCpf}`).get();
  if (!snapshot.exists() || snapshot.val().arquivado) return { found: false };

  const client = snapshot.val();
  const today = brazilDate();
  const lastVisit = client.ultimaVisitaTimestamp ? brazilDate(new Date(client.ultimaVisitaTimestamp)) : null;
  return {
    found: true,
    firstName: firstName(client.nome),
    alreadyCheckedIn: lastVisit === today,
    rewardAvailable: Number(client.almocos || 0) >= 10
  };
});

exports.registerTotemClient = onCall({ enforceAppCheck: true }, async (request) => {
  const { unit, cpf, nome, nascimento, telefone } = request.data || {};
  assertUnit(unit);
  const cleanCpf = onlyDigits(cpf);
  if (!validCpf(cleanCpf)) totemError("CPF inválido.", "invalid-argument");
  if (!validBirthDate(nascimento)) totemError("Data de nascimento inválida.", "invalid-argument");
  if (!validPhone(telefone)) totemError("Telefone inválido.", "invalid-argument");

  const birth = String(nascimento).includes("/")
    ? `${String(nascimento).slice(6)}-${String(nascimento).slice(3, 5)}-${String(nascimento).slice(0, 2)}`
    : nascimento;
  const client = {
    cpf: cleanCpf,
    nome: normalizeName(nome),
    nascimento: birth,
    telefone: onlyDigits(telefone),
    almocos: 1,
    premiosResgatados: 0,
    historico: [`${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`],
    origemCadastro: "Totem",
    dataCadastro: new Date().toLocaleDateString("pt-BR"),
    ultimaVisitaTimestamp: admin.database.ServerValue.TIMESTAMP,
    arquivado: false
  };

  const result = await db.ref(`lojas/${unit}/clientes/${cleanCpf}`).transaction((current) => {
    if (current) return;
    return client;
  });
  if (!result.committed) totemError("Este CPF já está cadastrado.", "already-exists");

  await db.ref(`lojas/${unit}/auditoria`).push({
    tipo: "Cadastro (Totem)",
    timestamp: admin.database.ServerValue.TIMESTAMP,
    detalhes: "Cadastro realizado pelo totem."
  });
  return { firstName: firstName(client.nome), birthdayToday: birth.slice(5) === brazilDate().slice(5) };
});

exports.checkInTotemClient = onCall({ enforceAppCheck: true }, async (request) => {
  const { unit, cpf, action = "accumulate" } = request.data || {};
  assertUnit(unit);
  const cleanCpf = onlyDigits(cpf);
  if (!validCpf(cleanCpf)) totemError("CPF inválido.", "invalid-argument");
  if (!["accumulate", "redeem"].includes(action)) totemError("Ação inválida.", "invalid-argument");

  let response;
  const ref = db.ref(`lojas/${unit}/clientes/${cleanCpf}`);
  const result = await ref.transaction((client) => {
    if (!client || client.arquivado) return;
    const today = brazilDate();
    const lastVisit = client.ultimaVisitaTimestamp ? brazilDate(new Date(client.ultimaVisitaTimestamp)) : null;
    if (lastVisit === today) {
      response = { state: "already_checked_in", firstName: firstName(client.nome) };
      return;
    }
    if (action === "redeem") {
      if (Number(client.almocos || 0) < 10) {
        response = { state: "reward_unavailable", firstName: firstName(client.nome) };
        return;
      }
      client.almocos -= 10;
      client.premiosResgatados = Number(client.premiosResgatados || 0) + 1;
      response = { state: "reward_redeemed", firstName: firstName(client.nome) };
    } else {
      client.almocos = Number(client.almocos || 0) + 1;
      client.historico = Array.isArray(client.historico) ? client.historico : [];
      client.historico.unshift(`${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
      client.historico = client.historico.slice(0, 50);
      response = {
        state: client.almocos % 10 === 0 ? "reward_earned" : "checked_in",
        firstName: firstName(client.nome),
        lunches: client.almocos
      };
    }
    client.ultimaVisitaTimestamp = admin.database.ServerValue.TIMESTAMP;
    return client;
  });
  if (!result.committed) {
    if (response) return response;
    totemError("Cliente não encontrado.");
  }
  return response;
});

exports.enqueueCampaign = onCall({ enforceAppCheck: true }, async (request) => {
  requireStaff(request);
  const { unit, campaignId, runKey, recipients } = request.data || {};
  assertUnit(unit);
  if (!campaignId || !runKey || !Array.isArray(recipients)) {
    throw new HttpsError("invalid-argument", "Campanha incompleta.");
  }
  const updates = {};
  for (const recipient of recipients) {
    const cpf = onlyDigits(recipient.cpf);
    if (!validCpf(cpf) || !validPhone(recipient.telefone) || !recipient.texto) continue;
    const idempotencyKey = `${campaignId}:${runKey}:${cpf}`;
    updates[`lojas/${unit}/fila_mensagens/${idempotencyKey}`] = {
      campaignId, runKey, cpf, telefone: onlyDigits(recipient.telefone),
      texto: String(recipient.texto), status: "pendente",
      idempotencyKey, criadoEm: admin.database.ServerValue.TIMESTAMP
    };
  }
  await db.ref().update(updates);
  return { queued: Object.keys(updates).length };
});

exports.dispatchDueCampaigns = onSchedule({ schedule: "every 1 minutes", timeZone: "America/Sao_Paulo" }, async () => {
  // A execução efetiva será habilitada após o robô de WhatsApp adotar idempotencyKey.
  // Esta trava evita que uma implantação parcial envie mensagens em duplicidade.
  console.log("Dispatcher aguardando integração do robô de WhatsApp.");
});
