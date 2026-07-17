/**
 * BOS governance + trust copy (Cards 13–14). Operator-facing only — no security jargon.
 */

/** Proposal tied to a different active operational context than the open record. */
export const STALE_OPERATIONAL_PROPOSAL_MESSAGE =
    "This proposal is tied to a different active record. Open that record or switch context before applying.";

export const OPERATIONAL_PROPOSAL_CONTEXT_MISMATCH_COPY = STALE_OPERATIONAL_PROPOSAL_MESSAGE;

export const OPERATIONAL_PROPOSAL_STALE_DEFAULT_COPY =
    "Blocked — open the matching record or confirm the target before applying.";

/** Workflow Assist propose/apply when portal user lacks admin mutation access. */
export const WORKFLOW_ASSIST_MUTATION_BLOCKED_COPY =
    "This organization currently allows review-only workflow recommendations. Propose and apply require admin access.";

/** @deprecated Use WORKFLOW_ASSIST_MUTATION_BLOCKED_COPY — kept for imports from workflowAssistReadV1. */
export const WORKFLOW_ASSIST_PORTAL_MUTATION_BLOCKED_USER_MESSAGE = WORKFLOW_ASSIST_MUTATION_BLOCKED_COPY;

export const CONFIG_ASSIST_APPLY_PERMISSION_COPY =
    "Approve and apply require configuration assist permissions for your role.";

export const TASK_ASSIST_UNAVAILABLE_COPY =
    "Task Assist is not available in this deployment. Outbound messages and reminders use the standard workspace tools.";

export const RECOMMENDATION_ONLY_CONFIG_COPY =
    "Recommendation only — no configuration changes will be applied.";

export type BosPolicyDenialPresentation = {
    headline: string;
    reason: string;
    bullets: readonly string[];
    nextStep?: string | null;
};

export type BosPolicyDenialKind =
    | "task_assist_unavailable"
    | "workflow_assist_review_only"
    | "config_assist_apply_denied";

export function resolveBosPolicyDenial(kind: BosPolicyDenialKind): BosPolicyDenialPresentation {
    switch (kind) {
        case "task_assist_unavailable":
            return {
                headline: "Not available",
                reason: "Task Assist is turned off for this environment.",
                bullets: [
                    "Outbound message drafts and operational reminders are not offered in the Orchestrator here.",
                    "Use the inquiry drawer or workspace tools for family communication and follow-ups.",
                ],
                nextStep: null,
            };
        case "workflow_assist_review_only":
            return {
                headline: "Review only",
                reason: "Workflow changes require admin approval in this portal.",
                bullets: [
                    WORKFLOW_ASSIST_MUTATION_BLOCKED_COPY,
                    "You can still review workflow summaries, failed runs, and explanations.",
                ],
                nextStep: "Open Automations to review or enable workflows after an admin applies a proposal.",
            };
        case "config_assist_apply_denied":
            return {
                headline: "Approval required",
                reason: "Your role can review configuration proposals but cannot approve and apply.",
                bullets: [CONFIG_ASSIST_APPLY_PERMISSION_COPY],
                nextStep: "Ask an administrator to apply from Configuration → Config proposals, or request apply access.",
            };
        default: {
            const _exhaustive: never = kind;
            return _exhaustive;
        }
    }
}

export function formatBosPolicyDenialPlainText(p: BosPolicyDenialPresentation): string {
    const lines = [p.headline, p.reason, ...p.bullets];
    if (p.nextStep?.trim()) lines.push(p.nextStep.trim());
    return lines.filter(Boolean).join(" ");
}
