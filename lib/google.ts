import { getConfig, setConfig } from "./config";

// One Google connection serves the whole app: reading confirmation emails, and
// writing a timetable into Sheets. Both mint access tokens from the same stored
// refresh token.
export type GoogleAuth =
  | { token: string }
  // "not-connected" = never linked; "reconnect" = the token is dead (Google
  // expires refresh tokens weekly for apps still in "Testing").
  | { error: "not-connected" | "reconnect" };

export async function googleAccessToken(): Promise<GoogleAuth> {
  const refresh = await getConfig("gmail_refresh_token");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !refresh) return { error: "not-connected" };
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const t = (await res.json()) as { access_token?: string };
  if (t.access_token) return { token: t.access_token };
  // Stored token is dead — drop it so status flips to disconnected and the UI re-prompts.
  await setConfig("gmail_refresh_token", "");
  return { error: "reconnect" };
}
