import { getSupabase } from "./supabase";

// Tiny key/value store (Supabase table `penciled_config`) for server-only
// secrets like the Gmail OAuth refresh token. RLS-on-no-policies keeps it
// service-role only.
const CONFIG_TABLE = "penciled_config";

export async function getConfig(key: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from(CONFIG_TABLE)
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value as string | undefined) ?? null;
}

export async function setConfig(key: string, value: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from(CONFIG_TABLE).upsert({ key, value });
}

// Emails the scan should leave alone: every one whose booking you deleted.
// Without this the scan has no memory — it re-reads the same confirmation on
// the next run and puts the thing you just threw away straight back.
const IGNORED_KEY = "scan_ignored_email_ids";
const IGNORED_CAP = 500;

/** The Gmail message id inside a source link, if there is one. */
export function gmailIdOf(sourceUrl?: string | null): string | null {
  return sourceUrl?.match(/#all\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

export async function getIgnoredEmails(): Promise<Set<string>> {
  const raw = await getConfig(IGNORED_KEY);
  if (!raw) return new Set();
  try {
    const v = JSON.parse(raw);
    return new Set(Array.isArray(v) ? (v as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function ignoreEmail(id: string): Promise<void> {
  const ids = await getIgnoredEmails();
  if (ids.has(id)) return;
  // Newest last, oldest dropped: an id that old is not coming back round.
  const next = [...ids, id].slice(-IGNORED_CAP);
  await setConfig(IGNORED_KEY, JSON.stringify(next));
}
