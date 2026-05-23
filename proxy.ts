import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_EMAILS } from "@/lib/admin";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page through without auth check
  if (pathname.startsWith("/login")) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Not logged in — send to login
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Admin-only sections — allow listed emails (centralized in lib/admin.ts).
  // /userdash = User Dashboard (Passdown, BOLO, Reports, Watchlist, On Duty,
  // Rent Roll). /admin/system + /admin/post-orders = system admin pages.
  if (
    (pathname.startsWith("/admin") || pathname.startsWith("/userdash")) &&
    !ADMIN_EMAILS.includes(user.email ?? "")
  ) {
    return NextResponse.redirect(new URL("/vms", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
