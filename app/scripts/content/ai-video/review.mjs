import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const DEFAULT_REVIEW_MODEL = 'gpt-5.6-luna';
const CODEX = path.resolve(import.meta.dirname, '../../../node_modules/.bin/codex');
const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail', 'unknown'] },
    observations: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'string' } }
  },
  required: ['verdict', 'observations', 'issues']
};

/** Isolated, image-only review. No shell, plugins, MCP, browser or generation tools. */
export async function reviewJson({ system, prompt, images = [], reasoning = true, model = process.env.CODEX_REVIEW_MODEL || DEFAULT_REVIEW_MODEL }) {
  if (!images.length) throw new Error('Visual review requires actual image inputs');
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-video-review-'));
  const schemaPath = path.join(scratch, 'schema.json');
  const resultPath = path.join(scratch, 'result.json');
  try {
    await fs.writeFile(schemaPath, JSON.stringify(SCHEMA));
    const args = [
      'exec', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check',
      '--ephemeral', '--sandbox', 'read-only', '--cd', scratch,
      '--model', model, '--json', '--color', 'never',
      '--config', `model_reasoning_effort="${reasoning ? 'high' : 'low'}"`,
      '--config', 'project_doc_max_bytes=0', '--config', 'web_search="disabled"',
      '--output-schema', schemaPath, '--output-last-message', resultPath
    ];
    for (const feature of ['shell_tool', 'unified_exec', 'view_image', 'image_generation', 'computer_use', 'in_app_browser', 'hooks', 'apps', 'plugins', 'multi_agent', 'skill_search', 'skill_mcp_dependency_install', 'tool_suggest', 'unbounded_connection_retries']) {
      args.push('--disable', feature);
    }
    for (const image of images) args.push('--image', typeof image === 'string' ? image : image.path);
    args.push('--', `${system}\nDo not use tools, execute commands, read other files or generate media. Inspect ONLY the attached images.\n\n${prompt}`);
    let stdout;
    try {
      const invocation = execFileAsync(CODEX, args, {
        cwd: scratch, timeout: 300000, maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, CODEX_HOME: path.join(os.homedir(), '.codex') }
      });
      // Codex reads piped stdin even with an argument prompt; close the pipe.
      invocation.child.stdin.end();
      ({ stdout } = await invocation);
      if (invocation.child.killed) {
        throw Object.assign(new Error('Native visual review timed out'), { code: 'REVIEW_TIMEOUT' });
      }
    } catch (error) {
      throw new Error(`Native visual review failed: ${error.code || error.signal || 'process-error'}`);
    }
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.item && !['agent_message', 'reasoning'].includes(event.item.type)) {
        throw new Error(`Visual reviewer attempted a prohibited tool: ${event.item?.type || 'unknown'}`);
      }
    }
    const result = JSON.parse(await fs.readFile(resultPath, 'utf8'));
    if (!['pass', 'fail', 'unknown'].includes(result.verdict)
      || !Array.isArray(result.observations) || !Array.isArray(result.issues)
      || !result.observations.every(value => typeof value === 'string')
      || !result.issues.every(value => typeof value === 'string')) {
      throw new Error('Native visual review returned an invalid verdict object');
    }
    return result;
  } finally {
    await fs.rm(scratch, { recursive: true, force: true });
  }
}
