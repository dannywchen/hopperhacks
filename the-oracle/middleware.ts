import { NextResponse } from 'next/server';

export function middleware() {
  // Supabase browser auth session is stored client-side in this app flow.
  // Route auth is enforced by API token checks and page-level bootstrap checks.
  return NextResponse.next();
}

export const config = {
  matcher: ['/onboarding/:path*', '/dashboard/:path*'],
};
