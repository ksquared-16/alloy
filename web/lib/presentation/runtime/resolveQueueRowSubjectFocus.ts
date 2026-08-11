/**
 * Presentation Runtime V2 — Queue Row Variant Subject Focus resolution (pure).
 *
 * A variant declares WHICH subject the row anchors on (household / active_child /
 * placement_candidate_child / opportunity), decoupled from grain. This resolver reads the frozen
 * QueueRowContext and returns a FocusedSubjectContext — the primary subject + supporting context +
 * sibling summary — that Phase 2 feeds into the SAME compact slots (no new renderer). It NEVER
 * invents data: if the focused subject isn't present in the context it fails safe to the household.
 */

import type { QueueRowSubjectFocus } from "@/lib/layout/queueRecordLayoutV3";
import type {
    QueueRowContext,
    QueueRowSubjectPresentation,
    RelatedSubjectSummary,
} from "@/lib/workUnits/lifecycleSubjectContracts";

export type FocusedSubjectContext = {
    focus: QueueRowSubjectFocus;
    /** The subject the row is anchored on (feeds the identity/subject slot). */
    primary: QueueRowSubjectPresentation;
    /** Household / parent context lines (feed the supporting/contact slot), most-relevant first. */
    supportingLines: string[];
    /** Sibling rollup for the focused subject, or null when not relevant. */
    siblings: { count: number; summary: string | null } | null;
};

function visibleRelated(context: QueueRowContext): RelatedSubjectSummary[] {
    return context.related_subjects_summary.filter((s) => s.visibility !== "hidden");
}

function siblingsExcluding(
    context: QueueRowContext,
    excludeSubjectId: string | null,
    summarize: boolean,
): { count: number; summary: string | null } | null {
    const others = visibleRelated(context).filter((s) => s.subject_id !== excludeSubjectId);
    if (!others.length) return null;
    const summary = summarize ? others.map((s) => s.display_name.trim()).filter(Boolean).join(", ") || null : null;
    return { count: others.length, summary };
}

function householdPrimary(context: QueueRowContext): QueueRowSubjectPresentation {
    return {
        subject_type: "case",
        subject_id: context.case_context.case_id,
        display_name: context.case_context.display_name,
    };
}

function contactLine(context: QueueRowContext): string[] {
    const name = context.primary_contact?.display_name?.trim();
    return name ? [name] : [];
}

/**
 * Resolve the focused subject context for a row + variant subjectFocus. Defaults to "household".
 * Pure; never throws; fails safe to the household when the requested subject isn't present.
 */
export function resolveQueueRowSubjectFocus(
    context: QueueRowContext,
    focus: QueueRowSubjectFocus | undefined,
): FocusedSubjectContext {
    const resolved: QueueRowSubjectFocus = focus ?? "household";
    const rowSubject = context.row_subject;

    // active_child — the highlighted child is the row subject when the row IS a child; else fall back.
    if (resolved === "active_child" && rowSubject.subject_type === "child") {
        return {
            focus: "active_child",
            primary: rowSubject,
            supportingLines: [context.case_context.display_name, ...contactLine(context)].filter(Boolean),
            siblings: siblingsExcluding(context, rowSubject.subject_id, true),
        };
    }

    // placement_candidate_child — the candidate is the row subject; waitlist rank + household are
    // supporting; siblings as COUNT only. Rank is shown WHERE AVAILABLE (Phase 5 context).
    // Child-grain Waitlist rows use subject_type "child" with waitlist_context attached — same
    // attention identity as candidate grain (do not fall through to household).
    if (
        resolved === "placement_candidate_child" &&
        (rowSubject.subject_type === "candidate" ||
            (rowSubject.subject_type === "child" && Boolean(context.waitlist_context)))
    ) {
        return {
            focus: "placement_candidate_child",
            primary: rowSubject,
            supportingLines: [
                context.waitlist_context?.position_label,
                context.case_context.display_name,
            ].filter((v): v is string => Boolean(v && v.trim())),
            siblings: siblingsExcluding(context, rowSubject.subject_id, false),
        };
    }

    // household / opportunity (and any fail-safe fallback) — anchor on the family/case.
    const isOpportunity = resolved === "opportunity";
    return {
        focus: isOpportunity ? "opportunity" : "household",
        primary: householdPrimary(context),
        supportingLines: contactLine(context),
        siblings: isOpportunity ? null : siblingsExcluding(context, null, true),
    };
}
