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
