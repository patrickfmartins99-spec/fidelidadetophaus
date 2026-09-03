import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compararHash } from '../netlify/functions/totem-pin.mjs';
import {
  aniversarioHoje,
  cpfValido,
  nascimentoISO,
  nomePadronizado,
  registradoHoje
} from '../netlify/functions/totem-cliente.mjs';

assert.equal(cpfValido('529.982.247-25'), true);
assert.equal(cpfValido('111.111.111-11'), false);
assert.equal(cpfValido('123'), false);

assert.equal(nomePadronizado('pATRICK  MARTINS'), 'Patrick Martins');
assert.equal(nomePadronizado('MARIA DA silva'), 'Maria da Silva');
assert.equal(nomePadronizado('Nome123 Inválido'), '');

assert.equal(nascimentoISO('31/02/2000'), '');
assert.equal(nascimentoISO('2000-02-29'), '2000-02-29');
assert.equal(nascimentoISO('29/02/2001'), '');

const hashCorreto = createHash('sha256').update('987654').digest('hex');
assert.equal(compararHash('987654', hashCorreto), true);
assert.equal(compararHash('987653', hashCorreto), false);
assert.equal(compararHash('987654', 'valor-invalido'), false);

assert.equal(registradoHoje({ ultimaVisitaTimestamp: Date.now() }), true);
assert.equal(registradoHoje({ ultimaVisitaTimestamp: Date.now() - 3 * 86400000 }), false);

const hoje = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo', month: '2-digit', day: '2-digit'
}).formatToParts(new Date()).reduce((acc, item) => ({ ...acc, [item.type]: item.value }), {});
assert.equal(aniversarioHoje(`2000-${hoje.month}-${hoje.day}`), true);

console.log('Testes de segurança e regras do totem concluídos.');

