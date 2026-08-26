import { createClient } from "@supabase/supabase-js";
async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data } = await sb.from("departments").select("metadata").eq("id", "00000000-0000-4000-8000-000000000020").single();
  const lb = (data as any)?.metadata?.lifecycle_builder_v1;
  console.log("departments.metadata.lifecycle_builder_v1 present:", Boolean(lb));
  if (lb) {
    const pr = lb.processes?.[0];
    console.log("projection command_set_v1:", JSON.stringify(pr?.command_set_v1 ?? null));
    console.log("projection stages:", pr?.stages?.length);
  }
}
main().catch((e) => { console.error("FAILED:", e.message ?? e); process.exit(1); });
