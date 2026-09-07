import { NextResponse } from "next/server";
import { setConfig } from "@/lib/config";

// Google redirects here with ?code=… — exchange it for a refresh token and stash
// it so future scans can mint access tokens without re-consent.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!code || !clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/?gmail=error`);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${origin}/api/gmail/callback`,
      grant_type: "authorization_code",
    }),
  });
  const tok = (await res.json()) as { refresh_token?: string };

  if (tok.refresh_token) {
    await setConfig("gmail_refresh_token", tok.refresh_token);
    return NextResponse.redirect(`${origin}/?gmail=connected`);
  }
  return NextResponse.redirect(`${origin}/?gmail=error`);
}
