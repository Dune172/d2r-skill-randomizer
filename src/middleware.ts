import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Redirect legacy shared links: old URLs were shaped like /?seed=123&teleportStaff=1,
// but the generator moved to /generate. We keep the homepage statically rendered
// (no dynamic APIs) and handle this redirect at the edge instead, so a plain
// homepage visit never forces SSR.
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === '/' && searchParams.has('seed')) {
    const url = request.nextUrl.clone();
    url.pathname = '/generate';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Only run middleware for the root path — keeps the per-request overhead near
// zero for everything else.
export const config = {
  matcher: ['/'],
};
