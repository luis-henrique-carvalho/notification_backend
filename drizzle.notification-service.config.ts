import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  schema: './apps/notification-service/src/database/schema.ts',
  out: './apps/notification-service/src/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://notification:notification@localhost:5432/notification',
  },
  verbose: true,
  strict: true,
});
