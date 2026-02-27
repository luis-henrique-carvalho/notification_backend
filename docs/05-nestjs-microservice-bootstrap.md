# 05 — NestJS Microservice Bootstrap

> **Aprendizado prático:** como o NestJS cria um microserviço puro (sem HTTP), o transporte RMQ, o ciclo de vida de uma mensagem e o papel das filas duráveis no RabbitMQ.

---

## O que é um Microserviço "Puro" no NestJS?

Normalmente, uma aplicação NestJS sobe um servidor HTTP (Express / Fastify). No caso de microserviços que só precisam processar mensagens internas, usamos `NestFactory.createMicroservice()` em vez de `NestFactory.create()`.

Isso significa que **não há porta HTTP exposta** — o processo apenas escuta em um canal de mensagens (no nosso caso, RabbitMQ).

```ts
// apps/user-service/src/main.ts
const app = await NestFactory.createMicroservice<MicroserviceOptions>(
  UserServiceModule,
  {
    transport: Transport.RMQ,
    options: {
      urls: [rmqUrl],
      queue: 'user_queue',
      queueOptions: { durable: true },
    },
  },
);

await app.listen();
```

---

## O Transport Layer RMQ

`Transport.RMQ` é um dos transportes suportados nativamente pelo `@nestjs/microservices`. Ele usa o protocolo AMQP com RabbitMQ.

Ao configurar o transporte, dois parâmetros são críticos:

| Parâmetro | Valor | Motivo |
|-----------|-------|--------|
| `urls` | `['amqp://...']` | Endereço do broker RabbitMQ |
| `queue` | `'user_queue'` | Fila que este serviço irá **consumir** |
| `queueOptions.durable` | `true` | Fila sobrevive a reinicializações do broker |

---

## `durable: true` — Por que é importante?

Uma fila **durável** é persistida no disco pelo RabbitMQ. Se o broker reiniciar, a fila e as mensagens nela armazenadas continuam existindo.

- **`durable: false`** → Fila desaparece junto com o broker ao reiniciar (útil apenas para dev/testes rápidos).
- **`durable: true`** → Recomendado para produção. Mensagens não se perdem em caso de falha.

> ⚠️ Tanto o **produtor** (Gateway) quanto o **consumidor** (user-service) precisam declarar a fila com os **mesmos parâmetros**. Parâmetros incompatíveis geram erro de conexão no RabbitMQ.

---

## Ciclo de Vida de uma Mensagem

```
Gateway (Producer)                  RabbitMQ           User Service (Consumer)
       │                               │                        │
       │── ClientProxy.send() ────────►│                        │
       │   { pattern: 'user.register'  │                        │
       │     data: { name, email, pw } │                        │
       │   }                           │── entrega mensagem ───►│
       │                               │                        │── @MessagePattern('user.register')
       │                               │                        │   controller method executa
       │                               │◄── ACK + resposta ─────│
       │◄── Observable response ───────│                        │
```

1. O **Gateway** chama `clientProxy.send(USER_PATTERNS.REGISTER, dto)` — isso publica uma mensagem na fila `user_queue`.
2. O **RabbitMQ** entrega a mensagem ao próximo consumidor disponível (user-service).
3. O **user-service** executa o handler decorado com `@MessagePattern('user.register')`.
4. O resultado é enviado de volta ao Gateway como resposta (padrão **request-response** do RMQ).

---

## `@MessagePattern` — Roteamento de Mensagens

O decorator `@MessagePattern` é a forma de mapear uma mensagem a um método do controller. O NestJS usa o campo `pattern` da mensagem para encontrar o handler correto.

```ts
// apps/user-service/src/user-service.controller.ts
@Controller()
export class UserServiceController {
  @MessagePattern(USER_PATTERNS.REGISTER)  // 'user.register'
  register(@Payload() dto: RegisterDto): Promise<LoginResponseDto> {
    return this.userService.register(dto);
  }

  @MessagePattern(USER_PATTERNS.LOGIN)     // 'user.login'
  login(@Payload() dto: LoginDto): Promise<LoginResponseDto> {
    return this.userService.login(dto);
  }

  @MessagePattern(USER_PATTERNS.FIND_BY_ID) // 'user.findById'
  findById(@Payload() id: string): Promise<UserResponseDto> {
    return this.userService.findById(id);
  }
}
```

- `@Payload()` extrai o corpo da mensagem (equivalente a `@Body()` no HTTP).
- Os padrões são strings definidas como constantes em `@app/shared` — isso garante que produtor e consumidor usam **exatamente o mesmo valor**.

---

## Comparativo: HTTP vs Microserviço Puro

| Aspecto | API HTTP (Gateway) | Microserviço RMQ (user-service) |
|---------|-------------------|----------------------------------|
| Fábrica | `NestFactory.create()` | `NestFactory.createMicroservice()` |
| Porta | TCP (3000) | Nenhuma (somente AMQP) |
| Entrada | `@Get()`, `@Post()` | `@MessagePattern()` |
| Dados | `@Body()`, `@Param()` | `@Payload()` |
| Resposta | `@Res()` / return | return direto |
| Inicialização | `app.listen(3000)` | `app.listen()` |

---

## Estrutura Final do user-service

```
apps/user-service/
├── src/
│   ├── database/
│   │   ├── drizzle.provider.ts   ← Provider do Drizzle (DRIZZLE token)
│   │   └── schema.ts             ← Tabela users
│   ├── main.ts                   ← Bootstrap: NestFactory.createMicroservice()
│   ├── user-service.module.ts    ← Módulo raiz (JwtModule + DrizzleProvider)
│   ├── user-service.controller.ts← @MessagePattern handlers
│   └── user-service.service.ts   ← register(), login(), findById()
└── tsconfig.app.json             ← Estende ../../tsconfig.json
```

---

## Conceitos-chave

- **`NestFactory.createMicroservice()`** — cria um processo sem HTTP, conectado a um transport.
- **`Transport.RMQ`** — define RabbitMQ como o canal de transporte usando AMQP.
- **`durable: true`** — garante que a fila persiste no disco do broker.
- **`@MessagePattern()`** — mapeia uma string de pattern a um método do controller.
- **`@Payload()`** — extrai os dados da mensagem (análogo ao `@Body()` HTTP).
- **Request-Response** — o NestJS gerencia a correlação de IDs internamente; para o developer, `.send()` retorna um `Observable`.
