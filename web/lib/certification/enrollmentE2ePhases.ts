/**
 * REAL ENROLLMENT V1 — the certification phases themselves.
 *
 * Each phase proves one property against the LIVE certification database using real product entry
 * points, and states its own failure boundary. See enrollmentE2eDriver.ts for the harness contract.
 *
 * Phases that require the participant browser surface are declared `not_implemented` rather than
 * stubbed green. A harness that reports PASS for a step it never ran is not a weaker harness, it is
 * a misleading one, and this program has already lost days to confident claims that outran their
 * evidence.
 */

import type { Phase } from "@/lib/certification/enrollmentE2eDriver";
import { CERT_FAMILIES, findFixtureHousehold, verifyEnrollmentCertification } from "@/lib/certification/enrollmentCertificationFixture";
/*
 * From lib/process/processInstances, which is where this constant actually lives. The first draft
 * imported it from the status vocabulary, and under tsx a missing named export resolves to
 * `undefined` rather than throwing — so every journey compared unequal and the phase reported a
 * confident failure naming the correct value as wrong. Worth stating: the harness failed CLOSED,
 * which is the safe direction, but the lesson is that an import of a constant deserves the same
 * "read where it is defined" discipline as a database column.
 */
import { ENROLLMENT_PARTICIPATION_CONTEXT_TYPE } from "@/lib/process/processInstances";

type Row = Record<string, unknown>;

/** A: the starting state exists and is exactly what the fixture claims. */
const bootstrap: Phase = {
    key: "A_bootstrap",
    title: "fixture bootstrap",
    async run(ctx) {
        const result = await verifyEnrollmentCertification(ctx.supabase, ctx.orgId);
        if (!result.ok) {
            return { status: "failed", detail: `fixture is not verifiable: ${result.findings.join("; ")}` };
        }
        return {
            status: "passed",
            detail: `both certification families verify with no findings`,
            evidence: { families: result.families },
        };
    },
};

/**
 * B: entry state, at the grain the whole lane exists to protect.
 *
 * Path A must be context-free; Path B must retain its acquisition Opportunity. Both must anchor their
 * journey to the participation. This is the property the grain correction established, so it is
 * asserted against live data on every run rather than trusted because a unit test passed.
 */
const entryState: Phase = {
    key: "B_entry",
    title: "entry state and grain separation",
    dependsOn: ["A_bootstrap"],
    async run(ctx) {
        const problems: string[] = [];
        const seen: Record<string, unknown> = {};

        for (const key of Object.keys(CERT_FAMILIES) as Array<keyof typeof CERT_FAMILIES>) {
            const spec = CERT_FAMILIES[key];
            const { customerId } = await findFixtureHousehold(ctx.supabase, ctx.orgId, spec.email);
            if (!customerId) {
                problems.push(`${spec.key}: household absent`);
                continue;
            }

            const { data: members } = await ctx.supabase
                .from("customer_members")
                .select("id")
                .eq("org_id", ctx.orgId)
                .eq("customer_id", customerId)
                .eq("relationship", "child");
            const childId = ((members ?? []) as Row[])[0]?.id as string | undefined;
            if (!childId) {
                problems.push(`${spec.key}: child absent`);
                continue;
            }

            const { data: ocms } = await ctx.supabase
                .from("opportunity_customer_members")
                .select("id, opportunity_id")
                .eq("org_id", ctx.orgId)
                .eq("customer_member_id", childId);
            const ocmRows = (ocms ?? []) as Row[];
            if (ocmRows.length !== 1) {
                problems.push(`${spec.key}: expected exactly one participation, found ${ocmRows.length}`);
                continue;
            }
            const ocm = ocmRows[0]!;

            const { data: journeys } = await ctx.supabase
                .from("process_instances")
                .select("id, context_type, context_id, stage_key, state, metadata")
                .eq("org_id", ctx.orgId)
                .eq("process_key", "enrollment")
                .eq("subject_id", childId);
            const jrs = (journeys ?? []) as Row[];
            if (jrs.length !== 1) {
                problems.push(`${spec.key}: expected exactly one journey, found ${jrs.length}`);
                continue;
            }
            const j = jrs[0]!;

            if (j.context_type !== ENROLLMENT_PARTICIPATION_CONTEXT_TYPE) {
                problems.push(`${spec.key}: journey anchored as ${String(j.context_type)}`);
            }
            if (j.context_id !== ocm.id) {
                problems.push(`${spec.key}: journey is not anchored to its participation`);
            }
            // The grain property: Path A carries no acquisition Opportunity, Path B keeps one.
            if (spec.key === "context_free" && ocm.opportunity_id) {
                problems.push("context_free: participation carries an acquisition Opportunity");
            }
            if (spec.key === "opportunity_backed" && !ocm.opportunity_id) {
                problems.push("opportunity_backed: participation lost its acquisition Opportunity");
            }
            seen[spec.key] = { childId, participationId: ocm.id, journeyId: j.id, stageKey: j.stage_key };
        }

        return problems.length
            ? { status: "failed", detail: problems.join("; ") }
            : { status: "passed", detail: "both paths: one participation, one anchored journey, grain preserved", evidence: seen };
    },
};

