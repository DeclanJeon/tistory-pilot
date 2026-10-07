import { loadProjectEnv } from '../../scripts/lib/load-env.mjs';

loadProjectEnv({ localEnvPath: '.env.local', fallbackEnvPaths: ['.env'] });
import { createHttpServer } from './http-server.mjs';

const app = await createHttpServer();
const url = await app.listen();
console.log(`publish workbench web listening on ${url}`);
