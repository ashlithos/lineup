import { NextResponse } from "next/server";
import {
  extractCandidatesFromImages,
  extractCandidatesFromText,
} from "@/lib/extractServer";

// Reading a screenshot takes longer than reading text.
export const maxDuration = 30;

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const MAX_IMAGE = 5 * 1024 * 1024;

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

  // A screenshot arrives as multipart; pasted text as JSON. Same reader
  // either way — a photo of a confirmation is still a confirmation.
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await req.formData();
    const files = form.getAll("images").filter((f): f is File => f instanceof File);
    if (!files.length) {
      return NextResponse.json({ error: "Pick a screenshot first." }, { status: 400 });
    }
    if (files.length > 4) {
      return NextResponse.json(
        { error: "Four screenshots at a time, please." },
        { status: 400 },
      );
    }
    const bad = files.find((f) => !IMAGE_TYPES.has(f.type) || f.size > MAX_IMAGE);
    if (bad) {
      return NextResponse.json(
        {
          error: IMAGE_TYPES.has(bad.type)
            ? "That image is over 5MB — try a screenshot instead of a photo."
            : "PNG, JPEG, WebP or GIF only.",
        },
        { status: 400 },
      );
    }
    const images = await Promise.all(
      files.map(async (f) => ({
        mediaType: f.type,
        data: Buffer.from(await f.arrayBuffer()).toString("base64"),
      })),
    );
    return NextResponse.json({
      candidates: await extractCandidatesFromImages(images),
    });
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
