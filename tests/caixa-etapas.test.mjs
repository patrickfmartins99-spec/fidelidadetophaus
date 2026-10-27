import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const codigo = (await readFile(new URL('../clientes.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/m, '');

function prepararCaixa() {
  const elementos = new Map();
  const elemento = id => {
    if (!elementos.has(id)) elementos.set(id, {
      id, value: '', textContent: '', innerText: '', innerHTML: '', open: false, disabled: false,
      classList: { estado: new Set(), toggle(nome, ativo) { if (ativo) this.estado.add(nome); else this.estado.delete(nome); }, add(nome) { this.estado.add(nome); }, remove(nome) { this.estado.delete(nome); } }
    });
    return elementos.get(id);
  };
  const cliente = { cpf: '12345678909', nome: 'Ana Oliveira', almocos: 8, historico: [], nascimento: '1990-02-10' };
  const acoes = [];
  const window = {
    addEventListener() {}, clientesMap: { [cliente.cpf]: cliente }, operacoesAtivas: {},
    validarCPFReal: () => true, diasParaAniversario: () => 20, jaRegistrouHoje: () => false,
    nomeExibicao: nome => nome, escaparHTML: texto => texto, escapeHTML: texto => texto,
    limitarHistorico: historico => historico, PATH_CLIENTES: 'lojas/navegantes/clientes',
    firebaseRef: (_, caminho) => caminho, firebaseSet: async () => { acoes.push('gravou'); },
    mostrarToast: () => {}, formatarCPF: cpf => cpf, permissoesLogado: { caixa: true }, cargoLogado: 'caixa'
  };
  vm.runInNewContext(codigo, { window, document: { getElementById: elemento }, Date, Promise, console, setTimeout: () => 0, clearTimeout });
  elemento('busca-cpf').value = cliente.cpf;
  return { window, elemento, cliente, acoes };
}

test('buscar CPF apenas mostra o cliente; registro depende de ação e confirmação separados', () => {
  const { window, elemento, acoes } = prepararCaixa();
  window.buscarEContabilizar();
  assert.equal(elemento('caixa-cliente-nome').textContent, 'Ana Oliveira');
  assert.equal(elemento('caixa-cliente-saldo').textContent, '8 de 10 almoços');
  assert.equal(elemento('caixa-etapa-cliente').classList.estado.has('hidden'), false);
  assert.equal(elemento('caixa-etapa-confirmacao').classList.estado.has('hidden'), true);
  assert.deepEqual(acoes, []);

  window.avancarAtendimentoCaixa();
  assert.equal(elemento('caixa-etapa-confirmacao').classList.estado.has('hidden'), false);
  assert.equal(elemento('caixa-saldo-antes').textContent, '8 de 10');
  assert.equal(elemento('caixa-saldo-depois').textContent, '9 de 10');
  assert.deepEqual(acoes, []);
});

test('sucesso só aparece após gravação confirmada, com saldo atualizado', async () => {
  const { window, elemento, cliente, acoes } = prepararCaixa();
  window.buscarEContabilizar();
  window.avancarAtendimentoCaixa();
  window.confirmarAlmocoCaixa();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(acoes, ['gravou']);
  assert.equal(cliente.almocos, 9);
  assert.equal(elemento('caixa-etapa-sucesso').classList.estado.has('hidden'), false);
  assert.equal(elemento('caixa-sucesso-resumo').textContent, 'Ana Oliveira agora tem 9 almoços no saldo.');
});
