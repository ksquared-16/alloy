/**
 * THE BUSINESS PROCESS CARD'S COMPOSITION — one place, reading only canonical owners.
 *
 * Follows the same shape as every other card evidence builder (`buildCurrentWorkCardEvidence`,
 * `buildChildrenCardEvidence`): a pure function over the already-composed `OperationalContext`. The
 * card fetches nothing; there is no Process-owned store, and no truth is recomputed here that some
 * other owner already decided.
 *
 * ── WHAT IT COMPOSES, AND FROM WHOM ──
 *
 *   configured stages + case stage   `workspace.lifecycle_rail`     (department lifecycle config)
 *   current work                     `buildCurrentWorkCardEvidence` (Current Work)
 *   participants + their stages      `buildChildrenCardEvidence`    (participation rows)
 *   activity                         the canonical activity projection, passed in
 *
 * ── PLACEMENT IS BY KEY, NEVER BY LABEL ──
 *
 * A participant lands on a stage because `participant.stageKey === stage.key`. Matching display
 * strings would mean reconciling "Closed / Withdrawn" with `closed_withdrawn`, which works until a
 * label is reworded and then silently drops a real child from the rail.
 *
 * A participant whose stage cannot be placed is NOT discarded. It is recorded in
 * `unresolvedParticipants` with a reason, so the gap is visible in development and tests instead of
 * looking like a family with fewer children than it has.
 *
 * ── NO PROCESS-NAME BRANCHING ──
 *
 * Nothing here reads the process key to decide behaviour. Stages, labels and annotation slots all
 * arrive from configuration, which is what lets Assignment and Billing compose through this same
 * function without an Enrollment branch.
 */

import { buildCurrentWorkCardEvidence } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkCardEvidence";
import { buildChildrenCardEvidence } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

/** A participant projected onto the rail. Identity only — no participant truth is decided here. */
export type BusinessProcessParticipant = {
    /** Canonical participation id (the row the stage came from). */
    id: string;
    name: string;
    /** First name only: the rail is a marker, not a roster. */
    firstName: string;
    imageUrl: string | null;
    /** The stable key that decided placement. */
    stageKey: string;
    /** Presentation, carried for the marker's tooltip/label — never used to place. */
    stageLabel: string | null;
    /** True when the current context scopes the case to this participant. */
    scoped: boolean;
};

/** A participant the rail could not place, kept rather than dropped. */
export type UnresolvedParticipant = {
    id: string;
    name: string;
    /** What the provider knows, stated plainly. */
    reason: "no_stage_key" | "stage_not_on_rail";
    /** The key that failed to match, when there was one. */
    stageKey: string | null;
};

export type BusinessProcessStage = {
    key: string;
    label: string;
    state: "done" | "current" | "future";
    /** Configured annotation slot 1 — canonical fact, chosen by configuration. */
    primarySupport: string | null;
    /** Configured annotation slot 2. The platform caps it here; there is never a third. */
    secondarySupport: string | null;
    participants: BusinessProcessParticipant[];
};

export type BusinessProcessCardEvidence = {
    /** Operator-facing process name. */
    processLabel: string | null;
    /** The case's authoritative stage. Participant state never changes it. */
    caseStageKey: string | null;
    caseStageLabel: string | null;
    stages: BusinessProcessStage[];
    /** Current Work, composed by its own owner. Null when the process has no work concept. */
    currentWork: {
        answerLine: string;
        supportingLine: string | null;
        stillNeeded: string[];
        isEmpty: boolean;
    } | null;
    participantsLabel: string | null;
    /** Every participant placed on the rail, in rail order. */
    participants: BusinessProcessParticipant[];
    unresolvedParticipants: UnresolvedParticipant[];
    selectedParticipant: BusinessProcessParticipant | null;
    /** True when every participant sits at the case's own stage — divergence is what is worth showing. */
    participantsAligned: boolean;
};

function firstNameOf(name: string): string {
    const trimmed = name.trim();
    const first = trimmed.split(/\s+/)[0];
    return first && first.length > 0 ? first : trimmed;
}

/**
 * Stage presentation state, decided by position relative to the case's stage — the one place the
 * case marker is expressed, and the only thing that decides `current`.
 */
function stageStates(
    stageKeys: readonly string[],
    caseStageKey: string | null,
): Map<string, "done" | "current" | "future"> {
    const out = new Map<string, "done" | "current" | "future">();
    const currentIndex = caseStageKey ? stageKeys.indexOf(caseStageKey) : -1;
    stageKeys.forEach((key, i) => {
        if (currentIndex < 0) {
            out.set(key, "future");
            return;
        }
        out.set(key, i < currentIndex ? "done" : i === currentIndex ? "current" : "future");
    });
    return out;
}

