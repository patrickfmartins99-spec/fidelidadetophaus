import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../auth.js', import.meta.url), 'utf8');
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

function harness({ unidade = 'navegantes', perfil = { cargo: 'caixa' } } = {}) {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) {
            const classes = new Set(['hidden']);
            elements.set(id, { value: '', disabled: false, innerText: '', classList: {
                add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value)
            }});
        }
        return elements.get(id);
    };
    element('login-user').value = 'caixa2';
    element('login-senha').value = 'senha-ficticia';
    const values = new Map([['unidadeAtiva', unidade]]);
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    const timers = new Map();
    const h = { toasts: [], paths: [], shown: 0, starts: 0, signouts: 0, requests: [] };
    const user = { uid: 'uid-teste', email: 'caixa2@tophaus.com.br', getIdToken: async () => 'token-ficticio' };
    const w = {
        localStorage: storage, sessionStorage: storage,
        auth: { currentUser: null, authStateReady: async () => {} },
        firebaseApp: { options: { databaseURL: 'https://teste.firebaseio.com' } }, db: {},
        firebaseOnAuthStateChanged: (_, callback) => { h.observer = callback; },
        firebaseRef: (_, path) => { h.paths.push(path); return path; },
        firebaseGet: async () => ({ exists: () => perfil !== null, val: () => perfil }),
        firebaseSignIn: async () => { w.auth.currentUser = user; await h.observer(user); return { user }; },
        firebaseSignOut: async () => { h.signouts++; w.auth.currentUser = null; await h.observer(null); },
        mostrarToast: (message) => h.toasts.push(message),
        iniciarListenersProtegidos: () => h.starts++, pararListenersProtegidos: () => {},
        location: { reload() {} }
    };
    const context = vm.createContext({ window: w, document: { getElementById: element }, console: { warn() {} },
        setInterval() {}, setTimeout: (fn, ms) => { const id = {}; timers.set(id, { fn, ms }); return id; },
        clearTimeout: id => timers.delete(id), AbortController,
        fetch: async (url, options) => { h.requests.push({ url, options }); return { ok: true, status: 200, json: async () => perfil }; }
    });
    vm.runInContext(source, context);
    w.aplicarRegrasNaInterface = () => h.shown++;
    h.start = () => w.iniciarObservadorSessao();
    h.login = () => w.fazerLogin({ preventDefault() {} });
    h.timeout = async ms => {
        const entry = [...timers.values()].find(timer => timer.ms === ms);
        assert.ok(entry, `timer ${ms} existente`);
        entry.fn(); await flush();
    };
    return Object.assign(h, { w, context, user, element, values });
}

for (const unidade of ['navegantes', 'picarras']) {
    test(`login conclui e lê somente o perfil de ${unidade}`, async () => {
        const h = harness({ unidade }); h.start(); await h.login();
        assert.equal(h.shown, 1); assert.equal(h.starts, 1);
        assert.equal(h.w.cargoLogado, 'caixa');
        assert.deepEqual(h.paths, [`lojas/${unidade}/usuarios/caixa2`]);
        assert.equal(h.element('btn-login').disabled, false);
        assert.equal(h.element('login-senha').value, '');
    });
}

test('observador só inicia explicitamente depois dos módulos', async () => {
    const h = harness(); assert.equal(h.observer, undefined);
    h.start(); const callback = h.observer; h.start(); assert.equal(h.observer, callback);
    h.w.auth.currentUser = h.user; await h.observer(h.user); assert.equal(h.shown, 1);
    const bootstrap = await readFile(new URL('../bootstrap.js', import.meta.url), 'utf8');
    assert.ok(bootstrap.indexOf('window.iniciarObservadorSessao()') > bootstrap.indexOf("import('./relatorios.js')"));
});

test('novo login substitui timestamp expirado antes de validar o perfil', async () => {
    const h = harness(); h.start(); h.values.set('loginTimestamp', String(Date.now() - 13 * 3600000));
    await h.login(); assert.equal(h.shown, 1); assert.equal(h.signouts, 0);
});

test('restauração de sessão expirada não abre painel', async () => {
    const h = harness(); h.start(); h.w.auth.currentUser = h.user;
    h.values.set('loginTimestamp', String(Date.now() - 13 * 3600000));
    await h.observer(h.user); await flush(); assert.equal(h.shown, 0); assert.equal(h.signouts, 1);
});

