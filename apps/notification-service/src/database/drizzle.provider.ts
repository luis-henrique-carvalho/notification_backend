import { Provider } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');

export type DrizzleDB = NodePgDatabase<typeof schema>;

export const DrizzleProvider: Provider = {
  provide: DRIZZLE,
  useFactory: async () => {
    const pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        'postgresql://notification:notification@localhost:5432/notification',
    });

    return drizzle(pool, { schema });
  },
};
