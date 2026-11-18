// PowerPlan inside the ABCM AMS (abcm-ams.vercel.app).
//
// The AMS signs its users into PowerPlan as one dedicated co-coach account
// (AMS_COACH_EMAIL) via /auth/ams. That session lives in its own cookies:
//   - a different name, so it never mixes with a normal PowerPlan login
//   - SameSite=None + Secure, so the browser sends them inside the AMS iframe
//   - Partitioned, so they only exist inside the AMS (Safari/Chrome/Firefox
//     keep them in a separate jar keyed to the AMS site)
// The `pp_embed` marker cookie is set alongside; seeing it means "this request
// is coming from inside the AMS frame, use the embed session".

export const EMBED_MARKER = "pp_embed";

export const EMBED_COOKIE_ATTRS = {
  sameSite: "none" as const,
  secure: true,
  partitioned: true,
  path: "/",
};

export const EMBED_COOKIE_OPTIONS = { ...EMBED_COOKIE_ATTRS, name: "sb-ams-embed" };

type CookieReader = { get(name: string): { value: string } | undefined };

/** Server: cookie options for this request (undefined = normal PowerPlan defaults). */
export function cookieOptionsFor(cookies: CookieReader) {
  return cookies.get(EMBED_MARKER)?.value === "1" ? EMBED_COOKIE_OPTIONS : undefined;
}

/** Browser: cookie options for this page. */
export function browserCookieOptions() {
  if (typeof document === "undefined") return undefined;
  return document.cookie.split("; ").includes(`${EMBED_MARKER}=1`) ? EMBED_COOKIE_OPTIONS : undefined;
}
