/**
 * CERTIFICATION HEALTH TRUTH — created through H4, never inserted.
 *
 * The whole point of routing this through `healthFactService` is that the fixture exercises the same
 * seam an operator does: the permission check, the payload validation, the provenance requirement and
 * the supersession lineage all apply. A direct insert would prove the table accepts rows and nothing
 * about whether the platform works.
 *
 * ── IDEMPOTENCE WITHOUT A FLAG ──
 *
 * A repeated `ensure` must not stack duplicate active allergies — on a health card that would read as
 * two separate peanut allergies. There is no natural key in the payload, so each fixture fact carries
 * a deterministic `source_ref`: "the action that asserted it" is exactly what that column is for, and
 * a stable action identifier is a truthful value rather than a fixture-only marker bolted on.
 *
 * ── AND NO DELETION, EVER ──
 *
 * `restore` ENDS facts through H4 rather than removing rows. Health history is append-only for the
 * same reason attendance history is, and the fixture that tried to delete attendance is why that rule
 * is now enforced in the database.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { HealthAccessSubject } from "@/lib/health/healthAccess";
import { addHealthFact, endHealthFact } from "@/lib/health/healthFactService";
import {
    PERSON_HEALTH_FACTS_TABLE,
    PERSON_HEALTH_FACT_SELECT,
    type PersonHealthFactRow,
} from "@/lib/health/healthFactModel";

/** Stable, namespaced provenance. One per fixture fact, and the idempotence key. */
const SOURCE_PREFIX = "operational-cards-cert";

export type HealthFixtureResult = {
    ok: boolean;
    created: Array<{ child: string; kind: string; label: string; factId: string }>;
    reused: Array<{ child: string; kind: string; factId: string }>;
    ended: Array<{ child: string; factId: string }>;
    refusals: string[];
};

type FixtureFact = {
    childKey: "Certa" | "Certb";
    ref: string;
    kind: "allergy" | "condition" | "medication";
    payload: Record<string, unknown>;
    /** For a medication: the ref of the fact it treats, resolved to an id at write time. */
    treatsRef?: string;
};

/**
 * The two specimens, chosen to CONTRAST.
 *
 * Certa is high-acuity: a severe allergy with a reaction, an action instruction and the medication
 * that answers it — the case the critical region exists for. Certb is ordinary daily care. If both
 * children rendered the same shape, participant switching would look correct while proving nothing.
 */
const FIXTURE_FACTS: readonly FixtureFact[] = [
    {
        childKey: "Certa",
        ref: `${SOURCE_PREFIX}:certa:allergy:peanut`,
        kind: "allergy",
        payload: {
            allergen: "Peanut",
            severity: "severe",
            reaction: "Anaphylaxis",
            care_instructions: "Strict avoidance. No shared food or utensils.",
            treatment: "Administer EpiPen Jr and call 911 immediately.",
        },
    },
    {
        childKey: "Certa",
        ref: `${SOURCE_PREFIX}:certa:medication:epipen`,
        kind: "medication",
        treatsRef: `${SOURCE_PREFIX}:certa:allergy:peanut`,
        payload: {
            medication: "EpiPen Jr",
            dosage: "0.15 mg",
            as_needed: true,
            administration_instructions: "Outer thigh, hold 3 seconds, then call 911.",
            storage_location: "Office medication cabinet, front shelf",
        },
    },
    {
        childKey: "Certb",
        ref: `${SOURCE_PREFIX}:certb:condition:asthma`,
        kind: "condition",
        payload: {
            condition: "Mild intermittent asthma",
            severity: "mild",
            restrictions: "May need a rest break during sustained outdoor play.",
            care_instructions: "Watch for wheezing on high-pollen days.",
        },
    },
];

