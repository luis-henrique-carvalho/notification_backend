# 03 — Docker Compose & RabbitMQ: Orquestrando a Infraestrutura Local

## O que você vai aprender

- Por que precisamos de um **message broker** em arquiteturas de microserviços
- Como o **RabbitMQ** funciona: exchanges, queues e bindings
- Como o **Docker Compose** orquestra PostgreSQL + RabbitMQ localmente
- Como o NestJS se conecta ao RabbitMQ como transport layer

---

## 1. Por que um Message Broker?

Em uma arquitetura monolítica, serviços se comunicam por chamadas de função diretas. Em microserviços, processos distintos precisam trocar informações **sem acoplamento direto**. Chamadas HTTP síncronas criam dependência temporal: se o serviço B cair, a chamada do serviço A falha imediatamente.

Um **message broker** resolve isso atuando como intermediário:

```
Producer (user-service)  →  [Broker: RabbitMQ]  →  Consumer (gateway)
```

- O **producer** publica uma mensagem e segue em frente
- O **broker** armazena e entrega a mensagem quando o consumer estiver disponível
- O **consumer** processa no seu próprio ritmo

### Benefícios

| Problema sem broker | Solução com broker |
|---------------------|--------------------|
| Dependência temporal: B precisa estar online quando A chama | Desacoplamento temporal: mensagem fica na fila até B processar |
| Se B cai, A falha | Durabilidade: mensagem não se perde se B reiniciar |
| A precisa saber o endereço IP/porta de B | A só conhece a fila, não o endereço de B |
| Escalabilidade difícil | Múltiplos consumers na mesma fila = balanceamento automático |

---

## 2. Conceitos Fundamentais do RabbitMQ

### 2.1 Exchange

O **exchange** é o ponto de entrada de mensagens. Producers publicam em exchanges, nunca diretamente em queues.

```
Producer → Exchange → (routing) → Queue → Consumer
```

**Tipos de exchange:**

| Tipo | Comportamento |
|------|---------------|
| `direct` | Entrega à queue com routing key exata |
| `fanout` | Entrega para TODAS as queues vinculadas (broadcast) |
| `topic` | Routing key com wildcards (`user.*`, `*.created`) |
| `headers` | Roteamento por atributos do header |

No NestJS com `Transport.RMQ`, o padrão é uma exchange `direct` implícita chamada `amq.direct`.

### 2.2 Queue

A **queue** é onde as mensagens ficam armazenadas até serem consumidas.

```typescript
// apps/user-service/src/main.ts
const app = await NestFactory.createMicroservice<MicroserviceOptions>(
  AppModule,
  {
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL],
      queue: 'user_queue',        // ← nome da queue
      queueOptions: {
        durable: true,            // ← sobrevive ao restart do RabbitMQ
      },
    },
  },
);
```

**`durable: true`** é essencial em produção: a queue persiste no disco, então mensagens não são perdidas se o RabbitMQ reiniciar.

### 2.3 Binding

O **binding** é a ligação entre uma exchange e uma queue, com uma routing key.

```
Exchange: amq.direct
    │
    ├── Binding: routing_key="user_queue"   → Queue: user_queue
    └── Binding: routing_key="notif_queue" → Queue: notification_queue
```

Quando um producer publica com `routing_key=user_queue`, apenas a `user_queue` recebe a mensagem.

### 2.4 Message Patterns no NestJS

O NestJS abstrai dois modelos de comunicação sobre o AMQP:

#### `@MessagePattern` — Request-Response

```typescript
// Consumer (user-service)
@MessagePattern(USER_PATTERNS.FIND_BY_ID)
async findById(id: string) {
  return this.userService.findById(id);
}

// Producer (gateway)
const user = await firstValueFrom(
  this.userClient.send(USER_PATTERNS.FIND_BY_ID, userId)
);
```

- O producer **espera** pela resposta
- O NestJS cria uma **reply queue** temporária para correlacionar resposta/requisição
- Ideal para consultas (GET equivalente)

#### `@EventPattern` — Fire-and-Forget

