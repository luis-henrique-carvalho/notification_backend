# 06 — Testing Microservices: Estratégias de Teste Unitário no NestJS

> **Série:** Real-Time Notification System
> **Módulo:** User Service — Unit Tests
> **Arquivo de referência:** `apps/user-service/src/user-service.service.spec.ts`

---

## Por que testar microserviços com testes unitários?

Em uma arquitetura de microserviços, cada serviço roda isolado. Isso é ótimo para deploys independentes, mas traz um desafio: **como garantir que a lógica interna funciona sem precisar subir todo o ambiente** (RabbitMQ, banco PostgreSQL, outros serviços)?

A resposta é testes unitários com **mocking** — substituímos as dependências externas por objetos falsos controlados.

```
Teste unitário                  Teste de integração
──────────────────               ───────────────────
Service só                       Service + RabbitMQ
  ↓ mock DB                        + PostgreSQL real
  ↓ mock JWT                       + outros services
→ Rápido (< 5s)                  → Lento (> 30s)
→ Sem infra necessária            → Requer docker-compose
→ Detecta bugs de lógica          → Detecta bugs de comunicação
```

---

## Como o NestJS Testing Module funciona

O `@nestjs/testing` fornece o `Test.createTestingModule()`, que monta um módulo NestJS completo em memória, substituindo provedores reais por mocks:

```typescript
const module = await Test.createTestingModule({
    providers: [
        UserServiceService,          // classe real que queremos testar
        {
            provide: DRIZZLE,        // token do provider real...
            useValue: mockDb,        // ...substituído por mock
        },
        {
            provide: JwtService,
            useValue: { sign: jest.fn().mockReturnValue('mock.jwt.token') },
        },
    ],
}).compile();

service = module.get<UserServiceService>(UserServiceService);
```

> **Conceito-chave:** O NestJS usa injeção de dependência (DI). Ao testar, substituímos cada dependência pelo token correspondente. O `UserServiceService` não sabe que está recebendo um mock — ele só chama os métodos que espera via interface.

---

## Mockando o Drizzle Client

O Drizzle usa uma API fluente (chainable) — cada método retorna `this`. Para mockar isso:

```typescript
const buildDrizzleMock = (rows: unknown[] = []) => ({
    // Query Builder (SELECT)
    select: jest.fn().mockReturnThis(),
    from:   jest.fn().mockReturnThis(),
    where:  jest.fn().mockReturnThis(),
    limit:  jest.fn().mockResolvedValue(rows),   // ← ponto final da chain

    // Mutation Builder (INSERT)
    insert:    jest.fn().mockReturnThis(),
    values:    jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(rows), // ← ponto final da chain
});
```

**Padrão `.mockReturnThis()` vs `.mockResolvedValue()`:**

| Método | Por quê |
|--------|---------|
| `mockReturnThis()` | Retorna o próprio mock (simula o chaining: `select().from().where()...`) |
| `mockResolvedValue(rows)` | Retorna uma Promise com dados (simula o ponto terminal que resolve) |

Para controlar resultados por teste, use `mockResolvedValueOnce()`:

```typescript
// Primeiro SELECT retorna vazio (sem usuário duplicado)
mockDb.limit.mockResolvedValueOnce([]);
// INSERT/returning retorna o novo usuário
mockDb.returning.mockResolvedValueOnce([newUser]);
```

> **Importante:** O `mockResolvedValueOnce` consome uma chamada por vez — ideal para simular diferentes retornos em sequência dentro do mesmo método do serviço.

---

## Mockando o RabbitMQ (por ausência)

O `UserServiceService` não interage diretamente com RabbitMQ — ele só faz operações de banco e JWT. O transporte RMQ fica no `main.ts` e no `UserServiceController`.

Portanto, **não há nada para mockar de RabbitMQ** nos testes unitários do service. O RabbitMQ só entra em cenários:

- **Testes do Controller** (onde `@MessagePattern` é usado)
- **Testes de integração** (onde a mensagem percorre o broker)

