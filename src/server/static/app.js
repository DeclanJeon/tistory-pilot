import {
  htmlDescription,
  htmlTitle,
  inferCategory,
  inferTags,
  isHtmlDocument,
  stripHtml
} from '/publish-inference.js?v=202606231245';
import {
  buildFallbackImageUrl,
  collectRelativeBodyAssetPaths,
  inlineBodyAssetDataUrls,
  normalizeAssetPath
} from '/body-asset-utils.js?v=202606231245';


const state = {
  jobs: [],
  blogs: [],
  selectedJobId: null,
  eventSource: null,
  autoPublishSourceJobId: null,
  autoPublishing: false,
  sourceAssetDataUrls: {},
  sourceFileName: ''
};

async function request(resource, options = {}) {
  const response = await fetch(resource, {
    credentials: 'same-origin',
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    },
    ...options
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `request failed: ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function $(id) { return document.getElementById(id); }
function showLoginError(message) { $('login-error').textContent = message; $('login-error').classList.remove('hidden'); }
function hideLoginError() { $('login-error').classList.add('hidden'); }
function setStatus(message) { const box = $('status-box'); box.textContent = message; box.classList.remove('hidden'); }
function appendLog(message) { const item = document.createElement('div'); item.className = 'log-item'; item.textContent = message; $('activity-log').prepend(item); }
function currentBlogUrl() { return $('blog-url').value.trim() || 'https://acstory.tistory.com'; }

function isMostlyLinks(input) {
  const lines = String(input || '').split(/\n+/).map(v => v.trim()).filter(Boolean);
  return lines.length > 0 && lines.every(line => /^https?:\/\//i.test(line));
}

function sourceLinks(input) {
  return String(input || '').split(/\n+/).map(v => v.trim()).filter(v => /^https?:\/\//i.test(v));
}

function sourceText() {
  return $('source-input').value.trim();
}

function preparedSourceText() {
  return inlineBodyAssetDataUrls(sourceText(), state.sourceAssetDataUrls || {});
}

function clearSourceAssets() {
  state.sourceAssetDataUrls = {};
  state.sourceFileName = '';
}

function isSupportedSourceFile(file) {
  const name = String(file?.name || '').toLowerCase();
  return /\.(md|markdown|html|htm)$/.test(name);
}

function candidateAssetKeys(file) {
  const normalized = normalizeAssetPath(file?.webkitRelativePath || file?.name || '');
  if (!normalized) return [];
  const parts = normalized.split('/');
  return [...new Set([normalized, parts.at(-1)])];
}

function resolveAssetFile(files, assetPath) {
  const normalizedAssetPath = normalizeAssetPath(assetPath);
  if (!normalizedAssetPath) return null;
  const candidates = files
    .map(file => ({ file, keys: candidateAssetKeys(file) }))
    .filter(entry => entry.keys.length > 0);
  const exact = candidates.find(entry => entry.keys.includes(normalizedAssetPath));
  if (exact) return exact.file;
  const suffix = candidates
    .filter(entry => entry.keys.some(key => key.endsWith(`/${normalizedAssetPath}`) || normalizedAssetPath.endsWith(`/${key}`)))
    .sort((a, b) => (b.keys[0] || '').length - (a.keys[0] || '').length)[0];
  return suffix?.file || null;
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error(`파일을 읽지 못했다: ${file?.name || 'unknown'}`));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

async function buildSourceAssetDataUrls(text, files) {
  const assetPaths = collectRelativeBodyAssetPaths(text);
  const assetDataUrls = {};
  const missingAssetPaths = [];
  const category = inferCategory([htmlTitle(text), htmlDescription(text), stripHtml(text)].filter(Boolean).join('\n'));
  for (const assetPath of assetPaths) {
    const file = resolveAssetFile(files, assetPath);
    if (!file) {
      missingAssetPaths.push(assetPath);
      assetDataUrls[normalizeAssetPath(assetPath)] = buildFallbackImageUrl({
        assetPath,
        title: htmlTitle(text),
        description: htmlDescription(text),
        text: stripHtml(text),
        category
      });
      continue;
    }
    assetDataUrls[normalizeAssetPath(assetPath)] = await readFileAsDataUrl(file);
  }
  return { assetDataUrls, missingAssetPaths, assetPaths };
}



function formatEventMessage(payload) {
  const detail = payload?.detail || {};
  const extras = [];
  if (detail.message) extras.push(detail.message);
  if (detail.reason) extras.push(`reason=${detail.reason}`);
  if (detail.artifactRef) extras.push(`artifact=${detail.artifactRef}`);
  if (detail.timeLeftSeconds) extras.push(`${detail.timeLeftSeconds}s`);
  return extras.length ? `${payload.at} · ${payload.type} · ${extras.join(' · ')}` : `${payload.at} · ${payload.type}`;
}

function renderJobs() {
  const list = $('job-list');
  list.innerHTML = '';
  const jobs = [...state.jobs].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  for (const job of jobs) {
    const button = document.createElement('button');
    button.className = `job-item ${job.jobId === state.selectedJobId ? 'active' : ''}`;
    button.type = 'button';
    button.innerHTML = `<strong>${job.type}</strong><br><span>${job.state} · ${job.blogUrl || 'no-blog'}</span>`;
    button.onclick = () => selectJob(job.jobId);
    list.appendChild(button);
  }
}

function renderBlogs() {
  const select = $('blog-select');
  select.innerHTML = '<option value="">저장된 블로그 선택</option>';
  for (const blog of state.blogs) {
    const option = document.createElement('option');
    option.value = blog.blogUrl;
    option.textContent = `${blog.accountName} · ${blog.blogTitle || blog.blogUrl}`;
    select.appendChild(option);
  }
}

async function refreshJobs() { state.jobs = (await request('/api/jobs')).jobs; renderJobs(); }
function preferredJobId() {
  const jobs = [...state.jobs].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return jobs.find(job => job.state === 'running' || job.state === 'waiting_for_qr')?.jobId || jobs[0]?.jobId || null;
}
async function refreshBlogs() { state.blogs = (await request('/api/blogs')).blogs; renderBlogs(); }

async function resolveJobDetail(jobId) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}`);
}

