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
 * @see docs/platform/operator/card-archetypes.md (Intelligence)
 */

import { buildChildrenCardEvidence } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

export type ReadinessVerdict = "ready" | "almost" | "blocked" | "unknown";
export type ReadinessFactorStatus = "complete" | "incomplete" | "blocked";

export type ReadinessFactor = {
    key: string;
    label: string;
    status: ReadinessFactorStatus;
    detail: string | null;
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
    const missingProgram = activeChildren.filter((c) => !c.program).length;
    const missingSchedule = activeChildren.filter((c) => !c.schedule).length;
    const missingStart = activeChildren.filter((c) => !c.startDate).length;

    const factors: ReadinessFactor[] = [];

    factors.push({
        key: "primary_contact",
        label: "Primary contact",
        status: primaryContactName ? "complete" : "incomplete",
        detail: primaryContactName ?? "Add a primary contact",
    });

    factors.push({
        key: "children",
        label: "Children added",
        status: childCount > 0 ? "complete" : "incomplete",
        detail:
            childCount > 0
                ? `${childCount} child${childCount === 1 ? "" : "ren"}`
                : "Add a child",
    });

    // Program / schedule / start only assessable once at least one child exists.
    if (childCount > 0) {
        factors.push({
            key: "program",
            label: "Program selected",
            status: missingProgram === 0 ? "complete" : "incomplete",
            detail: missingProgram === 0 ? "All children" : `${missingProgram} missing`,
        });
        factors.push({
            key: "schedule",
            label: "Schedule selected",
            status: missingSchedule === 0 ? "complete" : "incomplete",
            detail: missingSchedule === 0 ? "All children" : `${missingSchedule} missing`,
        });
        factors.push({
            key: "start_date",
            label: "Desired start",
            status: missingStart === 0 ? "complete" : "incomplete",
            detail: missingStart === 0 ? "Set" : `${missingStart} missing`,
        });
    }

    // Real attention blockers (e.g. "Immunization record missing").
    if (attention.needsAttention && attention.primaryReason) {
        factors.push({
            key: "attention",
            label: attention.primaryReason,
            status: "blocked",
            detail:
                attention.reasonCount > 1
                    ? `+${attention.reasonCount - 1} more signal${attention.reasonCount - 1 === 1 ? "" : "s"}`
                    : "Blocks advancing",
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

    if (verdict === "unknown") {
        answerLine = "Not enough info to assess";
        supportingLine = "Add contact + children to score";
        statusChip = null;
        statusTone = "neutral";
    } else if (verdict === "blocked") {
        answerLine = attention.primaryReason ?? "Blocked before enrollment";
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
        answerLine = `${score}% ready to advance`;
        supportingLine = `${completeCount} of ${totalCount} signals complete`;
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
