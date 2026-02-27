# 04 — Drizzle ORM: Schema, Migrations e Providers no NestJS

## O que você vai aprender

- O que é o Drizzle ORM e por que ele foi escolhido neste projeto
- Como modelar a estratégia **database-per-service** em um monorepo NestJS
- Como criar um provider customizado para injetar o client Drizzle via NestJS DI
- Como gerar e aplicar migrations com o `drizzle-kit`

---

## 1. Drizzle ORM — Uma Visão Geral

**Drizzle** é um ORM TypeScript "headless" — ele não impõe um padrão de módulo rígido, é
type-safe por padrão e não faz abstrações pesadas. Você escreve schemas em TypeScript,
e o Drizzle infere os tipos automaticamente:

```ts
// schema.ts
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull(),
});

// Tipos inferidos — sem necessidade de duplicar modelos
type User = typeof users.$inferSelect;   // SELECT
type NewUser = typeof users.$inferInsert; // INSERT
```

**Por que Drizzle em vez de Prisma ou TypeORM?**

| Critério | Drizzle | Prisma | TypeORM |
|---|---|---|---|
| Type-safety | ✅ Nativo | ✅ Via codegen | ⚠️ Parcial |
| Bundle size | 🟢 Leve | 🔴 Pesado (engine Rust) | 🟡 Médio |
| SQL explícito | ✅ Sim | ❌ Abstrai muito | ⚠️ QueryBuilder |
| Múltiplos schemas por monorepo | ✅ Config por serviço | ⚠️ Schema único | ⚠️ |

---

## 2. Estratégia Database-per-Service

Em microserviços, cada serviço é dono do seu próprio banco. Isso garante:

- **Isolamento**: falhas ou migrações em `user-service` não afetam `notification-service`
- **Autonomia**: cada time faz deploy independente
- **Escala**: cada banco pode ser escalado individualmente

```
notification_backend/
├── drizzle.user-service.config.ts         ← config do user-service
├── drizzle.notification-service.config.ts ← config do notification-service
├── apps/
│   ├── user-service/src/database/
│   │   ├── schema.ts                      ← tabela `users`
│   │   └── migrations/                    ← migrações do user-service
│   └── notification-service/src/database/
│       ├── schema.ts                      ← tabelas `notifications`, `recipients`
│       └── migrations/                    ← migrações do notification-service
```

Apesar de compartilharmos **um único PostgreSQL** neste projeto (por simplicidade),
cada serviço usa suas próprias tabelas e seu próprio arquivo de configuração Drizzle.
Em produção, cada serviço poderia apontar para um server PostgreSQL diferente.

---

## 3. Provider Customizado no NestJS

O NestJS não tem suporte nativo a Drizzle — por isso criamos um **provider customizado**
que inicializa o cliente e o disponibiliza via injeção de dependência (DI).

### Por que não usar `@InjectRepository`?

`@InjectRepository` é específico do TypeORM. Com Drizzle, usamos um `InjectionToken`
simbólico e um factory provider:

```ts
// drizzle.provider.ts
import { Provider } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');           // Token de injeção
export type DrizzleDB = NodePgDatabase<typeof schema>;

export const DrizzleProvider: Provider = {
  provide: DRIZZLE,                                  // Token registrado no módulo
  useFactory: async () => {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    return drizzle(pool, { schema });                // Retorna o client Drizzle
  },
};
```

### Registrando no Módulo

```ts
// database.module.ts (exemplo)
@Module({
  providers: [DrizzleProvider],
  exports: [DrizzleProvider],       // Exporta para outros módulos do serviço
})
export class DatabaseModule {}
```

### Injetando no Service

```ts
// users.service.ts (exemplo)
@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,  // Injeção via token simbólico
  ) {}

  async findAll() {
    return this.db.select().from(schema.users);
  }
}
```

---

## 4. Schema: Tabela `users`

```ts
// apps/user-service/src/database/schema.ts
import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),  // UUID gerado pelo Postgres
    name: text('name').notNull(),
    email: text('email').notNull(),
    password: text('password').notNull(),         // Será armazenado como hash (bcrypt)
    role: text('role').notNull().default('user'), // 'user' | 'admin'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('users_email_idx').on(table.email), // Índice único no email
  ],
);
```

**Decisões de design:**
- `id` é UUID gerado pelo Postgres (`gen_random_uuid()`) — sem dependência de sequência
- `role` usa `text` (não enum) para facilitar migrações no futuro
- `email` tem índice único garante unicidade a nível de banco, independente do código

---

## 5. Gerenciamento de Migrations

### Fluxo de trabalho

```
1. Editar schema.ts
        ↓
2. pnpm db:generate:user   → gera arquivo SQL em migrations/
        ↓
3. Revisar o SQL gerado    → importante verificar antes de aplicar!
        ↓
4. pnpm db:migrate:user    → aplica no banco e registra na tabela __drizzle_migrations
```

### Comandos disponíveis

```bash
# Gerar migration baseada nas mudanças do schema
pnpm db:generate:user

# Aplicar migrations pendentes ao banco
pnpm db:migrate:user

# Abrir Drizzle Studio (GUI para inspecionar o banco)
pnpm db:studio:user
```

### Tabela de controle de migrations

O Drizzle mantém uma tabela `__drizzle_migrations` no banco para rastrear quais
migrations já foram aplicadas — similar ao `_prisma_migrations` do Prisma ou à tabela
`migrations` do TypeORM.

> ⚠️ **Atenção**: Nunca edite arquivos `.sql` já gerados. Se precisar ajustar o schema,
> edite o `schema.ts` e gere uma **nova** migration. Isso mantém o histórico auditável.

---

## 6. Pontos-chave para revisar

- [x] `schema.ts` define a estrutura — tipos são inferidos automaticamente
- [x] `DRIZZLE` é um `Symbol` usado como token de injeção no NestJS
- [x] `DrizzleProvider` usa `useFactory` para criar o `Pool` do `pg` e o client Drizzle
- [x] Cada serviço tem sua própria config `drizzle.*.config.ts` — strategy database-per-service
- [x] Migrations são arquivos SQL versionados gerados pelo `drizzle-kit generate`