async function loadJobDetail(jobId) {
  const data = await resolveJobDetail(jobId);
  const qrArtifacts = data.artifacts.filter(artifact => artifact.kind === 'qr-image');
  if (qrArtifacts.length > 0) {
    $('qr-image').src = String(qrArtifacts.at(-1).value).trim();
    $('qr-panel').classList.remove('hidden');
  } else {
    $('qr-image').removeAttribute('src');
    $('qr-panel').classList.add('hidden');
  }
  return data;
}

function attachEvents(jobId) {
  if (state.eventSource) state.eventSource.close();
  const source = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/events`);
  state.eventSource = source;
  source.onmessage = async event => {
    const payload = JSON.parse(event.data);
    appendLog(formatEventMessage(payload));
    if (payload.type.startsWith('qr.') || payload.type === 'job.failed' || payload.type === 'job.succeeded') {
      const detail = await loadJobDetail(jobId).catch(error => { appendLog(`job detail error · ${error.message}`); return null; });
      if (payload.type === 'job.succeeded' && jobId === state.autoPublishSourceJobId && detail) {
        await publishFromSourceArtifacts(detail).catch(error => appendLog(`자동 발행 실패 · ${error.message}`));
      }
    }
    await refreshJobs().catch(error => appendLog(`job list error · ${error.message}`));
  };
}

async function selectJob(jobId) {
  state.selectedJobId = jobId;
  await loadJobDetail(jobId).catch(error => appendLog(`job detail error · ${error.message}`));
  attachEvents(jobId);
  renderJobs();
}

function payloadFromDraft(blogUrl, draft, sourceText = '') {
  const textForAi = [draft.title, draft.description, draft.body, sourceText].filter(Boolean).join('\n');
  return {
    type: 'publish_post',
    blogUrl,
    title: draft.title || '자동 생성 포스트',
    description: draft.description || '',
    body: draft.body || sourceText,
    category: inferCategory(textForAi),
    tags: inferTags(textForAi)
  };
}

async function publishPayload(payload) {
  const data = await request('/api/jobs', { method: 'POST', body: JSON.stringify(payload) });
  appendLog(`발행 job queued · ${data.job.jobId}`);
  setStatus('발행 작업을 큐에 등록했다. Tistory 로그인이 필요하면 Kakao QR이 표시된다.');
  await refreshJobs();
  await selectJob(data.job.jobId);
}

async function publishMarkdownNow(blogUrl, markdown) {
  setStatus('AI가 원고를 분석하고 제목·설명·카테고리·태그를 준비 중이다.');
  const analyzed = await request('/api/analyze', { method: 'POST', body: JSON.stringify({ markdown }) });
  $('analysis-output').textContent = JSON.stringify(analyzed, null, 2);
  const payload = payloadFromDraft(blogUrl, analyzed.draft || {}, markdown);
  await publishPayload(payload);
}

async function publishHtmlNow(blogUrl, html) {
  setStatus('HTML 원고를 그대로 발행 본문으로 준비 중이다. 제목·설명·카테고리·태그는 자동 추론한다.');
  const payload = payloadFromDraft(blogUrl, {
    title: htmlTitle(html),
    description: htmlDescription(html),
    body: html
  }, stripHtml(html));
  $('analysis-output').textContent = JSON.stringify({
    mode: 'html',
    draft: {
      title: payload.title,
      description: payload.description,
      category: payload.category,
      tags: payload.tags
    }
  }, null, 2);
  $('analysis-output').classList.remove('hidden');
  await publishPayload(payload);
}

async function publishLinksPipeline(blogUrl, links) {
  setStatus('링크 소재를 가져오고 분석하는 작업을 시작했다. 완료되면 자동으로 발행 큐에 이어서 등록한다.');
  const data = await request('/api/analyze', { method: 'POST', body: JSON.stringify({ blogUrl, links }) });
  if (!data.job) throw new Error('소재 분석 작업을 만들지 못했다.');
  state.autoPublishSourceJobId = data.job.jobId;
  appendLog(`소재 분석 job queued · ${data.job.jobId}`);
  await refreshJobs();
  await selectJob(data.job.jobId);
}

async function publishFromSourceArtifacts(jobDetail) {
  if (state.autoPublishing) return;
  state.autoPublishing = true;
  const analysis = jobDetail.artifacts.find(a => a.kind === 'source-analysis')?.value || {};
  const body = String(jobDetail.artifacts.find(a => a.kind === 'source-body')?.value || '').trim();
  const bundle = jobDetail.artifacts.find(a => a.kind === 'source-bundle')?.value || {};
  const title = bundle.title || analysis.title || '자동 수집 포스트';
  const description = bundle.description || `${title}에 대한 핵심 내용을 정리했다.`;
  const payload = payloadFromDraft(jobDetail.job.blogUrl || currentBlogUrl(), { title, description, body }, JSON.stringify(bundle));
  await publishPayload(payload);
  state.autoPublishSourceJobId = null;
  state.autoPublishing = false;
}

async function startAutopilotPublish() {
  const blogUrl = currentBlogUrl();
  const input = preparedSourceText();
  if (!blogUrl) throw new Error('포스팅할 블로그를 입력해라.');
  if (!input) throw new Error('글의 소재나 원고를 입력해라.');
  if (isMostlyLinks(input)) {
    await publishLinksPipeline(blogUrl, sourceLinks(input));
  } else if (isHtmlDocument(input)) {
    await publishHtmlNow(blogUrl, input);
  } else {
    await publishMarkdownNow(blogUrl, input);
  }
}

async function showApp() {
  $('login-view').classList.add('hidden');
  $('app-view').classList.remove('hidden');
  await Promise.all([refreshJobs(), refreshBlogs()]);
  const activeJobId = state.selectedJobId || preferredJobId();
  if (activeJobId) await selectJob(activeJobId);
}

async function requestCode() {
  hideLoginError();
  const email = $('email-input').value.trim();
  const result = await request('/api/session/email/request', { method: 'POST', body: JSON.stringify({ email }) });
  $('code-hint').textContent = `${result.email}로 인증 코드를 보냈다.`;
  $('code-hint').style.color = 'rgba(255,255,255,.95)';
  $('code-input').disabled = false;
  $('email-login-button').disabled = false;
  $('code-input').focus();
}

async function verifyCode() {
  hideLoginError();
  await request('/api/session/email/verify', { method: 'POST', body: JSON.stringify({ email: $('email-input').value.trim(), code: $('code-input').value.trim() }) });
  await showApp();
}

async function passwordLogin() {
  hideLoginError();
  await request('/api/session', { method: 'POST', body: JSON.stringify({ password: $('password-input').value }) });
  await showApp();
}

function wireHeroEffects() {
  const shell = $('login-view');
  const glow = $('glow-layer');
  if (shell && glow) {
    let frame = 0;
    shell.addEventListener('mousemove', event => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        glow.style.setProperty('--mx', `${event.clientX}px`);
        glow.style.setProperty('--my', `${event.clientY}px`);
        glow.style.setProperty('--r', '220px');
      });
    });
    shell.addEventListener('mouseleave', () => glow.style.setProperty('--r', '0px'));
  }
  const button = $('mobile-menu-button');
  const menu = $('mobile-menu');
  if (button && menu) button.onclick = () => menu.classList.toggle('hidden');
}

function wireAuth() {
  $('email-form').addEventListener('submit', async event => { event.preventDefault(); try { await requestCode(); } catch (error) { showLoginError(error.message); } });
  $('code-form').addEventListener('submit', async event => { event.preventDefault(); try { await verifyCode(); } catch (error) { showLoginError(error.message); } });
  $('secret-form').addEventListener('submit', async event => { event.preventDefault(); try { await passwordLogin(); } catch (error) { showLoginError(error.message); } });
  $('code-input').addEventListener('input', event => { event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6); });
}

async function loadSourceFiles(files) {
  const loadedFiles = Array.from(files || []).filter(Boolean);
  if (loadedFiles.length === 0) return;
  const sourceFile = loadedFiles.find(isSupportedSourceFile);
  if (!sourceFile) throw new Error('Markdown/HTML 원고 파일을 찾지 못했다.');
  const text = await sourceFile.text();
  const assetFiles = loadedFiles.filter(file => file !== sourceFile);
  const { assetDataUrls, missingAssetPaths, assetPaths } = await buildSourceAssetDataUrls(text, assetFiles);
  state.sourceAssetDataUrls = assetDataUrls;
  state.sourceFileName = sourceFile.name;
  $('source-input').value = text;
  const resolvedCount = Object.keys(assetDataUrls).length;
  const missingCount = missingAssetPaths.length;
  appendLog(`원고 파일 로드 · ${sourceFile.name}`);
  if (assetPaths.length > 0) {
    appendLog(`본문 이미지 자산 · ${resolvedCount}/${assetPaths.length}개 인라인 준비`);
  }
  if (missingCount > 0) {
    appendLog(`누락 이미지 자산 · ${missingAssetPaths.join(', ')} · 무료 이미지 fallback 적용`);
  }
  const assetMessage = assetPaths.length > 0
    ? ` 이미지 ${resolvedCount}/${assetPaths.length}개를 본문에 함께 싣는다.`
    : '';
  const missingMessage = missingCount > 0
    ? ` 누락된 상대경로 이미지는 ${missingCount}개다. 무료 이미지 fallback으로 채운다.`
    : '';
  setStatus(`${sourceFile.name} 파일을 불러왔다.${assetMessage}${missingMessage}`.trim());
}

function wireApp() {
  $('new-task-button').onclick = () => { $('source-input').focus(); };
  $('blog-select').onchange = event => { if (event.target.value) $('blog-url').value = event.target.value; };
  $('save-blog-button').onclick = async () => {
    const payload = { accountName: $('blog-account-name').value || 'default', blogTitle: $('blog-title').value || currentBlogUrl(), blogUrl: currentBlogUrl() };
    await request('/api/blogs', { method: 'POST', body: JSON.stringify(payload) });
    appendLog(`블로그 저장 · ${payload.blogUrl}`);
    await refreshBlogs();
  };
  $('source-file').onchange = async event => {
    await loadSourceFiles(event.target.files);
  };
  $('source-folder').onchange = async event => {
    await loadSourceFiles(event.target.files);
  };

  $('source-input').addEventListener('dragover', event => {
    event.preventDefault();
    $('source-input').classList.add('drop-active');
  });
  $('source-input').addEventListener('dragleave', () => {
    $('source-input').classList.remove('drop-active');
  });
  $('source-input').addEventListener('drop', async event => {
    event.preventDefault();
    $('source-input').classList.remove('drop-active');
    await loadSourceFiles(event.dataTransfer?.files);
  });
  $('source-input').addEventListener('paste', event => {
    const html = event.clipboardData?.getData('text/html');
    if (!html) return;
    event.preventDefault();
    clearSourceAssets();
    $('source-input').value = html;
    setStatus('클립보드의 HTML을 원고로 붙여넣었다.');
    appendLog('HTML 붙여넣기 완료');
  });
  $('source-input').addEventListener('input', () => {
    if (!$('source-input').value.trim()) clearSourceAssets();
  });
  $('publish-button').onclick = async () => {
    try { await startAutopilotPublish(); } catch (error) { setStatus(`오류: ${error.message}`); appendLog(`오류 · ${error.message}`); }
  };
}

async function bootstrap() {
  wireHeroEffects();
  wireAuth();
  wireApp();
  const session = await request('/api/session');
  if (session.authenticated) await showApp();
}

bootstrap().catch(error => showLoginError(error.message));
