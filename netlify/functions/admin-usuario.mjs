import { autenticacaoAdmin, bancoAdmin } from './_shared/firebase-admin.mjs';
import { json, lerJson, somentePost } from './_shared/http.mjs';

const UNIDADES = new Set(['navegantes', 'picarras']);
const CARGOS = new Set(['caixa', 'gerente', 'admin']);
const PERMISSOES = ['dashboard', 'caixa', 'clientes', 'marketing', 'auditoria', 'simulacao', 'reset', 'usuarios', 'totem', 'configuracoes'];

export function usernameValido(valor) {
  return /^[a-z0-9_-]{3,40}$/.test(String(valor || '').trim().toLowerCase());
}

function permissoesSeguras(valor) {
  return Object.fromEntries(PERMISSOES.map(chave => [chave, valor?.[chave] === true]));
}

function tokenDaRequisicao(request) {
  const cabecalho = String(request.headers.get('authorization') || '');
  const correspondencia = cabecalho.match(/^Bearer\s+(.+)$/i);
  if (!correspondencia) throw Object.assign(new Error('Sessão ausente.'), { status: 401, codigo: 'sessao_ausente' });
  return correspondencia[1];
}

async function exigirGestor(request, unidade, db, auth) {
  let sessao;
  try {
    sessao = await auth.verifyIdToken(tokenDaRequisicao(request), true);
  } catch {
    throw Object.assign(new Error('Sessão inválida ou expirada.'), { status: 401, codigo: 'sessao_invalida' });
  }
  const email = String(sessao.email || '').toLowerCase();
  if (!email.endsWith('@tophaus.com.br')) {
    throw Object.assign(new Error('Acesso negado.'), { status: 403, codigo: 'acesso_negado' });
  }
  if (email === 'admin@tophaus.com.br') return sessao;

  const username = email.slice(0, -'@tophaus.com.br'.length);
  const perfilUnidade = (await db.ref(`lojas/${unidade}/usuarios/${username}`).get()).val();
  const perfil = perfilUnidade || (await db.ref(`usuarios/${username}`).get()).val();
  if (!perfil || (!['admin', 'gerente'].includes(perfil.cargo) && perfil.permissoes?.usuarios !== true)) {
    throw Object.assign(new Error('Seu perfil não pode gerenciar usuários nesta unidade.'), { status: 403, codigo: 'acesso_negado' });
  }
  return sessao;
}

async function localizarConta(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (erro) {
    if (erro.code === 'auth/user-not-found') return null;
    throw erro;
  }
}

export default async (request) => {
  const rejeicao = somentePost(request);
  if (rejeicao) return rejeicao;

  try {
    const corpo = await lerJson(request, 12_000);
    const unidade = String(corpo.unidade || '');
    const acao = String(corpo.acao || '');
    const username = String(corpo.username || '').trim().toLowerCase();
    if (!UNIDADES.has(unidade) || !usernameValido(username)) {
      return json(400, { ok: false, codigo: 'dados_invalidos', erro: 'Unidade ou nome de usuário inválido.' });
    }

    const db = bancoAdmin();
    const auth = autenticacaoAdmin();
    const gestor = await exigirGestor(request, unidade, db, auth);
    const email = `${username}@tophaus.com.br`;
    const perfilRef = db.ref(`lojas/${unidade}/usuarios/${username}`);

    if (acao === 'redefinir_senha') {
      const senha = String(corpo.senha || '');
      if (senha.length < 6 || senha.length > 128) {
        return json(400, { ok: false, codigo: 'senha_invalida', erro: 'A senha precisa ter entre 6 e 128 caracteres.' });
      }
      const possuiPerfilUnidade = (await perfilRef.get()).exists();
      const possuiPerfilLegado = (await db.ref(`usuarios/${username}`).get()).exists();
      if (!possuiPerfilUnidade && !possuiPerfilLegado && email !== 'admin@tophaus.com.br') {
        return json(404, { ok: false, codigo: 'sem_acesso_unidade', erro: 'Esse usuário não pertence à unidade selecionada.' });
      }
      const conta = await localizarConta(auth, email);
      if (!conta) return json(404, { ok: false, codigo: 'usuario_nao_encontrado', erro: 'Conta de autenticação não encontrada.' });
      await auth.updateUser(conta.uid, { password: senha, disabled: false });
      await db.ref(`lojas/${unidade}/auditoria`).push({
        acao: 'Gestão de Acessos', detalhes: `Senha de '${username}' redefinida.`,
        usuario: gestor.email, timestamp: Date.now()
      });
      return json(200, { ok: true });
    }

    const cargo = String(corpo.cargo || '');
    if (!CARGOS.has(cargo)) {
      return json(400, { ok: false, codigo: 'cargo_invalido', erro: 'Perfil de acesso inválido.' });
    }
    const perfil = { cargo, permissoes: permissoesSeguras(corpo.permissoes) };
    const contaExistente = await localizarConta(auth, email);

    if (acao === 'vincular') {
      if (!contaExistente) return json(404, { ok: false, codigo: 'usuario_nao_encontrado', erro: 'A conta informada não existe.' });
      await perfilRef.set(perfil);
      return json(200, { ok: true, vinculada: true });
    }

    if (acao !== 'criar') {
      return json(400, { ok: false, codigo: 'acao_invalida', erro: 'Ação inválida.' });
    }
    const senha = String(corpo.senha || '');
    if (senha.length < 6 || senha.length > 128) {
      return json(400, { ok: false, codigo: 'senha_invalida', erro: 'A senha precisa ter entre 6 e 128 caracteres.' });
    }
    if (contaExistente) {
      return json(409, { ok: false, codigo: 'usuario_existente', erro: 'Esse usuário já possui uma conta.' });
    }

    const contaCriada = await auth.createUser({ email, password: senha, disabled: false });
    try {
      await perfilRef.set(perfil);
    } catch (erro) {
      await auth.deleteUser(contaCriada.uid).catch(() => {});
      throw erro;
    }
    return json(201, { ok: true, criada: true });
  } catch (erro) {
    console.error('Falha na gestão de usuário:', erro.code || erro.message);
    return json(erro.status || 500, {
      ok: false,
      codigo: erro.codigo || 'erro_interno',
      erro: erro.status && erro.status < 500 ? erro.message : 'Não foi possível concluir a gestão do usuário.'
    });
  }
};

export const config = { path: '/api/admin/usuario' };
