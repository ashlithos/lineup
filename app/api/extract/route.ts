import { NextResponse } from "next/server";
import { extractCandidatesFromText } from "@/lib/extractServer";

// Parses pasted confirmation text into LineUp's booking schema.
// Haiku is plenty for structured extraction and costs ~$0.01–0.03 per email.
export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "No ANTHROPIC_API_KEY set. Add it to penciled/.env.local to enable paste extraction.",
      },
      { status: 501 },
    );
  }

  const { text } = (await req.json()) as { text?: string };
  if (!text || text.trim().length < 20) {
    return NextResponse.json(
      { error: "Paste a booking confirmation to extract from." },
      { status: 400 },
    );
  }

  const candidates = await extractCandidatesFromText(text);
  return NextResponse.json({ candidates });
}
