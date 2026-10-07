/**
 * evidence.mjs — creative evidence gate for the ai-video track.
 *
 * verifyCreativeEvidence({ evidencePath, bodyHtml, projectRoot? })
 *   -> { ok: boolean, failures: string[] }
 *
 * Re-verifies the recorded production chain before a post may be queued:
 *   - every asset file exists and its sha256 matches the record
 *   - every prompt file exists and hashes to the recorded promptSha256, and the
 *     recorded prompt string matches the prompt file bytes
 *   - keyframe assets are bound to actual character-sheet reference hashes
 *   - every asset plus the assembled sheet has a semantic review with
 *     verdict 'pass' bound to the CURRENT file hash and prompt hash
 *   - sheet/panel/scene-overview files exist with matching hashes, panel
 *     coverage is complete, and panels point at real keyframe assets
 *   - the render manifest exists, parses, and binds panels to sheet geometry
 *   - the article body embeds every recorded prompt and Flow prompt verbatim
 *     and references the actual produced images (relative path or inlined
 *     data: URL matched by content sha256)
 *   - the source bundle covers >= 2 languages across >= 2 distinct URLs
 *   - videoGenerated stays false and no video artifacts exist
 *
 * The function NEVER throws: any internal error becomes
 * { ok: false, failures: ['evidence-error: ...'] } (fail-closed).
 * Source bundle text and prompts are untrusted data, never executed.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { productionSourceCoverage } from './research.mjs';

const APP_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const PROJECT_FILE = 'project.json';
const FLOW_SPECS = [
  { field: 'flowPrompt10s', model: 'Omni Flash 1.1', seconds: 10 },
  { field: 'flowPrompt8s', model: 'Veo 3.1', seconds: 8 }
];
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function sha256Bytes(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function sha256File(filePath) {
  return sha256Bytes(await fsp.readFile(filePath));
}

function isHex64(v) {
  return typeof v === 'string' && /^[0-9a-f]{64}$/i.test(v);
}

function resolveEvidence(evidencePath, projectRoot) {
  const raw = String(evidencePath || '');
  if (!raw) return { projectPath: null, dir: null };
  const candidates = [];
  if (path.isAbsolute(raw)) candidates.push(raw);
  else {
    if (projectRoot) candidates.push(path.resolve(projectRoot, raw));
    candidates.push(path.resolve(APP_ROOT, raw));
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const stat = fs.statSync(candidate);
      if (stat.isDirectory()) {
        const pj = path.join(candidate, PROJECT_FILE);
        return fs.existsSync(pj)
          ? { projectPath: pj, dir: candidate }
          : { projectPath: null, dir: candidate };
      }
      return { projectPath: candidate, dir: path.dirname(candidate) };
    }
  }
  // Nothing exists; fall back to the first candidate for a clear failure.
  const fallback = candidates[0] || path.resolve(APP_ROOT, raw);
  return {
    projectPath: fallback.endsWith('.json') ? fallback : path.join(fallback, PROJECT_FILE),
    dir: fallback.endsWith('.json') ? path.dirname(fallback) : fallback
  };
}

function unescapeHtml(text) {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

/** Split HTML into code/pre blocks and the rest, entity-unescaped. */
function bodyTexts(bodyHtml) {
  const html = String(bodyHtml || '');
  const codeChunks = [...html.matchAll(/<(?:pre|code)\b[^>]*>([\s\S]*?)<\/(?:pre|code)>/gi)]
    .map((m) => unescapeHtml(m[1].replace(/<[^>]+>/g, '')));
  const noTags = unescapeHtml(html.replace(/<[^>]+>/g, ' '));
  return { codeChunks, full: noTags };
}

function promptBound(promptText, { codeChunks, full }) {
  const needle = String(promptText || '').trim();
  if (!needle) return false;
  if (codeChunks.some((c) => c.includes(needle))) return true;
  // tolerate code blocks split across adjacent pre/code siblings
  return full.includes(needle);
}

function imgSources(bodyHtml) {
  const matches = String(bodyHtml || '').matchAll(/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi);
  return [...new Set([...matches].map(match => unescapeHtml(match[1] ?? match[2] ?? match[3])))];
}

