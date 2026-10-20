import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // This preview branch inherits some legacy provider credentials. Keep its
  // unrelated API routes from reaching the existing live automations.
  if ((process.env.ORDER_AUTOMATION_TEST_ONLY === 'true' || process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_GIT_COMMIT_REF === 'codex/order-request-capture-preview') &&
      !['/api/order-requests','/api/order-requests/recovery','/api/order-menu/published'].includes(request.nextUrl.pathname))
    return NextResponse.json({ok:false,error:'INTEGRATION_PREVIEW_ROUTE_DISABLED'},{status:503,headers:{'Cache-Control':'no-store'}});
  return NextResponse.next();
}
export const config = { matcher: ['/api/:path*'] };
