import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { acumular } from '../netlify/functions/totem-cliente.mjs';

const codigoPainel = await readFile(new URL('../marketing.js', import.meta.url), 'utf8');

for (const [unidade, quantidade] of [['navegantes', 1], ['picarras', 9]]) {
  test(`${unidade}: caixa e totem enviam a mesma mensagem após ${quantidade} almoço(s)`, async () => {
    const cpf = 'cliente-teste';
    const cliente = { cpf, nome: 'Ana Silva', telefone: '47999999999', almocos: quantidade - 1 };
    let textoTotem;
    const db = {
      ref(caminho) {
        if (caminho === `lojas/${unidade}/clientes/${cpf}`) return {
          on(_evento, callback) { queueMicrotask(callback); },
          off() {},
          async transaction(atualizar) {
            const novo = atualizar({ ...cliente });
            return { committed: true, snapshot: { val: () => novo } };
          }
        };
        if (caminho.startsWith(`lojas/${unidade}/fila_mensagens/`)) return {
          async transaction(atualizar) { textoTotem = atualizar(null).texto; }
        };
        throw new Error(`Caminho inesperado: ${caminho}`);
      }
    };
    await acumular(db, unidade, cpf);

    let textoCaixa;
    const contexto = { console, window: {} };
    vm.runInNewContext(codigoPainel, contexto);
    contexto.window.enviarParaFilaRobo = (_cpf, _telefone, texto) => { textoCaixa = texto; };
    contexto.window.checarEAvisarAlmoco({ ...cliente, almocos: quantidade });

    assert.equal(textoCaixa, textoTotem);
    assert.match(textoCaixa, /Que bom receber você hoje/);
    assert.match(textoCaixa, new RegExp(`${quantidade} de 10 almoços`));
    assert.match(textoCaixa, quantidade === 9 ? /Falta \*1 almoço\*/ : /Faltam \*9 almoços\*/);
    assert.match(textoCaixa, /R\$ 50 de desconto.*próxima visita/);
  });
}
