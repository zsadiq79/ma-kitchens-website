const buckets = new Map();
const WINDOW_MS = 60000;
const MAX_CLIENTS = 2000;

export function orderRateLimited(request, action, limit = 12, now = Date.now()) {
  const ip = (request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown').slice(0,80);
  const key = action + ':' + ip;
  for (const [candidate, bucket] of buckets) if (now - bucket.started >= WINDOW_MS) buckets.delete(candidate);
  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_CLIENTS) return true;
    bucket = { started: now, count: 0 }; buckets.set(key,bucket);
  }
  return ++bucket.count > limit;
}

export async function readOrderBytes(request, maximum) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > maximum) throw new Error('BODY_TOO_LARGE');
  if (!request.body) throw new Error('INVALID_JSON');
  const reader = request.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
  } finally { reader.releaseLock(); }
}

export async function readOrderJson(request,maximum) {
  return JSON.parse((await readOrderBytes(request,maximum)).toString('utf8'));
}

export function orderBackendEndpoint(value, action) {
  const endpoint = new URL(value);
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'script.google.com' ||
      !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint.pathname) || endpoint.username || endpoint.password || endpoint.port || endpoint.search || endpoint.hash)
    throw new Error('INVALID_BACKEND_CONFIGURATION');
  endpoint.searchParams.set('action',action); return endpoint;
}