async function findByRef(
    supabase: SupabaseClient,
    orgId: string,
    memberId: string,
    ref: string,
): Promise<PersonHealthFactRow | null> {
    const { data, error } = await supabase
        .from(PERSON_HEALTH_FACTS_TABLE)
        .select(PERSON_HEALTH_FACT_SELECT)
        .eq("org_id", orgId)
        .eq("subject_entity_id", memberId)
        .eq("source_ref", ref)
        .eq("status", "active")
        .maybeSingle();
    if (error) throw new Error(`health fixture lookup failed: ${error.message}`);
    return (data ?? null) as unknown as PersonHealthFactRow | null;
}

/**
 * Ensure the certification health truth exists. Idempotent by `source_ref`.
 *
 * Written in DEPENDENCY ORDER — the allergy before the medication that treats it — so
 * `related_fact_id` can point at a real row rather than being patched in afterwards. Patching it
 * afterwards would mean an in-place edit of what a fact says, which the trigger correctly refuses.
 */
export async function ensureCertificationHealthTruth(
    supabase: SupabaseClient,
    orgId: string,
    childIdsByName: Record<string, string>,
    access: HealthAccessSubject,
    actorUserId: string | null,
): Promise<HealthFixtureResult> {
    const out: HealthFixtureResult = { ok: true, created: [], reused: [], ended: [], refusals: [] };
    const idByRef = new Map<string, string>();

    for (const spec of FIXTURE_FACTS) {
        const memberId = childIdsByName[spec.childKey];
        if (!memberId) {
            out.refusals.push(`${spec.childKey}: no certification child resolved`);
            continue;
        }
        try {
            const existing = await findByRef(supabase, orgId, memberId, spec.ref);
            if (existing) {
                idByRef.set(spec.ref, existing.id);
                out.reused.push({ child: spec.childKey, kind: spec.kind, factId: existing.id });
                continue;
            }
            const relatedFactId = spec.treatsRef ? idByRef.get(spec.treatsRef) ?? null : null;
            if (spec.treatsRef && !relatedFactId) {
                // Fail closed rather than write a medication that treats nothing.
                out.refusals.push(`${spec.childKey}: cannot link ${spec.kind} — ${spec.treatsRef} unresolved`);
                continue;
            }
            const row = await addHealthFact(supabase, {
                access,
                orgId,
                subjectEntityType: "customer_member",
                subjectEntityId: memberId,
                factKind: spec.kind,
                payload: spec.payload,
                // An operator asserted it. The fixture does not pretend a form or document did.
                sourceKind: "operator",
                sourceRef: spec.ref,
                relatedFactId,
                actorUserId,
            });
            idByRef.set(spec.ref, row.id);
            out.created.push({
                child: spec.childKey,
                kind: spec.kind,
                label: String(spec.payload.allergen ?? spec.payload.condition ?? spec.payload.medication ?? ""),
                factId: row.id,
            });
        } catch (e) {
            out.ok = false;
            out.refusals.push(`${spec.childKey}/${spec.kind}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    return out;
}

/**
 * Return the certification subjects to a known health state by ENDING their fixture facts.
 *
 * Never a delete. `end` closes a fact with a date and leaves the row saying when it stopped applying,
 * which is what the append-only model is for — and what the Attendance fixture had to learn.
 * Medications are ended before what they treat, so no closed fact is left with a live dependent.
 */
export async function restoreCertificationHealthTruth(
    supabase: SupabaseClient,
    orgId: string,
    childIdsByName: Record<string, string>,
    access: HealthAccessSubject,
    actorUserId: string | null,
): Promise<HealthFixtureResult> {
    const out: HealthFixtureResult = { ok: true, created: [], reused: [], ended: [], refusals: [] };
    for (const spec of [...FIXTURE_FACTS].reverse()) {
        const memberId = childIdsByName[spec.childKey];
        if (!memberId) continue;
        try {
            const existing = await findByRef(supabase, orgId, memberId, spec.ref);
            if (!existing) continue;
            const row = await endHealthFact(supabase, {
                access,
                orgId,
                factId: existing.id,
                reason: "operational cards certification restore",
                actorUserId,
            });
            out.ended.push({ child: spec.childKey, factId: row.id });
        } catch (e) {
            out.ok = false;
            out.refusals.push(`${spec.childKey}/${spec.kind}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    return out;
}
