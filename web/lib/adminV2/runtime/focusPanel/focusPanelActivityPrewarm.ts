/**
 * Activity-mode background prewarm for the inline Focus Panel.
 *
 * Arms lightweight metadata for communications, documents, activity timeline, and notes
 * (notes ship on VM — no fetch). Sanctioned idle prefetch only — never a reveal gate.
 */

import { scheduleDeferredCommunicationsDrawerPrefetch } from "@/lib/admin/communications/communicationsDrawerPrefetch";
import { scheduleOpportunityDrawerTabPrefetch } from "@/lib/admin/opportunityDrawerTabPrefetch";

/** Prewarm all Activity cockpit dependencies for an opportunity subject. Idempotent helpers. */
export function prewarmFocusPanelActivityMode(opportunityId: string): void {
    const id = opportunityId.trim();
    if (!id) return;
    scheduleDeferredCommunicationsDrawerPrefetch("opportunities", id);
    scheduleOpportunityDrawerTabPrefetch(id);
}
