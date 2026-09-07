import { NextResponse } from "next/server";

// Kicks off Google OAuth — read-only Gmail. access_type=offline + prompt=consent
// so Google returns a refresh token we can reuse for future scans.
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "google-not-configured" }, { status: 501 });
  }
  const origin = new URL(req.url).origin;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/gmail/callback`,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  });
  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
}
