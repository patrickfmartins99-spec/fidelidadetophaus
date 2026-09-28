import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const codigo = await readFile(new URL('../clientes.js', import.meta.url), 'utf8');

function carregarFluxo({ registradoHoje, almocos }) {
  const elementos = new Map();
  const elemento = id => {
    if (!elementos.has(id)) elementos.set(id, {
      id,
      classList: { remove() {}, add() {} },
      disabled: false,
      innerText: '',
      innerHTML: '',
      onclick: null
    });
    return elementos.get(id);
  };
  const chamadas = [];
  const window = {
    jaRegistrouHoje: () => registradoHoje,
    prenderFocoModal: () => chamadas.push('foco'),
    escapeHTML: valor => valor,
    nomeExibicao: valor => valor
  };
  vm.runInNewContext(codigo, { window, document: { getElementById: elemento }, console, setTimeout, clearTimeout, Date, Promise });
  // O restante do módulo também declara essas funções; substituímos somente as
  // ações de borda para observar a decisão tomada pelo fluxo real.
  window.fecharModal = () => chamadas.push('fechar');
  window.efetuarResgateEImprimir = () => chamadas.push('resgatar');
  window.prepararAlmocoAtrasado = () => chamadas.push('extra');
  window.processarConfirmacao = () => chamadas.push('confirmar');
  window.confirmacaoDupla = () => chamadas.push('duplicado');
  window.processarFluxoNormal({ cpf: 'cliente-teste', nome: 'Cliente Teste', almocos });
  return { window, elemento, chamadas };
}

test('oferece resgate antes da trava de almoço duplicado', () => {
  const fluxo = carregarFluxo({ registradoHoje: true, almocos: 11 });
  assert.equal(typeof fluxo.elemento('btn-trava-resgatar').onclick, 'function');
  assert.equal(fluxo.chamadas.includes('duplicado'), false);
  fluxo.elemento('btn-trava-resgatar').onclick();
  assert.equal(fluxo.chamadas.includes('resgatar'), true);
});

test('registrar almoço extra após guardar benefício continua protegido', () => {
  const fluxo = carregarFluxo({ registradoHoje: true, almocos: 10 });
  assert.equal(fluxo.elemento('btn-trava-acumular-text').innerText, 'Guardar benefício e registrar almoço extra');
  fluxo.elemento('btn-trava-acumular').onclick();
  assert.equal(fluxo.chamadas.includes('extra'), true);
  assert.equal(fluxo.chamadas.includes('confirmar'), false);
});

test('sem benefício mantém a confirmação de almoço duplicado', () => {
  const fluxo = carregarFluxo({ registradoHoje: true, almocos: 9 });
  assert.equal(fluxo.chamadas.includes('duplicado'), true);
  assert.equal(fluxo.elemento('btn-trava-resgatar').onclick, null);
});
