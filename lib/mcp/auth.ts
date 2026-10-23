import { createClient } from "@supabase/supabase-js";
import type { AuthInfo } from "@modelcontextprotocol/server";

// Who may use the /mcp door. Lineup has no accounts of its own (single user,
// service-role reads), so sign-in is borrowed: Claude logs in through the
// Supabase Auth OAuth 2.1 server of Ashley's identity project (the one
// Slowcart uses), and this file accepts that token only if it belongs to the
// owner's email. One login covers every app's door.
//
//   MCP_AUTH_SUPABASE_URL       identity project URL (default: Slowcart's)
//   MCP_AUTH_SUPABASE_ANON_KEY  its publishable key (default: Slowcart's)
//   MCP_OWNER_EMAIL             the only email allowed in (comma-separate to
//                               add more; default: REMINDER_TO_EMAIL, the
//                               owner address Lineup already emails)
//
// The defaults are public values (the same URL and key Slowcart ships to
// every browser), so the door works without new Vercel settings.

const SLOWCART_URL = "https://iivgfzbliuaobcvvneqw.supabase.co";
const SLOWCART_PUBLISHABLE_KEY = "sb_publishable_HS1W-NrAreZbdnJ7A5I_Cw_l7xzmdy-";

const AUTH_URL = process.env.MCP_AUTH_SUPABASE_URL || SLOWCART_URL;
const AUTH_ANON_KEY = process.env.MCP_AUTH_SUPABASE_ANON_KEY || SLOWCART_PUBLISHABLE_KEY;

/** The issuer Claude is sent to for a token (RFC 8414 metadata lives under it). */
export const AUTH_SERVER_URL = `${AUTH_URL}/auth/v1`;

const owners = () =>
  (process.env.MCP_OWNER_EMAIL || process.env.REMINDER_TO_EMAIL || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export async function verifyBearer(
  _req: Request,
  token?: string,
): Promise<AuthInfo | undefined> {
  // Misconfigured is closed, not open: no owner, no entry.
  if (!token || !AUTH_URL || !AUTH_ANON_KEY || owners().length === 0) return undefined;
  const supabase = createClient(AUTH_URL, AUTH_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Signature + expiry (JWKS for asymmetric keys, the Auth server otherwise).
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return undefined;
  const claims = data.claims as Record<string, unknown>;
  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
  // A valid login for someone else is still a no.
  if (!owners().includes(email)) return undefined;
  return {
    token,
    clientId: typeof claims.client_id === "string" ? claims.client_id : "supabase",
    scopes: typeof claims.scope === "string" ? claims.scope.split(" ") : [],
    expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
    extra: { email },
  };
}
