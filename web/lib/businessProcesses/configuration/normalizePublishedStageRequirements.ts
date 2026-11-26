/**
 * D-97 — a published Business Process revision is a SELF-CONTAINED executable artifact.
 *
 * ## The gap this closes
 *
 * Phase 1 (D-88..D-92) gave a stage a canonical `requirements_v1` section inside the
 * business-process payload, and made {@link resolveEffectiveStageRequirements} the one
 * resolver: canonical when present, otherwise a single legacy compatibility projection
 * over two `departments.metadata` keys.
 *
 * That leaves a published revision only PARTIALLY self-contained. A stage that was never
 * authored canonically publishes with no `requirements_v1` at all, so answering "what did
 * this stage require?" for that revision still requires reading LIVE department metadata —
 * metadata that is not versioned, not immutable and not CAS-protected. Two consequences,
 * both fatal to D-96:
 *
 *   1. An instance pinned to revision N would still resolve its requirements from whatever
 *      the legacy keys say TODAY. Pinning the revision would buy nothing.
 *   2. Rolling back to revision N would restore its stages but not its requirements, because
 *      the requirements were never in it.
 *
 * ## What normalization does
 *
 * Immediately before the checksum and the publish RPC, every stage in the payload is made to
 * carry an explicit `requirements_v1`:
 *
 * ```
 *   stage.requirements_v1 present ──► preserved EXACTLY, including an authored-empty set
 *   stage.requirements_v1 absent  ──► the legacy projection is materialized into it
 * ```
 *
 * **Presence is authority (D-90), and the test here is the resolver's own test.** A stage is
 * "present" iff {@link parseStageRequirementsV1} reads it, which is precisely the condition
 * under which {@link canonicalStageRequirements} reports canonical has spoken. Using any other
 * predicate — truthiness, `.length`, `"requirements_v1" in stage` — would let normalization and
 * resolution disagree about the same stage, which is the one failure this module cannot have.
 *
 * **Preserved means untouched.** A present section is carried through by reference; it is never
 * re-parsed and re-serialized. Re-serializing would silently drop any field a newer writer added
 * and would rewrite an operator's authored artifact at publish time.
 *
 * **Nothing is merged (D-91).** Materialization happens only where canonical is silent, and it
 * replaces nothing.
 *
 * ## Why this is TypeScript and not the publish RPC
 *
 * `publish_business_process_revision_v1` inserts `v_draft.payload` verbatim. Normalizing inside
 * it would require a second copy of the legacy projection written in PL/pgSQL — exactly the
 * second authority D-92 exists to prevent — and the checksum the caller already computed would
 * no longer describe the payload that was stored, breaking publish CAS and republish idempotency.
 * So the draft payload is normalized here, persisted, and THEN checksummed.
 *
 * ## What legacy can and cannot express
 *
 * The legacy projection yields two things: label rows and field rule ids. Only the rule ids carry
 * an IDENTITY, so only they can become canonical requirements — `kind: "field"` rows referencing
 * the same `rule_id` the legacy path already uses. The labels are not lost: they are derived FROM
 * field rules by `deriveObjectLabelsFromFieldRules`, which is how the platform already stores them
 * (`buildLifecycleFieldRulesOverridePatch`), and the canonical branch of the resolver derives them
 * back down. Materialization is therefore round-trip exact in the direction that matters:
 * `projectCanonicalToFieldRules(materialized)` equals the legacy rules it came from.
 *
 * Pure. No I/O, no clock, no randomness — a republish of unchanged configuration must produce a
 * byte-identical payload or idempotency breaks.
 *
 * @see lib/lifecycle/effectiveStageRequirements.ts — the one resolver, and the legacy projection
 * @see lib/lifecycle/stageRequirementsV1.ts — the canonical contract
 */

import { asOperatorStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveEffectiveStageRequirements } from "@/lib/lifecycle/effectiveStageRequirements";
import type { LifecycleStageFieldRules } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import {
    parseStageRequirementsV1,
    serializeStageRequirementsV1,
    type StageRequirementV1,
} from "@/lib/lifecycle/stageRequirementsV1";

/**
 * Prefix for a requirement id synthesized from a legacy field rule.
 *
 * Deterministic and derived from the rule id, so republishing unchanged configuration produces an
 * identical payload and therefore an identical checksum. A generated uuid here would make every
 * publish a new revision and would break the RPC's already-published no-op.
 *
 * The prefix also keeps the provenance readable: an operator looking at a materialized revision can
 * see which rows were authored and which were carried forward from legacy metadata.
 */
export const LEGACY_MATERIALIZED_REQUIREMENT_ID_PREFIX = "legacy:field:" as const;

export function legacyMaterializedRequirementId(ruleId: string): string {
    return `${LEGACY_MATERIALIZED_REQUIREMENT_ID_PREFIX}${ruleId}`;
}

