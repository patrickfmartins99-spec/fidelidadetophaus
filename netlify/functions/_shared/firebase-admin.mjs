import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

function env(nome) {
  return globalThis.Netlify?.env?.get(nome) ?? process.env[nome];
}

function credenciais() {
  const bruto = env('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!bruto) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON não configurado.');
  const valor = JSON.parse(bruto);
  if (valor.private_key) valor.private_key = valor.private_key.replace(/\\n/g, '\n');
  return valor;
}

export function bancoAdmin() {
  const app = getApps()[0] || initializeApp({
    credential: cert(credenciais()),
    databaseURL: 'https://fidelidadetophausnavega-default-rtdb.firebaseio.com'
  });
  return getDatabase(app);
}

export function obterEnv(nome) {
  return env(nome);
}

