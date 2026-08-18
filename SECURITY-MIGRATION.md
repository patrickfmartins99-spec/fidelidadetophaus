# Migração de segurança e privacidade

Esta alteração remove o acesso direto do navegador a dados pessoais, à fila de mensagens, à auditoria e a contadores. Ela deve ser implantada **junto** com as Cloud Functions desta branch. Publicar apenas as regras bloqueará fluxos existentes.

## Ordem de implantação

1. Faça backup do Realtime Database e valide o ambiente em um projeto Firebase de homologação.
2. Instale e implante `functions/`; as funções usam a conta de serviço e não dependem das regras de cliente.
3. Execute a função administrativa de migração para criar os perfis `usuarios_por_uid` e atribuir as *custom claims* `role` e `unit`.
4. Atualize o frontend desta branch.
5. Publique `database.rules.json`.
6. Em cada totem, configure o Firebase App Check e valide que o fluxo de consulta/cadastro funciona sem sessão de funcionário.
7. Revogue sessões antigas, verifique a auditoria e teste as permissões de caixa, gerente e administrador.

## Princípios aplicados

- CPF, telefone e nome completo não podem ser protegidos de DevTools se forem enviados ao navegador; a aplicação passa a consultar serviços de servidor e recebe apenas a resposta necessária.
- A fila deixa de ser legível ou gravável pelo navegador. O robô de WhatsApp deve usar credenciais de servidor e processar chaves de idempotência.
- Regras usam `auth.uid` e *custom claims*, nunca permissões escondidas apenas na interface.
- A chave de API Firebase no navegador não é segredo; a segurança está nas regras, no App Check e no backend.

## Pendências operacionais

- Habilitar Firebase App Check para o domínio/totem antes de ativar o bloqueio obrigatório.
- Definir o repositório ou credencial de implantação do robô de WhatsApp para adotar a nova fila.
- Revisar a política de privacidade, consentimento de marketing, retenção de dados e processo de descadastro com responsável jurídico/DPO.
