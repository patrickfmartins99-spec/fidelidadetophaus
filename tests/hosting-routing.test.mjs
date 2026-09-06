import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const [index, bootstrap, serviceWorker, funcaoTotem] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../bootstrap.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/totem-cliente.mjs', import.meta.url), 'utf8')
]);

test('endereço antigo redireciona para o Netlify antes de iniciar o sistema', () => {
  assert.match(index, /patrickfmartins99-spec\.github\.io/);
  assert.match(index, /location\.replace\('https:\/\/tophausfidelidade\.netlify\.app\/'\)/);
  assert.match(index, /bootstrap\.js\?v=20260906-2/);
});

test('aplicativo instalado procura atualizações sem reutilizar cache antigo', () => {
  assert.match(bootstrap, /serviceWorker\.register\('\.\/sw\.js', \{ updateViaCache: 'none' \}\)/);
  assert.match(serviceWorker, /v71-emergency-routing/);
});

test('status do totem valida a unidade sem receber ou devolver CPF', () => {
  assert.match(funcaoTotem, /corpo\.acao === 'status'/);
  assert.match(funcaoTotem, /limitToFirst\(1\)\.get\(\)/);
  assert.match(funcaoTotem, /return \{ disponivel: true, unidade \}/);
});

