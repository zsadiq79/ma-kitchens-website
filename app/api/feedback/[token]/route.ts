import { NextResponse } from "next/server";
// Retire path-token API calls without forwarding or logging the token.
export function POST() { return NextResponse.json({ error: "INVALID_LINK" }, { status: 410, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }); }
