/**
 * R12 — the canonical pin/override and position state the runtime actually computed.
 *
 * Read from the RSC payload rather than the DOM: `active_override_kinds`, `runtime_position` and the
 * precedence reason are placement-system facts, and reading them off the screen would only prove what
 * was rendered, not what was decided. Subject identifiers are pseudonymised before anything is
 * written, so no raw payload reaches durable output.
 *
 * Env (PE3): PE3_SLOT / PE3_PORT / PE3_BASE / PE3_STORAGE / R11_OUT_DIR. Local hosts only.
 */
import { chromium } from "playwright";
import { BASE, STORAGE, assertLocalBase, assertCandidateBuild, redactSubject, writeEvidence, withResource } from "./r11Env.mjs";

const WORK_UNIT = process.env.R12_WORK_UNIT ?? "waitlist";
const CLUSTER = "[data-queue-row-waitlist-rank-cluster]";

/** Last match before `index` — payload fields precede the position they belong to. */
function lastBefore(text, regex) {
    const found = [...text.matchAll(regex)];
    return found.length ? found[found.length - 1][1] : undefined;
}

assertLocalBase();
assertCandidateBuild();

const payload = await withResource(
    () => chromium.launch({ headless: true }),
    (b) => b.close(),
    async (browser) => {
        const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 1200 } });
        const page = await ctx.newPage();
        const blobs = [];
        page.on("response", async (res) => {
            try {
                const text = await res.text();
                if (/active_override_kinds|runtime_position/.test(text)) blobs.push(text);
            } catch { /* body already consumed or binary */ }
        });
        await page.goto(`${BASE}/workspace/work-unit/${WORK_UNIT}`, { waitUntil: "domcontentloaded", timeout: 120000 });
        await page.waitForFunction((sel) => document.querySelectorAll(sel).length > 0, CLUSTER, { timeout: 90000 });
        await page.waitForTimeout(8000);
        return blobs.join("\n");
    },
);

const rows = [];
for (const match of payload.matchAll(/runtime_position\\?":\s*(\d+)/g)) {
    const before = payload.slice(Math.max(0, match.index - 2500), match.index);
    const after = payload.slice(match.index, match.index + 600);
    const kinds = lastBefore(before, /active_override_kinds\\?":\s*\\?\[([^\]]*)\]/g);
    rows.push({
        position: Number(match[1]),
        total: Number((after.match(/runtime_position_total\\?":\s*(\d+)/) ?? [])[1] ?? 0),
        section: (after.match(/runtime_position_section_key\\?":\\?"([^"\\]{0,30})/) ?? [])[1] ?? null,
        reason: (after.match(/runtime_position_precedence_reason\\?":\\?"([^"\\]{0,40})/) ?? [])[1] ?? null,
        note: (after.match(/runtime_position_precedence_note\\?":\\?"([^"\\]{0,90})/) ?? [])[1] ?? null,
        cohort: lastBefore(before, /program_room_cohort_key\\?":\\?"([^"\\]{0,40})/g) ?? null,
        subject: redactSubject(lastBefore(before, /child_display_name\\?":\\?"([^"\\]{0,40})/g) ?? ""),
        pinned: Boolean(kinds && kinds.replace(/[\\"\s]/g, "").length > 0),
    });
}

console.log("pos    section      cohort                  subject            pin   reason");
for (const r of rows) {
    console.log(
        `${`${r.position}/${r.total}`.padEnd(6)} ${String(r.section).padEnd(12)} ${String(r.cohort).padEnd(23)} ` +
        `${r.subject.padEnd(18)} ${r.pinned ? "PIN" : "-  "}   ${r.reason ?? "none"}`,
    );
}
const modes = [...new Set([...payload.matchAll(/runtime_position_mode\\?":\\?"(\w+)/g)].map((m) => m[1]))];
const shadow = [...new Set([...payload.matchAll(/shadow_mode\\?":\s*(true|false)/g)].map((m) => m[1]))];
console.log(`\nposition modes: ${modes.join(", ")} | shadow_mode: ${shadow.join(", ")}`);
console.log(`pinned rows: ${rows.filter((r) => r.pinned).length} | rows with a precedence reason: ${rows.filter((r) => r.reason).length}`);
writeEvidence("pin-state.json", { base: BASE, work_unit: WORK_UNIT, modes, shadow, rows });
