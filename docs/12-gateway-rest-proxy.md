# 12. Gateway — Notification REST Endpoints

Este documento aborda o papel do Gateway como proxy REST no ecossistema do NestJS, explicando como ele atua na borda da arquitetura e traduz chamadas HTTP externas para requisições assíncronas via RabbitMQ.

## 1. O Papel do Gateway como Proxy REST

Numa arquitetura onde os microserviços operam estritamente como consumidores/produtores RabbitMQ, o API Gateway atua como a única porta de entrada HTTP da aplicação.
Suas principais responsabilidades são:
- Receber as chamadas REST (HTTP GET, POST, PATCH, etc.) de clientes externos (App, Web, Desktop).
- Extrair tokens, rate limits, headers, entre outros dados inerentes ao protocolo HTTP.
- Mapear a rota HTTP correspondente para a Fila do microserviço correto.

Ter o Gateway como única borda HTTP reduz a superfície de ataque expondo uma interface unificada, enquanto os microserviços ficam ocultos na rede privada comunicando-se unicamente pelo Broker (RMQ).

## 2. Tradução HTTP para RMQ (`clientProxy.send()`)

Dentro de um Controller do Gateway, a classe `ClientProxy` (instanciada através de `ClientsModule.register()`) é injetada.

Para métodos que demandam uma resposta síncrona aos olhos do cliente web, utilizamos `clientProxy.send()`:
```typescript
@Get()
findAll(@Query('page') page: number) {
    // Translates the REST GET call mapping to the Pattern 'notification.findAll'
    return this.notificationClient.send(NOTIFICATION_PATTERNS.FIND_ALL, { page });
}
```
Sob os panos, o NestJS gera um identificador único de correlação (Correlation-ID), cria uma call na Queue de destino, e escuta transitoriamente numa Reply Queue exclusiva até que o Microserviço envie a resposta de volta ao Gateway. Ele resolve a Promessa local transformando a reposta RPC novamente para um payload HTTP.

## 3. Padrões de API Design para Notificações

Foram implementados padrões REST convencionais aplicados ao domínio de notificações.
- `GET /notifications` e `GET /notifications/unread-count`: Retornam dados específicos de leitura, o segundo agindo como um sub-recurso dedicado para poling/badges otimizados.
- `POST /notifications` (admin): Cria o recurso primário na base dados e aciona downstream actions.
- `PATCH /notifications/:id/read`: Uma rota de atualização parcial especializada, projetada para ser idempotente (marcá-la como lida inúmeras vezes afeta a base dados apenas uma).
- `POST /notifications/:id/acknowledge`: Operação que reflete uma ação de negócio ("Estou ciente disto"), logo mapeada como `POST` indicando de fato uma submissão de estado ou consentimento.

## 4. Propagação do Contexto do Usuário (Auth)

Para manter os microserviços acoplados de forma leve e fáceis de testar (sem injeção de Headers e JWT validadores nativos), o Gateway faz a parte "pesada" do Auth.
A verificação final preenche o Payload da request localmente e, apenas as chaves indispensáveis da Identidade (como o `userId` em formato UUID puro) são enxertadas (merged) na interface de Message Broker.

```typescript
@Post()
create(@Body() dto: CreateNotificationDto, @CurrentUser() user: any) {
    // Gateway Auth extracts identity from JWT
    // Service Payload consumes pure data, totally decoupled from web layers
    return this.notificationClient.send(NOTIFICATION_PATTERNS.CREATE, {
        ...dto,
        senderId: user.id, // Auth propogation boundary
    });
}
```
Dessa forma, os microserviços (que implementam apenas lógica de domínio puro) confiam plenamente no `senderId`/`userId` oriundo do evento, consolidando assim o Gateway como uma barreira segura de Zero Trust entre web client e backend.
