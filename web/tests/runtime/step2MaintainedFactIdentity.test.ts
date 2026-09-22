/**
 * P0-7.6 STEP 2 — OLD versus NEW, on the same facts.
 *
 * Retiring a read is only safe if what replaces it answers identically. This runs BOTH
 * implementations over the same participant rows and requires the same effective stages and the same
 * rollup labels: the database loader (`loadEffectiveEnrollmentStagesByOpportunity`, driven through a
 * double) and the pure derivation over maintained facts.
 *
 * It lives in the certification suite ON PURPOSE. A shadow comparison inside the runtime would
 * reintroduce the very read it exists to retire, while looking like diligence.
 */
import { describe, expect, it } from "vitest";
import { loadEffectiveEnrollmentStagesByOpportunity } from "@/lib/process/definitions/enrollment/loadEffectiveEnrollmentStagesByOpportunity";
import {
    attachEffectiveStagesFromMaintainedFacts,
    deriveEffectiveStagesFromMaintainedFacts,
    type MaintainedParticipantFact,
} from "@/lib/process/definitions/enrollment/maintainedParticipantFacts";

const ORG = "11111111-1111-4111-8111-111111111111";
const OPP = "22222222-2222-4222-8222-222222222222";

type Row = MaintainedParticipantFact & { org_id: string; process_key: string; metadata: Record<string, unknown> };

const participant = (over: Partial<MaintainedParticipantFact> & { id: string }): MaintainedParticipantFact => ({
    subject_type: "child",
    subject_id: `subj-${over.id}`,
    context_id: OPP,
    stage_key: null,
    state: "active",
    close_reason_key: null,
    stage_entered_at: null,
    location_id: null,
    ...over,
});

/** A double answering exactly the two reads the loader performs — and nothing else. */
function fakeSupabase(rows: MaintainedParticipantFact[]) {
    return {
        from(table: string) {
            const builder: Record<string, unknown> = {};
            const chain = () => builder;
            builder.select = chain;
            builder.eq = chain;
            builder.in = chain;
            builder.is = chain;
            builder.then = (resolve: (r: { data: unknown[]; error: null }) => void) => {
                if (table === "opportunity_customer_members") {
                    // No participation-anchored journeys in these fixtures: every context is the
                    // opportunity itself, which is the older anchor and the simpler comparison.
                    resolve({ data: [], error: null });
                    return;
                }
                const data: Row[] = rows
                    // The loader filters closed journeys in its WHERE clause; the pure derivation
                    // filters them in TypeScript. Modelling it here is what makes the two comparable.
                    .filter((r) => r.close_reason_key == null)
                    .map((r) => ({
                        ...r,
                        org_id: ORG,
                        process_key: "enrollment",
                        /*
                         * The loader reads a participant's location from `metadata.location_id`, not
                         * from a column. The maintained field extracts that SAME value
                         * (metadata ->> 'location_id'), so this is where the two representations meet
                         * — and supplying it as a bare column made both scoped cases silently agree
                         * that nothing was scoped out.
                         */
                        metadata: r.location_id ? { location_id: r.location_id } : {},
                    }));
                resolve({ data, error: null });
            };
            return builder;
        },
    } as never;
}

async function oldAnswer(rows: MaintainedParticipantFact[], contextStage: string | null, allowed?: Set<string>) {
    const loaded = await loadEffectiveEnrollmentStagesByOpportunity({
        supabase: fakeSupabase(rows),
        orgId: ORG,
        opportunityIds: [OPP],
        contextStageByOpportunityId: new Map([[OPP, contextStage]]),
        allowedLocationIds: allowed ?? null,
    });
    return {
        stageKeys: loaded.stagesByOpportunityId.get(OPP) ?? [],
        rollup: loaded.rollupLabelsByOpportunityId.get(OPP) ?? { stage: null, location: null },
    };
}

function newAnswer(rows: MaintainedParticipantFact[], contextStage: string | null, allowed?: Set<string>) {
    return deriveEffectiveStagesFromMaintainedFacts({
        opportunityId: OPP,
        contextStageKey: contextStage,
        participants: rows,
        allowedLocationIds: allowed ?? null,
    });
}

describe("the maintained-fact derivation answers identically to the read it retires", () => {
    const cases: Array<{
        name: string;
        rows: MaintainedParticipantFact[];
        contextStage: string | null;
        allowed?: Set<string>;
    }> = [
        { name: "no participants", rows: [], contextStage: "lead" },
        { name: "one participant with its own stage", rows: [participant({ id: "a", stage_key: "tour" })], contextStage: "lead" },
        {
            name: "multiple participants at different stages",
            rows: [participant({ id: "a", stage_key: "tour" }), participant({ id: "b", stage_key: "waitlist" })],
            contextStage: "lead",
        },
        {
            name: "a null participant stage inheriting the opportunity stage",
            rows: [participant({ id: "a", stage_key: null })],
            contextStage: "decision",
        },
        {
            name: "a forked stage — one inheriting, one diverged",
            rows: [participant({ id: "a", stage_key: null }), participant({ id: "b", stage_key: "waitlist" })],
            contextStage: "lead",
        },
        {
            name: "a closed participant beside an open one",
            rows: [
                participant({ id: "a", stage_key: "tour" }),
                participant({ id: "b", stage_key: "closed_withdrawn", state: "closed", close_reason_key: "withdrawn" }),
            ],
            contextStage: "lead",
        },
        {
            name: "every participant closed",
            rows: [participant({ id: "a", stage_key: "closed_withdrawn", state: "closed", close_reason_key: "withdrawn" })],
            contextStage: "lead",
        },
        {
            name: "no opportunity stage to inherit",
            rows: [participant({ id: "a", stage_key: null })],
            contextStage: null,
        },
        {
            name: "scoped caller — one participant in scope, one out",
            rows: [
                participant({ id: "a", stage_key: "tour", location_id: "loc-1" }),
                participant({ id: "b", stage_key: "waitlist", location_id: "loc-2" }),
            ],
            contextStage: "lead",
            allowed: new Set(["loc-1"]),
        },
        {
            name: "scoped caller — a participant with no location is kept, not scoped out",
            rows: [
                participant({ id: "a", stage_key: "tour", location_id: null }),
                participant({ id: "b", stage_key: "waitlist", location_id: "loc-2" }),
            ],
            contextStage: "lead",
            allowed: new Set(["loc-1"]),
        },
    ];

    for (const c of cases) {
        it(`is identical: ${c.name}`, async () => {
            const before = await oldAnswer(c.rows, c.contextStage, c.allowed);
            const after = newAnswer(c.rows, c.contextStage, c.allowed);
            expect([...after.stageKeys].sort()).toEqual([...before.stageKeys].sort());
            expect(after.rollup.stage).toEqual(before.rollup.stage);
            expect(after.rollup.location).toEqual(before.rollup.location);
        });
    }

    it("absence is not emptiness — an unmaintained row is left out, not called childless", () => {
        /*
         * The loader returned no entry for an opportunity it could not resolve, and the attach helper
         * decided what that rendered as. Collapsing "never maintained" into "zero participants" is how
         * a missing fact would quietly render as a family with no children.
         */
        const rows: Record<string, unknown>[] = [
            { id: OPP, stage_key: "lead" },
            { id: OPP, stage_key: "lead", maintained_operational_facts: { v: 1, participants: [], tour: null } },
        ];
        const [unmaintained, maintained] = attachEffectiveStagesFromMaintainedFacts(rows);
        expect(unmaintained!._effective_participant_stage_keys).toBeUndefined();
        expect(maintained!._effective_participant_stage_keys).toEqual([]);
    });
});
