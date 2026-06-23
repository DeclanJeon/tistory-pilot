export const JOB_TYPES = Object.freeze([
  'source_import',
  'category_ensure',
  'draft_prepare',
  'publish_post'
]);

export const JOB_STATES = Object.freeze([
  'queued',
  'running',
  'waiting_for_qr',
  'waiting_for_editor',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out'
]);

function assertString(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }
  if (!allowEmpty && value.trim() === '') {
    throw new Error(`${label} must not be empty.`);
  }
  return value;
}

function assertArrayOfStrings(value, label) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value;
}

function assertNullableString(value, label) {
  if (value === null) return value;
  return assertString(value, label, { allowEmpty: false });
}

function assertEnum(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`${label} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

export function createJobMetadata(input) {
  const createdAt = input.createdAt || new Date().toISOString();
  const updatedAt = input.updatedAt || createdAt;

  return validateJobMetadata({
    jobId: input.jobId,
    type: input.type,
    state: input.state || 'queued',
    blogUrl: input.blogUrl,
    createdBy: input.createdBy,
    createdAt,
    updatedAt,
    artifactRefs: input.artifactRefs || [],
    lockOwner: input.lockOwner ?? null,
    failureCode: input.failureCode ?? null
  });
}

export function validateJobMetadata(job) {
  return {
    jobId: assertString(job.jobId, 'jobId'),
    type: assertEnum(job.type, JOB_TYPES, 'type'),
    state: assertEnum(job.state, JOB_STATES, 'state'),
    blogUrl: assertString(job.blogUrl, 'blogUrl'),
    createdBy: assertString(job.createdBy, 'createdBy'),
    createdAt: assertString(job.createdAt, 'createdAt'),
    updatedAt: assertString(job.updatedAt, 'updatedAt'),
    artifactRefs: assertArrayOfStrings(job.artifactRefs, 'artifactRefs'),
    lockOwner: assertNullableString(job.lockOwner, 'lockOwner'),
    failureCode: assertNullableString(job.failureCode, 'failureCode')
  };
}

export function createJobEvent(input) {
  return {
    jobId: assertString(input.jobId, 'jobId'),
    at: assertString(input.at || new Date().toISOString(), 'at'),
    type: assertString(input.type, 'type'),
    detail: input.detail && typeof input.detail === 'object' ? input.detail : {}
  };
}
