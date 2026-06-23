import { loadProjectEnv } from '../../scripts/lib/load-env.mjs';

loadProjectEnv({ localEnvPath: '.env.local', fallbackEnvPaths: ['.env'] });
import { runWorkerLoop } from './loop.mjs';

const argv = process.argv.slice(2);
const once = argv.includes('--once');
const jobIdIndex = argv.indexOf('--job-id');
const jobId = jobIdIndex >= 0 ? String(argv[jobIdIndex + 1] || '') : '';

if (jobIdIndex >= 0 && !jobId) {
  throw new Error('--job-id requires a value.');
}

const result = await runWorkerLoop({ once, jobId: jobId || null, argv });
if (once && !jobId) {
  console.log('publish workbench worker completed one poll');
}
if (jobId) {
  console.log(JSON.stringify(result));
}
