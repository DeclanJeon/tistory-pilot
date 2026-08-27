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
  'waiting_for_reconcile',
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
    failureCode: input.failureCode ?? null,
    runId: input.runId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    notBefore: input.notBefore ?? null,
    attempt: input.attempt ?? 0,
    maxAttempts: input.maxAttempts ?? 1,
    nextAttemptAt: input.nextAttemptAt ?? null
  });
}

function assertNullableIso(value, label) {
  if (value === null) return value;
  const text = assertString(value, label);
  if (Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO date.`);
  return text;
}

function assertNonNegativeInteger(value, label, { minimum = 0 } = {}) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}.`);
  }
  return value;
}

export function validateJobMetadata(job) {
  const maxAttempts = assertNonNegativeInteger(job.maxAttempts ?? 1, 'maxAttempts', { minimum: 1 });
  const attempt = assertNonNegativeInteger(job.attempt ?? 0, 'attempt');
  if (attempt > maxAttempts) throw new Error('attempt must not exceed maxAttempts.');
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
    failureCode: assertNullableString(job.failureCode, 'failureCode'),
    runId: assertNullableString(job.runId ?? null, 'runId'),
    idempotencyKey: assertNullableString(job.idempotencyKey ?? null, 'idempotencyKey'),
    notBefore: assertNullableIso(job.notBefore ?? null, 'notBefore'),
    attempt,
    maxAttempts,
    nextAttemptAt: assertNullableIso(job.nextAttemptAt ?? null, 'nextAttemptAt')
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
