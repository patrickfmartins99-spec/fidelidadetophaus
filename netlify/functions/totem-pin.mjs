import { createHash, timingSafeEqual } from 'node:crypto';
import { json, lerJson, somentePost } from './_shared/http.mjs';
import { obterEnv } from './_shared/firebase-admin.mjs';

const UNIDADES = new Set(['navegantes', 'picarras']);

export function compararHash(valor, esperado) {
  if (!/^[a-f0-9]{64}$/i.test(String(esperado || ''))) return false;
  const recebido = Buffer.from(createHash('sha256').update(String(valor)).digest('hex'), 'utf8');
  const configurado = Buffer.from(String(esperado).toLowerCase(), 'utf8');
  return recebido.length === configurado.length && timingSafeEqual(recebido, configurado);
}

export default async (request) => {
  const rejeicao = somentePost(request);
  if (rejeicao) return rejeicao;

  try {
    const { unidade, pin } = await lerJson(request, 1_000);
    if (!UNIDADES.has(unidade) || !/^\d{4,10}$/.test(String(pin || ''))) {
      return json(401, { ok: false, erro: 'PIN inválido.' });
    }

    const nomeVariavel = `TOTEM_PIN_HASH_${unidade.toUpperCase()}`;
    const hashConfigurado = obterEnv(nomeVariavel);
    if (!hashConfigurado) {
      console.error(`Variável ${nomeVariavel} não configurada.`);
      return json(503, { ok: false, erro: 'Saída administrativa temporariamente indisponível.' });
    }

    if (!compararHash(pin, hashConfigurado)) {
      return json(401, { ok: false, erro: 'PIN inválido.' });
    }
    return json(200, { ok: true });
  } catch (erro) {
    console.error('Falha ao validar saída do totem:', erro.message);
    return json(erro.status || 500, { ok: false, erro: 'Não foi possível validar o PIN.' });
  }
};

export const config = { path: '/api/totem/pin' };

