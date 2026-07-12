/**
 * Readiness card evidence (Intelligence archetype).
 *
 * Operational question: "Is this family ready to advance?"
 *
 * Readiness is a PURE DERIVATION over the Operational Context — never a fabricated
 * score. Factors come from real truth (primary contact, children, each child's
 * program / schedule / desired start) and real signals (attention blockers). The
 * percentage is honest factor-completion (complete ÷ total), not a magic number.
 *
 * @see docs/platform/operator/universal-universal-card-archetypes.md (Intelligence)
 */

import { buildChildrenCardEvidence } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

export type ReadinessVerdict = "ready" | "almost" | "blocked" | "unknown";
export type ReadinessFactorStatus = "complete" | "incomplete" | "blocked";

export type ReadinessFactor = {
    key: string;
    label: string;
    status: ReadinessFactorStatus;
    detail: string | null;
    /**
     * The card that OWNS this fact. Readiness only references — clicking an
     * incomplete factor hands off to the owner card (Perspective Change), never
     * edits here. Null when no single owner card exists (informational only).
     */
    ownerCard: FocusPanelCardKey | null;
    /** Focus target inside the owner card (child id / group key); null = just open. */
    ownerFocus: string | null;
    /** Short noun for diagnosis copy ("program", "primary contact"). */
    shortLabel: string;
};

export type ReadinessCardEvidence = {
    verdict: ReadinessVerdict;
    /** Honest completion percentage (complete ÷ total factors), null when unknown. */
    score: number | null;
    factors: ReadinessFactor[];
    completeCount: number;
    totalCount: number;
    blockers: string[];
    primaryReason: string | null;
    answerLine: string;
    supportingLine: string | null;
    statusChip: string | null;
    statusTone: "ready" | "blocked" | "at-risk" | "neutral";
    isEmpty: boolean;
};

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function resolvePrimaryContactName(truth: Record<string, unknown>): string | null {
    const identity = (truth._identity as Record<string, unknown> | null | undefined) ?? null;
    const primaryPerson =
        identity?.primary_person && typeof identity.primary_person === "object"
            ? (identity.primary_person as { label?: unknown })
            : null;
    return (
        trimOrNull(truth["person.primary_contact_name"]) ?? trimOrNull(primaryPerson?.label)
    );
}