test('login não depende de novo evento para usuário já autenticado', async () => {
    const h = harness(); h.start(); h.w.auth.currentUser = h.user;
    h.w.firebaseSignIn = async () => ({ user: h.user });
    await h.login(); assert.equal(h.shown, 1);
    await h.observer(h.user); assert.equal(h.shown, 1);
});

test('perfil ausente não recebe acesso genérico', async () => {
    const h = harness({ perfil: null }); h.start(); await h.login(); await flush();
    assert.equal(h.shown, 0); assert.equal(h.w.usuarioLogado, null);
    assert.match(h.toasts[0], /não possui acesso/);
});

test('negação de permissão não usa leitura alternativa', async () => {
    const h = harness(); h.start(); h.w.firebaseGet = async () => { throw { code: 'PERMISSION_DENIED' }; };
    await h.login(); assert.equal(h.requests.length, 0); assert.equal(h.shown, 0);
    assert.match(h.toasts[0], /não possui acesso/);
});

test('perfil travado usa REST autenticado, sem cache e limitado à unidade', async () => {
    const h = harness(); h.start(); h.w.firebaseGet = () => new Promise(() => {});
    const login = h.login(); await flush(); await h.timeout(8000); await login;
    assert.equal(h.shown, 1); assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].url, 'https://teste.firebaseio.com/lojas/navegantes/usuarios/caixa2.json?auth=token-ficticio');
    assert.equal(h.requests[0].options.cache, 'no-store');
});

test('falha também no REST libera botão sem conceder acesso', async () => {
    const h = harness(); h.start(); h.w.firebaseGet = () => new Promise(() => {});
    h.context.fetch = () => new Promise(() => {});
    const login = h.login(); await flush(); await h.timeout(8000); await h.timeout(10000); await login;
    assert.equal(h.shown, 0); assert.equal(h.element('btn-login').disabled, false);
    assert.match(h.toasts[0], /demorou/);
});

test('SDK lento não autentica depois do timeout e não permite tentativas sobrepostas', async () => {
    const h = harness(); h.start(); const pending = deferred();
    h.w.firebaseSignIn = () => pending.promise;
    const login = h.login(); await flush(); await h.timeout(15000); await login;
    assert.equal(h.element('btn-login').disabled, false); assert.equal(h.shown, 0);
    await h.login(); assert.match(h.toasts.at(-1), /tentativa anterior/);
    h.w.auth.currentUser = h.user; await h.observer(h.user); pending.resolve({ user: h.user }); await flush();
    assert.equal(h.shown, 0); assert.equal(h.w.auth.currentUser, null);
    h.w.firebaseSignIn = async () => { h.w.auth.currentUser = h.user; return { user: h.user }; };
    await h.login(); assert.equal(h.shown, 1);
});

test('inicialização travada não mantém Entrando indefinidamente', async () => {
    const h = harness(); h.start(); h.w.auth.authStateReady = () => new Promise(() => {});
    const login = h.login(); await flush(); await h.timeout(8000); await login;
    assert.equal(h.element('btn-login').disabled, false); assert.equal(h.shown, 0);
});

test('logout durante leitura invalida resultado atrasado', async () => {
    const h = harness(); h.start(); const pending = deferred(); h.w.firebaseGet = () => pending.promise;
    const login = h.login(); await flush(); await h.w.fazerLogout();
    pending.resolve({ exists: () => true, val: () => ({ cargo: 'admin' }) }); await login;
    assert.equal(h.shown, 0); assert.equal(h.w.usuarioLogado, null);
});

test('falha de auditoria não transforma login válido em logout', async () => {
    const h = harness(); h.start(); h.w.logAuditoria = () => { throw new Error('storage bloqueado'); };
    await h.login(); assert.equal(h.shown, 1); assert.equal(h.signouts, 0);
});

test('senha inválida libera botão e permite nova tentativa', async () => {
    const h = harness(); h.start(); h.w.firebaseSignIn = async () => { throw { code: 'auth/invalid-credential' }; };
    await h.login(); await flush(); assert.equal(h.element('btn-login').disabled, false);
    assert.match(h.toasts[0], /senha incorretos/);
    h.w.firebaseSignIn = async () => { h.w.auth.currentUser = h.user; return { user: h.user }; };
    await h.login(); assert.equal(h.shown, 1);
});