export function buildBusinessProcessCardEvidence(
    context: OperationalContext,
    options?: { selectedParticipantId?: string | null },
): BusinessProcessCardEvidence {
    const configuredStages = readConfiguredStages(context);

    // The case's stage comes from the operational context, which resolves it from the lifecycle
    // rail. Nothing below may write to it.
    const caseStageKey = context.businessProcess.stageKey ?? null;
    const caseStageLabel =
        configuredStages.find((s) => s.key === caseStageKey)?.label
        ?? context.businessProcess.label
        ?? null;

    const states = stageStates(
        configuredStages.map((s) => s.key),
        caseStageKey,
    );
    const stageKeySet = new Set(configuredStages.map((s) => s.key));

    // ── PARTICIPANTS ──────────────────────────────────────────────────────────────────────────
    const childrenEvidence = safeChildren(context);
    const placed: BusinessProcessParticipant[] = [];
    const unresolved: UnresolvedParticipant[] = [];

    for (const child of childrenEvidence) {
        const stageKey = child.stageKey?.trim() || null;
        if (!stageKey) {
            unresolved.push({ id: child.id, name: child.name, reason: "no_stage_key", stageKey: null });
            continue;
        }
        if (!stageKeySet.has(stageKey)) {
            // The child has a real stage; this rail simply does not show it. Recorded, never dropped.
            unresolved.push({
                id: child.id,
                name: child.name,
                reason: "stage_not_on_rail",
                stageKey,
            });
            continue;
        }
        placed.push({
            id: child.id,
            name: child.name,
            firstName: firstNameOf(child.name),
            imageUrl: child.imageUrl ?? null,
            stageKey,
            stageLabel: child.status ?? null,
            scoped: !!options?.selectedParticipantId && child.id === options.selectedParticipantId,
        });
    }

    const stages: BusinessProcessStage[] = configuredStages.map((s) => ({
        key: s.key,
        label: s.label,
        state: states.get(s.key) ?? "future",
        primarySupport: s.primarySupport,
        secondarySupport: s.secondarySupport,
        participants: placed.filter((p) => p.stageKey === s.key),
    }));

    // ── CURRENT WORK ──────────────────────────────────────────────────────────────────────────
    const work = safeCurrentWork(context);

    return {
        processLabel: context.businessProcess.label ?? null,
        caseStageKey,
        caseStageLabel,
        stages,
        currentWork: work,
        participantsLabel: placed.length > 0 || unresolved.length > 0 ? "Children" : null,
        participants: placed,
        unresolvedParticipants: unresolved,
        selectedParticipant: placed.find((p) => p.scoped) ?? null,
        // Aligned means there is nothing a marker could add: every participant is where the case is.
        participantsAligned:
            placed.length > 0 && caseStageKey != null && placed.every((p) => p.stageKey === caseStageKey),
    };
}

/**
 * The configured stage set, with its annotation slots.
 *
 * Slots come from configuration on the stage entry. When configuration declares none, the slots are
 * null and the rail simply shows the stage — an unannotated stage is a normal, honest state, not a
 * placeholder to fill.
 */
function readConfiguredStages(
    context: OperationalContext,
): Array<{ key: string; label: string; primarySupport: string | null; secondarySupport: string | null }> {
    const stages = (context.businessProcess.stages ?? []) as Array<Record<string, unknown>>;
    return stages
        .map((s) => {
            const key = typeof s.key === "string" ? s.key.trim() : "";
            if (!key) return null;
            const label = typeof s.label === "string" && s.label.trim() ? s.label.trim() : key;
            const support = Array.isArray(s.support) ? (s.support as unknown[]) : [];
            const slot = (i: number): string | null => {
                const v = support[i];
                return typeof v === "string" && v.trim() ? v.trim() : null;
            };
            return {
                key,
                label,
                // TWO SLOTS. The platform caps it here so configuration cannot grow a third.
                primarySupport: slot(0),
                secondarySupport: slot(1),
            };
        })
        .filter((s): s is { key: string; label: string; primarySupport: string | null; secondarySupport: string | null } => s !== null);
}

function safeChildren(context: OperationalContext) {
    try {
        return buildChildrenCardEvidence(context).children;
    } catch {
        // A children projection that cannot compose is an absence of participants, never a reason
        // for the whole process card to fail — the stage rail is useful on its own.
        return [];
    }
}

function safeCurrentWork(context: OperationalContext): BusinessProcessCardEvidence["currentWork"] {
    try {
        const evidence = buildCurrentWorkCardEvidence(context);
        return {
            answerLine: evidence.answerLine,
            supportingLine: evidence.supportingLine,
            stillNeeded: [],
            isEmpty: evidence.isEmpty,
        };
    } catch {
        return null;
    }
}
