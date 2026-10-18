import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { orderRateLimited, readOrderJson, orderBackendEndpoint } from '../../../../lib/orderApiBoundary.mjs';
import { ORDERING_WHATSAPP_NUMBER } from '../../../../lib/publishedOrderMenu.mjs';

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

export async function POST(request: Request) {
  if (!validOrigin(request)) return NextResponse.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  if (orderRateLimited(request,'recovery',30)) return NextResponse.json({ok:false,error:'RATE_LIMITED'},{status:429,headers:{'Cache-Control':'no-store'}});
  let input: unknown;
  try { input = await readOrderJson(request, MAX_BODY_BYTES); } catch { return NextResponse.json({ ok: false, error: 'INVALID_REQUEST' }, { status: 400, headers: { 'Cache-Control': 'no-store' } }); }
  const secret = process.env.ORDER_REQUEST_API_SECRET, rawUrl = process.env.ORDER_REQUEST_API_URL;
  if (!secret || secret.length < 32 || !rawUrl) return NextResponse.json({ ok: false, error: 'ORDER_CAPTURE_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input as {capability?:unknown;requestKey?:unknown} : {};
  let capability = value.capability;
  if (capability === undefined && typeof value.requestKey === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestKey))
    capability = createHmac('sha256',secret).update(`order-request-recovery\n${value.requestKey.toLowerCase()}`).digest('base64url');
  if (typeof capability !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(capability))
    return NextResponse.json({ ok: false, error: 'INVALID_RECOVERY_CAPABILITY' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  let endpoint: URL;
  try { endpoint = orderBackendEndpoint(rawUrl, ACTION); } catch { return NextResponse.json({ ok: false, error: 'ORDER_CAPTURE_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
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
    const whatsappUrl = new URL(`https://wa.me/${ORDERING_WHATSAPP_NUMBER}`);
    whatsappUrl.searchParams.set('text', `Hi Ma Kitchens, please review my saved tentative order request ${value.reference}. Delivery: ${value.deliveryDate}. Please confirm availability and the final total.`);
    return NextResponse.json({ ok: true, found: true, capability, whatsappUrl:whatsappUrl.toString(), reference: value.reference, status: value.status,
      deliveryDate: value.deliveryDate, publicTotalCents: value.publicTotalCents, createdAt: value.createdAt },
      { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch {
    return NextResponse.json({ ok: false, error: 'RECOVERY_UNAVAILABLE' }, { status: 502, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  }
}

