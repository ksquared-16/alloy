/**
 * Action intent execution — operator intent vs target scope.
 *
 * Work Templates store intent-level action_ref values (e.g. move_to_waitlist).
 * Runtime resolves execution keys and subject selection from process configuration.
 *
 * Does not replace the Action Registry — registry owns handlers; this layer maps
 * configured intent → execution ref + selection mode.
 */

import {
    normalizeActionRefToIntentKey,
    resolveIntentExecutionRef,
    resolveWorkTemplateSubjectGrain,
    workTemplateActionIntentForKey,
} from "@/lib/lifecycle/workTemplateActionIntentCatalog";
import {
    classifyEligibleEnrollmentChildren,
    type EligibleEnrollmentChildSubject,
} from "@/lib/lifecycle/resolveEligibleEnrollmentChildrenForOpportunity";
import { getPlatformAction } from "@/lib/platform/actions/platformActionCatalog";

export type ActionIntentSelectionMode = "configured" | "single" | "one_or_more" | "all";

export type ActionIntentApplicableSubject = {
    id: string;
    label: string;
    grain?: string;
};

export type ActionIntentExecutionPlan = {
    /** Canonical intent ref (matches Work Template action_ref). */
    intentKey: string;
    /** Registry / mutation execution key — backward compatible with legacy saved refs. */
    executionKey: string;
    selectionMode: ActionIntentSelectionMode;
    applicableSubjects: ActionIntentApplicableSubject[];
    /** When true, action surface should prompt before execute (future UI). */
    requiresSubjectPicker: boolean;
    /** Operator-safe block when no eligible related subject exists. */
    blockedReason?: string;
};

function selectionModeForExecutionKey(executionKey: string): ActionIntentSelectionMode {
    if (executionKey === "waitlist_child" || executionKey === "enroll_child") {
        // Related-subject: exactly one child at a time; multi must pick.
        return "single";
    }
    const platform = getPlatformAction(executionKey);
    if (platform?.supportsMultiSubject) return "one_or_more";
    return "configured";
}

export function evaluateRequiresSubjectPicker(
    applicableSubjects: ActionIntentApplicableSubject[],
    selectionMode: ActionIntentSelectionMode,
): boolean {
    if (applicableSubjects.length <= 1) return false;
    return (
        selectionMode === "one_or_more"
        || selectionMode === "all"
        || selectionMode === "single"
    );
}

function subjectsFromTruth(truth: Record<string, unknown> | undefined): EligibleEnrollmentChildSubject[] {
    if (!truth) return [];
    const raw =
        truth.eligible_enrollment_children
        ?? truth.eligibleEnrollmentChildren
        ?? truth.opportunity_customer_members;
    if (!Array.isArray(raw)) return [];
    const out: EligibleEnrollmentChildSubject[] = [];
    for (const row of raw) {
        if (row == null || typeof row !== "object") continue;
        const rec = row as Record<string, unknown>;
        const id =
            (typeof rec.id === "string" && rec.id.trim())
            || (typeof rec.opportunityCustomerMemberId === "string" && rec.opportunityCustomerMemberId.trim())
            || "";
        const customerMemberId =
            (typeof rec.customerMemberId === "string" && rec.customerMemberId.trim())
            || (typeof rec.customer_member_id === "string" && rec.customer_member_id.trim())
            || "";
        if (!id || !customerMemberId) continue;
        const label =
            (typeof rec.label === "string" && rec.label.trim())
            || (typeof rec.displayName === "string" && rec.displayName.trim())
            || "Child";
        out.push({
            id,
            label,
            grain: "opportunity_customer_member",
            customerMemberId,
        });
    }
    return out;
}

/**
 * Resolve applicable subjects for related-subject intents.
 * When truth carries eligible children, classify them for picker / auto-resolve signals.
 * Empty list → caller/server must resolve at execute time (family opportunity path).
 */
export function resolveApplicableSubjectsForIntent(input: {
    intentKey: string;
    truth?: Record<string, unknown>;
    stageDefinition?: unknown;
    processDefinition?: unknown;
}): ActionIntentApplicableSubject[] {
    void input.stageDefinition;
    void input.processDefinition;
    if (input.intentKey !== "move_to_waitlist" && input.intentKey !== "enroll_subject") {
        return [];
    }
    return subjectsFromTruth(input.truth).map((row) => ({
        id: row.id,
        label: row.label,
        grain: row.grain,
    }));
}

/**
 * Resolve operator intent ref → execution plan.
 * Legacy saved execution aliases (e.g. waitlist_child) still execute unchanged.
 *
 * Move to Waitlist always executes as waitlist_child (child Enrollment participation),
 * including when invoked from a family-grain stage.
 */
export function resolveActionIntentExecution(input: {
    actionRef: string;
    processDefinition?: unknown;
    stageDefinition?: unknown;
    truth?: Record<string, unknown>;
}): ActionIntentExecutionPlan {
    const rawRef = input.actionRef.trim();
    const intent = workTemplateActionIntentForKey(rawRef);
    const intentKey = normalizeActionRefToIntentKey(rawRef);

    if (!intent) {
        return {
            intentKey: rawRef,
            executionKey: rawRef,
            selectionMode: selectionModeForExecutionKey(rawRef),
            applicableSubjects: [],
            requiresSubjectPicker: false,
        };
    }

    const subjectGrain = resolveWorkTemplateSubjectGrain({
        processDefinition: input.processDefinition,
        stageDefinition: input.stageDefinition,
    });

    // Legacy configs may persist a grain-specific alias — honor as execution key when explicit.
    // Intent-level refs resolve through refBySubjectGrain (Move to Waitlist → waitlist_child).
    const executionKey =
        rawRef !== intent.intentKey && intent.aliases.includes(rawRef)
            ? rawRef
            : resolveIntentExecutionRef(intent, subjectGrain);

    const selectionMode = selectionModeForExecutionKey(executionKey);
    const eligible = subjectsFromTruth(input.truth);
    const classified =
        intent.intentKey === "move_to_waitlist" || intent.intentKey === "enroll_subject"
            ? classifyEligibleEnrollmentChildren(eligible)
            : null;

    const applicableSubjects =
        classified ?
            classified.subjects.map((row) => ({
                id: row.id,
                label: row.label,
                grain: row.grain,
            }))
        :   resolveApplicableSubjectsForIntent({
                intentKey: intent.intentKey,
                truth: input.truth,
                stageDefinition: input.stageDefinition,
                processDefinition: input.processDefinition,
            });

    const requiresSubjectPicker = evaluateRequiresSubjectPicker(applicableSubjects, selectionMode);
    const blockedReason =
        classified?.status === "none" && eligible.length === 0 && input.truth != null
            ? classified.message
            : undefined;

    return {
        intentKey,
        executionKey,
        selectionMode,
        applicableSubjects,
        requiresSubjectPicker,
        ...(blockedReason ? { blockedReason } : {}),
    };
}
