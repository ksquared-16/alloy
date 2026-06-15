import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const f = path.join(repoRoot, "web/app/adminV2/communications/CommandCenterShell.tsx");
const s = fs.readFileSync(f, "utf8");
const idx = (t) => s.indexOf(t);
const checks = {
  "imports computeCommunicationHealth": s.includes('from "@/lib/communications/v2/communicationHealth"'),
  "imports ComposerV2 (reuse)":         s.includes('import ComposerV2 from "@/app/adminV2/communications/composer/ComposerV2"'),
  "UI-1 geometry preserved":            s.includes("grid-cols-[minmax(320px,28%)_minmax(0,1fr)]"),
  "TOP snapshot present":               idx('data-cc-ws-section="snapshot"') > -1,
  "health present":                     idx('data-cc-ws-section="health"') > -1,
  "consent present":                    idx('data-cc-ws-section="consent"') > -1,
  "MIDDLE timeline present":            idx('data-cc-ws-section="timeline"') > -1,
  "BOTTOM composer present":            idx('data-cc-ws-section="composer"') > -1,
  "timeline test-hook preserved":       s.includes('data-cc-timeline') && s.includes('data-cc-msg-dir'),
  "claim hook preserved":               s.includes('data-cc-claim'),
  "order: snapshot < timeline < composer":
      idx('data-cc-ws-section="snapshot"') < idx('data-cc-ws-section="timeline"') &&
      idx('data-cc-ws-section="timeline"') < idx('data-cc-ws-section="composer"'),
  "no new API route string added (only existing endpoints)":
      (s.match(/\/api\/admin\/communications\//g) || []).length === 3, // conversations, threads/messages, assign — unchanged
};
let pass = true;
for (const [k,v] of Object.entries(checks)) { console.log((v?"PASS":"FAIL").padEnd(5), k); if(!v) pass=false; }
console.log("\nHARNESS:", pass ? "PASS" : "FAIL");
process.exit(pass?0:1);
