import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { EMBED_COOKIE_ATTRS, EMBED_COOKIE_OPTIONS, EMBED_MARKER } from "@/lib/supabase/embed";

// GET /auth/ams?ticket=<exp>.<sig>&next=/coach/weightroom
//
// Called inside the ABCM AMS iframe. The AMS server only hands out a ticket
// after its own password check; the ticket is an HMAC (shared secret
// PP_TICKET_SECRET) over a 60-second expiry. A valid ticket signs the frame in
// as the AMS co-coach account (AMS_COACH_EMAIL) without a PowerPlan login.

function verifyTicket(ticket: string | null): boolean {
  const secret = process.env.PP_TICKET_SECRET;
  if (!secret || !ticket) return false;
  const [exp, sig] = ticket.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = createHmac("sha256", secret).update(`pp-ams:${exp}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Only same-site coach pages, never an absolute or protocol-relative URL.
function safeNext(next: string | null): string {
  return next && /^\/coach(\/[\w\-/]*)?$/.test(next) ? next : "/coach/weightroom";
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const amsEmail = process.env.AMS_COACH_EMAIL?.toLowerCase();

  if (!amsEmail || !verifyTicket(url.searchParams.get("ticket"))) {
    return new NextResponse("This PowerPlan link has expired. Reload the AMS and try again.", { status: 401 });
  }

  const response = NextResponse.redirect(new URL(safeNext(url.searchParams.get("next")), url.origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: EMBED_COOKIE_OPTIONS,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    }
  );

  // Already signed in as the AMS account in this frame → nothing to do.
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email?.toLowerCase() !== amsEmail) {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: amsEmail });
    if (error || !link.properties?.hashed_token) {
      return new NextResponse(`AMS sign-in failed: ${error?.message ?? "no token"}`, { status: 500 });
    }
    const { error: otpError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    if (otpError) return new NextResponse(`AMS sign-in failed: ${otpError.message}`, { status: 500 });
  }

  response.cookies.set(EMBED_MARKER, "1", { ...EMBED_COOKIE_ATTRS, maxAge: 60 * 60 * 24 * 30 });
  return response;
}
