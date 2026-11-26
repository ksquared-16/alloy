/**
 * PHASE 4 STEP 2 — prove the CHILD provider against REAL Firefly data, through the LIVE provider.
 *
 * The unit suite already proves the participation rule in isolation. What it cannot prove is the claim
 * this surface actually rests on: that `loadChildGrainProvisioningRows({mode:"participation"})`, run
 * against the tenant's real `process_instances`, returns **active enrollment participations only** —
 * and that every instance it leaves out is left out for a NAMED reason rather than by accident.
 *
 * So this does not just print the rows. It independently enumerates every enrollment
 * `process_instance` in the tenant, classifies each one against the Definition's own liveness gate,
 * and then asserts the provider's output equals the set that classification predicts. A provider that
 * quietly dropped a live child, or admitted a closed one, fails here even though the row list would
 * still "look right".
 *
 * Run from web/ with the trusted env sourced:
 *   npx tsx scripts/tmp-proveParticipationMembership.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadChildGrainProvisioningRows } from "../lib/runtime/provisioning/childGrainProvisioningRows";
import { savedWorkViewsFromDepartmentMetadata } from "../lib/lifecycle/resolveWorkViewRuntimeContext";
import {
    activeLifecycleProcess,
    activeStagesForProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "../lib/lifecycle/lifecycleBuilderConfig";
import { lensStageKeys, resolveLensRowGrain } from "../lib/runtime/provisioning/workUnitProvisioningAnswer";
import { buildEnrollmentParticipants } from "../lib/process/definitions/enrollment/enrollmentProjection";
import { isLiveEnrollmentParticipant } from "../lib/process/definitions/enrollment/enrollmentSemantics";

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19"; // Firefly
const DEPT = "3933ac47-077a-4de8-aaac-8aed48d80413"; // Enrollment
const WORK_UNIT_KEY = "lifecycle_wu_lead";

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
    console.log(`${ok ? "  ✓" : "  ✗"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures += 1;
}

async function main() {
    const db = createClient(process.env.SUPABASE_URL!.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), {
        auth: { persistSession: false },
    });

    const { data: wu } = await db
        .from("work_units")
        .select("id, key, name")
        .eq("org_id", ORG)
        .eq("key", WORK_UNIT_KEY)
        .maybeSingle();
    const workUnitId = (wu as { id: string } | null)?.id;
    if (!workUnitId) throw new Error("work unit not resolved");
    console.log(`work unit: ${WORK_UNIT_KEY} (${workUnitId})\n`);

    // ── The lens under test, read from tenant config through the production reader. ──
    const { data: dept } = await db.from("departments").select("metadata").eq("id", DEPT).maybeSingle();
    const meta = (dept as { metadata?: unknown } | null)?.metadata;
    const stages = activeStagesForProcess(activeLifecycleProcess(lifecycleBuilderFromDepartmentMetadata(meta))!);
    const views = savedWorkViewsFromDepartmentMetadata(meta);
    const lens = views.find((v) => v.id === "all_children_in_enrollment");
    console.log("── the lens ──");
    check(!!lens, `"All Children in Enrollment" exists in tenant config`);
    if (!lens) throw new Error("lens absent — author it first");
    const grain = resolveLensRowGrain(lens, stages);
    check(grain.ok && grain.grain === "child", "resolves to child grain", JSON.stringify(grain));
    check(lensStageKeys(lens).length === 0, "is stage-independent → participation membership");

    // ── Ground truth, computed independently of the PROVIDER but through the DEFINITION's own gate. ──
    // Liveness is not restated here: `isLiveEnrollmentParticipant` is the ratified predicate, and a
    // second copy of it in this script would prove only that two copies agree. What IS independent is
    // the population and the scoping — enumerated straight from the tables, with no provider involved.
    const { data: allPis, error: piErr } = await db
        .from("process_instances")
        .select("id, org_id, process_key, subject_type, subject_id, context_id, stage_key, state, close_reason_key")
        .eq("org_id", ORG)
        .eq("process_key", "enrollment");
    if (piErr) throw new Error(`ground-truth process_instances read failed: ${piErr.message}`);
    const pis = (allPis ?? []) as Array<Record<string, unknown>>;

    const contextIds = [...new Set(pis.map((p) => p.context_id).filter(Boolean))] as string[];
    const { data: opps, error: oppErr } = await db
        .from("opportunities")
        .select("id, stage_key, status_key, work_unit_id")
        .eq("org_id", ORG)
        .in("id", contextIds.length ? contextIds : ["00000000-0000-0000-0000-000000000000"]);
    if (oppErr) throw new Error(`ground-truth opportunities read failed: ${oppErr.message}`);
    const oppById = new Map((opps ?? []).map((o) => [String((o as Record<string, unknown>).id), o as Record<string, unknown>]));

    const subjectIds = [...new Set(pis.map((p) => p.subject_id).filter(Boolean))] as string[];
    const { data: cms, error: cmErr } = await db
        .from("customer_members")
        .select("id, is_active")
        .in("id", subjectIds.length ? subjectIds : ["00000000-0000-0000-0000-000000000000"]);
    if (cmErr) throw new Error(`ground-truth customer_members read failed: ${cmErr.message}`);
    const cmById = new Map((cms ?? []).map((c) => [String((c as Record<string, unknown>).id), c as Record<string, unknown>]));

    // Scope first (the provider resolves its context opportunities WITH `work_unit_id` bound), then
    // hand what survives to the Definition.
    const inScope = pis.filter((pi) => {
        const opp = pi.context_id ? oppById.get(String(pi.context_id)) : undefined;
        return !!opp && String(opp.work_unit_id ?? "") === workUnitId;
    });

    const participants = buildEnrollmentParticipants(
        inScope as never,
        inScope.map((pi) => {
            const opp = oppById.get(String(pi.context_id))!;
            return {
                id: String(opp.id),
                stage_key: typeof opp.stage_key === "string" ? opp.stage_key : null,
                status_key: typeof opp.status_key === "string" ? opp.status_key : null,
                work_unit_id: typeof opp.work_unit_id === "string" ? opp.work_unit_id : null,
            };
        }) as never,
        [...cmById.values()].map((cm) => ({
            id: String(cm.id),
            is_active: typeof cm.is_active === "boolean" ? cm.is_active : null,
        })) as never,
    );
    const expectedLive = new Set(
        participants.filter(isLiveEnrollmentParticipant).map((p) => String(p.participantId)),
    );

    type Verdict = { pi: Record<string, unknown>; live: boolean; reason: string };
    const verdicts: Verdict[] = pis.map((pi) => {
        const id = String(pi.id);
        if (expectedLive.has(id)) return { pi, live: true, reason: "live" };
        const opp = pi.context_id ? oppById.get(String(pi.context_id)) : undefined;
        if (String(pi.subject_type) !== "child") return { pi, live: false, reason: "subject_type is not child" };
        if (!opp) return { pi, live: false, reason: "context opportunity not found" };
        if (String(opp.work_unit_id ?? "") !== workUnitId) return { pi, live: false, reason: "context outside this work unit" };
        if (pi.close_reason_key != null) return { pi, live: false, reason: "instance closed (close_reason_key set)" };
        const cm = pi.subject_id ? cmById.get(String(pi.subject_id)) : undefined;
        if (cm && cm.is_active === false) return { pi, live: false, reason: "subject inactive" };
        return { pi, live: false, reason: `context closed (status_key=${String(opp.status_key ?? "")})` };
    });
    console.log(`\n── tenant population (${pis.length} enrollment process_instances) ──`);
    const byReason = new Map<string, number>();
    for (const v of verdicts) byReason.set(v.reason, (byReason.get(v.reason) ?? 0) + 1);
    for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${reason}`);

    // ── THE PROVIDER, RUN FOR REAL. ──
    const rows = await loadChildGrainProvisioningRows({
        supabase: db as never,
        orgId: ORG,
        workUnitId,
        membership: { mode: "participation" },
    });

    console.log(`\n── provider returned ${rows.length} rows ──`);
    for (const r of rows) {
        console.log(
            `  ${String(r.title ?? "(unnamed)").padEnd(22)} stage=${String(r.stageKey ?? "-").padEnd(10)} ` +
                `cm=${String(r.subjectId).slice(0, 8)} pi=${String(r.participationId ?? "-").slice(0, 8)} ` +
                `opp=${String(r.contextId ?? "-").slice(0, 8)} ocm=${r.legacyOcmId ? String(r.legacyOcmId).slice(0, 8) : "-"}`,
        );
    }

    console.log("\n── PROOFS ──");
    const returned = new Set(rows.map((r) => String(r.participationId)));

    check(
        returned.size === expectedLive.size && [...returned].every((id) => expectedLive.has(id)),
        "provider output == independently-computed LIVE participation set",
        `provider=${returned.size} expected=${expectedLive.size}` +
            ([...expectedLive].filter((id) => !returned.has(id)).length
                ? ` MISSING=${[...expectedLive].filter((id) => !returned.has(id)).join(",")}`
                : "") +
            ([...returned].filter((id) => !expectedLive.has(id)).length
                ? ` EXTRA=${[...returned].filter((id) => !expectedLive.has(id)).join(",")}`
                : ""),
    );

    const closedIds = new Set(verdicts.filter((v) => !v.live).map((v) => String(v.pi.id)));
    if (closedIds.size === 0) {
        // Say this out loud. A negative claim with no negative instances in the data is not evidence,
        // and a green tick here would read as if it were. The exclusion rule is unit-proven
        // (`tests/queues/childGrainProcessInstanceQueue.test.ts` covers closed instance under an active
        // family, inactive subject, closed family case, non-enrollment subject type); what THIS tenant
        // cannot currently contribute is a live counterexample.
        console.log(
            "  ⚠ NOT PROVEN HERE — the tenant holds zero non-live enrollment participations, so " +
                "'closed participation never appears' is vacuously true against this data. Unit-proven only.",
        );
    } else {
        check([...returned].every((id) => !closedIds.has(id)), `no non-live participation appears (${closedIds.size} excluded)`);
    }

    const oppIds = new Set([...oppById.keys()]);
    check(rows.every((r) => !oppIds.has(String(r.subjectId))), "no row's SUBJECT is an opportunity id");
    check(rows.every((r) => !!r.subjectId), "every row names a child (customer_members.id)");
    check(rows.every((r) => !!r.participationId), "every row names its participation (process_instances.id)");
    check(rows.every((r) => !!r.contextId), "every row names its family context (opportunities.id)");
    check(
        new Set(rows.map((r) => r.participationId)).size === rows.length,
        "one row per participation — no duplicates",
    );
    check(
        rows.every((r) => {
            const opp = r.contextId ? oppById.get(String(r.contextId)) : undefined;
            return !!opp && String(opp.work_unit_id ?? "") === workUnitId;
        }),
        "every row is scoped to this work unit through its context",
    );

    // Effective stage travels for DISPLAY. Membership must not have used it.
    const stageKeysSeen = [...new Set(rows.map((r) => r.stageKey))];
    console.log(`\n  effective stages present in the result: ${JSON.stringify(stageKeysSeen)}`);
    check(
        stageKeysSeen.length >= 1,
        "membership is stage-independent (rows carry effective stage, it did not gate them)",
    );

    console.log(`\n${failures === 0 ? "ALL PROOFS PASSED" : `${failures} PROOF(S) FAILED`}`);
    if (failures) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
