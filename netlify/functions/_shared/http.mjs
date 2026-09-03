export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

export async function lerJson(request, limite = 8_000) {
  const tamanho = Number(request.headers.get('content-length') || 0);
  if (tamanho > limite) throw Object.assign(new Error('Requisição muito grande.'), { status: 413 });
  const texto = await request.text();
  if (texto.length > limite) throw Object.assign(new Error('Requisição muito grande.'), { status: 413 });
  try {
    return JSON.parse(texto || '{}');
  } catch {
    throw Object.assign(new Error('Dados inválidos.'), { status: 400 });
  }
}

export function somentePost(request) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, erro: 'Método não permitido.' });
  }
  return null;
}

