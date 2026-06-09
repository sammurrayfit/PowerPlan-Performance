import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Public routes — no auth needed
  const publicPaths = ["/login", "/signup", "/invite"];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return supabaseResponse;
  }

  // Redirect unauthenticated users to login
  if (!user) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("pp_role");
    return response;
  }

  // Read role from cache cookie to avoid a DB hit on every request
  let role = request.cookies.get("pp_role")?.value;
  if (role !== "coach" && role !== "athlete") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    role = profile?.role ?? undefined;
    if (role) {
      supabaseResponse.cookies.set("pp_role", role, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60, // 1 hour
        path: "/",
      });
    }
  }

  // Protect coach routes
  if (pathname.startsWith("/coach") && role !== "coach") {
    return NextResponse.redirect(new URL("/athlete/dashboard", request.url));
  }

  // Protect athlete routes
  if (pathname.startsWith("/athlete") && role !== "athlete") {
    return NextResponse.redirect(new URL("/coach/dashboard", request.url));
  }

  // Root redirect based on role
  if (pathname === "/") {
    const dest = role === "coach" ? "/coach/dashboard" : "/athlete/dashboard";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
