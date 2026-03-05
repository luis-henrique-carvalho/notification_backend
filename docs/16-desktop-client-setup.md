# Desktop Client Setup — Conectando ao Backend via OpenAPI

Este documento explica como o cliente desktop (Electron + React) se conecta aos microsserviços backend, como gerar tipos TypeScript automaticamente a partir da especificação OpenAPI e as vantagens de um desenvolvimento orientado por contratos (contract-driven).

## 1. Como Clientes Desktop se Conectam a Microsserviços

Em uma arquitetura de microsserviços, o cliente desktop **nunca** se comunica diretamente com os serviços internos (`user-service`, `notification-service`). Toda comunicação passa pelo **API Gateway**, que expõe endpoints REST na porta 3000.

```
┌─────────────────┐       HTTP/REST        ┌─────────────┐       RabbitMQ        ┌──────────────────┐
│ Desktop Client  │  ──────────────────►   │   Gateway   │  ──────────────────►  │ user-service     │
│ (Electron+React)│  ◄──────────────────   │  :3000      │  ◄──────────────────  │ notification-svc │
└─────────────────┘       + WebSocket      └─────────────┘                       └──────────────────┘
```

O cliente desktop utiliza dois canais de comunicação:

- **REST (HTTP):** Para operações CRUD — login, enviar notificação, buscar histórico. Usa o `openapi-fetch` como client HTTP type-safe.
- **WebSocket (Socket.IO):** Para receber atualizações em tempo real — novas notificações, status de entrega. Usa o `socket.io-client`.

Ambos os canais utilizam JWT Bearer token para autenticação.

## 2. Geração de Tipos TypeScript a Partir do OpenAPI Spec

### O que é `openapi-typescript`?

O pacote `openapi-typescript` lê a especificação OpenAPI (JSON ou YAML) exposta pelo Gateway e gera um arquivo `.d.ts` com todos os tipos TypeScript correspondentes.

### Como funciona

```bash
# O Gateway expõe o spec em /api/docs-json
npx openapi-typescript http://localhost:3000/api/docs-json -o src/api/schema.d.ts
```

Isso gera três interfaces principais no arquivo `schema.d.ts`:

- **`paths`**: Mapeia cada endpoint (URL + método HTTP) com seus parâmetros, body e respostas tipadas.
- **`components`**: Contém os schemas dos DTOs (`RegisterDto`, `LoginDto`, `SendNotificationDto`, etc).
- **`operations`**: Liga cada `operationId` à sua assinatura completa de request/response.

### Exemplo do tipo gerado

```typescript
export interface components {
  schemas: {
    LoginDto: {
      email: string;
      password: string;
    };
    SendNotificationDto: {
      title: string;
      body: string;
      priority: 'low' | 'medium' | 'high';
      broadcast: boolean;
      userIds?: string[];
    };
    // ... demais DTOs
  };
}
```

### Vantagens da geração automática

1. **Sincronia garantida:** Os tipos no frontend sempre refletem o contrato real do backend. Se o backend adicionar um campo ou mudar um tipo, basta regenerar.
2. **Zero código manual:** Não é necessário criar interfaces manualmente para cada DTO — elimina duplicação e erros de digitação.
3. **Documentação inline:** Os JSDoc comments do Swagger (`@ApiProperty({ description, example })`) são preservados nos tipos gerados.

### Script no `package.json`

```json
{
  "scripts": {
    "generate:api": "openapi-typescript http://localhost:3000/api/docs-json -o src/api/schema.d.ts"
  }
}
```

Basta executar `pnpm generate:api` sempre que a API backend mudar.

## 3. Type-Safe API Clients com `openapi-fetch`

### O que é `openapi-fetch`?

O `openapi-fetch` é um client HTTP minimalista (< 6kb) que usa os tipos gerados pelo `openapi-typescript` para fornecer **autocomplete e validação estática** em todas as chamadas de API.

### Configuração do client

```typescript
import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema';

// Middleware que injeta o token JWT em cada requisição
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = localStorage.getItem('auth_token');
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    return request;
  },
};

const api = createClient<paths>({ baseUrl: 'http://localhost:3000' });
api.use(authMiddleware);

export default api;
```

### Uso na prática

