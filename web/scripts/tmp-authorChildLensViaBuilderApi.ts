/**
 * PHASE 4 PREREQUISITE — author Firefly's "All Children in Enrollment" Work View through the
 * PRODUCT'S OWN authoring path.
 *
 * This posts to `/api/admin/lifecycle-builder/process-work-views` — the exact route the Work View
 * builder saves through — using the slot-3 operator session. That means the write goes through the
 * real admin-role check, the real department scope check, `parseWorkViewsV1`, and
 * `persistWorkViewsForProcessSave`, rather than around them. A lens authored any other way would not
 * have been proven authorable.
 *
 * The lens is stage-INDEPENDENT and declares its Row Grain, because there is no stage predicate to
 * derive one from (the deriver reads "no stage predicate" as "spans every active stage" and refuses a
 * process with both family and child stages as grain-ambiguous).
 *
 * Idempotent: re-running replaces the lens of the same id rather than appending a second one.
 *
 * Run from web/:
 *   npx tsx scripts/tmp-authorChildLensViaBuilderApi.ts [--apply]
 * Without `--apply` it GETs and reports only.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:3013";
const STORAGE_STATE =
    process.env.PLAYWRIGHT_STORAGE_STATE?.trim() ||
    join(homedir(), ".local/state/alloy-dev/auth/slot3/storage-state.json");

const DEPT = "3933ac47-077a-4de8-aaac-8aed48d80413"; // Firefly · Enrollment
const PROCESS_ID = "42be9074-443f-4047-bece-d68cd1d22788"; // the active `enrollment` process record

const VIEW_ID = "all_children_in_enrollment";
const NEW_VIEW = {
    id: VIEW_ID,
    label: "All Children in Enrollment",
    mission: "Every child with a live enrollment participation, wherever they are in the process.",
    row_grain_v1: "child",
    filters_v1: [] as unknown[],
    sort_v1: { field_key: "updated_at", direction: "desc" },
    sorts_v1: [{ field_key: "updated_at", direction: "desc" }],
    visible_in_runtime: true,
    display_order: 7,
};

function cookieHeader(): string {
    const state = JSON.parse(readFileSync(STORAGE_STATE, "utf8")) as {
        cookies?: Array<{ name: string; value: string }>;
    };
    const cookies = state.cookies ?? [];
    if (!cookies.length) throw new Error(`no cookies in ${STORAGE_STATE} — re-run \`alloy-agent-login 3\``);
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function main() {
    const apply = process.argv.includes("--apply");
    const Cookie = cookieHeader();
    console.log("base:", BASE);

    // The builder addresses a process by its RECORD ID, not its key.
    const processId = PROCESS_ID;
    console.log("process: enrollment", processId);

    const getRes = await fetch(
        `${BASE}/api/admin/lifecycle-builder/process-work-views?department_id=${DEPT}&process_id=${processId}`,
        { headers: { Cookie } },
    );
    const getBody = (await getRes.json()) as Record<string, unknown>;
    if (!getRes.ok) throw new Error(`work-views GET ${getRes.status}: ${JSON.stringify(getBody).slice(0, 300)}`);

    const saved = (getBody.work_views_v1 ?? getBody.saved ?? getBody.effective ?? []) as Array<Record<string, unknown>>;
    console.log(`\ncurrent lens set (${saved.length}):`);
    for (const v of saved) console.log(`  ${String(v.id).padEnd(28)} grain=${v.row_grain_v1 ?? "-"}  "${v.label}"`);

    // RESTORE the Row Type declarations too. They were authored in a prior session and have since been
    // wiped — every `row_grain_v1` on this department is null again, which returns Active Pipeline and
    // All Leads to `grain_ambiguous` dead destinations. The whole list is replaced on every save, so a
    // builder save elsewhere that predates the Row Type control silently drops them.
    const FAMILY_DECLARED = new Set(["new_leads", "new_work_view_6", "new_work_view_2"]);
    const next = saved.map((v) =>
        FAMILY_DECLARED.has(String(v.id)) && !v.row_grain_v1 ? { ...v, row_grain_v1: "family" } : v,
    );
    const at = next.findIndex((v) => v.id === VIEW_ID);
    if (at >= 0) next[at] = NEW_VIEW;
    else next.push(NEW_VIEW);

    if (!apply) {
        console.log(`\nDRY RUN — would POST ${next.length} lenses (${at >= 0 ? "replacing" : "appending"} ${VIEW_ID}).`);
        return;
    }

    const postRes = await fetch(`${BASE}/api/admin/lifecycle-builder/process-work-views`, {
        method: "POST",
        headers: { Cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ department_id: DEPT, process_id: processId, work_views_v1: next }),
    });
    const postBody = (await postRes.json()) as Record<string, unknown>;
    if (!postRes.ok) throw new Error(`POST ${postRes.status}: ${JSON.stringify(postBody).slice(0, 500)}`);

    const persisted = (postBody.work_views_v1 ?? []) as Array<Record<string, unknown>>;
    console.log(`\nSAVED — lens set is now (${persisted.length}):`);
    for (const v of persisted) console.log(`  ${String(v.id).padEnd(28)} grain=${v.row_grain_v1 ?? "-"}  "${v.label}"`);
    const mine = persisted.find((v) => v.id === VIEW_ID);
    if (!mine) throw new Error("the save dropped the child lens");
    if (mine.row_grain_v1 !== "child") throw new Error("the declared Row Grain did not survive the save");
    if ((mine.filters_v1 as unknown[] | undefined)?.length) throw new Error("the lens came back stage-scoped");
    console.log("\nOK — declared child grain persisted, lens is stage-independent.");
}

main().catch((e) => {
    console.error(String(e));
    process.exit(1);
});
