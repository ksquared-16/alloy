// Documents V1 / D7 + D8 — hosted AUTOMATED browser walk (Playwright, the QA run's persona sessions). Not Director Human QA.
// Usage: node d7d8_hosted_browser_walk.mjs <qa_run_id>   (run from web/ so `playwright` resolves)
// Reads the run's D7 and D8 fixture files; visible controls and the library's test ids only; screenshots in
// d7d8-browser-qa/. Never prints cookies or URLs with tokens.
import { createRequire } from "node:module";
const { chromium } = createRequire(process.cwd() + "/package.json")("playwright");
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const RUN = process.argv[2];
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "d7d8-browser-qa");
mkdirSync(OUT, { recursive: true });
const BASE = "https://staging.workwithalloy.com";
const SUFFIX = RUN.split("_")[1];
const TAG = `qa-authz-${RUN}`;
const D7 = JSON.parse(readFileSync(join(HERE, `d7_hosted_fixture_ids.${RUN}.json`), "utf8"));
const D8 = JSON.parse(readFileSync(join(HERE, `d8_fi10_hosted_fixture_ids.${RUN}.json`), "utf8"));
const storage = (p) => join(os.homedir(), ".local/state/alloy-dev/gateway/auth/qa-runs", RUN, p, "storage-state.json");
const R = [];
const rec = (id, goal, ok, actual, shot) => { R.push({ id, goal, pass: !!ok, actual, screenshot: shot ?? null }); console.log(`${ok ? "PASS" : "FAIL"} ${id} ${goal} :: ${actual}`); };

