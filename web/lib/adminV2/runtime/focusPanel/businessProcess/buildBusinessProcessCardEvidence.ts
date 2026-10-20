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
    /**
     * The durable child identity, when the participation names one.
     *
     * Carried because participant EMPHASIS is applied by the renderer from ephemeral browser state,
     * and "either stable identity may name the participant" — so the projection has to expose both
     * or the durable-child branch could never match.
     */
    customerMemberId: string | null;
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
    /**
     * `skipped`: an earlier stage the journey never entered (e.g. Waitlist for a child offered a spot
     * straight from Decision). Drawn blank like `future` — never a check.
     */
    state: "done" | "current" | "future" | "skipped";
    /** When the current position is a folded sub-stage (internal `offered` inside Decision), its label. */
    detail?: string | null;
    /** Configured annotation slot 1 — canonical fact, chosen by configuration. */
    primarySupport: string | null;
    /** Configured annotation slot 2. The platform caps it here; there is never a third. */
    secondarySupport: string | null;
    participants: BusinessProcessParticipant[];
};

export type BusinessProcessCardEvidence = {
    /** Operator-facing process name. */
    processLabel: string | null;
    /** The configured process's own name, when the department declares one. */
    processName?: string | null;
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

type StepperStage = { key: string; grain: string | null; parentKey: string | null };

/**
 * STAGE STATE FROM THE ACTUAL PATH, NOT FROM CONFIGURED ORDER.
 *
 * The rail is one flat list of family stages (Lead, Tour, Decision) followed by child stages (Waitlist,
 * Offered, Enrolling, Enrolled) — but the child track BRANCHES from Decision. Position alone marked
 * Waitlist complete for a child offered a spot who was never waitlisted. Now:
 *   - `current` is the record's stage — or, for a sub-stage (`parent_stage_key`), its parent;
 *   - a FAMILY stage before a child-track position is done: the child track is entered only from the
 *     family track's end;
 *   - a CHILD-track stage before the current one is done only when the journey's recorded path
 *     (`traversedStageKeys`) entered it; otherwise it is `skipped` (drawn blank). Unknown is never
 *     inferred as traversed;
 *   - on the family track (linear), earlier stages are done; everything after `current` is future.
 * `displayKeys` are the stages drawn (sub-stages folded away); `stages` carries grain and parent.
 */
export function deriveStageStates(input: {
    stages: readonly StepperStage[];
    displayKeys: readonly string[];
    currentKey: string | null;
    traversedStageKeys?: readonly string[] | null;
}): Map<string, "done" | "current" | "future" | "skipped"> {
    const out = new Map<string, "done" | "current" | "future" | "skipped">();
    const byKey = new Map(input.stages.map((s) => [s.key, s]));
    const isChild = (key: string) => (byKey.get(key)?.grain ?? "").toLowerCase() === "child";
    const current = input.currentKey;
    const displayCurrent = current && byKey.get(current)?.parentKey && input.displayKeys.includes(byKey.get(current)!.parentKey!)
        ? byKey.get(current)!.parentKey!
        : current;
    const currentIndex = displayCurrent ? input.displayKeys.indexOf(displayCurrent) : -1;
    const traversed = new Set(input.traversedStageKeys ?? []);
    // A drawn stage counts as entered when it, or a sub-stage folded into it, was entered.
    const enteredDisplay = (key: string) => traversed.has(key) || input.stages.some((s) => s.parentKey === key && traversed.has(s.key));
    input.displayKeys.forEach((key, i) => {
        if (currentIndex < 0) return out.set(key, "future");
        if (i === currentIndex) return out.set(key, "current");
        if (i > currentIndex) return out.set(key, "future");
        if (isChild(key)) return out.set(key, enteredDisplay(key) ? "done" : "skipped");
        // A family stage before the current position: the family track is linear, and the child
        // track is entered only from its end.
        out.set(key, "done");
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
    // A folded sub-stage reads as its parent (internal `offered` is operator "Decision").
    const caseStage = configuredStages.find((s) => s.key === caseStageKey) ?? null;
    const caseParent = caseStage?.parentKey ? configuredStages.find((s) => s.key === caseStage.parentKey) ?? null : null;
    const caseStageLabel =
        caseParent?.label
        ?? caseStage?.label
        ?? context.businessProcess.label
        ?? null;

    // Sub-stages (`parent_stage_key`) are presented inside their parent and draw no milestone.
    const configuredKeys = new Set(configuredStages.map((s) => s.key));
    const displayStages = configuredStages.filter((s) => !(s.parentKey && configuredKeys.has(s.parentKey)));
    const states = deriveStageStates({
        stages: configuredStages.map((s) => ({ key: s.key, grain: s.grain, parentKey: s.parentKey })),
        displayKeys: displayStages.map((s) => s.key),
        currentKey: caseStageKey,
        traversedStageKeys: context.businessProcess.traversedStageKeys ?? null,
    });
    const foldedCurrent = configuredStages.find((s) => s.key === caseStageKey && s.parentKey && configuredKeys.has(s.parentKey)) ?? null;
    const displayKeyOf = (key: string) => {
        const s = configuredStages.find((x) => x.key === key);
        return s?.parentKey && configuredKeys.has(s.parentKey) ? s.parentKey : key;
    };
    const stageKeySet = new Set(configuredStages.map((s) => s.key));

    // ── PARTICIPANTS ──────────────────────────────────────────────────────────────────────────
    const childrenEvidence = safeChildren(context, stageKeySet);
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
            customerMemberId: child.customerMemberId ?? null,
            stageKey,
            stageLabel: child.status ?? null,
            // Either stable identity may name the participant — the participation row or the
            // durable child. Never the display name.
            scoped:
                !!options?.selectedParticipantId
                && (child.id === options.selectedParticipantId
                    || (child.customerMemberId ?? null) === options.selectedParticipantId),
        });
    }

    // An OPTIONAL stage (`allow_skipping`, e.g. the Waitlist branch) is drawn only when this path goes
    // through it — current, entered, or holding one of the family's children. Otherwise it is not a
    // step the record is on, and drawing it would read as one still ahead.
    const drawn = displayStages.filter((s) => {
        if (!s.optional) return true;
        const state = states.get(s.key);
        return state === "current" || state === "done" || placed.some((p) => displayKeyOf(p.stageKey) === s.key);
    });
    const stages: BusinessProcessStage[] = drawn.map((s) => ({
        key: s.key,
        label: s.label,
        state: states.get(s.key) ?? "future",
        ...(foldedCurrent && foldedCurrent.parentKey === s.key ? { detail: foldedCurrent.label } : {}),
        primarySupport: s.primarySupport,
        secondarySupport: s.secondarySupport,
        // A participant at a folded sub-stage sits on its parent's step.
        participants: placed.filter((p) => displayKeyOf(p.stageKey) === s.key),
    }));

    // ── CURRENT WORK ──────────────────────────────────────────────────────────────────────────
    const work = safeCurrentWork(context);

    return {
        processLabel: context.businessProcess.label ?? null,
        processName: context.businessProcess.name ?? null,
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
type ConfiguredStage = {
    key: string;
    label: string;
    primarySupport: string | null;
    secondarySupport: string | null;
    grain: string | null;
    parentKey: string | null;
    /** `allow_skipping` — a branch the path may never enter. */
    optional: boolean;
};

function readConfiguredStages(context: OperationalContext): ConfiguredStage[] {
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
                grain: typeof s.grain === "string" && s.grain.trim() ? s.grain.trim() : null,
                parentKey: typeof s.parent_stage_key === "string" && s.parent_stage_key.trim() ? s.parent_stage_key.trim() : null,
                optional: s.allow_skipping === true,
            };
        })
        .filter((s): s is ConfiguredStage => s !== null);
}

function safeChildren(context: OperationalContext, configuredStageKeys: ReadonlySet<string>) {
    try {
        return buildChildrenCardEvidence(context, { configuredStageKeys }).children;
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

/**
 * The evidence for a surface with nothing published to say — DERIVED, never hand-written.
 *
 * The renderer needs an empty value for the frame before the server projection arrives. Writing one
 * out by hand would be a second definition of "no process" that drifts the moment this type gains a
 * field, so it is produced by the builder itself over an empty context.
 */
export const EMPTY_BUSINESS_PROCESS_EVIDENCE: BusinessProcessCardEvidence =
    buildBusinessProcessCardEvidence({
        grain: "case",
        subject: { type: "opportunity", id: "", label: "" },
        businessProcess: { key: null, label: null, stageKey: null },
        perspective: null,
        truth: {},
        signals: {
            work: { nextActionLabel: null, nextActionRef: null, openWorkCount: 0, workItems: [] },
            attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
            tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
            communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
            billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
        },
        capabilities: { canMutate: false, maskedChannels: false },
        status: "ready",
    } as unknown as OperationalContext);