Quando você precisar testar algo que emite eventos (`ClientProxy.emit()`), o mock é:

```typescript
{
    provide: 'NOTIFICATION_CLIENT',
    useValue: {
        emit: jest.fn().mockReturnValue(of(null)), // rxjs Observable
        send: jest.fn().mockReturnValue(of(someResponse)),
    },
}
```

---

## Testando exceções RPC

O serviço lança `RpcException` (de `@nestjs/microservices`) em vez de `HttpException`. Para verificar o tipo e payload:

```typescript
await expect(service.register(dto)).rejects.toMatchObject({
    error: {
        code: RpcErrorCode.CONFLICT,
        message: expect.stringContaining(dto.email),
    },
});
```

**Por que `rejects.toMatchObject`?**
A `RpcException` armazena o payload em `.error` (ou via `.getError()`). O `toMatchObject` verifica subset — não requer igualdade exata, então você pode testar a estrutura sem se preocupar com campos extras.

---

## Testar serviços isolados vs integração com broker

| Aspecto | Teste Unitário (service) | Teste de Integração (broker) |
|---------|--------------------------|------------------------------|
| **Velocidade** | Milissegundos | Segundos/minutos |
| **Infra** | Nenhuma | Docker (RabbitMQ + PostgreSQL) |
| **Cobertura** | Lógica de negócio, validações, erros | Fluxo completo, ack/nack, dead-letters |
| **Mocking** | Tudo que não é o service | Apenas stubs externos (ex.: APIs terceiros) |
| **Quando falha** | Revela bug de lógica | Revela bug de configuração/comunicação |
| **Arquivo** | `*.service.spec.ts` | `test/*.e2e-spec.ts` |

**Regra 80/20:** Invista 80% em testes unitários (rápidos, confiáveis) e 20% em testes de integração (lentos, cobrem paths críticos end-to-end).

---

## Boas práticas observadas neste módulo

### 1. Factory de usuário de teste
Centralizar dados de fixture evita repetição e facilita mudanças no schema:

```typescript
const makeUser = (overrides = {}) => ({
    id: 'uuid-123',
    name: 'Alice',
    email: 'alice@example.com',
    // ...
    ...overrides, // sobrescrever apenas o que o teste precisa
});
```

### 2. Segurança: nunca expor o password
O `UserResponseDto` não inclui o campo `password`. Verificar isso explicitamente protege contra regressões:

```typescript
expect((result.user as unknown as Record<string, unknown>)['password']).toBeUndefined();
```

### 3. Error messages não devem revelar qual campo falhou (login)
Ambos os cenários (email não encontrado e senha errada) devem retornar `"Invalid credentials"` — evita enumeração de usuários:

```typescript
it('should NOT reveal whether the email or the password was wrong', async () => {
    // ambas as exceções devem ter o mesmo payload
    expect(errorNoEmail.getError()).toEqual(errorBadPw.getError());
});
```

### 4. `beforeEach` recria o mock
Recriar o mock a cada teste garante isolation: um teste não vaza estado para o próximo.

---

## Executando os testes

```bash
# Roda apenas os testes do user-service
pnpm exec jest --testPathPattern="user-service.service.spec" --no-coverage

# Roda todos com cobertura
pnpm exec jest --coverage
```

Resultado esperado:

```
PASS  apps/user-service/src/user-service.service.spec.ts
  UserServiceService
    register()
      ✓ should register a new user and return an access token with user data
      ✓ should hash the password before storing it
      ✓ should throw CONFLICT RpcException when email is already registered
      ✓ should call jwtService.sign with correct payload after registration
    login()
      ✓ should return access token and user data for valid credentials
      ✓ should throw UNAUTHORIZED when email is not found
      ✓ should throw UNAUTHORIZED when password is wrong
      ✓ should NOT reveal whether the email or the password was wrong
    findById()
      ✓ should return user data without password for an existing user
      ✓ should throw NOT_FOUND RpcException for a non-existent user id
      ✓ should propagate the requested id in the error message

Tests: 11 passed, 11 total
```
