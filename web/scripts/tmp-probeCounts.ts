/**
 * COUNT ↔ ROW AGREEMENT, over the real seams.
 *
 * The pill count, the queue total and the workspace tile all resolve through ONE owner
 * (`useWorkViewTotals` → POST /api/admin/queue-view-totals). The rows come from the provisioning
 * answer. This asks both, per lens, and reports whether they agree.
 *
 * The count TARGETS are not guessed: they are read from the answer's own D5 settlement locators
 * (`settlement.workViewCountTargets`) — exactly what the client hands to the totals route. A probe
 * that invented its own lane key would prove nothing about what an operator actually sees.
 *
 * Run from web/:  npx tsx scripts/tmp-probeCounts.ts
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3013").replace(/\/$/, "");
const STORAGE =
    process.env.PLAYWRIGHT_STORAGE_STATE?.trim() ||
    join(homedir(), ".local/state/alloy-dev/auth/slot3/storage-state.json");
const WU_SLUG = "lifecycle-wu-lead";

const cookie = () =>
    (JSON.parse(readFileSync(STORAGE, "utf8")).cookies ?? [])
        .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
        .join("; ");

type Answer = Record<string, any>;

async function answerFor(Cookie: string, viewId?: string): Promise<Answer> {
    const qs = viewId ? `?work_view_id=${encodeURIComponent(viewId)}` : "";
    const res = await fetch(`${BASE}/api/admin/work-units/${WU_SLUG}/provisioning-answer${qs}`, {
        headers: { Cookie },
    });
    return (await res.json()) as Answer;
}

async function main() {
    const Cookie = cookie();

    // The answer publishes the lens set AND the canonical count location of each lens.
    const base = await answerFor(Cookie);
    const lensSet: Array<{ id: string; label: string }> = base.lensSet ?? base.navigationFrame?.lensSet ?? [];
    const targets = (base.settlement?.workViewCountTargets ?? []) as Array<{
        workViewId: string;
        hostWorkUnitId: string;
        baseQueueKey: string;
    }>;
    console.log(
        `settlement: ${base.settlement?.status} · ${targets.length} count targets · ${lensSet.length} lenses\n`,
    );
    if (!targets.length) throw new Error("no count targets resolved — cannot probe the count path");

    const totalsRes = await fetch(`${BASE}/api/admin/queue-view-totals`, {
        method: "POST",
        headers: { Cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
            targets: targets.map((t) => ({
                workUnitId: t.hostWorkUnitId,
                queueKey: t.baseQueueKey,
                workViewId: t.workViewId,
            })),
        }),
    });
    const totalsBody = (await totalsRes.json()) as { totals?: Array<Record<string, unknown>> };
    if (!totalsRes.ok) throw new Error(`totals ${totalsRes.status}: ${JSON.stringify(totalsBody).slice(0, 300)}`);
    const pillByView = new Map((totalsBody.totals ?? []).map((t) => [String(t.workViewId), t]));

    let disagreements = 0;
    console.log("lens".padEnd(30) + "grain".padEnd(10) + "pill".padStart(6) + "rows".padStart(7) + "   verdict");
    for (const lens of lensSet) {
        const a = await answerFor(Cookie, lens.id);
        const grain = a.terminal === "error" ? `ERR:${a.code}` : (a.rowGrain ?? "-");
        const rows = a.terminal === "error" ? null : (a.rows?.length ?? null);

        const t = pillByView.get(lens.id);
        const pill = t && t.known ? Number(t.count) : null;

        let verdict: string;
        if (rows == null) verdict = "lens refuses (nothing to compare)";
        else if (pill == null) verdict = "*** PILL UNKNOWN ***";
        else if (pill === rows) verdict = "AGREE";
        else {
            verdict = "*** DISAGREE ***";
            disagreements += 1;
        }
        console.log(
            String(lens.label).slice(0, 29).padEnd(30) +
                String(grain).padEnd(10) +
                String(pill ?? "?").padStart(6) +
                String(rows ?? "?").padStart(7) +
                "   " +
                verdict,
        );
    }
    console.log(`\n${disagreements === 0 ? "ALL LENSES AGREE" : `${disagreements} DISAGREEMENT(S)`}`);
    if (disagreements) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