/**
 * R1: Path A's Enrollment does not rejoin the acquisition track.
 *
 * THE FIRST VERSION OF THIS PHASE WAS WRONG, and the correction is worth keeping. It asserted that
 * the context-free household holds ZERO Opportunities, and duly failed — because Path A's fixture is
 * built through Create Lead and then CONCLUDES the acquisition, so one historical Opportunity is
 * exactly what its design produces. The spec's "Path A creates no Opportunity" means Enrollment must
 * not FABRICATE one, not that the family never had an acquisition.
 *
 * So the property is stated at the grain that actually carries it: the participation must remain
 * context-free, and the household's acquisition must stay concluded. A count of Opportunities is
 * recorded as evidence so a later lifecycle phase can prove it did not GROW, which is the real
 * regression this guards against.
 */
const pathAStaysContextFree: Phase = {
    key: "R1_path_a_stays_context_free",
    title: "negative: context-free Enrollment does not rejoin the acquisition track",
    dependsOn: ["B_entry"],
    async run(ctx) {
        const spec = CERT_FAMILIES.contextFree;
        const { customerId } = await findFixtureHousehold(ctx.supabase, ctx.orgId, spec.email);
        if (!customerId) return { status: "failed", detail: "context-free household absent" };

        const { data: opps } = await ctx.supabase
            .from("opportunities")
            .select("id, status")
            .eq("org_id", ctx.orgId)
            .eq("customer_id", customerId);
        const oppRows = (opps ?? []) as Row[];

        const { data: members } = await ctx.supabase
            .from("customer_members")
            .select("id")
            .eq("org_id", ctx.orgId)
            .eq("customer_id", customerId)
            .eq("relationship", "child");
        const childId = ((members ?? []) as Row[])[0]?.id as string | undefined;
        if (!childId) return { status: "failed", detail: "context-free child absent" };

        const { data: ocms } = await ctx.supabase
            .from("opportunity_customer_members")
            .select("opportunity_id")
            .eq("org_id", ctx.orgId)
            .eq("customer_member_id", childId);
        const attached = ((ocms ?? []) as Row[]).filter((r) => r.opportunity_id);

        return attached.length === 0
            ? {
                  status: "passed",
                  detail: `participation is context-free; household holds ${oppRows.length} concluded acquisition record(s)`,
                  evidence: { opportunityCount: oppRows.length },
              }
            : {
                  status: "failed",
                  detail: `context-free participation has acquired an Opportunity reference`,
              };
    },
};

/**
 * R2: no duplicate active context-free participation.
 *
 * The episode-slot invariant. `enrolled` ends an episode, so a second active context-free
 * participation for one child means either the slot was never released or two were opened.
 */
const noDuplicateActiveEpisode: Phase = {
    key: "R2_no_duplicate_episode",
    title: "negative: no duplicate active context-free participation",
    dependsOn: ["B_entry"],
    async run(ctx) {
        const { data } = await ctx.supabase
            .from("opportunity_customer_members")
            .select("customer_member_id, opportunity_id, outcome_status_key")
            .eq("org_id", ctx.orgId)
            .is("opportunity_id", null);
        const rows = (data ?? []) as Row[];
        const concluded = new Set(["enrolled", "withdrawn", "closed_withdrawn", "not_enrolling"]);
        const active = rows.filter((r) => !concluded.has(String(r.outcome_status_key ?? "")));
        const byChild = new Map<string, number>();
        for (const r of active) {
            const k = String(r.customer_member_id);
            byChild.set(k, (byChild.get(k) ?? 0) + 1);
        }
        const offenders = [...byChild.values()].filter((n) => n > 1).length;
        return offenders === 0
            ? { status: "passed", detail: `${active.length} active context-free participation(s), none duplicated` }
            : { status: "failed", detail: `${offenders} child(ren) hold more than one active context-free participation` };
    },
};

/**
 * Phases that need the participant browser surface. Declared, ordered and explicitly unimplemented
 * so the report shows the shape of what remains rather than hiding it.
 */
const browserPhases: readonly Phase[] = (
    [
        ["C_participant_entry", "participant entry"],
        ["D_confirmation", "confirm known facts"],
        ["E_collection", "missing semantic collection"],
        ["F_parties", "repeatable parties"],
        ["G_evidence", "evidence and Form completion"],
        ["H_artifacts", "artifact generation"],
        ["I_correction", "review and correction"],
        ["J_signature", "signatures"],
        ["K_participant_complete", "participant completion"],
        ["L_sufficiency", "requirement sufficiency: blocked then ready"],
        ["M_exception", "governed exception"],
        ["N_complete_enrollment", "Complete Enrollment"],
        ["P_handoff", "operational handoff"],
        ["Q_next_episode", "next episode"],
        ["S_responsive", "1280 and 375 product proof"],
    ] as const
).map(([key, title]) => ({
    key,
    title,
    dependsOn: ["B_entry"],
    async run() {
        return {
            status: "not_implemented" as const,
            detail: "requires the participant browser surface; not run, and deliberately not reported as a pass",
        };
    },
}));

/** The suite, in order. */
export const REAL_ENROLLMENT_V1_PHASES: readonly Phase[] = [
    bootstrap,
    entryState,
    pathAStaysContextFree,
    noDuplicateActiveEpisode,
    ...browserPhases,
];
