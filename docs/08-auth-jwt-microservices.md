# Autenticação JWT em Arquitetura de Microserviços

Este documento explica os padrões e decisões adotadas para implementar a autenticação JWT centralizada no API Gateway e sua comunicação com os serviços internos.

## Por que o Gateway centraliza a autenticação?

Em uma arquitetura de microserviços, centralizar a autenticação no **API Gateway** oferece várias vantagens:
1. **Ponto único de entrada**: Todos os clientes (web, mobile, desktop) se conectam ao Gateway, que atua como uma fachada de segurança.
2. **Redução de overhead**: Os microserviços internos (como `Notification` ou outros) não precisam validar a assinatura do JWT individualmente a cada requisição. O gateway já faz isso e pode repassar as informações do usuário logado via payload ou headers.
3. **Desacoplamento de chaves secretas**: A chave secreta do JWT (`JWT_SECRET`) só precisa ser conhecida pelo Gateway e, possivelmente, pelo serviço emissor (se for diferente). Os serviços de recurso (resource services) não precisam conhecer essa chave.

## Padrão Estratégia (Passport)

O NestJS usa a biblioteca `passport` para facilitar a autenticação. A `JwtStrategy` (em `jwt.strategy.ts`) funciona como um interceptor que:
1. Extrai o token do cabeçalho `Authorization: Bearer <token>`.
2. Verifica sua assinatura e expiração.
3. Decodifica o payload.
4. O retorno do método `validate()` (ex: `{ id, email, role }`) é anexado ao objeto `request.user` do express, tornando-se disponível nos controllers.

## Guards Globais e Exceções (`@Public()`)

Para garantir que a segurança seja _default_, registramos a `JwtAuthGuard` globalmente no `GatewayModule` (usando `APP_GUARD`). Isso significa que todas as rotas do Gateway necessitam de um token JWT válido para serem acessadas.

Para rotas públicas, como de login (`/auth/login`) ou registro (`/auth/register`), utilizamos um decorador customizado `@Public()`. Ele anexa um metadado `isPublic` àquela rota. A `JwtAuthGuard` intercepta as requisições, checa com o injetor `Reflector` se a rota atual possui esse metadado. Se possuir, ela ignora a validação do token e permite o acesso.

## Controle de Acesso Baseado em Perfis (RBAC) com `@Roles()`

Além da autenticação (saber quem o usuário é), precisamos de **autorização** (saber o que o usuário pode fazer). Para isso implementamos a `RolesGuard`.
1. Em rotas que exigem um perfil específico, usamos o decorador `@Roles(Role.ADMIN, Role.USER)`.
2. A guarda lê esse metadado.
3. Verifica se a propriedade `role` contida em `request.user` (preenchida pela JwtStrategy) consta na lista de roles permitidas.
4. Caso sim, permite a continuação; caso contrário, lança um erro `403 Forbidden`.

## Fluxo do Token: Gateway → Serviços Internos

Como a segurança está concentrada no gateway, a comunicação entre o gateway e os microserviços internos (geralmente via RabbitMQ, TCP, ou gRPC) é considerada uma rede confiável dentro do cluster.

1. **Client** envia requisição REST com token JWT.
2. **Gateway** intercepta, recusa caso seja inválido. Caso válido, popula `req.user`.
3. Para criar um recurso interno protegido, o Gateway emite uma mensagem pelo Message Broker (RabbitMQ no nosso caso).
4. O Gateway anexa implicitamente o ID do usuário como parte do Payload enviado na mensagem RPC, garantindo que o downstream (por exemplo, `Notification Service`) saiba *quem* está solicitando a ação sem precisar enviar o JWT inteiro ou decodificá-lo de novo. Exemplo: `this.notificationClient.send('create_notification', { ...dto, userId: req.user.id })`.

Isso mantém os microserviços downstream rápidos, leves, focados na lógica de negócios e agnósticos ao tipo de autenticação original.
