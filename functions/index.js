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

function brazilClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short"
  }).formatToParts(now).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday),
    dayOfMonth: Number(parts.day),
    month: Number(parts.month)
  };
}

function brazilDate(now = new Date()) {
  return brazilClock(now).date;
}

function campaignRunKey(campaign, clock) {
  const schedule = campaign.horario || campaign.configRecorrencia?.horario || "09:00";
  const match = /^(\d{2}):(\d{2})$/.exec(schedule);
  if (!match) return null;
  const scheduledMinutes = Number(match[1]) * 60 + Number(match[2]);
  // Não dispara campanhas atrasadas horas depois; a tolerância cobre atrasos do agendador.
  if (clock.minutes < scheduledMinutes || clock.minutes > scheduledMinutes + 5) return null;

  if (campaign.tipo === "unica") {
    return campaign.data === clock.date ? `${clock.date}T${schedule}` : null;
  }
  const config = campaign.configRecorrencia || {};
  if (campaign.frequencia === "diaria") return `${clock.date}T${schedule}`;
  if (campaign.frequencia === "semanal" && (config.diasSemana || []).includes(clock.weekday)) return `${clock.date}T${schedule}`;
  if (campaign.frequencia === "mensal" && Number(config.diaMes) === clock.dayOfMonth) return `${clock.date}T${schedule}`;
  if (campaign.frequencia === "anual") {
    const [day, month] = String(config.diaAno || "").split("/").map(Number);
    return day === clock.dayOfMonth && month === clock.month ? `${clock.date}T${schedule}` : null;
  }
  if (campaign.frequencia === "data_especifica" && config.dataEspecifica === clock.date) return `${clock.date}T${schedule}`;
  return null;
}

function firstName(name) {
  return String(name || "Cliente").trim().split(/\s+/)[0];
}

function totemError(message, code = "failed-precondition") {
  throw new HttpsError(code, message);
}

function requireStaff(request, unit) {
  const role = request.auth?.token?.role;
  const assignedUnit = request.auth?.token?.unit;
  if (!request.auth || (role !== "admin" && !(role === "gerente" && assignedUnit === unit))) {
    throw new HttpsError("permission-denied", "Ação restrita à gestão desta unidade.");
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
  const { unit, campaignId, runKey, recipients } = request.data || {};
  assertUnit(unit);
  requireStaff(request, unit);
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

exports.enqueueDirectMessage = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Faça login para enviar mensagens.");
  const { unit, cpf, telefone, texto } = request.data || {};
  assertUnit(unit);
  const cleanCpf = onlyDigits(cpf);
  if (!validCpf(cleanCpf) || !validPhone(telefone) || !String(texto || "").trim()) {
    throw new HttpsError("invalid-argument", "Mensagem incompleta.");
  }
  const idempotencyKey = `manual-${request.auth.uid}-${Date.now()}-${cleanCpf}`;
  await db.ref(`lojas/${unit}/fila_mensagens/${idempotencyKey}`).set({
    cpf: cleanCpf, telefone: onlyDigits(telefone), texto: String(texto),
    status: "pendente", idempotencyKey, criadoEm: admin.database.ServerValue.TIMESTAMP
  });
  return { idempotencyKey };
});

exports.dispatchDueCampaigns = onSchedule({ schedule: "every 1 minutes", timeZone: "America/Sao_Paulo" }, async () => {
  const clock = brazilClock();
  for (const unit of UNITS) {
    const campaignsRef = db.ref(`lojas/${unit}/config/mensagens/agendadas`);
    const snapshot = await campaignsRef.get();
    const campaigns = snapshot.val() || {};

    for (const [storageKey, campaign] of Object.entries(campaigns)) {
      const runKey = campaignRunKey(campaign, clock);
      if (!runKey || campaign.status !== "ativa") continue;

      const claim = await campaignsRef.child(storageKey).transaction((current) => {
        if (!current || current.status !== "ativa" || current.lastRunKey === runKey) return;
        return {
          ...current,
          id: current.id || `legacy-${storageKey}`,
          lastRunKey: runKey,
          ultimoDisparo: admin.database.ServerValue.TIMESTAMP
        };
      });
      if (!claim.committed) continue;

      const activeCampaign = claim.snapshot.val();
      const clients = (await db.ref(`lojas/${unit}/clientes`).get()).val() || {};
      const updates = {};
      let queued = 0;
      for (const [cpf, client] of Object.entries(clients)) {
        if (client.arquivado || !validPhone(client.telefone)) continue;
        const idempotencyKey = `${activeCampaign.id}:${runKey}:${cpf}`;
        updates[`lojas/${unit}/fila_mensagens/${idempotencyKey}`] = {
          campaignId: activeCampaign.id,
          runKey,
          cpf,
          telefone: onlyDigits(client.telefone),
          texto: String(activeCampaign.texto || "")
            .replace(/\[Nome\]/g, firstName(client.nome))
            .replace(/\[Acumulados\]/g, String(client.almocos || 0)),
          status: "pendente",
          idempotencyKey,
          criadoEm: admin.database.ServerValue.TIMESTAMP
        };
        queued += 1;
      }
      await db.ref().update(updates);
      await db.ref(`lojas/${unit}/auditoria`).push({
        tipo: "Campanha Automática",
        timestamp: admin.database.ServerValue.TIMESTAMP,
        detalhes: `Campanha ${activeCampaign.id} enfileirada para ${queued} destinatários.`,
        campaignId: activeCampaign.id,
        runKey,
        queued
      });
    }
  }
});
