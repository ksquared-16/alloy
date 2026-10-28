/**
 * Legacy workflow SMS (`create_message` / `send_message` with channel sms) — refused at the workflow step.
 *
 * These actions carry a free-text body to a free-text number with no message category and no resolved
 * recipient Person, so no eligibility record can be written for them: the dispatcher refuses every such
 * row (`revalidate_for_dispatch` → SNAPSHOT_MISSING, backend/app/services/message_sender.py). There is no
 * compliant canonical mapping — the automation purpose (`automated_family_message`) admits only
 * platform-composed content to a Person, as `operational` or `transactional` — and a category is never
 * guessed to get a message past consent. So the step says so instead of reporting `queued` for a row
 * that can never be sent, and names the governed path: `send_communication_template` (Template Library,
 * lead's primary person, canonical eligibility).
 */
export const LEGACY_WORKFLOW_SMS_REFUSED = "legacy_workflow_sms_refused" as const;
export const LEGACY_WORKFLOW_SMS_REMEDY = "send_communication_template" as const;

export function legacyWorkflowSmsRefusal(actionType: string): { skipReason: string; log: string; outputs: Record<string, unknown> } {
    return {
        skipReason: LEGACY_WORKFLOW_SMS_REFUSED,
        log: `${actionType}: SMS refused — a workflow text needs a category and a resolved recipient; use ${LEGACY_WORKFLOW_SMS_REMEDY}`,
        outputs: { queued: false, refused: LEGACY_WORKFLOW_SMS_REFUSED, remedy: LEGACY_WORKFLOW_SMS_REMEDY },
    };
}