export function buildReadinessCardEvidence(context: OperationalContext): ReadinessCardEvidence {
    const truth = context.truth;
    const attention = context.signals.attention;
    const childrenEvidence = buildChildrenCardEvidence(context);

    const primaryContactName = resolvePrimaryContactName(truth);
    const childCount = childrenEvidence.count;
    const activeChildren = childrenEvidence.children.filter(
        (c) => c.statusTone !== "risk",
    );
    const missingProgram = activeChildren.filter((c) => !c.program);
    const missingSchedule = activeChildren.filter((c) => !c.schedule);
    const missingStart = activeChildren.filter((c) => !c.startDate);

    const factors: ReadinessFactor[] = [];

    factors.push({
        key: "primary_contact",
        label: "Primary contact",
        status: primaryContactName ? "complete" : "incomplete",
        detail: primaryContactName ?? "Add a primary contact",
        // Household owns contact truth — point there to resolve.
        ownerCard: "household",
        ownerFocus: "primary_contact",
        shortLabel: "primary contact",
    });

    factors.push({
        key: "children",
        label: "Children added",
        status: childCount > 0 ? "complete" : "incomplete",
        detail:
            childCount > 0
                ? `${childCount} child${childCount === 1 ? "" : "ren"}`
                : "Add a child",
        ownerCard: "children",
        ownerFocus: null,
        shortLabel: "a child",
    });

    // Program / schedule / start only assessable once at least one child exists.
    // Children owns these — point to the first child still missing the field.
    if (childCount > 0) {
        factors.push({
            key: "program",
            label: "Program selected",
            status: missingProgram.length === 0 ? "complete" : "incomplete",
            detail:
                missingProgram.length === 0 ? "All children" : `${missingProgram.length} missing`,
            ownerCard: "children",
            ownerFocus: missingProgram[0]?.id ?? null,
            shortLabel: "program",
        });
        factors.push({
            key: "schedule",
            label: "Schedule selected",
            status: missingSchedule.length === 0 ? "complete" : "incomplete",
            detail:
                missingSchedule.length === 0 ? "All children" : `${missingSchedule.length} missing`,
            ownerCard: "children",
            ownerFocus: missingSchedule[0]?.id ?? null,
            shortLabel: "schedule",
        });
        factors.push({
            key: "start_date",
            label: "Desired start",
            status: missingStart.length === 0 ? "complete" : "incomplete",
            detail: missingStart.length === 0 ? "Set" : `${missingStart.length} missing`,
            ownerCard: "children",
            ownerFocus: missingStart[0]?.id ?? null,
            shortLabel: "start date",
        });
    }

    // Real attention blockers (e.g. "Immunization record missing"). No single
    // Core-Four owner today — informational diagnosis only (no handoff target).
    if (attention.needsAttention && attention.primaryReason) {
        factors.push({
            key: "attention",
            label: attention.primaryReason,
            status: "blocked",
            detail:
                attention.reasonCount > 1
                    ? `+${attention.reasonCount - 1} more signal${attention.reasonCount - 1 === 1 ? "" : "s"}`
                    : "Blocks advancing",
            ownerCard: null,
            ownerFocus: null,
            shortLabel: attention.primaryReason,
        });
    }

    const totalCount = factors.length;
    const completeCount = factors.filter((f) => f.status === "complete").length;
    const blockedFactors = factors.filter((f) => f.status === "blocked");
    const incompleteFactors = factors.filter((f) => f.status !== "complete");
    const blockers = incompleteFactors.map((f) => f.label);

    // Not enough info to assess: nothing established yet.
    const isEmpty = !primaryContactName && childCount === 0;

    let verdict: ReadinessVerdict;
    if (isEmpty) {
        verdict = "unknown";
    } else if (blockedFactors.length > 0) {
        verdict = "blocked";
    } else if (incompleteFactors.length === 0) {
        verdict = "ready";
    } else {
        verdict = "almost";
    }

    const score = isEmpty ? null : Math.round((completeCount / Math.max(totalCount, 1)) * 100);

    let answerLine: string;
    let supportingLine: string | null;
    let statusChip: string | null;
    let statusTone: ReadinessCardEvidence["statusTone"];

    // Diagnosis phrasing: lead with WHAT is missing (a noun list), not a percentage
    // or a task title. Readiness describes the condition; owners hold the verbs.
    const diagnose = (statuses: ReadinessFactorStatus[]): string => {
        const nouns = factors
            .filter((f) => statuses.includes(f.status))
            .map((f) => f.shortLabel);
        if (nouns.length === 0) return "";
        if (nouns.length === 1) return nouns[0]!;
        if (nouns.length === 2) return `${nouns[0]} and ${nouns[1]}`;
        return `${nouns.slice(0, -1).join(", ")}, and ${nouns[nouns.length - 1]}`;
    };

    const capitalize = (text: string): string =>
        text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text;

    if (verdict === "unknown") {
        answerLine = "Not enough info to assess";
        supportingLine = "Add contact + children to score";
        statusChip = null;
        statusTone = "neutral";
    } else if (verdict === "blocked") {
        const blockingNouns = diagnose(["blocked"]);
        answerLine = blockingNouns ? `Blocked — ${blockingNouns}` : "Blocked before enrollment";
        supportingLine =
            blockers.length > 0
                ? `${blockers.length} item${blockers.length === 1 ? "" : "s"} before advancing`
                : "Resolve blocker to advance";
        statusChip = "Blocked";
        statusTone = "blocked";
    } else if (verdict === "ready") {
        answerLine = "Ready to advance";
        supportingLine = "No blockers detected";
        statusChip = "Ready";
        statusTone = "ready";
    } else {
        const missingNouns = diagnose(["incomplete"]);
        answerLine = missingNouns ? `${capitalize(missingNouns)} needed` : "Almost ready";
        supportingLine = `${completeCount} of ${totalCount} ready${score != null ? ` · ${score}%` : ""}`;
        statusChip = "Almost";
        statusTone = "at-risk";
    }

    return {
        verdict,
        score,
        factors,
        completeCount,
        totalCount,
        blockers,
        primaryReason: attention.primaryReason,
        answerLine,
        supportingLine,
        statusChip,
        statusTone,
        isEmpty,
    };
}
