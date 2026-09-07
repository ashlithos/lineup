import { NextResponse } from "next/server";

// Looks up a destination photo from Pexels. The key lives server-side; the
// client calls this once per trip and caches the URL on the booking.
export async function GET(req: Request) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "no-pexels-key" }, { status: 501 });
  }
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "no-query" }, { status: 400 });

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: key } },
    );
    if (!res.ok) {
      return NextResponse.json({ error: "pexels-failed" }, { status: 502 });
    }
    const data = (await res.json()) as {
      photos?: { src?: { landscape?: string; large?: string } }[];
    };
    const src = data.photos?.[0]?.src;
    return NextResponse.json({ url: src?.landscape ?? src?.large ?? null });
  } catch {
    return NextResponse.json({ error: "pexels-error" }, { status: 500 });
  }
}
