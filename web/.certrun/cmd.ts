import fs from "node:fs";
async function main() {
  const pre = JSON.parse(fs.readFileSync(process.env.PRE!, "utf8"));
  const cur = JSON.parse(fs.readFileSync(process.env.CUR!, "utf8")).payload;
  for (const [name, p] of [["PRE", pre], ["CURRENT", cur]] as const) {
    const pr = (p as any).processes[0];
    console.log(`\n${name}: command_set_v1 =`, JSON.stringify(pr.command_set_v1 ?? null)?.slice(0, 300));
  }
  const errs = JSON.parse(fs.readFileSync(process.env.CUR!, "utf8")).errors;
  console.log("\n=== the 20 errors ===");
  for (const e of errs) console.log(`[${e.code}] ${e.stage_key ?? ""} ${e.path ?? ""}\n     ${e.message}`);
}
main().catch((e) => { console.error("FAILED:", e.message ?? e); process.exit(1); });
