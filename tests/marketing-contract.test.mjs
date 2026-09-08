import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const codigo = await readFile(new URL('../marketing.js', import.meta.url), 'utf8');
let sequencia = 0;
const contexto = {
  console,
  window: {
    crypto: { randomUUID: () => `campanha-teste-${++sequencia}` },
    obterCaminhoUnidade: caminho => `lojas/navegantes/${caminho}`
  }
};
vm.runInNewContext(codigo, contexto);

test('marketing sempre usa a configuração real monitorada pelo robô', () => {
  contexto.window.isSimulationMode = true;
  assert.equal(
    contexto.window.obterCaminhoMarketingReal(),
    'lojas/navegantes/config/mensagens'
  );
  assert.doesNotMatch(codigo, /firebaseRef\(window\.db, window\.PATH_MENSAGENS\)/);
});

test('campanhas são persistidas por identificador estável, não por posição', () => {
  const mapa = contexto.window.campanhasParaMapa([
    { id: 'promocao-sexta', titulo: 'Sexta' },
    { titulo: 'Sem identificador' }
  ]);
  assert.equal(mapa['promocao-sexta'].titulo, 'Sexta');
  assert.equal(Object.keys(mapa).length, 2);
  assert.ok(Object.values(mapa).every(campanha => campanha.id));
});

test('campanha diária usa o contrato semanal aceito pelo robô', () => {
  const campanha = contexto.window.normalizarCampanhaParaRobo({
    id: 'diaria', tipo: 'recorrente', frequencia: 'diaria',
    configRecorrencia: { horario: '10:30' }
  });
  assert.equal(campanha.frequencia, 'semanal');
  assert.equal(campanha.frequenciaExibicao, 'diaria');
  assert.deepEqual(Array.from(campanha.configRecorrencia.diasSemana), [0, 1, 2, 3, 4, 5, 6]);
});

test('data específica usa o contrato de disparo único aceito pelo robô', () => {
  const campanha = contexto.window.normalizarCampanhaParaRobo({
    id: 'evento', tipo: 'recorrente', frequencia: 'data_especifica',
    configRecorrencia: { dataEspecifica: '2026-09-10', horario: '14:35' }
  });
  assert.equal(campanha.tipo, 'unica');
  assert.equal(campanha.data, '2026-09-10');
  assert.equal(campanha.horario, '14:35');
});

test('salvamento preserva trava e encerramento gravados pelo robô', () => {
  const mesclada = contexto.window.mesclarControlesDoRobo(
    { id: 'campanha', status: 'ativa', titulo: 'Campanha' },
    {
      id: 'campanha', status: 'encerrada', robotCampaignId: 'robo-1',
      execucoes: { '2026-09-08_14-35': { status: 'concluida' } }
    }
  );
  assert.equal(mesclada.status, 'encerrada');
  assert.equal(mesclada.robotCampaignId, 'robo-1');
  assert.equal(mesclada.execucoes['2026-09-08_14-35'].status, 'concluida');
});

