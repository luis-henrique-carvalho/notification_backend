# Arquitetura Orientada a Eventos no Sistema de Notificações

## Introdução
Esta documentação explica a abordagem baseada em eventos utilizada para integrar os microserviços, com foco no `notification-service` e sua comunicação com o Gateway através do RabbitMQ.

## Request-Response vs Fire-and-Forget
No NestJS com RabbitMQ, utilizamos dois padrões principais de comunicação:

1. **Request-Response (`@MessagePattern`)**:
   - Usado para ações que necessitam de confirmação ou de retorno de dados do microserviço.
   - O Client ("Gateway") envia uma mensagem e aguarda a resposta. Exemplo: Criar notificação, listar notificações (`notification.create`, `notification.findAll`).
   - O `notification-service` processa o pedido e através do RabbitMQ (RPC) devolve um resultado ou um erro legível para o cliente da requisição original.

2. **Fire-and-Forget (`@EventPattern`)**:
   - Usado para sinais de que "um evento aconteceu", em que o microserviço emissor não depende da resposta imediata para continuar operando.
   - Exemplo: Após criar a notificação e persistir os dados do destinatário, o `notification-service` faz um `this.gatewayClient.emit('notification.created', payload)`.
   - O processo do `notification-service` acaba ali, sem bloquear.
   - O Gateway assina esse evento via `@EventPattern('notification.created')` e apenas repassa os dados recebidos via WebSocket/Socket.IO (Push Notification Real-time) para os front-ends conectados.

## Emissão de Eventos do Notification-Service para o Gateway
O `notification-service` importa o `ClientsModule` e registra uma conexão chamada `GATEWAY_SERVICE` apontando para a fila `gateway_queue`.
Sempre que uma notificação é criada (no método `create`), os seguintes passos ocorrem:
1. Os dados da "Notificação" e do "Destinatário" são persistidos no PostgreSQL (via Drizzle).
2. É construído um DTO único consolidado com o status lido/não lido.
3. Utilizando o `gatewayClient.emit(NOTIFICATION_EVENTS.CREATED, response)`, o RabbitMQ envia um evento assíncrono à fila do Gateway.

## Padrões de Event Sourcing Simplificado
O sistema registra ações chave de mudança de estado, em vez de apenas alterar o dado no banco sem reflexo no ecossistema:
- O frontend confirma o recebimento (`acknowledge`) -> `notification-events.controller` capta essa finalização de ciclo e atualiza para garantirmos status transacionais.
- Todos os serviços interessados numa notificação podem inscrever-se no evento através das queues.

## Garantia de Idempotência
A lógica de `acknowledge` e entrega (`delivery`) no serviço de notificações é idempotente. Se múltiplos eventos de "delivered" ou múltiplas chamadas de `markRead` / `acknowledge` ocorrerem (ex: cliques acidentais rápidos no cliente mobile, ou retry do RabbitMQ), o `WHERE clause` das operações no banco de dados garantem que o timestamp atrelado ou status seja atualizado apenas caso não tenha avançado para uma fase final de processamento, evitando assim anomalias na contagem `unreadCount`.