function decodeDataUrl(src) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(String(src || ''));
  if (!m || !m[2]) return null;
  try {
    return Buffer.from(decodeURIComponent(m[3]), 'base64');
  } catch {
    try { return Buffer.from(m[3], 'base64'); } catch { return null; }
  }
}

async function walkFiles(dir, predicate) {
  const found = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try { entries = await fsp.readdir(current, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(current, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile() && (!predicate || predicate(p))) found.push(p);
    }
  }
  return found;
}

async function videoFilesIn(dir) {
  return walkFiles(dir, (p) => VIDEO_EXTENSIONS.has(path.extname(p).toLowerCase()));
}

/**
 * @param {{evidencePath:string, bodyHtml:string, projectRoot?:string}} args
 * @returns {Promise<{ok:boolean, failures:string[]}>}
 */
export async function verifyCreativeEvidence({ evidencePath, bodyHtml, projectRoot, heroImagePath } = {}) {
  const failures = [];
  try {
    const { projectPath, dir: projectDir } = resolveEvidence(evidencePath, projectRoot);
    if (!projectPath || !fs.existsSync(projectPath)) {
      return { ok: false, failures: [`project.json not found at evidencePath ${evidencePath}`] };
    }

    let project;
    try {
      project = JSON.parse(await fsp.readFile(projectPath, 'utf8'));
    } catch (err) {
      return { ok: false, failures: [`project.json unreadable: ${err.message}`] };
    }

    // ---- top-level invariants ------------------------------------------------
    if (project.schemaVersion !== 1) failures.push('project schemaVersion must be 1');
    if (project.contentTrack !== 'ai-video') failures.push('project contentTrack must be ai-video');
    if (project.videoGenerated !== false) failures.push('project.videoGenerated must be false');
    const recipe = project.recipe || {};
    const scenes = Array.isArray(recipe.scenes) ? recipe.scenes : [];
    const characters = Array.isArray(recipe.characters) ? recipe.characters : [];
    if (scenes.length < 1 || scenes.length > 3) failures.push(`scene count ${scenes.length} outside 1..3`);
    if (scenes.length * 2 > 8) failures.push('panel count exceeds 8');
    if (characters.length > 2) failures.push('character count exceeds 2');

    // ---- no-video invariant: files ------------------------------------------
    for (const vf of await videoFilesIn(projectDir)) {
      failures.push(`video artifact present: ${path.basename(vf)}`);
    }

    // ---- sources: >=2 languages, >=2 URLs -------------------------------------
    const sources = Array.isArray(project.sources) && project.sources.length
      ? project.sources
      : (Array.isArray(recipe.sourceBundle) ? recipe.sourceBundle : []);
    const langs = new Set(sources.map((s) => String(s?.language || '').toLowerCase()).filter(Boolean));
    const urls = new Set(sources.map((s) => s?.finalUrl || s?.url).filter(Boolean));
    if (sources.length < 2) failures.push('source bundle has fewer than 2 sources');
    if (langs.size < 2) failures.push('source bundle covers fewer than 2 languages');
    if (urls.size < 2) failures.push('source bundle covers fewer than 2 distinct URLs');
    const used = sources.filter(source => recipe.sourceIds?.includes(source.id));
    const coverage = productionSourceCoverage(used);
    if (!coverage.ok) failures.push(`actually used production sources insufficient: ${coverage.documents} documents/${coverage.languages} languages/${coverage.sites} sites`);
    for (const s of sources) {
      if (isHex64(s?.contentSha256) && typeof s?.text === 'string' && s.text) {
        if (sha256Bytes(Buffer.from(s.text)) !== s.contentSha256) {
          failures.push(`source ${s.id || s.url} contentSha256 mismatch`);
        }
      } else if (!isHex64(s?.contentSha256)) {
        failures.push(`source ${s?.id || s?.url} missing contentSha256`);
      }
    }

    // ---- assets ----------------------------------------------------------------
    const assets = Array.isArray(project.assets) ? project.assets : [];
    const assetIds = new Set(assets.map((a) => a.id));
    const sheetAssets = new Map(assets.filter((a) => a.kind === 'character-sheet').map((a) => [a.characterId, a]));

    for (const ch of characters) {
      const cid = String(ch.id || '').toLowerCase();
      const has = assets.some((a) => a.kind === 'character-sheet' && String(a.characterId || '').toLowerCase() === cid);
      if (!has) failures.push(`missing character-sheet asset for ${ch.id}`);
    }
    for (const scene of scenes) {
      for (const role of ['start', 'end']) {
        const has = assets.some((a) => a.kind === 'keyframe' && a.sceneId === scene.id && a.role === role);
        if (!has) failures.push(`missing ${role} keyframe for ${scene.id}`);
      }
    }

    for (const asset of assets) {
      if (!asset.id || !asset.path) { failures.push('asset missing id/path'); continue; }
      const abs = path.join(projectDir, asset.path);
      if (!fs.existsSync(abs)) { failures.push(`asset file missing: ${asset.path}`); continue; }
      if (!isHex64(asset.sha256)) failures.push(`asset ${asset.id} missing sha256`);
      else if ((await sha256File(abs)) !== asset.sha256) failures.push(`asset file tampered: ${asset.path}`);
      if (!isHex64(asset.promptSha256)) {
        failures.push(`asset ${asset.id} missing promptSha256`);
      } else {
        const promptFile = path.join(projectDir, String(asset.promptPath || ''));
        if (!asset.promptPath || !fs.existsSync(promptFile)) {
          failures.push(`prompt file missing for ${asset.id}`);
        } else {
          const bytes = await fsp.readFile(promptFile);
          if (sha256Bytes(bytes) !== asset.promptSha256) failures.push(`prompt file tampered for ${asset.id}`);
          if (bytes.toString('utf8') !== String(asset.prompt)) failures.push(`recorded prompt does not match prompt file for ${asset.id}`);
        }
      }
      if (!asset.model) failures.push(`asset ${asset.id} missing model`);
      if (!asset.generatedAt) failures.push(`asset ${asset.id} missing generatedAt`);
      if (asset.kind === 'keyframe') {
        const scene = scenes.find((s) => s.id === asset.sceneId);
        const expectedRefs = (scene?.characterIds || []).length;
        const refs = Array.isArray(asset.referenceHashes) ? asset.referenceHashes : [];
        if (expectedRefs === 0 && refs.length !== 0) {
          failures.push(`keyframe ${asset.id} has unexpected references`);
        }
        if (expectedRefs > 0) {
          const sheetHashSet = new Set([...sheetAssets.values()].map((a) => a.sha256));
          if (refs.length !== expectedRefs) failures.push(`keyframe ${asset.id} reference count ${refs.length} != ${expectedRefs}`);
          for (const h of refs) {
            if (!sheetHashSet.has(h)) failures.push(`keyframe ${asset.id} reference ${String(h).slice(0, 12)} not a character sheet`);
          }
        }
        // references must belong to this scene's characters
        const sceneSheetHashes = new Set(
          (scene?.characterIds || [])
            .map((cid) => [...sheetAssets.entries()].find(([k]) => String(k).toLowerCase() === String(cid).toLowerCase())?.[1]?.sha256)
            .filter(Boolean)
        );
        for (const h of refs) {
          if (expectedRefs > 0 && !sceneSheetHashes.has(h)) {
            failures.push(`keyframe ${asset.id} references a sheet not in scene ${asset.sceneId}`);
          }
        }
      }
    }

    // ---- sheets / panels / overviews -------------------------------------------
    const sheets = Array.isArray(project.sheets) ? project.sheets : [];
    if (sheets.length < 1) failures.push('no assembled sheet recorded');
    const sheetPanelIds = new Set();
    for (const sheet of sheets) {
      const abs = path.join(projectDir, String(sheet.path || ''));
      if (!sheet.path || !fs.existsSync(abs)) { failures.push(`sheet missing: ${sheet.path}`); continue; }
      if (!isHex64(sheet.sha256) || (await sha256File(abs)) !== sheet.sha256) failures.push(`sheet tampered: ${sheet.path}`);
      for (const pid of sheet.panelIds || []) sheetPanelIds.add(pid);
    }

    const panels = Array.isArray(project.panels) ? project.panels : [];
    const expectedPanelIds = scenes.flatMap((s) => [`${s.id}-start`, `${s.id}-end`]);
    const panelById = new Map(panels.map((p) => [p.id, p]));
    for (const pid of expectedPanelIds) {
      const panel = panelById.get(pid);
      if (!panel) { failures.push(`missing panel ${pid}`); continue; }
      for (const [key, shaKey] of [['path', 'sha256'], ['cleanPath', 'cleanSha256']]) {
        const abs = path.join(projectDir, String(panel[key] || ''));
        if (!panel[key] || !fs.existsSync(abs)) { failures.push(`panel file missing: ${panel[key]}`); continue; }
        if (!isHex64(panel[shaKey]) || (await sha256File(abs)) !== panel[shaKey]) failures.push(`panel file tampered: ${panel[key]}`);
      }
      if (!panel.assetId || !assetIds.has(panel.assetId)) failures.push(`panel ${pid} not bound to a keyframe asset`);
      if (!sheetPanelIds.has(pid)) failures.push(`panel ${pid} not listed on assembled sheet`);
    }
    // assembled sheet must not claim panels that are not recorded
    for (const pid of sheetPanelIds) {
      if (!panelById.has(pid)) failures.push(`sheet lists unrecorded panel ${pid}`);
    }


    const overviews = Array.isArray(project.sceneOverviews) ? project.sceneOverviews : [];
    for (const scene of scenes) {
      const ov = overviews.find((o) => o.sceneId === scene.id);
      if (!ov) { failures.push(`missing scene overview for ${scene.id}`); continue; }
      const abs = path.join(projectDir, String(ov.path || ''));
      if (!ov.path || !fs.existsSync(abs)) failures.push(`overview missing: ${ov.path}`);
      else if (!isHex64(ov.sha256) || (await sha256File(abs)) !== ov.sha256) failures.push(`overview tampered: ${ov.path}`);
    }

    // ---- render manifest --------------------------------------------------------
    const manifestRel = project.renderManifestPath || 'render-manifest.json';
    const manifestAbs = path.join(projectDir, manifestRel);
    if (!fs.existsSync(manifestAbs)) {
      failures.push('render manifest missing');
    } else {
      try {
        const manifest = JSON.parse(await fsp.readFile(manifestAbs, 'utf8'));
        const manifestPanels = new Set((manifest.panels || []).map((p) => p.id));
        for (const pid of expectedPanelIds) {
          if (!manifestPanels.has(pid)) failures.push(`manifest missing panel ${pid}`);
        }
        if (manifest?.sheet?.path && !isHex64(manifest.sheet.sha256)) failures.push('manifest sheet sha missing');
      } catch {
        failures.push('render manifest unreadable');
      }
    }

    // ---- reviews ------------------------------------------------------------------
    const reviews = Array.isArray(project.reviews) ? project.reviews : [];
    const reviewedTargets = [
      ...assets.map((a) => ({ id: a.id, sha256: a.sha256, promptSha256: a.promptSha256 })),
      ...sheets.map((s, i) => ({ id: i === 0 ? 'storyboard-sheet' : `sheet-${i}`, sha256: s.sha256, promptSha256: null }))
    ];
    for (const target of reviewedTargets) {
      const review = reviews.find((r) => r.assetId === target.id && r.assetSha256 === target.sha256)
        || reviews.find((r) => r.assetId === target.id);
      if (!review) { failures.push(`missing review for ${target.id}`); continue; }
      if (review.assetSha256 !== target.sha256) failures.push(`review for ${target.id} bound to stale asset hash`);
      if (target.promptSha256 && review.promptSha256 !== target.promptSha256) {
        failures.push(`review for ${target.id} bound to stale prompt hash`);
      }
      if (review.verdict !== 'pass') failures.push(`review for ${target.id} verdict ${review.verdict || 'missing'} != pass`);
    }

    // ---- Flow specs per scene ------------------------------------------------------
    for (const scene of scenes) {
      for (const spec of FLOW_SPECS) {
        const promptText = scene[spec.field];
        if (!promptText || !String(promptText).trim()) {
          failures.push(`scene ${scene.id} missing ${spec.field}`);
          continue;
        }
        const duration = scene[`${spec.field}Seconds`] ?? scene[`${spec.field}Duration`] ?? scene.durationSeconds?.[spec.field];
        if (duration !== undefined && duration !== spec.seconds) {
          failures.push(`scene ${scene.id} ${spec.field} unsupported duration ${duration}`);
        }
        const declared = scene.flowSpecs?.[spec.field] || scene.flow?.[spec.field];
        if (declared) {
          if (declared.durationSeconds !== undefined && declared.durationSeconds !== spec.seconds) {
            failures.push(`scene ${scene.id} ${spec.field} declares duration ${declared.durationSeconds}`);
          }
          if (declared.model && !String(declared.model).toLowerCase().includes(spec.model.split(' ')[0].toLowerCase())) {
            failures.push(`scene ${scene.id} ${spec.field} declares unexpected model ${declared.model}`);
          }
        }
      }
    }

    // ---- article binding --------------------------------------------------------------
    const body = String(bodyHtml || '');
    if (!body.trim()) {
      failures.push('bodyHtml empty');
    } else {
      const texts = bodyTexts(body);
      for (const asset of assets) {
        if (!promptBound(asset.prompt, texts)) failures.push(`article missing verbatim prompt for asset ${asset.id}`);
      }
      for (const scene of scenes) {
        for (const spec of FLOW_SPECS) {
          if (scene[spec.field] && !promptBound(scene[spec.field], texts)) {
            failures.push(`article missing verbatim ${spec.field} for scene ${scene.id}`);
          }
        }
      }

      // image bindings: relative path src OR inlined data URL matching content hash
      const srcs = imgSources(body);
      const imageHashes = new Set();
      for (const src of srcs) {
        const bytes = decodeDataUrl(src);
        if (bytes) imageHashes.add(sha256Bytes(bytes));
        else if (!/^[a-z][a-z0-9+.-]*:/i.test(src)) {
          try { imageHashes.add(await sha256File(path.resolve(projectDir, src))); }
          catch { failures.push(`article image missing: ${src}`); }
        } else failures.push(`article references unrecorded image ${src}`);
      }


      const requiredPublishes = [
        ...assets.map((a) => ({ label: `asset ${a.id}`, path: a.path, sha256: a.sha256 })),
        ...sheets.map((s, i) => ({ label: `sheet ${i}`, path: s.path, sha256: s.sha256 })),
        ...overviews.map((o) => ({ label: `overview ${o.sceneId}`, path: o.path, sha256: o.sha256 })),
        ...panels.flatMap((p) => [
          { label: `clean panel ${p.id}`, path: p.cleanPath, sha256: p.cleanSha256 },
          { label: `panel ${p.id}`, path: p.path, sha256: p.sha256 }
        ])
      ];
      for (const req of requiredPublishes) {
        if (!req.sha256 || !imageHashes.has(req.sha256)) {
          failures.push(`article does not reference produced image for ${req.label}`);
        }
      }
      // every content image in the article must be a recorded output (no stray stock)
      for (const hash of imageHashes) {
        if (!requiredPublishes.some(image => image.sha256 === hash)) {
          failures.push('article embeds an unrecorded image');
        }
      }
      if (heroImagePath) {
        const heroHash = await sha256File(path.resolve(projectDir, heroImagePath));
        if (!requiredPublishes.some(image => image.sha256 === heroHash)) failures.push('hero image is not a recorded output');
      }

      if (/data-ai-video-generated\s*=\s*["']true["']/i.test(body)) {
        failures.push('article claims a generated video exists');
      }
    }

    // ---- operation history ------------------------------------------------------------
    const historyRel = project.historyPath || path.posix.join('.history', 'operations.jsonl');
    const historyAbs = path.join(projectDir, historyRel);
    if (!fs.existsSync(historyAbs)) {
      failures.push('operation history missing');
    } else {
      const lines = (await fsp.readFile(historyAbs, 'utf8')).split('\n').filter((l) => l.trim());
      if (!lines.length) failures.push('operation history empty');
      for (const line of lines.slice(0, 2000)) {
        try { JSON.parse(line); } catch { failures.push('operation history contains unparseable line'); break; }
      }
      const ops = lines.map((l) => { try { return JSON.parse(l).op; } catch { return null; } });
      if (!ops.includes('imagen')) failures.push('history records no image generation');
      if (!ops.includes('review')) failures.push('history records no reviews');
      for (const line of lines) {
        if (/"approved"\s*:\s*true|"approvedBy"|"humanApproval"\s*:\s*true/.test(line)) {
          failures.push('history contains a synthetic approval record');
          break;
        }
      }
    }

    return { ok: failures.length === 0, failures };
  } catch (err) {
    return { ok: false, failures: [`evidence-error: ${String(err?.message || err)}`, ...failures] };
  }
}

export default { verifyCreativeEvidence };
