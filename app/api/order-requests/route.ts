import { createHmac } from 'node:crypto';
import publishedMenu from '../../../data/published-order-menu.json';
import { NextResponse } from 'next/server';
import { orderRateLimited, readOrderJson, orderBackendEndpoint } from '../../../lib/orderApiBoundary.mjs';
import { normalizeOrderRequest, orderRequestMessage, validOrderReference } from '../../../lib/orderRequest.mjs';
import { ORDERING_WHATSAPP_NUMBER, readPublishedOrderMenu } from '../../../lib/publishedOrderMenu.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Allow Apps Script cold starts and Sheets work before reporting an uncertain result.
export const maxDuration = 60;

const ACTION = 'order_request_capture';
const MAX_BODY_BYTES = 20000;
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

function signature(secret: string, timestamp: string, body: string) {
  return createHmac('sha256', secret).update(`${timestamp}\n${ACTION}\n${body}`).digest('hex');
}

function recoveryCapability(secret: string, requestKey: string) {
  return createHmac('sha256', secret).update(`order-request-recovery\n${requestKey}`).digest('base64url');
}

export async function POST(request: Request) {
  if (!checkOrigin(request)) return NextResponse.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  if (orderRateLimited(request, 'capture')) return NextResponse.json({ ok: false, error: 'RATE_LIMITED' }, { status: 429, headers: { 'Cache-Control': 'no-store' } });

  let input: unknown;
  try { input = await readOrderJson(request, MAX_BODY_BYTES); }
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
  try { backend = await orderBackendEndpoint(backendUrl, ACTION); }
  catch { return NextResponse.json({ ok: false, error: 'ORDER_CAPTURE_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }

  try {
    const response = await fetch(backend, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: signedEnvelope, signal: AbortSignal.timeout(45000), cache: 'no-store' });
    const finalUrl = new URL(response.url);
    if (finalUrl.protocol !== 'https:' || !['script.google.com', 'script.googleusercontent.com'].includes(finalUrl.hostname)) throw new Error('BACKEND_FAILED');
    if (!response.ok) throw new Error('BACKEND_FAILED');
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || (result as { ok?: unknown }).ok !== true) {
      const reported = result && typeof result === 'object' && typeof (result as { error?: unknown }).error === 'string'
        ? (result as { error: string }).error : 'ORDER_CAPTURE_FAILED';
      const code = ['MENU_STALE','MENU_CLOSED','ITEM_UNAVAILABLE','REQUEST_CONFLICT','MINIMUM_ORDER_NOT_MET','ORDER_REQUEST_BUSY','ORDER_REQUEST_NOT_READY'].includes(reported) ? reported : 'ORDER_CAPTURE_FAILED';
      const status = ['MENU_STALE', 'MENU_CLOSED', 'ITEM_UNAVAILABLE', 'REQUEST_CONFLICT','MINIMUM_ORDER_NOT_MET'].includes(code) ? 409 : 503;
      return NextResponse.json({ ok: false, error: code }, { status, headers: { 'Cache-Control': 'no-store' } });
    }
    const reference = (result as { reference?: unknown }).reference;
    if (typeof reference !== 'string' || !validOrderReference(reference)) throw new Error('BACKEND_FAILED');
    const message = orderRequestMessage(menu, normalized, reference);
    const target = new URL(`https://wa.me/${ORDERING_WHATSAPP_NUMBER}`);
    target.searchParams.set('text', message);
    return NextResponse.json({ ok: true, reference, capability, whatsappUrl: target.toString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false, error: 'ORDER_CAPTURE_UNCERTAIN' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}

