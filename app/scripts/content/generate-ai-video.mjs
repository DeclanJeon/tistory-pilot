#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadProjectEnv } from '../lib/load-env.mjs';
import { qaHtmlPost } from './qa-post.mjs';
import { callJson } from './ai-video/llm.mjs';
import { reviewJson } from './ai-video/review.mjs';
import { collectResearch, productionSourceCoverage } from './ai-video/research.mjs';
import { draftRecipe, renderArticle, checkFlowCapabilities, validateRecipe } from './ai-video/article.mjs';
import { produceSheets } from './ai-video/production.mjs';
import { verifyCreativeEvidence } from './ai-video/evidence.mjs';
import { registerCreativePost, scanCreativeQueue } from './ai-video/register.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function seoulDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function futureSeoulTime(now = new Date()) {
  return new Date(now.getTime() + 20 * 60000 + 9 * 3600000).toISOString().replace(/\.\d{3}Z$/, '+09:00');
}
async function save(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temp, file);
}
async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function loadSkills() {
  const files = [
    'tistory-ai-video-production/SKILL.md', 'creative-production/SKILL.md',
    'orchestrating-video-preproduction/SKILL.md', 'developing-video-synopses/SKILL.md',
    'designing-video-character-sheets/SKILL.md', 'designing-video-character-sheets/references/character-craft.md',
    'designing-video-character-sheets/references/character-ssot-master-prompt.md',
    'storyboarding-video/SKILL.md', 'video-production-assets/references/storyboard-contract.md',
    'video-production-assets/references/preproduction-review.md', 'tistory-blog/SKILL.md',
    'video-prompt/SKILL.md', 'video-prompt/dialects.json', 'video-model-router/SKILL.md'
  ];
  const texts = [];
  for (const file of files) {
    const text = await fs.readFile(path.join(ROOT, '.codex/skills', file), 'utf8');
    texts.push({ name: file, sha256: sha(text), text });
  }
  return texts;
}
function argsOf(argv) {
  const args = { topic: '', enqueue: false, researchOnly: false, resume: '', projectId: '', publishAt: '' };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--topic') args.topic = argv[++i];
    else if (key === '--enqueue') args.enqueue = true;
    else if (key === '--research-only') args.researchOnly = true;
    else if (key === '--resume') args.resume = argv[++i];
    else if (key === '--project-id') args.projectId = argv[++i];
    else if (key === '--publish-at') args.publishAt = argv[++i];
    else if (key === '--help') {
      console.log('Usage: node scripts/content/generate-ai-video.mjs [--topic ID] [--research-only] [--resume DIR] [--enqueue] [--publish-at ISO+09:00]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${key}`);
  }
  return args;
}

async function main() {
  const args = argsOf(process.argv.slice(2));
  loadProjectEnv({ localEnvPath: path.join(ROOT, '.env.local'), fallbackEnvPaths: [path.join(ROOT, '.env')] });
  const catalog = await readJson(path.join(ROOT, 'scripts/content/ai-video/topics.json'));
  const topics = Array.isArray(catalog) ? catalog : catalog.topics;
  const day = seoulDate();
  const ordinal = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000);
  const topic = args.topic ? topics.find(row => row.id === args.topic) : topics[ordinal % topics.length];
  if (!topic) throw new Error(`Unknown topic: ${args.topic}`);
  const projectId = args.projectId || `ai-video-${day}-${topic.id}`;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(projectId)) throw new Error('Unsafe project ID');
  const projectDir = args.resume ? path.resolve(args.resume) : path.join(ROOT, 'content/ai-video', projectId);
  await fs.mkdir(projectDir, { recursive: true });
  const evidencePath = path.join(projectDir, 'project.json');
  const oldProject = await readJson(evidencePath);
  const queueDir = process.env.SCHEDULED_QUEUE_DIR || '/srv/publish-workbench/scheduled/queue';
  if (args.enqueue && !args.researchOnly) {
    const existing = await scanCreativeQueue({ queueDir });
    const postId = oldProject?.id || projectId;
    const registered = [...existing.pending, ...existing.submitted].find(post => post.id === postId);
    if (registered) {
      const bodyHtml = await fs.readFile(registered.bodyFile, 'utf8');
      const gate = await verifyCreativeEvidence({ evidencePath: registered.evidencePath, bodyHtml, requireVerifiedState: true });
      if (!gate.ok) throw new Error(`Registered project evidence failed: ${gate.failures.join('; ')}`);
      console.log(JSON.stringify({ projectDir, registration: oldProject?.registration, reused: true }, null, 2));
      return;
    }
    const publishDay = (args.publishAt || futureSeoulTime()).slice(0, 10);
    if ([...existing.pending, ...existing.submitted, ...existing.failed].some(post =>
      post.id !== postId && post.publishAt?.slice(0, 10) === publishDay)) {
      console.log(JSON.stringify({ skipped: true, reason: 'daily-cap', publishDay }, null, 2));
      return;
    }
  }
  const history = path.join(projectDir, '.history/events.jsonl');
  await fs.mkdir(path.dirname(history), { recursive: true });
  const record = async (operation, state, detail = {}) => fs.appendFile(history, JSON.stringify({ at: new Date().toISOString(), operation, state, ...detail }) + '\n');
  await record('tutorial-run', 'started', { topic: topic.id, enqueue: args.enqueue, videoGenerated: false });
  try {
    const researchFile = path.join(projectDir, 'references/research.json');
    let research = await readJson(researchFile);
    const cachedCapabilities = research ? checkFlowCapabilities(research) : null;
    if (!research?.ok || !productionSourceCoverage(research.sources).ok || !cachedCapabilities?.omni10s || !cachedCapabilities?.veo8s) {
      research = await collectResearch({ topic, outputDir: projectDir });
      await save(researchFile, research);
    }
    console.log(`[research] ${research.sources?.length || 0} fetched sources; ${new Set((research.sources || []).map(s => s.language)).size} languages`);
    if (args.researchOnly) {
      await record('tutorial-run', 'completed', { researchOnly: true, researchFile });
      console.log(JSON.stringify({ projectDir, researchFile, searches: research.searches, failures: research.failures }, null, 2));
      return;
    }
    const skills = await loadSkills();
    const recipeFile = path.join(projectDir, 'recipe.json');
    let recipe = await readJson(recipeFile);
    if (!recipe) {
      recipe = await draftRecipe({ topic, research, skillTexts: skills, callJson });
      await save(recipeFile, recipe);
    }
    const recipeGate = validateRecipe(recipe, { topic, research });
    if (!recipeGate.ok) throw new Error(`Recipe QA failed before production: ${recipeGate.failures.join('; ')}`);
    console.log(`[recipe] ${recipe.title}; ${recipe.scenes.length} scenes`);
    const project = await produceSheets({ recipe: { ...recipe, sources: research.sources, sourceBundle: research.sources }, projectDir, callJson: reviewJson, env: process.env });
    project.id = project.id || projectId;
    project.projectDir = projectDir;
    project.sources = research.sources;
    project.skills = skills.map(({ name, sha256 }) => ({ name, sha256 }));
    project.videoGenerated = false;
    await save(evidencePath, project);
    const html = renderArticle({ recipe, research, project });
    const htmlPath = path.join(projectDir, 'article.html');
    await fs.writeFile(htmlPath, html);
    const qa = qaHtmlPost(html, { title: recipe.title, keyword: recipe.keyword, category: 'AI·P2P', contentType: 'tutorial', ymylRisk: 'none' });
    await save(path.join(projectDir, 'article.qa.json'), qa);
    if (!qa.ok) throw new Error(`Article QA failed: ${qa.failures.map(f => f.code).join(', ')}`);
    const evidence = await verifyCreativeEvidence({ evidencePath, bodyHtml: html, projectRoot: projectDir });
    await save(path.join(projectDir, 'evidence.qa.json'), evidence);
    if (!evidence.ok) throw new Error(`Creative evidence failed: ${evidence.failures.join('; ')}`);
    console.log(`[verified] ${project.assets.length} generated assets; ${project.sheets.length} storyboard sheets`);
    let registration = null;
    if (args.enqueue) {
      const firstSheet = project.sheets[0];
      const heroImage = path.resolve(projectDir, firstSheet.path);
      registration = await registerCreativePost({ queueDir, post: {
        id: project.id, runId: project.id, state: 'verified', status: 'qa_passed',
        keyword: recipe.keyword, title: recipe.title, blogUrl: 'https://acstory.tistory.com',
        category: 'AI·P2P', contentType: 'tutorial', tags: ['AI영상제작', '스토리보드', 'GoogleFlow'],
        bodyFile: htmlPath, heroImage, imageRequired: true,
        image: { status: 'ready', method: 'creative-production' }, requiresProvenance: true,
        sourceBundle: research.sources, ymylRisk: 'none', contentTrack: 'ai-video', evidencePath,
        publishAt: args.publishAt || futureSeoulTime()
      }});
      if (!registration.registered) throw new Error(`Creative registration blocked: ${registration.reason}`);
    }
    await record('tutorial-run', 'completed', { htmlPath, evidencePath, registration });
    console.log(JSON.stringify({ projectDir, htmlPath, evidencePath, registration, videoGenerated: false }, null, 2));
  } catch (error) {
    await record('tutorial-run', 'failed', { message: error.message });
    throw error;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
