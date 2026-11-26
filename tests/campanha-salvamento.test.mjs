import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const codigo = await readFile(new URL('../marketing.js', import.meta.url), 'utf8');

function preparar(janela = {}) {
  const elementos = Object.fromEntries([
    'mkt-novo-tipo', 'mkt-novo-titulo', 'mkt-nova-data', 'mkt-novo-horario-unica',
    'mkt-agenda-texto', 'mkt-data-especifica', 'btn-mkt-agendar', 'mkt-msg-niver', 'mkt-msg-premio',
    'mkt-msg-inativo', 'btn-limpar-fila', 'modal-marketing'
  ].map(id => [id, { value: '', textContent: '', disabled: false, classList: { remove() {} } }]));
  const contexto = {
    console: { ...console, error() {} },
    document: { getElementById: id => elementos[id], querySelectorAll: () => [] },
    window: {
      crypto: { randomUUID: () => 'campanha-teste' },
      obterCaminhoUnidade: caminho => `lojas/picarras/${caminho}`,
      msgsMarketing: { agendadas: {} },
      ...janela
    }
  };
  vm.runInNewContext(codigo, contexto);
  contexto.window.injetarUICampanhas = () => {};
  contexto.window.renderizarMensagensCustomizadas = () => {};
  contexto.window.iniciarListenerFila = () => {};
  contexto.window.firebaseRef = (_db, caminho) => ({ caminho });
  contexto.window.mostrarToast = () => {};
  elementos['mkt-novo-tipo'].value = 'unica';
  elementos['mkt-novo-titulo'].value = 'Especial de hoje';
  elementos['mkt-nova-data'].value = '2099-11-26';
  elementos['mkt-novo-horario-unica'].value = '15:45';
  elementos['mkt-agenda-texto'].value = 'Mensagem de teste';
  elementos['btn-mkt-agendar'].textContent = 'Agendar e salvar campanha';
  return { contexto, elementos };
}

test('agendar grava na unidade antes de mostrar a campanha como salva', async () => {
  const { contexto, elementos } = preparar();
  let caminhoGravado;
  contexto.window.firebaseRunTransaction = async (ref, atualizar) => {
    caminhoGravado = ref.caminho;
    assert.equal(Object.keys(contexto.window.msgsMarketing.agendadas).length, 0);
    const campanha = atualizar(null);
    return { committed: true, snapshot: { val: () => campanha } };
  };

  await contexto.window.adicionarAgendamento();

  assert.equal(caminhoGravado, 'lojas/picarras/config/mensagens/agendadas/campanha-teste');
  assert.equal(contexto.window.msgsMarketing.agendadas['campanha-teste'].horario, '15:45');
  assert.equal(elementos['mkt-agenda-texto'].value, '');
  assert.equal(elementos['btn-mkt-agendar'].disabled, false);
});

test('falha ao gravar mantém formulário e não exibe campanha fantasma', async () => {
  const { contexto, elementos } = preparar();
  contexto.window.firebaseRunTransaction = async () => { throw new Error('sem conexão'); };

  await contexto.window.adicionarAgendamento();

  assert.equal(Object.keys(contexto.window.msgsMarketing.agendadas).length, 0);
  assert.equal(elementos['mkt-agenda-texto'].value, 'Mensagem de teste');
  assert.equal(elementos['btn-mkt-agendar'].disabled, false);
});

test('disparo único no passado não é salvo nem enviado com atraso', async () => {
  const { contexto, elementos } = preparar();
  elementos['mkt-nova-data'].value = '2000-01-01';
  let tentouGravar = false;
  contexto.window.firebaseRunTransaction = async () => { tentouGravar = true; };

  await contexto.window.adicionarAgendamento();

  assert.equal(tentouGravar, false);
  assert.equal(elementos['mkt-agenda-texto'].value, 'Mensagem de teste');
});

test('reabrir a central substitui campanhas locais pelo estado real do Firebase', async () => {
  const { contexto } = preparar({ msgsMarketing: { agendadas: { fantasma: { id: 'fantasma' } } } });
  contexto.window.firebaseGet = async () => ({ val: () => ({}) });

  await contexto.window.abrirCentralMarketing();

  assert.equal(Object.keys(contexto.window.msgsMarketing.agendadas).length, 0);
});
