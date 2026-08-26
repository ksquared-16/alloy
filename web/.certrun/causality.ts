import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { validateBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: d } = await sb.from("business_process_drafts").select("draft_revision,draft_status,validated_at,validation_errors,payload,updated_at").eq("org_id", process.env.DEV_QUEUE_ORG_ID!).single();
  const dr = d as any;
  console.log("=== CURRENT DRAFT ===");
  console.log("draft_revision:", dr.draft_revision, "| status:", dr.draft_status, "| validated_at:", dr.validated_at, "| updated_at:", dr.updated_at);
  const pr = dr.payload.processes[0];
  console.log("entry_points_v1:", JSON.stringify(pr.entry_points_v1 ?? null));
  const wr = pr.stages.filter((s: any) => s.requirements_v1 !== undefined);
  console.log("stages with requirements_v1:", wr.length ? wr.map((s: any) => `${s.key}(${s.requirements_v1.requirements.length})`).join(", ") : "NONE");
  console.log("stored validation_errors:", Array.isArray(dr.validation_errors) ? dr.validation_errors.length : dr.validation_errors);

  const now = validateBusinessProcessForPublish(dr.payload);
  console.log("\nvalidate(current): errors", now.errors.length, "warnings", now.warnings.length);
  const byCode: Record<string, number> = {};
  for (const e of now.errors) byCode[e.code] = (byCode[e.code] ?? 0) + 1;
  console.log("by code:", JSON.stringify(byCode, null, 1));

  // THE CAUSALITY TEST: validate the PRE-PACKET payload captured before any authoring.
  const prePath = process.env.PRE_PACKET!;
  if (fs.existsSync(prePath)) {
    const pre = JSON.parse(fs.readFileSync(prePath, "utf8"));
    const before = validateBusinessProcessForPublish(pre);
    const beforeBy: Record<string, number> = {};
    for (const e of before.errors) beforeBy[e.code] = (beforeBy[e.code] ?? 0) + 1;
    console.log("\nvalidate(PRE-PACKET draft): errors", before.errors.length);
    console.log("by code:", JSON.stringify(beforeBy, null, 1));
  } else console.log("\n(no pre-packet snapshot at", prePath, ")");
  fs.writeFileSync(process.env.OUT!, JSON.stringify({ payload: dr.payload, errors: now.errors, warnings: now.warnings }, null, 2));
}
main().catch((e) => { console.error("FAILED:", e.message ?? e); process.exit(1); });
