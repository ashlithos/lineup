import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

const BUCKET = "trip-photos";

// Uploads a user photo to Supabase Storage and returns its public URL.
export async function POST(req: Request) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "supabase-not-configured" }, { status: 501 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no-file" }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "too-large" }, { status: 413 });
  }

  // Make sure the public bucket exists (no-op once created).
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
  const path = `${Date.now()}-${Math.round(Math.random() * 1e9).toString(36)}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
