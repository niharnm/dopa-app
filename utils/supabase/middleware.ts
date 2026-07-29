import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export async function updateSession(
  request: NextRequest,
  requestHeaders = new Headers(request.headers),
) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        const cookieHeader = request.headers.get("cookie");
        if (cookieHeader) requestHeaders.set("cookie", cookieHeader);
        supabaseResponse = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (path.startsWith("/dashboard") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("modal", "login");
    url.searchParams.set("redirectTo", `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (path.startsWith("/onboarding") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("modal", "login");
    url.searchParams.set("redirectTo", "/onboarding");
    return NextResponse.redirect(url);
  }

  if ((path === "/login" || path === "/signup") && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}
