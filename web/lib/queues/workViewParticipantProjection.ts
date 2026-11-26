/**
 * Work View participant projection + explicit count semantics.
 *
 * A Work View SELECTS process participants (via the effective-stage membership) and GROUPS them into
 * rows at a configured grain. Two counts are distinct and must never be conflated:
 *   - participantCount — how many participants the view matched (the metric truth),
 *   - rowCount         — how many rows after grain grouping (what the operator sees).
 * They differ at family grain: two children in one household are 2 participants but 1 household row.
 * `count_unit` labels what a row represents so "N" is never ambiguous.
 *
 * Pure; no status_key, no OCM — participants come from the engine projection. A family can appear in
 * multiple Work Views via different child participants (each view filters the participant set).
 */

import type { ProcessParticipant } from "@/lib/process/engine";

export type WorkViewGrain = "family" | "child" | "candidate";
export type WorkViewCountUnit = "cases" | "children" | "candidates";

const UNIT_FOR_GRAIN: Record<WorkViewGrain, WorkViewCountUnit> = {
    family: "cases",
    child: "children",
    candidate: "candidates",
};
const UNIT_LABEL: Record<WorkViewCountUnit, string> = {
    cases: "households",
    children: "children",
    candidates: "candidates",
};

export function workViewCountUnitForGrain(grain: WorkViewGrain): WorkViewCountUnit {
    return UNIT_FOR_GRAIN[grain];
}

/** A projected row: its stable key + the participants it represents (one for child/candidate, N for family). */
export type WorkViewRow<Attr = unknown> = {
    rowKey: string;
    grain: WorkViewGrain;
    participants: ProcessParticipant<Attr>[];
};

/**
 * Group matched participants into rows at the configured grain:
 *  - family    → one row per household (context), representing all its participants,
 *  - child     → one row per child participant,
 *  - candidate → one row per candidate participant.
 */
export function projectParticipantsToRows<Attr>(
    participants: readonly ProcessParticipant<Attr>[],
    grain: WorkViewGrain,
): WorkViewRow<Attr>[] {
    if (grain === "family") {
        const byHousehold = new Map<string, ProcessParticipant<Attr>[]>();
        for (const p of participants) {
            const key = p.contextId ?? p.participantId;
            const bucket = byHousehold.get(key);
            if (bucket) bucket.push(p);
            else byHousehold.set(key, [p]);
        }
        return [...byHousehold.entries()].map(([rowKey, ps]) => ({ rowKey, grain, participants: ps }));
    }
    return participants.map((p) => ({ rowKey: p.participantId, grain, participants: [p] }));
}

export type WorkViewCountSemantics = {
    /** How many participants matched (metric truth). */
    participantCount: number;
    /** How many rows after grain grouping (what the operator sees). */
    rowCount: number;
    countUnit: WorkViewCountUnit;
    /** Operator label for a row / the count (households · children · candidates). */
    countUnitLabel: string;
};

/** The explicit count semantics for a matched participant set at a grain — participant vs row, labeled. */
export function workViewCountSemantics<Attr>(
    participants: readonly ProcessParticipant<Attr>[],
    grain: WorkViewGrain,
): WorkViewCountSemantics {
    const participantCount = participants.length;
    const rows = projectParticipantsToRows(participants, grain);
    const countUnit = workViewCountUnitForGrain(grain);
    return {
        participantCount,
        rowCount: rows.length,
        countUnit,
        countUnitLabel: UNIT_LABEL[countUnit],
    };
}
