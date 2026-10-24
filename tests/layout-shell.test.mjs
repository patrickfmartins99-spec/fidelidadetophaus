import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const [painel, acesso, auth, navegacao, relatorios] = await Promise.all([
  readFile(new URL('../fragments/dashboard.html', import.meta.url), 'utf8'),
  readFile(new URL('../fragments/access.html', import.meta.url), 'utf8'),
  readFile(new URL('../auth.js', import.meta.url), 'utf8'),
  readFile(new URL('../dashboard.js', import.meta.url), 'utf8'),
  readFile(new URL('../relatorios.js', import.meta.url), 'utf8')
]);

test('painel usa logotipo original e preserva uma única ação por identificador', () => {
  assert.match(painel, /src="\.\/logo\.jpg"/);
  for (const id of [
    'btn-aba-admin', 'btn-aba-caixa', 'btn-aba-relatorios',
    'btn-gerenciar-acessos', 'btn-auditoria', 'btn-lixeira',
    'btn-mesclar', 'btn-trocar-unidade', 'btn-ativar-simulacao',
    'btn-zerar-banco', 'painel-conteudo', 'painel-clientes',
    'aba-admin', 'aba-clientes', 'aba-caixa', 'overview-novos',
    'overview-almocos', 'overview-resgates', 'overview-disponiveis'
  ]) {
    assert.equal([...painel.matchAll(new RegExp(`id="${id}"`, 'g'))].length, 1, `${id} deve ser único`);
  }
});

test('navegação móvel e lateral respeitam as permissões existentes', () => {
  assert.match(painel, /id="painel-sidebar"/);
  assert.match(painel, /id="btn-mobile-admin"/);
  assert.match(painel, /id="btn-mobile-caixa"/);
  assert.match(painel, /id="btn-mobile-clientes"/);
  assert.doesNotMatch(painel, /id="btn-mobile-relatorios"/);
  assert.match(auth, /btn-mobile-admin'\)\?\.classList\.toggle\('hidden', !permissoes\.dashboard\)/);
  assert.match(auth, /btn-mobile-caixa'\)\?\.classList\.toggle\('hidden', !permissoes\.caixa\)/);
  assert.match(auth, /btn-mobile-clientes'\)\?\.classList\.toggle\('hidden', !permissoes\.dashboard\)/);
  assert.match(auth, /btn-nav-marketing'\)/);
  assert.match(navegacao, /window\.fecharMenuPainel\(\)/);
  assert.match(navegacao, /menu\.inert = window\.innerWidth < 1024/);
  assert.match(navegacao, /const nomes = \['caixa', 'admin', 'clientes', 'relatorios'\]/);
});

test('entrada e visão geral usam estrutura própria e cálculos existentes', () => {
  assert.match(acesso, /class="access-login-shell"/);
  assert.match(acesso, /class="access-unit-shell"/);
  assert.match(acesso, /src="\.\/logo\.jpg"/);
  assert.match(painel, /id="dashboard-atalho-caixa"/);
  assert.match(painel, /id="overview-fluxo"/);
  assert.match(painel, /id="overview-frequencia"/);
  assert.match(relatorios, /const diario = calcularRelatorioDiario\(clientes, hoje\)/);
  assert.match(relatorios, /const analise = calcularAnaliseFrequencia\(clientes, dataLocalParaUtc\(hoje\)\)/);
});
