import { NextResponse } from "next/server";

// Kicks off Google OAuth. access_type=offline + prompt=consent so Google
// returns a refresh token we can reuse. Two scopes, one consent screen:
// read confirmation emails, and create the timetable sheets we export.
// drive.file is the narrow one — it only reaches files this app made.
const SCOPE = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

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
    include_granted_scopes: "true",
  });
  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
}
