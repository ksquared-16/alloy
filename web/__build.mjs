import { chromium } from "@playwright/test";
import fs from "node:fs"; import crypto from "node:crypto"; import path from "node:path";
const STATE = "/Users/Kelly/.local/state/alloy-dev/gateway/auth/slot4/cert-storage-state.json";
const FIX = "/Users/Kelly/Code/alloy-worktrees/wt4-enrollment-phase2-participant-anchor/web/tests/fixtures/processing";
const FILES = ["school-of-enrichment-family-handbook.pdf","oregon-certificate-of-immunization-status.pdf","school-of-enrichment-admissions-packet.capture.html"];
const log = (...a) => console.log("[build]", ...a);
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(path.join(FIX,f))).digest("hex");
for (const f of FILES) log("corpus", f, sha(f).slice(0,16)+"…");

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STATE });
const page = await ctx.newPage();
await page.goto("http://127.0.0.1:3014/workspace", { waitUntil: "domcontentloaded", timeout: 240000 });
await page.waitForTimeout(3000);

async function upload(file, attachToCaseId) {
  const buf = fs.readFileSync(path.join(FIX, file));
  const mp = { file: { name: file, mimeType: file.endsWith(".pdf") ? "application/pdf" : "text/html", buffer: buf },
               processing_intent: "generate_form", title: file };
  if (attachToCaseId) mp.attach_to_case_id = attachToCaseId; else mp.open_processing_case = "true";
  const r = await page.request.post("http://127.0.0.1:3014/api/admin/documents/upload", { multipart: mp, timeout: 180000 });
  const b = await r.json().catch(()=>({}));
  return { status: r.status(), ...b };
}

const a = await upload(FILES[0], null);
log("A upload:", a.status, "case:", a.processing_case_id, "doc:", a.id ?? a.document_id ?? "(see body)");
const caseId = a.processing_case_id;
if (!caseId) { log("NO CASE", JSON.stringify(a).slice(0,300)); await browser.close(); process.exit(1); }

const b = await upload(FILES[1], caseId);
log("B attach:", b.status, "case:", b.processing_case_id, "outcome:", b.attach_outcome);
const c = await upload(FILES[2], caseId);
log("C attach:", c.status, "case:", c.processing_case_id, "outcome:", c.attach_outcome);
// duplicate refusal / idempotency
const dup = await upload(FILES[1], caseId);
log("B again (new doc row, so a NEW related source is expected):", dup.status, dup.attach_outcome);

fs.writeFileSync("/tmp/certcase.json", JSON.stringify({ caseId, a, b, c }, null, 2));
log("CASE ID:", caseId);
await browser.close();
