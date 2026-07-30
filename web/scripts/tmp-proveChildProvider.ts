/**
 * PHASE D + E PROOF — the child provider executes against REAL Firefly data.
 *
 * D: Registration/Waitlist are empty because the child provider RAN and the stage filter excluded every
 *    child, not because a provider was absent or the wrong table was read.
 * E: the same provider, pointed at the stage those children actually hold (`lead`), returns REAL child
 *    rows — names, family context, effective stage. No seeded data: these are the 11 participations
 *    Create Lead wrote.
 *
 * Run from web/ with the trusted env sourced:
 *   npx tsx scripts/tmp-proveChildProvider.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadChildGrainProvisioningRows } from "../lib/runtime/provisioning/childGrainProvisioningRows";

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19"; // Firefly

async function main() {
    const db = createClient(process.env.SUPABASE_URL!.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), {
        auth: { persistSession: false },
    });

    const { data: wus } = await db
        .from("work_units")
        .select("id, key, department_id")
        .eq("org_id", ORG)
        .eq("key", "lifecycle_wu_lead")
        .maybeSingle();
    const workUnitId = (wus as { id: string } | null)?.id;
    const departmentId = (wus as { department_id: string } | null)?.department_id;
    if (!workUnitId) throw new Error("work unit not resolved");

    const { data: dept } = await db.from("departments").select("metadata").eq("id", departmentId!).maybeSingle();
    const views = ((dept as { metadata?: Record<string, unknown> } | null)?.metadata?.work_views_v1 ?? []) as Array<{
        id: string;
        label: string;
        filters_v1?: Array<{ field_key?: string; value?: unknown }>;
    }>;

    const stagesOf = (v: (typeof views)[number]) =>
        (v.filters_v1 ?? [])
            .filter((f) => f.field_key === "opportunity_stage")
            .flatMap((f) => (Array.isArray(f.value) ? f.value : [f.value]))
            .map(String);

    // How many child participations exist AT ALL for this tenant — the population under evaluation.
    const { data: allPis } = await db
        .from("process_instances")
        .select("id, subject_id, context_id, stage_key")
        .eq("org_id", ORG)
        .eq("process_key", "enrollment")
        .eq("subject_type", "child");
    console.log(`child participations in tenant: ${allPis?.length ?? 0}`);
    console.log(`  with their own stage_key: ${(allPis ?? []).filter((p) => p.stage_key).length}`);
    console.log(`  riding the family stage:   ${(allPis ?? []).filter((p) => !p.stage_key).length}\n`);

    for (const v of views) {
        const stages = stagesOf(v);
        const rows = await loadChildGrainProvisioningRows({
            supabase: db as never,
            orgId: ORG,
            workUnitId,
            stageKeys: stages,
        });
        console.log(`${v.label.padEnd(17)} stages=[${stages.join(", ") || "(all)"}]  childRows=${rows.length}`);
        for (const r of rows.slice(0, 12)) {
            console.log(
                `    ${String(r.title).padEnd(18)} subject=${r.subjectId.slice(0, 8)} participation=${String(r.participationId).slice(0, 8)} context=${String(r.contextId).slice(0, 8)} stage=${r.stageKey} legacyOcm=${r.legacyOcmId ?? "-"}`,
            );
        }
    }

    // E: the provider aimed at the stage the children actually hold.
    const leadRows = await loadChildGrainProvisioningRows({
        supabase: db as never,
        orgId: ORG,
        workUnitId,
        stageKeys: ["lead"],
    });
    console.log(`\nSAME PROVIDER, stage "lead": childRows=${leadRows.length}`);
    for (const r of leadRows) {
        console.log(
            `    ${String(r.title).padEnd(18)} subject=${r.subjectId.slice(0, 8)} participation=${String(r.participationId).slice(0, 8)} context=${String(r.contextId).slice(0, 8)} stage=${r.stageKey}`,
        );
    }

    // The invariant that actually matters: no child row's identity or subject is an opportunity id.
    const { data: opps } = await db.from("opportunities").select("id").eq("org_id", ORG);
    const oppIds = new Set((opps ?? []).map((o) => o.id as string));
    const leak = leadRows.filter((r) => oppIds.has(r.subjectId));
    console.log(`\nchild rows whose SUBJECT is an opportunity id: ${leak.length} (must be 0)`);
    const distinct = leadRows.every((r) => r.subjectId !== r.participationId && r.subjectId !== r.contextId);
    console.log(`every child row keeps subject/participation/context distinct: ${distinct}`);
}

main().catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
});
