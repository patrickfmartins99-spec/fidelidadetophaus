import test from 'node:test';
import assert from 'node:assert/strict';
import { acumular, transacaoComEstadoCarregado } from '../netlify/functions/totem-cliente.mjs';

// Banco em memória: o estado remoto existe, mas o cache começa vazio.
// Nenhuma credencial, requisição externa ou mensagem real é utilizada.
function bancoTeste(cliente, { erroLeitura, erroTransacao, conflito, semResposta = false } = {}) {
  let remoto = structuredClone(cliente);
  let cacheCarregado = false;
  let listener;
  const estado = { gravacoes: 0, transacoes: 0, removidos: 0, caminhos: [] };
  const ref = {
    on(evento, callback, cancelar) {
      assert.equal(evento, 'value');
      listener = callback;
      if (semResposta) return callback;
      queueMicrotask(() => {
        if (erroLeitura) return cancelar(erroLeitura);
        cacheCarregado = true;
        callback({ val: () => structuredClone(remoto) });
      });
      return callback;
    },
    off(evento, callback) {
      assert.equal(callback, listener);
      estado.removidos++;
      listener = null;
      cacheCarregado = false;
    },
    async transaction(atualizar, callback, aplicarLocalmente) {
      estado.transacoes++;
      assert.equal(aplicarLocalmente, false);
      assert.ok(listener, 'A leitura deve continuar ativa durante a transação');
      if (erroTransacao) throw erroTransacao;
      let proximo = atualizar(cacheCarregado ? structuredClone(remoto) : null);
      if (conflito && proximo !== undefined) {
        remoto = { ...remoto, ultimaVisitaTimestamp: Date.now(), almocos: Number(remoto.almocos) + 1 };
        proximo = atualizar(structuredClone(remoto));
      }
      if (proximo !== undefined) {
        remoto = structuredClone(proximo);
        estado.gravacoes++;
      }
      return { committed: proximo !== undefined, snapshot: { val: () => structuredClone(remoto) } };
    }
  };
  return { estado, ref, cliente: () => structuredClone(remoto), db: { ref(caminho) { estado.caminhos.push(caminho); return ref; } } };
}

const clienteAntigo = () => ({ cpf: 'teste-local', nome: 'Cliente Teste', almocos: 3,
  premiosResgatados: 2, historico: ['01/01/2025 às 12:00'],
  historicoResgates: [{ dataResgate: '01/01/2025', datas: [] }], nascimento: '2000-01-01' });

for (const unidade of ['navegantes', 'picarras']) {
  test(`${unidade}: registra cliente existente com cache inicialmente vazio`, async () => {
    const b = bancoTeste(clienteAntigo());
    const resultado = await acumular(b.db, unidade, 'teste-local');
    assert.equal(resultado.almocos, 4);
    assert.equal(resultado.registradoHoje, true);
    assert.equal(b.estado.gravacoes, 1);
    assert.equal(b.estado.removidos, 1);
    assert.deepEqual(b.estado.caminhos, [`lojas/${unidade}/clientes/teste-local`]);
    assert.equal(b.cliente().historico.length, 2);
    assert.deepEqual(b.cliente().historicoResgates, clienteAntigo().historicoResgates);
    assert.equal(b.cliente().premiosResgatados, 2);
    await assert.rejects(acumular(b.db, unidade, 'teste-local'), { codigo: 'ja_registrado', status: 409 });
    assert.equal(b.estado.gravacoes, 1, 'Repetir o pedido não pode duplicar o almoço');
    assert.equal(b.estado.removidos, 2);
  });
}

test('cliente ausente ou arquivado não é criado nem modificado pelo acúmulo', async () => {
  for (const cliente of [null, { ...clienteAntigo(), arquivado: true }]) {
    const b = bancoTeste(cliente);
    await assert.rejects(acumular(b.db, 'navegantes', 'teste-local'), { codigo: 'nao_encontrado', status: 404 });
    assert.equal(b.estado.gravacoes, 0);
    assert.deepEqual(b.cliente(), cliente);
    assert.equal(b.estado.removidos, 1);
  }
});

test('conflito com um almoço concorrente mantém a proteção contra duplicação', async () => {
  const b = bancoTeste(clienteAntigo(), { conflito: true });
  await assert.rejects(acumular(b.db, 'picarras', 'teste-local'), { codigo: 'ja_registrado', status: 409 });
  assert.equal(b.estado.gravacoes, 0);
  assert.equal(b.cliente().almocos, 4);
  assert.equal(b.estado.removidos, 1);
});

test('falha de leitura não inicia transação e sempre remove a leitura ativa', async () => {
  const b = bancoTeste(clienteAntigo(), { erroLeitura: new Error('leitura_negada') });
  await assert.rejects(acumular(b.db, 'navegantes', 'teste-local'), /leitura_negada/);
  assert.equal(b.estado.transacoes, 0);
  assert.equal(b.estado.removidos, 1);
});

test('falha na transação também remove a leitura ativa', async () => {
  const b = bancoTeste(clienteAntigo(), { erroTransacao: new Error('conexao_perdida') });
  await assert.rejects(acumular(b.db, 'navegantes', 'teste-local'), /conexao_perdida/);
  assert.equal(b.estado.gravacoes, 0);
  assert.equal(b.estado.removidos, 1);
});

test('leitura sem resposta termina com erro controlado, sem gravar', async () => {
  const b = bancoTeste(clienteAntigo(), { semResposta: true });
  await assert.rejects(transacaoComEstadoCarregado(b.ref, () => ({}), 10), { codigo: 'consulta_timeout', status: 503 });
  assert.equal(b.estado.transacoes, 0);
  assert.equal(b.estado.removidos, 1);
});

