import fs from "node:fs";
import { parseLifecycleBuilderV1, serializeLifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { validateBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
async function main() {
  const pre = JSON.parse(fs.readFileSync(process.env.PRE!, "utf8"));
  console.log("PRE command_set_v1:", JSON.stringify(pre.processes[0].command_set_v1 ?? null));
  const rt: any = serializeLifecycleBuilderV1(parseLifecycleBuilderV1(pre)!);
  console.log("after parse→serialize:", JSON.stringify(rt.processes[0].command_set_v1 ?? null));
  const before = validateBusinessProcessForPublish(pre).errors.length;
  const after = validateBusinessProcessForPublish(rt).errors.length;
  console.log(`\nvalidation errors: PRE ${before} → after a plain round trip ${after}`);
  console.log("=> the round trip alone accounts for", after - before, "errors, with no authoring at all");
}
main().catch((e) => { console.error("FAILED:", e.message ?? e); process.exit(1); });
