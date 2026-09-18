/**
 * The PURE half of Effective Process Position.
 *
 * `loadEffectiveEnrollmentStagesByOpportunity` needed two serial reads before it could derive
 * anything: one to widen opportunity ids to both journey anchors, another to fetch the participant
 * rows. The derivation that followed was already pure — it just had nowhere to get its rows from.
 *
 * Those rows now ride on the opportunity, maintained transactionally by the authority that changes
 * them (`opportunities.maintained_operational_facts`). So this module is the same derivation with the
 * reads deleted, not a second implementation of it: it builds the same participants, hands them to
 * the same `deriveEffectiveProcessPosition`, and composes the same rollups.
 *
 * Nothing here is cached and nothing is stored. Inheritance depends on `opportunities.stage_key`,
 * which moves without any participant moving, and location SCOPE is an authorization answer — both
 * must be computed per request, from raw facts, every time.
 */

import { ENROLLMENT_PARTICIPATION_CONTRACT } from "@/lib/process/definitions/enrollment/enrollmentContract";
import { buildProcessParticipant } from "@/lib/process/engine/processParticipant";
import { attachEffectiveParticipantStagesToContextRows } from "@/lib/process/engine/attachEffectiveParticipantStagesToContextRows";
import {
    composeLocationRollup,
    composeStageRollup,
    deriveEffectiveProcessPosition,
} from "@/lib/process/engine/effectiveProcessPosition";

/** One raw participant exactly as the maintainer persists it. No derived values. */
export type MaintainedParticipantFact = {
    id: string;
    subject_type: string | null;
    subject_id: string | null;
    context_id: string | null;
    stage_key: string | null;
    state: string | null;
    close_reason_key: string | null;
    stage_entered_at: string | null;
    location_id: string | null;
};

export type MaintainedOperationalFacts = {
    v?: number;
    participants?: MaintainedParticipantFact[] | null;
    tour?: unknown;
};

const str = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t ? t : null;
};

/**
 * Read the maintained facts off a row.
 *
 * Returns `null` when the column is absent or malformed — NOT an empty set. A row that was never
 * maintained and a row maintained as empty are different answers, and collapsing them is how a
 * missing fact would quietly render as "this family has no children".
 */
export function readMaintainedOperationalFacts(
    row: Record<string, unknown>,
): MaintainedOperationalFacts | null {
    const raw = row.maintained_operational_facts;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as MaintainedOperationalFacts;
}

export function maintainedParticipants(
    facts: MaintainedOperationalFacts | null,
): MaintainedParticipantFact[] {
    const list = facts?.participants;
    return Array.isArray(list) ? list : [];
}

/**
 * Derive one opportunity's effective participant stages and rollup labels.
 *
 * `contextStageKey` is passed in rather than read from the facts: it is the OPPORTUNITY's stage, the
 * thing an inheriting child falls back to, and persisting it would have been a copy that goes stale
 * the moment the family moves.
 */
export function deriveEffectiveStagesFromMaintainedFacts(input: {
    opportunityId: string;
    contextStageKey: string | null;
    participants: readonly MaintainedParticipantFact[];
    /** Workspace / access scope, applied HERE at request time — never persisted. */
    allowedLocationIds?: ReadonlySet<string> | null;
}): { stageKeys: string[]; rollup: { stage: string | null; location: string | null } } {
    /*
     * Closed journeys are filtered HERE, not in storage. The read this replaces filtered them in its
     * WHERE clause; keeping the filter in the derivation means storage stays raw and "absent" never
     * becomes indistinguishable from "closed".
     */
    let participants = input.participants
        .filter((p) => str(p.close_reason_key) === null)
        .map((p) =>
            buildProcessParticipant(
                {
                    id: String(p.id),
                    org_id: "",
                    process_key: "enrollment",
                    subject_type: String(p.subject_type ?? ""),
                    subject_id: String(p.subject_id ?? ""),
                    context_id: p.context_id,
                    stage_key: p.stage_key,
                    state: p.state,
                    close_reason_key: p.close_reason_key,
                    stage_entered_at: p.stage_entered_at,
                },
                {
                    contextStageKey: input.contextStageKey,
                    scopeId: null,
                    attributes: { locationId: str(p.location_id) },
                },
            ),
        );

    const allowed = input.allowedLocationIds;
    if (allowed && allowed.size > 0) {
        participants = participants.filter((p) => {
            const loc = p.attributes.locationId;
            // Identical to the read it replaces: a participant with no location is kept, because
            // excluding it would hide an inheriting child rather than scope one out.
            if (!loc) return true;
            return allowed.has(loc);
        });
    }

    const position = deriveEffectiveProcessPosition({
        contextId: input.opportunityId,
        contextStageKey: input.contextStageKey,
        participants,
        contract: ENROLLMENT_PARTICIPATION_CONTRACT,
        locationOf: (p) => p.attributes.locationId,
    });

    const stageKeys = position.participants
        .map((p) => p.effectiveStageKey)
        .filter((k): k is string => Boolean(k));

    return {
        stageKeys,
        rollup: {
            stage: composeStageRollup(stageKeys).compactLabel,
            location: composeLocationRollup(position.participants.map((p) => p.locationId)).compactLabel,
        },
    };
}

