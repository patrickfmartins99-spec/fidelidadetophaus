import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { usernameValido } from '../netlify/functions/admin-usuario.mjs';

const [auth, firebase, acesso, modal] = await Promise.all([
  readFile(new URL('../auth.js', import.meta.url), 'utf8'),
  readFile(new URL('../firebase.js', import.meta.url), 'utf8'),
  readFile(new URL('../fragments/access.html', import.meta.url), 'utf8'),
  readFile(new URL('../fragments/admin-modals.html', import.meta.url), 'utf8')
]);

test('login móvel desativa correção e identifica os campos ao gerenciador de senhas', () => {
  assert.match(acesso, /id="login-user"[^>]+autocomplete="username"[^>]+autocapitalize="none"[^>]+autocorrect="off"/);
  assert.match(acesso, /id="login-senha"[^>]+autocomplete="current-password"[^>]+autocapitalize="none"/);
  assert.match(acesso, /onclick="trocarUnidadeNoLogin\(\)"/);
});

test('login trata unidade sem acesso e não concede perfil genérico a conta órfã', () => {
  assert.match(auth, /auth\/sem-acesso-unidade/);
  assert.match(auth, /PERFIS_LEGADOS\[username\]/);
  assert.doesNotMatch(auth, /username === 'admin' \? 'admin' : 'caixa'/);
});

test('persistência possui alternativas para navegadores móveis restritivos', () => {
  assert.match(firebase, /browserLocalPersistence/);
  assert.match(firebase, /browserSessionPersistence/);
  assert.match(firebase, /inMemoryPersistence/);
  assert.match(auth, /configurarPersistenciaLogin/);
});

test('cadastro rejeita nomes incompatíveis com chaves do Realtime Database', () => {
  assert.equal(usernameValido('caixa2'), true);
  assert.equal(usernameValido('matheus.s'), false);
  assert.equal(usernameValido('nome com espaço'), false);
  assert.match(modal, /pattern="\[a-zA-Z0-9_-\]\{3,40\}"/);
});

test('gestão de acesso usa função administrativa autenticada', () => {
  assert.match(auth, /authorization: `Bearer \$\{token\}`/);
  assert.match(auth, /\/api\/admin\/usuario/);
  assert.doesNotMatch(auth, /firebaseCreateUser/);
});