```typescript
// ✅ TypeScript sabe exatamente quais campos enviar e receber
const { data, error } = await api.POST('/auth/login', {
  body: { email: 'admin@test.com', password: '123456' },
});

if (data) {
  // data é tipado como LoginResponseDto
  setAuthToken(data.accessToken);
}

// ✅ Parâmetros de query tipados automaticamente
const { data: notifications } = await api.GET('/notifications', {
  params: { query: { page: 1, limit: 20 } },
});

// ❌ Erro de compilação — campo inexistente
const { data: bad } = await api.POST('/auth/login', {
  body: { email: 'test', wrongField: true }, // TypeScript error!
});
```

### Vantagens sobre `fetch` ou `axios` puro

| Aspecto                 | `fetch`/`axios`  | `openapi-fetch`        |
| ----------------------- | ---------------- | ---------------------- |
| Tipagem de request body | Manual (as any)  | Automática via schema  |
| Tipagem de response     | Manual (casting) | Inferida do endpoint   |
| Autocomplete de URLs    | Nenhum           | Todos os paths da API  |
| Validação de parâmetros | Runtime apenas   | Compile-time + runtime |
| Tamanho do bundle       | ~15kb (axios)    | < 6kb                  |

### Middleware de autenticação

O middleware `authMiddleware` intercepta todas as requisições e adiciona o header `Authorization: Bearer <token>`. Isso significa que:

- Não é necessário passar o token manualmente em cada chamada.
- A lógica de autenticação fica centralizada em um único ponto.
- Futuras necessidades (refresh token, retry em 401) podem ser adicionadas no mesmo middleware.

## 4. Contract-Driven Development

### O fluxo completo

```
Backend (NestJS)                    Geração                    Frontend (React)
┌──────────────┐                                              ┌──────────────┐
│ DTOs com     │    Swagger gera    ┌──────────┐  openapi-ts  │ schema.d.ts  │
│ @ApiProperty │ ────────────────►  │ spec.json│ ──────────►  │ (tipos TS)   │
│              │                    └──────────┘              │              │
│ Controllers  │                                              │ openapi-fetch│
│ com @ApiOp   │                                              │ (client)     │
└──────────────┘                                              └──────────────┘
```

### Por que isso importa?

1. **Fonte única de verdade:** Os decoradores `@ApiProperty()` nos DTOs do backend definem o contrato. O frontend consome esse contrato automaticamente — sem duplicação.
2. **Detecção precoce de breaking changes:** Se o backend renomear um campo ou mudar um tipo, ao regenerar os tipos o compilador TypeScript do frontend apontará todos os locais afetados.
3. **Desenvolvimento paralelo:** Enquanto o backend está em desenvolvimento, o frontend pode usar a spec existente como "mock contract" e começar a desenvolver as telas.
4. **Documentação viva:** A spec OpenAPI serve simultaneamente como documentação para humanos (Swagger UI) e para máquinas (geração de tipos).

### Comparação com abordagens alternativas

| Abordagem                   | Prós                            | Contras                            |
| --------------------------- | ------------------------------- | ---------------------------------- |
| Tipos manuais no frontend   | Simples, sem ferramentas extras | Dessincronia, erros silenciosos    |
| GraphQL codegen             | Type-safe, flexível             | Requer stack GraphQL completa      |
| **OpenAPI + openapi-fetch** | **Type-safe, leve, usa REST**   | **Requer regeneração manual**      |
| tRPC                        | End-to-end type safety          | Acoplamento forte backend/frontend |

Para este projeto, a combinação **OpenAPI + openapi-typescript + openapi-fetch** é ideal porque:

- O backend já usa NestJS com Swagger (OpenAPI spec gratuita via decoradores).
- O frontend precisa apenas de um client HTTP leve — sem overhead de GraphQL ou acoplamento de tRPC.
- A separação entre repositórios (backend vs desktop) favorece uma abordagem baseada em contratos publicados.

## 5. Estrutura de Arquivos no Desktop

```
src/
  api/
    schema.d.ts    ← Gerado automaticamente (NÃO editar)
    client.ts      ← Client openapi-fetch com middleware de auth
    index.ts       ← Barrel export para imports limpos
```

**Regra:** Nunca edite `schema.d.ts` manualmente. Sempre regenere com `pnpm generate:api`.
