import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

// Tells the UI whether Gmail is set up (env) and connected (token stored).
export async function GET() {
  const token = await getConfig("gmail_refresh_token");
  return NextResponse.json({
    configured: !!process.env.GOOGLE_CLIENT_ID,
    connected: !!token,
  });
}
