# 07 — API Gateway & Hybrid App no NestJS

## O que é um API Gateway?

Em arquiteturas de microserviços, o **API Gateway** é o único ponto de entrada da rede externa para todos os clientes (browser, mobile, desktop). Em vez de os clientes conhecerem os endereços de cada microserviço, eles falam apenas com o Gateway:

```
Cliente HTTP/WebSocket
        │
        ▼
  [ API Gateway :3000 ]
     │           │
     ▼           ▼
user-service   notification-service
 (RabbitMQ)     (RabbitMQ)
```

**Responsabilidades do Gateway:**
- Autenticar requisições (JWT)
- Aplicar autorização baseada em roles
- Rotear/proxy de requisições HTTP para o microserviço correto via RabbitMQ
- Expor WebSocket para entrega em tempo real
- Expor documentação OpenAPI centralizada

---

## App HTTP vs. Hybrid App

| Característica | App HTTP puro | Hybrid App |
|---|---|---|
| `NestFactory.create()` | ✅ Sim | ✅ Sim |
| `NestFactory.createMicroservice()` | ❌ Não | ❌ Não |
| `app.connectMicroservice()` | ❌ Não | ✅ Sim |
| Escuta em porta HTTP | ✅ Sim | ✅ Sim |
| Escuta em fila RabbitMQ | ❌ Não | ✅ Sim |

O Gateway precisa das **duas capacidades ao mesmo tempo**:
1. **Receber** requisições HTTP dos clientes (REST + WebSocket)
2. **Consumir** eventos RabbitMQ emitidos pelos microserviços internos (ex: `notification.created`)

Isso é o que o NestJS chama de **hybrid application**:

```typescript
// 1. Cria o app HTTP normalmente
const app = await NestFactory.create(GatewayModule);

// 2. Conecta o transporte RMQ como um microserviço adicional
app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.RMQ,
  options: {
    urls: ['amqp://localhost:5672'],
    queue: 'gateway_queue',
    queueOptions: { durable: true },
  },
});

// 3. Inicia o listener RMQ E o servidor HTTP
await app.startAllMicroservices(); // ← RMQ consumer começa aqui
await app.listen(3000);            // ← HTTP server começa aqui
```

> 💡 **`startAllMicroservices()` deve ser chamado ANTES de `listen()`** para garantir que os event handlers estejam ativos antes das requisições HTTP chegarem.

---

## `ClientsModule.register()` — ClientProxy para comunicação inter-serviços

O Gateway precisa **enviar** mensagens para `user-service` e `notification-service`. Para isso, o NestJS usa o `ClientProxy`, que é injetado via `ClientsModule.register()`:

```typescript
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'USER_CLIENT',        // token de injeção
        transport: Transport.RMQ,
        options: {
          urls: ['amqp://localhost:5672'],
          queue: 'user_queue',      // fila do user-service
          queueOptions: { durable: true },
        },
      },
      {
        name: 'NOTIFICATION_CLIENT',
        transport: Transport.RMQ,
        options: {
          urls: ['amqp://localhost:5672'],
          queue: 'notification_queue',
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
})
export class GatewayModule {}
```

### Injeção no controller

```typescript
@Controller('auth')
export class AuthController {
  constructor(
    @Inject('USER_CLIENT') private readonly userClient: ClientProxy,
  ) {}
}
```

---

## O fluxo request-response com `clientProxy.send()`

O `ClientProxy.send()` implementa o padrão **RPC (Remote Procedure Call)** sobre RabbitMQ:

```
HTTP POST /auth/login
       │
       ▼
  AuthController
       │
       │  userClient.send('user.login', { email, password })
       ▼
  [RabbitMQ - user_queue]
       │
       ▼
  UserServiceController @MessagePattern('user.login')
       │  processa, retorna resultado
       ▼
  [RabbitMQ - reply queue (temporária)]
       │
       ▼
  Gateway recebe o resultado (Observable)
       │
       ▼
  HTTP 200 { token, user }
```

### Exemplo de uso no controller

```typescript
@Post('login')
@Public()
async login(@Body() dto: LoginDto) {
  // send() retorna um Observable — use firstValueFrom() para converter em Promise
  return firstValueFrom(
    this.userClient.send('user.login', dto),
  );
}
```

### `send()` vs `emit()`

| Método | Pattern | Aguarda resposta? | Uso |
|---|---|---|---|
| `clientProxy.send(pattern, data)` | `@MessagePattern` | ✅ Sim (RPC) | Ações que retornam dados |
| `clientProxy.emit(pattern, data)` | `@EventPattern` | ❌ Não (fire-and-forget) | Eventos assíncronos |

---

## Por que `durable: true` nas filas?

Filas duráveis sobrevivem a reinicios do RabbitMQ. Sem isso, se o broker reiniciar enquanto há mensagens enfileiradas, elas serão perdidas. Em produção, **sempre use `durable: true`** nas filas e `persistent: true` nas mensagens.

---

## Diagrama completo do Gateway

```
                ┌─────────────────────────────────────────┐
                │              API Gateway                 │
                │                                         │
HTTP Clients ──►│  @Controller (REST)                     │
WebSocket ──────│  @WebSocketGateway                      │
                │                                         │
                │  ClientsModule                          │
                │    USER_CLIENT ──────────► user_queue   │
                │    NOTIFICATION_CLIENT ──► notif_queue  │
                │                                         │
                │  @EventPattern (hybrid consumer)        │
                │    gateway_queue ◄─── notification-svc  │
                └─────────────────────────────────────────┘
```