/**
 * The replacement for `attachEffectiveEnrollmentStagesToOpportunityRows` on the first-order
 * navigation path: same output, zero reads.
 *
 * It is a plain synchronous function on purpose. The async signature was what let the read hide in
 * the middle of the evaluated page, and a pure one cannot grow a round trip without changing shape
 * — the gate that keeps this path at one read is enforceable precisely because of that.
 */
export function attachEffectiveStagesFromMaintainedFacts<T extends Record<string, unknown>>(
    rows: readonly T[],
    options?: { allowedLocationIds?: readonly string[] | null },
): T[] {
    if (!rows.length) return rows as T[];
    const allowed =
        options?.allowedLocationIds && options.allowedLocationIds.length > 0
            ? new Set(options.allowedLocationIds.map((id) => id.trim()).filter(Boolean))
            : null;

    const stagesByOpportunityId = new Map<string, string[]>();
    const rollupLabelsByOpportunityId = new Map<string, { stage: string | null; location: string | null }>();
    /*
     * ── MAINTAINED-EMPTY AND NEVER-MAINTAINED ARE DIFFERENT ANSWERS ──
     *
     * `markMissingAsEmpty` turns "no entry" into "zero participants", which is right for an
     * opportunity that genuinely has none. It is WRONG for a row whose facts never loaded — drop the
     * column from the select and every family would render as childless, with nothing failing.
     *
     * So unmaintained rows are not passed through the attach at all. They keep whatever they had, and
     * membership falls back to raw stage exactly as it did when the old loader failed open.
     */
    const maintainedRows: T[] = [];
    const unmaintained = new Set<T>();

    for (const row of rows) {
        const id = typeof row.id === "string" ? row.id.trim() : "";
        const facts = id ? readMaintainedOperationalFacts(row as Record<string, unknown>) : null;
        if (!id || !facts) {
            unmaintained.add(row);
            continue;
        }
        maintainedRows.push(row);
        const contextStage =
            (typeof row.stage_key === "string" && row.stage_key.trim() ? row.stage_key.trim() : null)
            || (typeof row.lifecycle_stage_key === "string" && row.lifecycle_stage_key.trim()
                ? (row.lifecycle_stage_key as string).trim()
                : null);
        const derived = deriveEffectiveStagesFromMaintainedFacts({
            opportunityId: id,
            contextStageKey: contextStage,
            participants: maintainedParticipants(facts),
            allowedLocationIds: allowed,
        });
        stagesByOpportunityId.set(id, derived.stageKeys);
        rollupLabelsByOpportunityId.set(id, derived.rollup);
    }

    if (!maintainedRows.length) return rows as T[];
    const attached = attachEffectiveParticipantStagesToContextRows(maintainedRows, stagesByOpportunityId, {
        markMissingAsEmpty: true,
        rollupLabelsByContextId: rollupLabelsByOpportunityId,
    });
    // Rebuild in the caller's order; canonical sorting happens downstream and must not be perturbed.
    const byIndex = new Map<T, T>();
    maintainedRows.forEach((row, i) => byIndex.set(row, attached[i]!));
    return rows.map((row) => (unmaintained.has(row) ? row : byIndex.get(row)!));
}
