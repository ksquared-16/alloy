/**
 * Pick the first registry action suitable for outreach / contact-family handoff.
 * Pure — no I/O.
 */

import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

const OUTREACH_ACTION_PATTERN =
    /\b(send|message|email|sms|text|outreach|communicat|contact|compose)\b/i;

export function resolveCommunicationsComposerAction(
    actions: readonly ResolvedActionForClient[],
): ResolvedActionForClient | null {
    for (const action of actions) {
        const haystack = `${action.key} ${action.label} ${action.description ?? ""}`;
        if (OUTREACH_ACTION_PATTERN.test(haystack)) {
            return action;
        }
    }
    return null;
}
