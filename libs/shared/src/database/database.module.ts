import { DynamicModule, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

export interface DatabaseModuleOptions {
  schema: Record<string, unknown>;
}

@Module({})
export class DatabaseModule {
  static forFeature(options: DatabaseModuleOptions): DynamicModule {
    const drizzleProvider = {
      provide: 'DRIZZLE',
      useFactory: () => {
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
        });
        return drizzle(pool, { schema: options.schema });
      },
    };

    return {
      module: DatabaseModule,
      providers: [drizzleProvider],
      exports: [drizzleProvider],
    };
  }
}
