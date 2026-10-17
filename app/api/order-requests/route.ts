import { createHmac, timingSafeEqual } from 'node:crypto';
import publishedMenu from '../../../data/published-order-menu.json';
import { NextResponse } from 'next/server';
import { normalizeOrderRequest, orderRequestMessage } from '../../../lib/orderRequest.mjs';
import { ORDERING_WHATSAPP_NUMBER, readPublishedOrderMenu } from '../../../lib/publishedOrderMenu.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTION = 'order_request_capture';
const MAX_BODY_BYTES = 20000;
const WINDOW_MS = 60000;
const MAX_REQUESTS_PER_WINDOW = 12;
const recentRequests = new Map<string, number[]>();

function allowedOrigins() {
  const configured = (process.env.ORDER_REQUEST_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  const values = new Set(configured);
  for (const key of ['VERCEL_URL', 'VERCEL_BRANCH_URL']) {
    const value = process.env[key];
    if (value && /^[A-Za-z0-9.-]+$/.test(value)) values.add(`https://${value}`);
  }
  if (process.env.NODE_ENV === 'development') {
    values.add('http://localhost:3000');
    values.add('http://127.0.0.1:3000');
  }
  return values;
}

function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin && allowedOrigins().has(origin);
  } catch { return false; }
}

function clientKey(request: Request) {
  const value = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  return value.slice(0, 80);
}

function rateLimited(request: Request, now = Date.now()) {
  const key = clientKey(request), current = (recentRequests.get(key) || []).filter(value => now - value < WINDOW_MS);
  if (current.length >= MAX_REQUESTS_PER_WINDOW) { recentRequests.set(key, current); return true; }
  current.push(now);
  recentRequests.set(key, current);
  if (recentRequests.size > 1000) {
    for (const [candidate, times] of recentRequests) if (!times.length || now - times[times.length - 1] >= WINDOW_MS) recentRequests.delete(candidate);
  }
  return false;
}

async function readBoundedJson(request: Request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
  if (!request.body) throw new Error('INVALID_JSON');
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('INVALID_JSON'); }
}

function safeEndpoint(value: string) {
  const endpoint = new URL(value);
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'script.google.com' ||
      !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint.pathname) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
    throw new Error('INVALID_BACKEND_CONFIGURATION');
  endpoint.searchParams.set('action', ACTION);
  return endpoint;
}

function signature(secret: string, timestamp: string, body: string) {
  return createHmac('sha256', secret).update(`${timestamp}\n${ACTION}\n${body}`).digest('hex');
}

function equalSignature(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function recoveryCapability(secret: string, requestKey: string) {
  return createHmac('sha256', secret).update(`order-request-recovery\n${requestKey}`).digest('base64url');
}

export async function POST(request: Request) {
  if (!checkOrigin(request)) return NextResponse.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  if (rateLimited(request)) return NextResponse.json({ ok: false, error: 'RATE_LIMITED' }, { status: 429, headers: { 'Cache-Control': 'no-store' } });

  let input: unknown;
  try { input = await readBoundedJson(request); }
  catch (error) {
    const status = error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 413 : 400;
    return NextResponse.json({ ok: false, error: status === 413 ? 'REQUEST_TOO_LARGE' : 'INVALID_REQUEST' }, { status, headers: { 'Cache-Control': 'no-store' } });
  }

  const secret = process.env.ORDER_REQUEST_API_SECRET, backendUrl = process.env.ORDER_REQUEST_API_URL;
  if (!secret || !backendUrl || secret.length < 32) return NextResponse.json({ ok: false, error: 'ORDER_CAPTURE_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

  const menu = readPublishedOrderMenu(publishedMenu);
  if (!menu) return NextResponse.json({ ok: false, error: 'MENU_CLOSED' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
  let normalized;
  try { normalized = normalizeOrderRequest(publishedMenu, input); }
  catch (error) {
    const code = error instanceof Error ? error.message : 'INVALID_REQUEST';
    const status = code === 'MENU_UNAVAILABLE' || code === 'MENU_REVISION_MISMATCH' || code === 'MINIMUM_ORDER_NOT_MET' ? 409 : 400;
    return NextResponse.json({ ok: false, error: code }, { status, headers: { 'Cache-Control': 'no-store' } });
  }

  const timestamp = String(Date.now());
  const capability = recoveryCapability(secret, normalized.requestKey);
  const body = JSON.stringify({
    requestKey: normalized.requestKey,
    menuRevision: normalized.menuRevision,
    menuCycleId: normalized.menuCycleId,
    deliveryDate: normalized.deliveryDate,
    recoveryCapability: capability,
    items: normalized.items.map(item => ({ id: item.id, quantity: item.quantity })),
  });
  const signedEnvelope = JSON.stringify({ timestamp, body, signature: signature(secret, timestamp, body) });

  let backend;
  try { backend = await safeEndpoint(backendUrl); }
  catch { return NextResponse.json({ ok: false, error: 'ORDER_CAPTURE_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }

  try {
    const response = await fetch(backend, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: signedEnvelope, signal: AbortSignal.timeout(12000), cache: 'no-store' });
    const finalUrl = new URL(response.url);
    if (finalUrl.protocol !== 'https:' || !['script.google.com', 'script.googleusercontent.com'].includes(finalUrl.hostname)) throw new Error('BACKEND_FAILED');
    if (!response.ok) throw new Error('BACKEND_FAILED');
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || (result as { ok?: unknown }).ok !== true) {
      const code = result && typeof result === 'object' && typeof (result as { error?: unknown }).error === 'string'
        ? (result as { error: string }).error : 'ORDER_CAPTURE_FAILED';
      const status = ['MENU_STALE', 'MENU_CLOSED', 'ITEM_UNAVAILABLE', 'REQUEST_CONFLICT'].includes(code) ? 409 : 503;
      return NextResponse.json({ ok: false, error: code }, { status, headers: { 'Cache-Control': 'no-store' } });
    }
    const reference = (result as { reference?: unknown }).reference;
    if (typeof reference !== 'string' || !/^MK-[A-Z0-9]{8}$/.test(reference)) throw new Error('BACKEND_FAILED');
    const message = orderRequestMessage(menu, normalized, reference);
    const target = new URL(`https://wa.me/${ORDERING_WHATSAPP_NUMBER}`);
    target.searchParams.set('text', message);
    return NextResponse.json({ ok: true, reference, capability, whatsappUrl: target.toString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false, error: 'ORDER_CAPTURE_UNCERTAIN' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
