# 02 — Shared Library: Contratos Compartilhados em Microserviços

## O que é uma Shared Library?

Em uma arquitetura de microserviços, cada serviço é independente — mas eles precisam **concordar sobre o formato das mensagens**. A shared library (`@app/shared`) é o **contrato** que garante essa concordância em compile-time.

Sem ela, um microserviço poderia mudar o nome de um pattern de `'user.login'` para `'auth.login'` e ninguém saberia até o sistema quebrar em runtime.

```
libs/shared/src/
├── patterns.ts              # Constantes de MessagePattern
├── events.ts                # Constantes de EventPattern
├── dto/
│   ├── user.dto.ts          # DTOs de usuário
│   └── notification.dto.ts  # DTOs de notificação
├── rpc/
│   ├── rpc-exception.helpers.ts    # Helpers tipados para erros RPC
│   ├── rpc-exception.filter.ts     # Filter global para microserviços
│   └── rpc-to-http.interceptor.ts  # Interceptor Gateway: RPC → HTTP
└── index.ts                 # Barrel file (re-exports tudo)
```

---

## MessagePattern vs EventPattern

O NestJS Microservices tem **dois modos** de comunicação — entender a diferença é fundamental.

### MessagePattern — Request/Response

Usado quando o serviço que envia **precisa de uma resposta** (como uma chamada de função remota).

```typescript
// Constante compartilhada
export const USER_PATTERNS = {
  LOGIN: 'user.login',
} as const;

// No Gateway (ENVIA e ESPERA resposta):
this.userClient.send(USER_PATTERNS.LOGIN, dto);
// → send() retorna um Observable<LoginResponseDto>

// No User Service (RECEBE e RESPONDE):
@MessagePattern(USER_PATTERNS.LOGIN)
async handleLogin(@Payload() dto: LoginDto): Promise<LoginResponseDto> {
  // ... processa e RETORNA
}
```

**Internamente no RabbitMQ:** O `send()` cria uma **reply queue** temporária. A mensagem vai para `user_queue` com um header `replyTo` apontando para essa reply queue. O User Service processa e publica a resposta na reply queue. O Gateway consome a resposta. Tudo automático — o NestJS abstrai isso.

### EventPattern — Fire-and-Forget

Usado quando o serviço que envia **não precisa de resposta** — ele só notifica que algo aconteceu.

```typescript
// Constante compartilhada
export const NOTIFICATION_EVENTS = {
  CREATED: 'notification.created',
} as const;

// No Notification Service (EMITE e segue em frente):
this.client.emit(NOTIFICATION_EVENTS.CREATED, payload);
// → emit() NÃO retorna resposta

// No Gateway (ESCUTA quando acontecer):
@EventPattern(NOTIFICATION_EVENTS.CREATED)
handleNotificationCreated(@Payload() data) {
  this.server.to(data.userId).emit('notification', data);
}
```

**Internamente no RabbitMQ:** O `emit()` publica a mensagem na queue do consumidor (ex: `gateway_queue`) sem reply queue. O consumidor processa quando puder. Se ninguém estiver escutando, a mensagem fica na queue (se `durable: true`).

### Quando usar cada um?

| Cenário | Padrão | Método |
|---------|--------|--------|
| Login de usuário | `@MessagePattern` | `send()` — preciso do token |
| Buscar notificações | `@MessagePattern` | `send()` — preciso da lista |
| Notificação foi criada | `@EventPattern` | `emit()` — só aviso quem quiser saber |
| Notificação foi entregue | `@EventPattern` | `emit()` — confirmação assíncrona |