```typescript
// Consumer (gateway) - ouve evento emitido pelo notification-service
@EventPattern('notification.created')
async handleNotificationCreated(data: NotificationCreatedEvent) {
  this.wsGateway.emit(data.userId, data);
}

// Producer (notification-service)
this.gatewayClient.emit('notification.created', payload);
```

- O producer **não espera** resposta
- Ideal para side effects, eventos de domínio (notificações, logs, webhooks)

---

## 3. O Docker Compose Como Orquestrador Local

O `docker-compose.yml` define os serviços de infraestrutura que nossos microserviços NestJS dependem:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"          # host:container
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    ports:
      - "5672:5672"          # AMQP (mensagens)
      - "15672:15672"        # Management UI (browser)
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
```

### Portas importantes

| Porta | Protocolo | Uso |
|-------|-----------|-----|
| `5432` | TCP | Conexão PostgreSQL (drivers de banco) |
| `5672` | AMQP | Conexão RabbitMQ (producers e consumers) |
| `15672` | HTTP | RabbitMQ Management UI (monitoramento) |

### Management UI

Com os containers rodando, acesse `http://localhost:15672` com as credenciais do `.env`. Você pode:

- Visualizar queues e mensagens acumuladas
- Inspecionar exchanges e bindings
- Publicar mensagens manualmente para testes
- Monitorar taxa de consumo em tempo real

### Networks

```yaml
networks:
  notification-network:
    driver: bridge
```

Todos os containers compartilham a mesma rede interna. Dentro dos containers, eles se comunicam por nome (`notification-postgres`, `notification-rabbitmq`). Do host, acessa-se pelas portas mapeadas.

---

## 4. Variáveis de Ambiente

O `.env` centraliza as configurações sensíveis:

```bash
# PostgreSQL
DATABASE_URL=postgresql://notification:notification@localhost:5432/notification

# RabbitMQ — formato amqp://user:pass@host:port
RABBITMQ_URL=amqp://notification:notification@localhost:5672

# JWT
JWT_SECRET=super-secret-key-change-in-production
JWT_EXPIRATION=7d
```

**Por que `localhost` no `.env` mas o container usa o nome do serviço?**

- Quando os microserviços NestJS rodam **no host** (desenvolvimento com `npm run start:dev`), eles conectam via `localhost`
- Se os serviços NestJS fossem containerizados também, usariam `notification-postgres` e `notification-rabbitmq` como hosts

---

## 5. Fluxo Completo de uma Mensagem

```
Cliente HTTP
    │
    ▼
Gateway (NestJS HTTP + RMQ hybrid)
    │  clientProxy.send('user.find_by_id', userId)
    ▼
Exchange: amq.direct
    │  routing_key: 'user_queue'
    ▼
Queue: user_queue (durable)
    │
    ▼
User Service (NestJS Microservice)
    │  @MessagePattern('user.find_by_id')
    ▼
Handler → Service → Drizzle → PostgreSQL
    │
    ▼
Resposta via reply queue
    │
    ▼
Gateway → Resposta HTTP para o cliente
```

---

## 6. Comandos Úteis

```bash
# Iniciar infraestrutura
docker compose up -d

# Verificar saúde dos containers
docker compose ps

# Ver logs do RabbitMQ
docker logs notification-rabbitmq --follow

# Ver logs do PostgreSQL
docker logs notification-postgres --follow

# Parar sem apagar dados
docker compose stop

# Parar e remover containers (dados persistem nos volumes)
docker compose down

# ⚠️ Apagar dados dos volumes também
docker compose down -v
```

---

## Resumo

| Conceito | Papel |
|----------|-------|
| **RabbitMQ** | Message broker: buffer e roteamento de mensagens entre microserviços |
| **Exchange** | Ponto de entrada; decide para qual queue rotear |
| **Queue** | Armazena mensagens até o consumer processar |
| **Binding** | Regra de roteamento exchange → queue |
| **`@MessagePattern`** | Comunicação request-response (espera retorno) |
| **`@EventPattern`** | Comunicação fire-and-forget (eventos de domínio) |
| **Docker Compose** | Define e orquestra a infraestrutura local (PostgreSQL + RabbitMQ) |
| **`durable: true`** | Fila sobrevive a restarts do broker |