/**
 * Legacy field rules -> canonical requirement rows.
 *
 * The exact inverse of `projectCanonicalToFieldRules`. Required first, then recommended, each in
 * the order the projection reported them, so the result is a pure function of its input.
 *
 * Levels are `required` / `recommended` only. The legacy projection cannot express `enforced` —
 * `effectiveFieldRulesForStage` returns two buckets — and reaching past it into
 * `rule_levels_v1` to recover a third would be a second legacy read path, which D-92 forbids and
 * D-97 explicitly rules out. A rule the platform treats as enforceable is still enforced at
 * evaluation time; nothing about enforcement is decided here.
 */
export function materializeLegacyFieldRequirements(
    rules: LifecycleStageFieldRules,
): StageRequirementV1[] {
    const out: StageRequirementV1[] = [];
    const seen = new Set<string>();

    const push = (ruleId: string, level: "required" | "recommended") => {
        const id = ruleId.trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        out.push({
            requirement_id: legacyMaterializedRequirementId(id),
            ref: { kind: "field", rule_id: id },
            level,
        });
    };

    for (const id of rules.required_rule_ids) push(id, "required");
    for (const id of rules.recommended_rule_ids) push(id, "recommended");
    return out;
}

export type MaterializedStageRecord = {
    readonly process_key: string;
    readonly stage_key: string;
    readonly requirement_count: number;
};

export type NormalizedBusinessProcessPayload = {
    /**
     * The payload to publish. When nothing needed materializing this is the ORIGINAL object,
     * unchanged and identical by reference, so an unchanged republish keeps its checksum.
     */
    readonly payload: Record<string, unknown>;
    readonly changed: boolean;
    /** Stages whose requirements were carried in from legacy. Empty when nothing was materialized. */
    readonly materialized: readonly MaterializedStageRecord[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Make every stage in a business-process payload carry an explicit `requirements_v1`.
 *
 * Operates on the RAW payload rather than a parsed builder, because a parse/serialize round trip
 * would rewrite sections this function has no business touching.
 */
export function normalizeBusinessProcessPayloadRequirements(input: {
    readonly payload: unknown;
    readonly departmentMetadata: Record<string, unknown> | null;
}): NormalizedBusinessProcessPayload {
    const payload = input.payload;
    if (!isPlainObject(payload)) {
        // A draft may be structurally anything; publish already refuses invalid drafts. Passing a
        // non-object through untouched keeps this function from becoming a second validator.
        return { payload: isPlainObject(payload) ? payload : {}, changed: false, materialized: [] };
    }
    if (!Array.isArray(payload.processes)) {
        return { payload, changed: false, materialized: [] };
    }

    const materialized: MaterializedStageRecord[] = [];
    let changed = false;

    const processes = payload.processes.map((processRaw) => {
        if (!isPlainObject(processRaw) || !Array.isArray(processRaw.stages)) return processRaw;
        const processKey = typeof processRaw.key === "string" ? processRaw.key : "";

        let processChanged = false;
        const stages = processRaw.stages.map((stageRaw) => {
            if (!isPlainObject(stageRaw)) return stageRaw;

            // D-90, using the resolver's own presence test. Present -> carried through by
            // reference, which is what makes "preserved" mean preserved.
            if (parseStageRequirementsV1(stageRaw.requirements_v1) !== null) return stageRaw;

            const stageKey = typeof stageRaw.key === "string" ? stageRaw.key.trim() : "";
            const operatorStage = stageKey ? asOperatorStageKey(stageKey) : null;

            // `builder: null` forces the LEGACY branch of the one resolver. Passing the department's
            // parsed builder would let the currently published projection answer as canonical, which
            // would make normalization depend on the previous publication instead of on legacy.
            //
            // A stage key that is not an operator stage gets an empty set, and that is the honest
            // answer rather than a gap: the legacy stores are keyed BY operator stage, so legacy has
            // nothing to say about such a stage — which is exactly what the resolver reports today.
            const requirements = operatorStage
                ? materializeLegacyFieldRequirements(
                      resolveEffectiveStageRequirements({
                          stage: operatorStage,
                          builder: null,
                          departmentMetadata: input.departmentMetadata,
                      }).legacy.rules,
                  )
                : [];

            processChanged = true;
            materialized.push({
                process_key: processKey,
                stage_key: stageKey,
                requirement_count: requirements.length,
            });

            return {
                ...stageRaw,
                requirements_v1: serializeStageRequirementsV1({ version: 1, requirements }),
            };
        });

        if (!processChanged) return processRaw;
        changed = true;
        return { ...processRaw, stages };
    });

    if (!changed) return { payload, changed: false, materialized: [] };
    return { payload: { ...payload, processes }, changed: true, materialized };
}
