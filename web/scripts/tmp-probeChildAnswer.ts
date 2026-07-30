/**
 * PHASE 4 — probe the composed Provisioning Answer for the child lens over its real HTTP seam.
 *
 * Fast feedback while certifying: this is the same entry resource the surface calls, with the same
 * operator session, so what it prints is what the surface will render.
 *
 * Run from web/:  npx tsx scripts/tmp-probeChildAnswer.ts [work_view_id] [subject_id]
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3013").replace(/\/$/, "");
const STORAGE =
    process.env.PLAYWRIGHT_STORAGE_STATE?.trim() ||
    join(homedir(), ".local/state/alloy-dev/auth/slot3/storage-state.json");
const WU = "lifecycle-wu-lead";

function cookieHeader(): string {
    const state = JSON.parse(readFileSync(STORAGE, "utf8")) as { cookies?: Array<{ name: string; value: string }> };
    return (state.cookies ?? []).map((c) => `${c.name}=${c.value}`).join("; ");
}

async function main() {
    const view = process.argv[2] ?? "all_children_in_enrollment";
    const subject = process.argv[3];
    const qs = new URLSearchParams({ work_view_id: view });
    if (subject) qs.set("subject_id", subject);

    const res = await fetch(`${BASE}/api/admin/work-units/${WU}/provisioning-answer?${qs}`, {
        headers: { Cookie: cookieHeader() },
    });
    const text = await res.text();
    if (!res.ok) {
        console.log(`HTTP ${res.status}`);
        console.log(text.slice(0, 1500));
        return;
    }
    const a = JSON.parse(text) as Record<string, any>;

    console.log(`terminal        : ${a.terminal}${a.code ? ` (${a.code})` : ""}`);
    if (a.message) console.log(`message         : ${a.message}`);
    if (a.terminal === "error") return;
    console.log(`lens            : ${a.activeWorkView?.label} (${a.activeWorkView?.id})`);
    console.log(`rowGrain        : ${a.rowGrain}   subjectGrain: ${JSON.stringify(a.subjectGrain)}`);
    console.log(`rows            : ${a.rows?.length}`);
    for (const r of (a.rows ?? []).slice(0, 5)) {
        console.log(`   ${String(r.title ?? "(unnamed)").padEnd(22)} stage=${String(r.stageKey ?? "-").padEnd(10)} id=${String(r.id).slice(0, 8)} ctx=${r.context ? "present" : "null"}`);
    }
    if (a.terminal !== "operational") return;
    console.log(`recordOfAttention: ${JSON.stringify(a.recordOfAttention)}`);
    console.log(`recordOfTruth   : ${JSON.stringify(a.recordOfTruth)}`);
    console.log(`childIdentity   : ${JSON.stringify(a.childIdentity)}`);
    console.log(`businessState   : ${JSON.stringify(a.currentBusinessState)}`);
    console.log(`primaryAction   : ${JSON.stringify(a.primaryAction)}`);
    console.log(`actionAbsence   : ${JSON.stringify(a.primaryActionAbsence)}`);
    console.log(`stageWork       : ${a.focusPanelStageWork ? "present" : "null"}`);
    console.log(`scope           : ${a.focusPanelScopeState} outOfView=${JSON.stringify(a.focusPanelOutOfView)}`);
    console.log(`identityTruth   : ${JSON.stringify(a.subjectIdentityTruth)}`);
    console.log(`actionsProjection: count=${a.actionsProjection?.count}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