> 📖 [Documentação: Sending Messages](https://docs.nestjs.com/microservices/basics#sending-messages) | [Publishing Events](https://docs.nestjs.com/microservices/basics#publishing-events)

---

## DTOs como Contrato de Comunicação

DTOs (Data Transfer Objects) definem o **shape** dos dados que trafegam entre serviços. No nosso sistema, usamos `class-validator` para validação runtime.

### Por que classes e não interfaces?

- **Interfaces** são apagadas em compile-time — existem apenas no TypeScript
- **Classes** existem em runtime — o `class-validator` precisa de decorators em classes reais
- O NestJS `ValidationPipe` usa reflexão sobre as classes para validar payloads

```typescript
// DTO com validação — funciona com ValidationPipe
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
```

### Fluxo de validação

```
Client → HTTP POST /auth/register { name, email, password }
  → Gateway ValidationPipe valida RegisterDto
    → Gateway envia via ClientProxy.send('user.register', dto)
      → User Service recebe dto já validado
        → Processa e retorna UserResponseDto
```

O Gateway valida **antes** de enviar para o microserviço. Isso evita que mensagens inválidas cheguem ao RabbitMQ.

---

## Tratamento de Exceções: RPC vs HTTP

Este é um dos pontos mais confusos em microserviços NestJS — exceções funcionam de forma **completamente diferente** entre o mundo HTTP e o mundo RPC.

### O Problema

No NestJS HTTP, você lança `HttpException` e o framework retorna o status code correto. Mas um microserviço **não tem HTTP** — ele fala RabbitMQ. Se você lançar `HttpException` dentro de um `@MessagePattern`, o NestJS não sabe o que fazer com status codes.

### A Solução: Três Camadas

#### Camada 1: Helpers tipados (microserviço lança)

```typescript
// O microserviço usa helpers que lançam RpcException estruturada
@MessagePattern(USER_PATTERNS.LOGIN)
async handleLogin(@Payload() dto: LoginDto) {
  const user = await this.findByEmail(dto.email);
  if (!user) {
    rpcNotFound('User not found');
    // ↑ throw new RpcException({ code: 'NOT_FOUND', message: 'User not found' })
  }
}
```

#### Camada 2: Exception Filter (microserviço normaliza)

```typescript
// No bootstrap do microserviço:
app.useGlobalFilters(new AllRpcExceptionsFilter());

// O filter captura QUALQUER exceção e normaliza para { code, message }
// Mesmo exceções não-RPC (TypeError, RangeError, etc.) viram { code: 'INTERNAL', message }
```

#### Camada 3: Interceptor (Gateway traduz para HTTP)

```typescript
// No bootstrap do Gateway:
app.useGlobalInterceptors(new RpcToHttpInterceptor());

// O interceptor captura o { code, message } que veio do microserviço via RabbitMQ
// e traduz para HttpException com o status code correto:
//   NOT_FOUND   → 404
//   BAD_REQUEST → 400
//   UNAUTHORIZED → 401
//   CONFLICT    → 409
//   INTERNAL    → 500
```

### Fluxo completo de um erro

```
User Service                    RabbitMQ              Gateway                 Client
     │                              │                    │                      │
     │ rpcNotFound('User not found')│                    │                      │
     │ → RpcException thrown        │                    │                      │
     │                              │                    │                      │
     │ AllRpcExceptionsFilter       │                    │                      │
     │ catches + normalizes         │                    │                      │
     │ { code: NOT_FOUND,           │                    │                      │
     │   message: 'User not found' }│                    │                      │
     │──────────────────────────────►│                    │                      │
     │                              │ error payload      │                      │
     │                              │───────────────────►│                      │
     │                              │                    │ RpcToHttpInterceptor  │
     │                              │                    │ catches + maps code   │
     │                              │                    │ → HttpException(404)  │
     │                              │                    │─────────────────────►│
     │                              │                    │                      │
     │                              │                    │  HTTP 404            │
     │                              │                    │  { message: 'User    │
     │                              │                    │    not found' }      │
```

### Por que não lançar HttpException diretamente no microserviço?

1. **Microserviços não são HTTP** — eles não sabem o que é "status 404"
2. **Acoplamento** — se o microserviço conhece HTTP, ele não pode ser consumido por outro protocolo (gRPC, TCP)
3. **Separação de responsabilidades** — quem decide o status HTTP é o Gateway (a "borda" HTTP do sistema)

> 📖 [Documentação: Exception Filters — Microservices](https://docs.nestjs.com/microservices/exception-filters)

---

## Importando da Shared Library

Graças ao path alias `@app/shared` configurado no `tsconfig.json`, qualquer app do monorepo pode importar:

```typescript
import {
  USER_PATTERNS,
  LoginDto,
  rpcNotFound,
  AllRpcExceptionsFilter,
  RpcToHttpInterceptor,
} from '@app/shared';
```

Tudo é re-exportado pelo barrel file `libs/shared/src/index.ts`. Se um novo módulo for criado na shared lib, basta adicioná-lo ao barrel file para ficar disponível.

> 📖 [Documentação: Monorepo — Libraries](https://docs.nestjs.com/cli/monorepo#libraries)
