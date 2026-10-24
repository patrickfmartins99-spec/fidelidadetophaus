import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const [painel, auth, navegacao] = await Promise.all([
  readFile(new URL('../fragments/dashboard.html', import.meta.url), 'utf8'),
  readFile(new URL('../auth.js', import.meta.url), 'utf8'),
  readFile(new URL('../dashboard.js', import.meta.url), 'utf8')
]);

test('painel usa logotipo original e preserva uma única ação por identificador', () => {
  assert.match(painel, /src="\.\/logo\.jpg"/);
  for (const id of [
    'btn-aba-admin', 'btn-aba-caixa', 'btn-aba-relatorios',
    'btn-gerenciar-acessos', 'btn-auditoria', 'btn-lixeira',
    'btn-mesclar', 'btn-trocar-unidade', 'btn-ativar-simulacao',
    'btn-zerar-banco', 'painel-conteudo', 'painel-clientes'
  ]) {
    assert.equal([...painel.matchAll(new RegExp(`id="${id}"`, 'g'))].length, 1, `${id} deve ser único`);
  }
});

test('navegação móvel e lateral respeitam as permissões existentes', () => {
  assert.match(painel, /id="painel-sidebar"/);
  assert.match(painel, /id="btn-mobile-admin"/);
  assert.match(painel, /id="btn-mobile-caixa"/);
  assert.match(auth, /btn-mobile-admin'\)\?\.classList\.toggle\('hidden', !permissoes\.dashboard\)/);
  assert.match(auth, /btn-mobile-caixa'\)\?\.classList\.toggle\('hidden', !permissoes\.caixa\)/);
  assert.match(auth, /btn-nav-marketing'\)/);
  assert.match(navegacao, /window\.fecharMenuPainel\(\)/);
  assert.match(navegacao, /menu\.inert = window\.innerWidth < 1024/);
});
