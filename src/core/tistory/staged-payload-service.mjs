import crypto from 'node:crypto';
import { validateStagedPublishPayload } from '../artifacts/contracts.mjs';

function artifactId(jobId, suffix) {
  return `${jobId}-${suffix}-${crypto.randomUUID()}`;
}

async function storeOptionalText(artifactStore, { jobId, kind, value }) {
  if (!value) return null;
  const record = await artifactStore.putText({
    artifactId: artifactId(jobId, kind),
    text: String(value),
    metadata: { kind, jobId }
  });
  return record.artifactId;
}


export async function stagePublishPayload({ artifactStore, jobId, blogUrl, title, body, description = '', tags = '', category = '', heroImagePath = '', sourceBundle = null }) {
  const titleRecord = await artifactStore.putText({
    artifactId: artifactId(jobId, 'title'),
    text: String(title),
    metadata: { kind: 'publish-title', jobId }
  });
  const bodyRecord = await artifactStore.putText({
    artifactId: artifactId(jobId, 'body'),
    text: String(body),
    metadata: { kind: 'publish-body', jobId }
  });

  let sourceBundleRef = null;
  if (sourceBundle) {
    const record = await artifactStore.putJson({
      artifactId: artifactId(jobId, 'source-bundle'),
      value: sourceBundle,
      metadata: { kind: 'source-bundle', jobId }
    });
    sourceBundleRef = record.artifactId;
  }

  return validateStagedPublishPayload({
    jobId,
    blogUrl,
    titleRef: titleRecord.artifactId,
    bodyRef: bodyRecord.artifactId,
    descriptionRef: await storeOptionalText(artifactStore, { jobId, kind: 'description', value: description }),
    tagsRef: await storeOptionalText(artifactStore, { jobId, kind: 'tags', value: tags }),
    categoryRef: await storeOptionalText(artifactStore, { jobId, kind: 'category', value: category }),
    heroImageRef: await storeOptionalText(artifactStore, { jobId, kind: 'hero-image-path', value: heroImagePath }),
    sourceBundleRef,
    createdAt: new Date().toISOString()
  });
}

export async function resolveStagedPublishPayload({ artifactStore, payload }) {
  const staged = validateStagedPublishPayload(payload);
  const loadText = async artifactIdValue => {
    if (!artifactIdValue) return '';
    const record = await artifactStore.get(artifactIdValue);
    const raw = await import('node:fs/promises').then(fs => fs.readFile(record.contentPath, 'utf8'));
    return raw.replace(/\n$/, '');
  };
  const loadJson = async artifactIdValue => {
    if (!artifactIdValue) return null;
    const record = await artifactStore.get(artifactIdValue);
    const raw = await import('node:fs/promises').then(fs => fs.readFile(record.contentPath, 'utf8'));
    return JSON.parse(raw);
  };

  return {
    jobId: staged.jobId,
    blogUrl: staged.blogUrl,
    title: await loadText(staged.titleRef),
    body: await loadText(staged.bodyRef),
    description: await loadText(staged.descriptionRef),
    tags: await loadText(staged.tagsRef),
    category: await loadText(staged.categoryRef),
    heroImagePath: await loadText(staged.heroImageRef),
    sourceBundle: await loadJson(staged.sourceBundleRef)
  };
}
