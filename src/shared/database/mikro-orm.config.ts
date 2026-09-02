import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import type { EnvConfig } from '../../config/env.validation';

type DbEnv = Pick<
  EnvConfig,
  'DB_HOST' | 'DB_PORT' | 'DB_USER' | 'DB_PASSWORD' | 'DB_NAME' | 'DB_DEBUG'
>;

export function buildMikroOrmConfig(env: DbEnv) {
  return defineConfig({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    dbName: env.DB_NAME,
    debug: env.DB_DEBUG,
    entities: ['./dist/**/*.entity.js'],
    entitiesTs: ['./src/**/*.entity.ts'],
    discovery: { warnWhenNoEntities: false },
    extensions: [Migrator],
    migrations: {
      tableName: 'mikro_orm_migrations',
      path: './dist/migrations',
      pathTs: './migrations',
      glob: '!(*.d).{js,ts}',
      transactional: true,
      disableForeignKeys: false,
      allOrNothing: true,
      emit: 'ts',
    },
  });
}