const browser = await chromium.launch();
const session = async (persona) => {
    const ctx = await browser.newContext({ storageState: storage(persona), viewport: { width: 1600, height: 1000 } });
    const page = await ctx.newPage();
    const api = [];
    page.on("response", (r) => { const u = r.url(); if (/\/api\/admin\/(documents|health|forms)\//.test(u)) api.push(`${r.status()} ${r.request().method()} ${u.replace(BASE, "").split("?")[0].replace(/[0-9a-f-]{36}/g, ":id")}`); });
    const body = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
    const shot = async (n) => { await page.screenshot({ path: join(OUT, n) }); return `d7d8-browser-qa/${n}`; };
    const inDialog = (re) => page.locator("[role=dialog] button").filter({ hasText: re }).first();
    const home = async () => {
        await page.goto(`${BASE}/adminV2`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(8000);
        if (/\/login/.test(page.url())) throw new Error(`SESSION DEAD (${persona})`);
        await page.getByRole("link", { name: "Workspace home" }).click();
        await page.waitForTimeout(8000);
    };
    const processing = async () => { await home(); await page.getByRole("button", { name: /^Processing/ }).first().click(); await page.waitForTimeout(6000); };
    const missingDocuments = async () => {
        await processing();
        await inDialog(/^Work$/).click(); await page.waitForTimeout(4000);
        await inDialog(/^Documents$/).click(); await page.waitForTimeout(6000);
        await inDialog(/Missing documents/).click(); await page.waitForTimeout(9000);
    };
    const openHousehold = async (adultName) => {
        await home();
        const search = page.getByPlaceholder(/search/i).first();
        await search.click(); await search.fill(adultName); await page.waitForTimeout(6000);
        await page.getByText(new RegExp(adultName.replace(/ /g, ".*"))).first().click(); await page.waitForTimeout(10000);
        try { await page.getByRole("button", { name: /^Activity$/ }).or(page.getByRole("tab", { name: /^Activity$/ })).first().click({ timeout: 8000 }); await page.waitForTimeout(3000); } catch {}
        try { await page.getByRole("button", { name: /^Documents$/ }).or(page.getByRole("tab", { name: /^Documents$/ })).first().click({ timeout: 8000 }); await page.waitForTimeout(10000); } catch {}
    };
    // The household's Documents, reached the way an operator does (B1): a child's work row → "Open the record's
    // documents" → the household member chip. (A header search for an adult's name opens a person record instead.)
    // The library's household member chips are role="tab" (data-testid document-library-focus-<ref>).
    const focusChip = async (label) => { await page.locator('[data-testid^="document-library-focus-"]').filter({ hasText: label }).first().click(); await page.waitForTimeout(9000); };
    const openChildDocuments = async (rowChild, chip) => {
        await missingDocuments();
        await page.locator("[role=dialog] button").filter({ hasText: rowChild }).first().click(); await page.waitForTimeout(3000);
        await inDialog(/Open the record.s documents|Renew on the record|Review on the record/).click(); await page.waitForTimeout(14000);
        if (chip) await focusChip(chip);
    };
    return { ctx, page, api, body, shot, inDialog, home, processing, missingDocuments, openHousehold, openChildDocuments, focusChip };
};

const S = await session("fixture_admin");

// W1 Studio → Documents → Requirements.
try {
    await S.processing();
    await S.inDialog(/^Studio$/).click(); await S.page.waitForTimeout(5000);
    await S.inDialog(/^Documents$/).click(); await S.page.waitForTimeout(5000);
    await S.inDialog(/Requirements/).click(); await S.page.waitForTimeout(8000);
    const t = await S.body();
    const s = await S.shot("01-studio-requirements.png");
    rec("W1a", "Studio lists the run's D7 requirement and the D8 Forms-evidence requirement", t.includes("immunization (D7)") && t.includes("Forms evidence"), `d7=${t.includes("immunization (D7)")} d8=${t.includes("Forms evidence")}`, s);
    await S.page.getByText(/enrollment document \(Forms evidence\)/).first().click(); await S.page.waitForTimeout(6000);
    const t2 = await S.body();
    const s2 = await S.shot("02-studio-forms-evidence-requirement.png");
    rec("W1b", "the requirement editor states the Forms evidence policy ('Also satisfied by completed forms')", /satisfied by completed forms/i.test(t2), `forms_policy=${/satisfied by completed forms/i.test(t2)} on_submission=${/submission/i.test(t2)}`, s2);
} catch (e) { rec("W1", "Studio → Documents → Requirements reachable", false, String(e).slice(0, 200), await S.shot("01-studio-error.png")); }

// W2 Processing → Work → Documents → Missing documents (requirement work) and Document attention.
const kidTwo = `QA D7 Kid Two ${SUFFIX}`;
const kidThree = `QA D7 Kid Three ${SUFFIX}`;
try {
    await S.missingDocuments();
    const t = await S.body();
    const s = await S.shot("03-processing-missing-documents.png");
    rec("W2a", "requirement work lists the run's missing and expired requirements", t.includes(kidTwo) && t.includes(kidThree) && /Expired/i.test(t), `kid2=${t.includes(kidTwo)} kid3=${t.includes(kidThree)} expired=${/Expired/i.test(t)}`, s);
    await S.inDialog(/^Document attention/).click(); await S.page.waitForTimeout(6000);
    const t2 = await S.body();
    const s2 = await S.shot("04-processing-document-attention.png");
    rec("W2b", "Document attention shows date-missing and expiring-soon documents for the run", /Date missing/i.test(t2) && /Expiring soon/i.test(t2) && t2.includes(SUFFIX), `date_missing=${/Date missing/i.test(t2)} expiring=${/Expiring soon/i.test(t2)}`, s2);
} catch (e) { rec("W2", "Processing document work reachable", false, String(e).slice(0, 200), await S.shot("03-processing-error.png")); }

// W3 B1: a child's work row → "Open the record's documents" lands on THAT child's Documents.
try {
    await S.missingDocuments();
    await S.page.locator("[role=dialog] button").filter({ hasText: kidTwo }).first().click(); await S.page.waitForTimeout(3000);
    await S.inDialog(/Open the record.s documents|Renew on the record|Review on the record/).click(); await S.page.waitForTimeout(14000);
    const t = await S.body();
    const s = await S.shot("05-child-documents-from-work.png");
    const lib = await S.page.locator('[data-testid="document-library"]').count();
    rec("W3", "B1: the child's work row opens the child's own Documents (library mounted, the child named)", lib > 0 && t.includes(kidTwo), `library=${lib > 0} child=${t.includes(kidTwo)} readiness=${/required/i.test(t)}`, s);
} catch (e) { rec("W3", "B1 child Documents navigation", false, String(e).slice(0, 200), await S.shot("05-child-documents-error.png")); }

// W4 Focus Panel library: review history, versions, validity and renewal controls on the D7 immunization record.
const imm = D7.docs["imm-c1"];
try {
    await S.openChildDocuments(kidTwo, `QA D7 Kid Three ${SUFFIX}`);
    const s = await S.shot("06-d7-focus-documents.png");
    const expired = await S.page.locator('[data-testid="document-readiness-expired"]').first().innerText().catch(() => "");
    rec("W4a", "Focus Panel readiness reports expired requirements from the same evaluator", /\d/.test(expired) && !/^0/.test(expired.trim()), `expired_tile=${JSON.stringify(expired)}`, s);
    await S.focusChip(`QA D7 Kid One ${SUFFIX}`);
    const row = S.page.locator(`[data-testid="document-library-row-${imm}"]`);
    await row.locator("button[aria-expanded]").first().click(); await S.page.waitForTimeout(6000);
    const detail = (await S.page.locator(`[data-testid="document-library-detail-${imm}"]`).innerText().catch(() => "")).replace(/\s+/g, " ");
    const validity = (await S.page.locator(`[data-testid="document-library-validity-${imm}"]`).innerText().catch(() => "")).replace(/\s+/g, " ");
    const s2 = await S.shot("07-d7-review-history-versions.png");
    rec("W4b", "history shows both decisions and the re-review ('Review accepted (was rejected)')", /Review rejected/.test(detail) && /Review accepted \(was rejected\)/.test(detail), `rejected=${/Review rejected/.test(detail)} rereview=${/was rejected/.test(detail)}`, s2);
    rec("W4c", "version history lists the renewals (v1 … v3)", /v3|Version 3/i.test(detail) && /v1|Version 1/i.test(detail), detail.match(/v\d|Version \d/gi)?.join(",") ?? "none", s2);
    // The row states the CURRENT version's review and dates (v3: rejected, its own recorded dates).
    const rowText = (await row.innerText().catch(() => "")).replace(/\s+/g, " ");
    rec("W4d", "the row states the current version's review and its server-derived dates", /Review: rejected/.test(rowText) && /Valid through \d{4}-\d{2}-\d{2}/.test(rowText), rowText.match(/Review: \w+[^·]*·[^·]*·[^·]*/)?.[0] ?? rowText.slice(0, 160), s2);
    // The replacement control is labelled "Renew: …" only while the current version is expired / expiring soon.
    rec("W4e", "review (reopen / re-review with reason) and replacement controls are offered", /Reopen review/.test(detail) && /Renew: upload the new version|Replace with a new version/.test(detail),
        `reopen=${/Reopen review/.test(detail)} replace=${/Replace with a new version/.test(detail)} renew=${/Renew: upload/.test(detail)}`, s2);
    const readinessText = (await S.page.locator('[data-testid="document-readiness"]').first().innerText().catch(() => "")).replace(/\s+/g, " ");
    const immLine = readinessText.match(/immunization \(D7\)[^]*?(?=qa-authz|$)/)?.[0] ?? "";
    rec("W4f", "readiness does not describe a REJECTED renewal as 'renewal awaiting review'", /Satisfied/.test(immLine) && !/renewal awaiting review/.test(immLine), immLine.slice(0, 160), s2);
} catch (e) { rec("W4", "Focus Panel review/version/renewal", false, String(e).slice(0, 200), await S.shot("07-d7-error.png")); }

// W5 Forms-produced document visibility and readiness (D8 household).
const da = D8.docs["a_f1"];
try {
    await S.openChildDocuments(`QA D8 Kid C ${SUFFIX}`, `QA D8 Kid A ${SUFFIX}`);
    const prov = (await S.page.locator(`[data-testid="document-library-form-provenance-${da}"]`).innerText().catch(() => "")).replace(/\s+/g, " ");
    const t = await S.body();
    const s = await S.shot("08-d8-forms-document.png");
    rec("W5a", "the completed form is a library document naming its form", /Completed form/.test(prov) && prov.includes("consent form"), prov.slice(0, 160), s);
    rec("W5b", "readiness shows the Forms-evidence requirement satisfied for the child", /Satisfied/i.test(t) && t.includes(`QA D8 Kid A ${SUFFIX}`), `satisfied=${/Satisfied/i.test(t)}`, s);
} catch (e) { rec("W5", "Forms-produced document visibility", false, String(e).slice(0, 200), await S.shot("08-d8-error.png")); }
const apiAdmin = [...new Set(S.api)];
await S.ctx.close();

// W6 Medical authorization denials in the browser: the OCR persona (documents.read + processing.operate, no health.view).
const O = await session("ocr");
try {
    await O.missingDocuments();
    const t = await O.body();
    const s = await O.shot("09-ocr-processing-no-medical.png");
    rec("W6a", "without health.view: no medical requirement row (immunization / physical / care plan / medication) in Processing", !/Immunization record|Physical examination|Health care plan|Medication authorization/.test(t),
        `medical_labels=${/Immunization record|Physical examination|Health care plan|Medication authorization/.test(t)}`, s);
    await O.inDialog(/^Document attention/).click(); await O.page.waitForTimeout(6000);
    const t2 = await O.body();
    const s2 = await O.shot("10-ocr-attention-standard-only.png");
    rec("W6b", "without health.view: standard attention (subsidy authorization) still shown, medical attention not", /Subsidy authorization/i.test(t2) && !/Immunization record/.test(t2), `subsidy=${/Subsidy authorization/i.test(t2)} immunization=${/Immunization record/.test(t2)}`, s2);
    const card = await O.page.evaluate(async (id) => { const r = await fetch(`/api/admin/health/card?customer_member_id=${id}`, { credentials: "include" }); return r.status; }, D8.childD ?? D8.childC);
    const sig = await O.page.evaluate(async (id) => { const r = await fetch(`/api/admin/documents/${id}/signed-url`, { credentials: "include" }); return r.status; }, imm);
    rec("W6c", "in the signed-in browser: the Health card and a medical document's URL are refused", card === 403 && (sig === 403 || sig === 404), `health_card=${card} medical_signed_url=${sig}`, s2);
} catch (e) { rec("W6", "medical denials in the browser", false, String(e).slice(0, 200), await O.shot("09-ocr-error.png")); }
await O.ctx.close();

rec("W7", "the admin surfaces read only canonical routes, all 2xx", apiAdmin.length > 0 && apiAdmin.every((a) => /^2\d\d /.test(a)), JSON.stringify(apiAdmin).slice(0, 600));
writeFileSync(join(HERE, `d7d8_hosted_browser_walk_results.${RUN}.json`), JSON.stringify({ run: RUN, kind: "automated_browser_qa (Playwright, QA persona sessions) — not Director Human QA", at: new Date().toISOString(), results: R, api: apiAdmin }, null, 2));
console.log("SUMMARY", JSON.stringify({ passed: R.filter((r) => r.pass).length, total: R.length }));
await browser.close();
