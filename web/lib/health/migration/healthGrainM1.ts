/**
 * M1 / D-H1 — THE HEALTH GRAIN CENSUS.
 *
 * `allergy_notes` and `medication_flag` ship as Forms system fields bound to `enrollment`. Two of
 * three Forms subsystems already say the child owns health (`canonicalBindingSuggestions` suggests
 * `customer_member`; `sharedValuesToFieldIds`'s canonical example is literally
 * `customer_member:allergies`), and the operational question — "what is true about this child?" — is
 * child-grain by nature. A child's allergy currently belongs to an enrollment episode, so re-enrol
 * next year and it does not follow them.
 *
 * ── THIS MODULE ONLY COUNTS ──
 *
 * It writes nothing. The move belongs in a migration, where it runs with the schema. What this
 * produces is the evidence the Director required before approving any move: exact counts per org and
 * field, and — the part that actually matters — every value whose enrollment → child mapping is
 * AMBIGUOUS, so those can be refused rather than guessed.
 *
 * ── WHY AMBIGUITY IS THE WHOLE PROBLEM ──
 *
 * An `enrollment`-grain value hangs off an episode. An episode can contain SEVERAL children. So
 * "which child owns this allergy note" has a deterministic answer only when the episode has exactly
 * one child participant. With two, moving the value picks a child — and putting one sibling's
 * allergy on another is precisely the failure this whole grain correction exists to prevent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** The two shipped health system fields, and nothing else. The blast radius is these keys. */
export const M1_HEALTH_FIELD_KEYS = ["allergy_notes", "medication_flag"] as const;
export type M1HealthFieldKey = (typeof M1_HEALTH_FIELD_KEYS)[number];

export type M1FieldCensus = {
    fieldKey: string;
    orgId: string;
    fieldDefinitionId: string;
    definitionEntityType: string;
    /** Values currently stored at the enrollment grain for this definition. */
    valueCount: number;
    /** Values whose owning child resolves to exactly one participant — safe to move. */
    deterministic: number;
    /** Values whose episode has several children, or none — refused. */
    ambiguous: number;
    ambiguityReasons: Record<string, number>;
};

export type M1Census = {
    /** True when nothing is bound at the wrong grain — the migration is then a registry-only change. */
    clean: boolean;
    definitionsAtEnrollmentGrain: number;
    totalValues: number;
    totalDeterministic: number;
    totalAmbiguous: number;
    byField: M1FieldCensus[];
    notes: string[];
};

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

export async function censusHealthGrainM1(supabase: SupabaseClient): Promise<M1Census> {
    const notes: string[] = [];

    // 1 — the DEFINITIONS. A system field only becomes storage when an org materializes it.
    const { data: defRows, error: defError } = await supabase
        .from("field_definitions")
        .select("id, org_id, entity_type, field_key, is_active")
        .in("field_key", M1_HEALTH_FIELD_KEYS as unknown as string[]);
    if (defError) throw new Error(`field_definitions census failed: ${defError.message}`);
    const definitions = (defRows ?? []) as unknown as Array<{
        id: string;
        org_id: string;
        entity_type: string;
        field_key: string;
    }>;

    const atEnrollment = definitions.filter((d) => t(d.entity_type) === "enrollment");
    if (definitions.length === 0) {
        notes.push(
            "No org has materialized `allergy_notes` or `medication_flag` as a field definition, so no "
            + "tenant value is bound at the wrong grain. M1 is a REGISTRY-ONLY correction here.",
        );
    }
    if (definitions.length > 0 && atEnrollment.length === 0) {
        notes.push("Definitions exist but none is at `enrollment` grain — nothing to move.");
    }

    const byField: M1FieldCensus[] = [];
    for (const def of atEnrollment) {
        const { data: valueRows, error: valueError } = await supabase
            .from("field_values")
            .select("id, entity_type, entity_id")
            .eq("org_id", def.org_id)
            .eq("field_definition_id", def.id);
        if (valueError) throw new Error(`field_values census failed: ${valueError.message}`);
        const values = (valueRows ?? []) as unknown as Array<{ entity_type: string; entity_id: string }>;

        const reasons: Record<string, number> = {};
        let deterministic = 0;
        let ambiguous = 0;

        // 2 — resolve each value's owning CHILD, and refuse anything that is not a single answer.
        const episodeIds = [...new Set(values.map((v) => t(v.entity_id)).filter(Boolean))];
        const childrenByEpisode = new Map<string, string[]>();
        if (episodeIds.length > 0) {
            /*
             * An `enrollment` value hangs off the episode. The children of an episode are its
             * enrollment process instances' subjects — the canonical participation truth, which is
             * the same source every child-grain Work View reads.
             */
            const { data: piRows, error: piError } = await supabase
                .from("process_instances")
                .select("context_id, subject_id, status:state")
                .eq("org_id", def.org_id)
                .eq("subject_type", "child")
                .in("context_id", episodeIds);
            if (piError) throw new Error(`participation census failed: ${piError.message}`);
            for (const raw of (piRows ?? []) as unknown as Array<Record<string, unknown>>) {
                const ctxId = t(raw.context_id);
                const subjectId = t(raw.subject_id);
                if (!ctxId || !subjectId) continue;
                const prior = childrenByEpisode.get(ctxId) ?? [];
                if (!prior.includes(subjectId)) childrenByEpisode.set(ctxId, [...prior, subjectId]);
            }
        }

        for (const value of values) {
            const episodeId = t(value.entity_id);
            const children = childrenByEpisode.get(episodeId) ?? [];
            if (children.length === 1) {
                deterministic += 1;
                continue;
            }
            ambiguous += 1;
            const reason = children.length === 0 ? "no_child_participant" : "several_children";
            reasons[reason] = (reasons[reason] ?? 0) + 1;
        }

        byField.push({
            fieldKey: def.field_key,
            orgId: def.org_id,
            fieldDefinitionId: def.id,
            definitionEntityType: def.entity_type,
            valueCount: values.length,
            deterministic,
            ambiguous,
            ambiguityReasons: reasons,
        });
    }

    const totalValues = byField.reduce((n, f) => n + f.valueCount, 0);
    const totalAmbiguous = byField.reduce((n, f) => n + f.ambiguous, 0);
    const totalDeterministic = byField.reduce((n, f) => n + f.deterministic, 0);
    if (totalAmbiguous > 0) {
        notes.push(
            `${totalAmbiguous} value(s) have no single owning child. These are REFUSED, not guessed — `
            + "putting one sibling's allergy on another is the failure this correction exists to prevent.",
        );
    }

    return {
        clean: totalValues === 0,
        definitionsAtEnrollmentGrain: atEnrollment.length,
        totalValues,
        totalDeterministic,
        totalAmbiguous,
        byField,
        notes,
    };
}
