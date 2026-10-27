import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const [painel, acesso, auth, navegacao, relatorios, totem, visual, index, build, bootstrap, modais, marketing] = await Promise.all([
  readFile(new URL('../fragments/dashboard.html', import.meta.url), 'utf8'),
  readFile(new URL('../fragments/access.html', import.meta.url), 'utf8'),
  readFile(new URL('../auth.js', import.meta.url), 'utf8'),
  readFile(new URL('../dashboard.js', import.meta.url), 'utf8'),
  readFile(new URL('../relatorios.js', import.meta.url), 'utf8'),
  readFile(new URL('../fragments/totem.html', import.meta.url), 'utf8'),
  readFile(new URL('../design-system.css', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../bootstrap.js', import.meta.url), 'utf8'),
  readFile(new URL('../fragments/admin-modals.html', import.meta.url), 'utf8'),
  readFile(new URL('../marketing.js', import.meta.url), 'utf8')
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
  assert.match(navegacao, /const nomes = \['caixa', 'admin', 'clientes', 'resgates', 'marketing', 'relatorios', 'auditoria', 'gestao', 'mais'\]/);
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

test('pranchas possuem seções reais, navegação móvel e folha incluída no build', () => {
  for (const id of ['aba-resgates', 'aba-marketing', 'aba-auditoria', 'aba-gestao', 'aba-mais']) {
    assert.match(painel, new RegExp(`id="${id}"`));
  }
  for (const id of ['btn-mobile-admin', 'btn-mobile-caixa', 'btn-mobile-clientes', 'btn-mobile-mais']) {
    assert.match(painel, new RegExp(`id="${id}"`));
  }
  assert.match(index, /design-system\.css/);
  assert.match(build, /'design-system\.css'/);
  assert.match(bootstrap, /window\.lucide\?\.createIcons\(\);/, 'os ícones devem ser iniciados depois de carregar os fragmentos');
  assert.match(visual, /\.dashboard-insights \{ grid-template-columns:/);
  assert.match(visual, /\.dashboard-mobile-nav/);
  assert.doesNotMatch(visual.split('/* Autoatendimento:')[0], /gradient\(/, 'o painel e o acesso desta etapa não utilizam degradês');
  assert.match(visual, /#painel-sidebar \{[^}]*background: #000/);
  assert.match(visual, /\.access-form-brand \{[^}]*background: #000/);
});

test('totem preserva teclado nativo, logo original e QR por unidade', () => {
  assert.match(totem, /src="\.\/logo\.jpg"/);
  assert.match(totem, /id="totem-unidade-nome"/);
  assert.match(totem, /id="totem-cpf"[^>]*inputmode="numeric"|inputmode="numeric"[^>]*id="totem-cpf"/);
  assert.match(visual, /totem-native-keyboard-open/);
  assert.doesNotMatch(totem, /teclado-virtual|virtual-keyboard/);
});

test('refinamento mantém acesso preto e formulário de marketing sem alterar contratos', () => {
  assert.match(visual, /\.access-form-panel \{[^}]*background: #000/);
  assert.match(visual, /#tela-login > \.access-login-shell \{[^}]*background: #000/);
  assert.match(visual, /#application-fragments \[id\^="modal-"\]/);
  assert.match(modais, /class="marketing-campaign-section/);
  assert.match(modais, /id="mkt-agenda-texto"/);
  assert.match(modais, /onclick="salvarCentralMarketing\(\)"/);
  for (const id of ['mkt-novo-tipo', 'mkt-novo-titulo', 'mkt-nova-data', 'mkt-novo-horario-unica', 'mkt-nova-freq', 'mkt-novo-horario-rec']) {
    assert.match(marketing, new RegExp(`id="${id}"`));
  }
});

test('login compacto não corta campos e logotipo da barra lateral fica centralizado', () => {
  assert.match(visual, /\.dashboard-brand \{[^}]*align-items: center/);
  assert.match(visual, /\.dashboard-brand-logo \{[^}]*object-position: center/);
  assert.match(visual, /#tela-login \{[^}]*overflow-y: auto/);
  assert.match(visual, /#tela-login \.access-login-shell \{[^}]*min-height: 0/);
  assert.match(visual, /#tela-login \.access-form-panel \{[^}]*min-height: 0/);
  assert.match(visual, /@media \(max-width: 640px\) and \(max-height: 720px\)/);
});
