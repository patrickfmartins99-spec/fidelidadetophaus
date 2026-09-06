import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const [dashboard, core, auth, serviceWorker] = await Promise.all([
  readFile(new URL('../dashboard.js', import.meta.url), 'utf8'),
  readFile(new URL('../core.js', import.meta.url), 'utf8'),
  readFile(new URL('../auth.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8')
]);

test('modo de simulação não persiste entre sessões do painel', () => {
  assert.match(dashboard, /localStorage\.removeItem\('modoSimulacao'\)/);
  assert.match(dashboard, /sessionStorage\.getItem\('modoSimulacao'\)/);
  assert.doesNotMatch(dashboard, /localStorage\.getItem\('modoSimulacao'\)/);
  assert.match(core, /sessionStorage\.setItem\('modoSimulacao', 'true'\)/);
  assert.match(auth, /sessionStorage\.removeItem\('modoSimulacao'\)/);
});

test('painel possui recuperação de sincronização ao voltar à internet ou à tela', () => {
  assert.match(dashboard, /window\.sincronizarClientesAgora = async/);
  assert.match(dashboard, /window\.addEventListener\('online'/);
  assert.match(dashboard, /document\.addEventListener\('visibilitychange'/);
  assert.match(dashboard, /window\.aplicarSnapshotClientes/);
});

test('arquivos críticos usam rede primeiro para não manter painel antigo em cache', () => {
  assert.match(serviceWorker, /v70-dashboard-sync/);
  assert.match(serviceWorker, /isCriticalAppFile/);
  assert.match(serviceWorker, /url\.pathname\.endsWith\('\.js'\)/);
});

