# Robô do WhatsApp

Esta é a versão controlada do robô usada junto do painel de fidelidade.

Arquivos locais obrigatórios que não devem ser enviados ao GitHub:

- `chave-firebase.json`: conta de serviço do Firebase;
- `config.js`: deve informar `unidade`, `nome` e, opcionalmente, `timezone`;
- `.wwebjs_auth/`: sessão local do WhatsApp.

A rotina de campanhas roda a cada minuto. Inativos e aniversariantes rodam às 15h no fuso da unidade. As duas rotinas possuem travas independentes, para que uma campanha demorada às 15h não impeça a verificação diária.

Antes do teste real, use um cliente de teste e confirme o telefone e a unidade. O envio real nunca deve ser iniciado com toda a base sem uma validação controlada.

