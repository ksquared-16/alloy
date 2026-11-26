/** Launch AdminV2 Quick message modal with surface-authored context (queue / drawer). */

import type { ContextualActionSurface } from "@/lib/admin/actions/contextualActionInvocation";

export type QuickMessageLaunchSeed = {
    /** When absent, modal opens in record-scoped empty state (no person search). */
    personId?: string | null;
    opportunityId?: string | null;
    recordDisplayName?: string | null;
    displayName?: string;
    email?: string | null;
    phone?: string | null;
    originatingSurface?: ContextualActionSurface;
    /** When true with opportunityId, load linked contacts via drawer-recipients (no global search). */
    recordScoped?: boolean;
    /** Pre-select composer channel when opening from canonical send_email / send_sms actions. */
    defaultChannel?: "email" | "sms";
    draftSubject?: string | null;
    draftBody?: string | null;
    tourInvitationId?: string | null;
};

export const ADMINV2_OPEN_QUICK_MESSAGE_EVENT = "adminv2:open-quick-message";

export function launchAdminV2QuickMessage(seed: QuickMessageLaunchSeed): void {
    if (typeof window === "undefined") return;
    const personId = seed.personId?.trim() || null;
    const opportunityId = seed.opportunityId?.trim() || null;
    if (!personId && !opportunityId) return;
    window.dispatchEvent(
        new CustomEvent<QuickMessageLaunchSeed>(ADMINV2_OPEN_QUICK_MESSAGE_EVENT, { detail: seed }),
    );
}
