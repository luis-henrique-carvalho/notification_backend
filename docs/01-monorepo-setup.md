# 01 — Monorepo Setup no NestJS

## O que é um Monorepo?

Um **monorepo** é uma estratégia de organização onde múltiplos projetos (aplicações e bibliotecas) vivem dentro de um único repositório Git. No NestJS, isso permite:

- **Compartilhar código** entre microserviços (DTOs, constantes, utilitários)
- **Manter consistência** de versões de dependências
- **Simplificar o desenvolvimento** local — um único `pnpm install` para tudo

## Como o `nest-cli.json` gerencia múltiplos apps/libs

O `nest-cli.json` é o coração do monorepo NestJS. Ele define:

```json
{
  "monorepo": true,        // Habilita modo monorepo
  "root": "apps/gateway",  // App padrão (executado com `nest start`)
  "projects": {
    "gateway":              { "type": "application", "root": "apps/gateway", ... },
    "user-service":         { "type": "application", "root": "apps/user-service", ... },
    "notification-service": { "type": "application", "root": "apps/notification-service", ... },
    "shared":               { "type": "library",     "root": "libs/shared", ... }
  }
}
```

### Campos importantes por projeto:

| Campo | Descrição |
|-------|-----------|
| `type` | `"application"` para apps executáveis, `"library"` para código compartilhado |
| `root` | Diretório raiz do projeto |
| `entryFile` | Arquivo de entrada (`main` para apps, `index` para libs) |
| `sourceRoot` | Onde o código-fonte fica (geralmente `<root>/src`) |
| `compilerOptions.tsConfigPath` | Caminho para o tsconfig específico do projeto |

### Comandos por projeto:

```bash
# Iniciar um app específico
nest start user-service --watch

# Build de um app específico
nest build notification-service

# App padrão (gateway, definido em "root")
nest start --watch
```

## Path Aliases no TypeScript

O `tsconfig.json` raiz define aliases para facilitar imports:

```json
{
  "compilerOptions": {
    "baseUrl": "./",
    "paths": {
      "@app/shared":   ["libs/shared/src"],
      "@app/shared/*": ["libs/shared/src/*"]
    }
  }
}
```

Isso permite importar código compartilhado de qualquer app:

```typescript
// Em vez de:
import { USER_PATTERNS } from '../../../libs/shared/src/patterns';

// Usamos:
import { USER_PATTERNS } from '@app/shared';
```

### Como funciona:

1. **`baseUrl: "./"` ** — diz ao TypeScript que caminhos relativos partem da raiz do projeto
2. **`@app/shared`** — mapeia para o barrel file `libs/shared/src/index.ts`
3. **`@app/shared/*`** — permite imports profundos como `@app/shared/dto/user.dto`

## Estrutura do Monorepo

```
notification_backend/
├── apps/
│   ├── gateway/              # HTTP + WebSocket (app híbrido)
│   │   ├── src/
│   │   └── tsconfig.app.json
│   ├── user-service/         # Microserviço RMQ para autenticação
│   │   ├── src/
│   │   └── tsconfig.app.json
│   └── notification-service/ # Microserviço RMQ para notificações
│       ├── src/
│       └── tsconfig.app.json
├── libs/
│   └── shared/               # Código compartilhado
│       ├── src/
│       │   └── index.ts      # Barrel file (re-exporta tudo)
│       └── tsconfig.lib.json
├── nest-cli.json             # Configuração do monorepo
├── tsconfig.json             # TypeScript config raiz
└── package.json              # Dependências centralizadas
```

## Por que compartilhar código entre microserviços?

### O problema sem shared library:

```
user-service define: { pattern: 'user.register', data: { name, email, password } }
gateway envia:       { pattern: 'user.register', data: { nome, email, senha } }
// ❌ Erro silencioso — campos não batem!
```

### A solução com `@app/shared`:

```typescript
// libs/shared/src/patterns.ts
export const USER_PATTERNS = {
  REGISTER: 'user.register',
  LOGIN: 'user.login',
} as const;

// libs/shared/src/dto/user.dto.ts
export class RegisterDto {
  name: string;
  email: string;
  password: string;
}
```

Ambos os serviços importam do mesmo lugar:

```typescript
// No gateway
import { USER_PATTERNS, RegisterDto } from '@app/shared';
clientProxy.send(USER_PATTERNS.REGISTER, registerDto);

// No user-service
import { USER_PATTERNS } from '@app/shared';
@MessagePattern(USER_PATTERNS.REGISTER)
register(data: RegisterDto) { ... }
```

### Benefícios:

- **Tipagem segura** — mudanças em DTOs são refletidas em todos os serviços
- **Single source of truth** — constantes de padrões definidas uma vez
- **Refatoração segura** — o compilador TypeScript captura inconsistências
- **DRY** — sem duplicação de código entre serviços

## Dependências Instaladas

| Pacote | Propósito |
|--------|-----------|
| `@nestjs/microservices` | Suporte a microserviços (RMQ transport) |
| `amqp-connection-manager` | Gerenciamento de conexão AMQP com reconnect |
| `amqplib` | Client AMQP para RabbitMQ |
| `@nestjs/jwt` | Módulo JWT para geração/validação de tokens |
| `@nestjs/passport` | Integração Passport.js para autenticação |
| `passport-jwt` | Strategy JWT para Passport |
| `bcryptjs` | Hashing seguro de senhas |
| `@nestjs/platform-socket.io` | WebSocket com Socket.IO |
| `@nestjs/swagger` | Documentação OpenAPI/Swagger |
| `drizzle-orm` | ORM TypeScript-first |
| `pg` | Driver PostgreSQL |
| `class-validator` | Validação de DTOs com decorators |
| `class-transformer` | Transformação de plain objects em class instances |
