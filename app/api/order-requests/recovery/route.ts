import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTION = 'order_request_recover';
const MAX_BODY_BYTES = 2000;

function allowedOrigins() {
  const values = new Set((process.env.ORDER_REQUEST_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
  for (const key of ['VERCEL_URL', 'VERCEL_BRANCH_URL']) {
    const value = process.env[key];
    if (value && /^[A-Za-z0-9.-]+$/.test(value)) values.add(`https://${value}`);
  }
  if (process.env.NODE_ENV === 'development') { values.add('http://localhost:3000'); values.add('http://127.0.0.1:3000'); }
  return values;
}

function validOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { const parsed = new URL(origin); return parsed.origin === origin && allowedOrigins().has(origin); }
  catch { return false; }
}

async function readBody(request: Request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY_BYTES || !request.body) throw new Error('INVALID_BODY');
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('INVALID_BODY'); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8')); }
  catch { throw new Error('INVALID_BODY'); }
}

function endpointFor(value: string) {
  const endpoint = new URL(value);
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'script.google.com' ||
      !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint.pathname) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
    throw new Error('INVALID_BACKEND_CONFIGURATION');
  endpoint.searchParams.set('action', ACTION); return endpoint;
}

export async function POST(request: Request) {
  if (!validOrigin(request)) return NextResponse.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  let input: unknown;
  try { input = await readBody(request); } catch { return NextResponse.json({ ok: false, error: 'INVALID_REQUEST' }, { status: 400, headers: { 'Cache-Control': 'no-store' } }); }
  const capability = input && typeof input === 'object' && !Array.isArray(input) ? (input as { capability?: unknown }).capability : null;
  if (typeof capability !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(capability))
    return NextResponse.json({ ok: false, error: 'INVALID_RECOVERY_CAPABILITY' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  const secret = process.env.ORDER_REQUEST_API_SECRET, rawUrl = process.env.ORDER_REQUEST_API_URL;
  if (!secret || secret.length < 32 || !rawUrl) return NextResponse.json({ ok: false, error: 'ORDER_CAPTURE_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  let endpoint: URL;
  try { endpoint = endpointFor(rawUrl); } catch { return NextResponse.json({ ok: false, error: 'ORDER_CAPTURE_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  const timestamp = String(Date.now()), body = JSON.stringify({ capability });
  const signature = createHmac('sha256', secret).update(`${timestamp}\n${ACTION}\n${body}`).digest('hex');
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp, body, signature }), signal: AbortSignal.timeout(12000), cache: 'no-store' });
    const final = new URL(response.url);
    if (!response.ok || final.protocol !== 'https:' || !['script.google.com', 'script.googleusercontent.com'].includes(final.hostname)) throw new Error();
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || (result as { ok?: unknown }).ok !== true || typeof (result as { found?: unknown }).found !== 'boolean') throw new Error();
    const found = (result as { found: boolean }).found;
    if (!found) return NextResponse.json({ ok: true, found: false }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    const value = result as { reference?: unknown; status?: unknown; deliveryDate?: unknown; publicTotalCents?: unknown; createdAt?: unknown };
    if (typeof value.reference !== 'string' || !/^MK-[A-Z0-9]{8}$/.test(value.reference) ||
        typeof value.status !== 'string' || !/^(UNASSIGNED|RECEIVED|UNDER_REVIEW|ACCEPTED|REJECTED|EXPIRED)$/.test(value.status) ||
        typeof value.deliveryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.deliveryDate) ||
        !Number.isSafeInteger(value.publicTotalCents) || Number(value.publicTotalCents) < 0 ||
        typeof value.createdAt !== 'string' || value.createdAt.length > 40) throw new Error();
    return NextResponse.json({ ok: true, found: true, reference: value.reference, status: value.status,
      deliveryDate: value.deliveryDate, publicTotalCents: value.publicTotalCents, createdAt: value.createdAt },
      { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch {
    return NextResponse.json({ ok: false, error: 'RECOVERY_UNAVAILABLE' }, { status: 502, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  }
}
