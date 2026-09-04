import { envSchema } from '../../config/env.validation';
import { buildMikroOrmConfig } from './mikro-orm.config';

export default buildMikroOrmConfig(envSchema.parse(process.env));
