import fs from "node:fs";
import { parseLifecycleBuilderV1, serializeLifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ensureBuilderCommandSetsOnSave } from "@/lib/lifecycle/ensureProcessCommandSetV1OnSave";
import { validateBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
async function main() {
  const pre = JSON.parse(fs.readFileSync(process.env.PRE!, "utf8"));
  const b = parseLifecycleBuilderV1(pre)!;
  const stamped: any = serializeLifecycleBuilderV1(ensureBuilderCommandSetsOnSave(b));
  console.log("save path now leaves command_set_v1 as:", JSON.stringify(stamped.processes[0].command_set_v1 ?? null));
  const v = validateBusinessProcessForPublish(stamped);
  const by: Record<string, number> = {};
  for (const e of v.errors) by[e.code] = (by[e.code] ?? 0) + 1;
  console.log("errors after a save with the fix:", v.errors.length, JSON.stringify(by));
}
main().catch((e) => { console.error("FAILED:", e.message ?? e); process.exit(1); });
