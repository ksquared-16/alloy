/**
 * Activity-mode background prewarm for the inline Focus Panel.
 *
 * Arms lightweight metadata for communications, documents, activity timeline, and notes
 * (notes ship on VM — no fetch). Sanctioned idle prefetch only — never a reveal gate.
 *
 * The operator should NEVER wait for the Activity cockpit to load on switch: while they are in
 * Work/Summary mode, this warms — in the background — everything the Activity switch will read, so the
 * switch is instant. The Communications panel is the one that used to visibly say "Loading
 * conversation…": its live workspace is served by `useFamilyCommunicationRuntime` reading the V2
 * `drawerFamilyWorkspacePrefetchCache`, so we warm THAT cache (the legacy drawer prefetch below feeds
 * the other cockpit panels), and we warm not just the thread LIST but the FIRST THREAD's messages —
 * the runtime auto-selects the first non-empty thread and loads its messages on open, so that
 * thread-scoped entry must be warm too, or the operator still watches it fetch.
 */

import { scheduleDeferredCommunicationsDrawerPrefetch } from "@/lib/admin/communications/communicationsDrawerPrefetch";
import { scheduleOpportunityDrawerTabPrefetch } from "@/lib/admin/opportunityDrawerTabPrefetch";
import { prefetchDrawerFamilyWorkspace } from "@/lib/communications/v2/drawerFamilyWorkspacePrefetchCache";
import { threadChannelToWorkspaceMode } from "@/lib/communications/v2/familyWorkspace/threadTopicPresentation";

/** Prewarm all Activity cockpit dependencies for an opportunity subject. Idempotent helpers. */
export function prewarmFocusPanelActivityMode(opportunityId: string): void {
    const id = opportunityId.trim();
    if (!id) return;
    scheduleDeferredCommunicationsDrawerPrefetch("opportunities", id);
    scheduleOpportunityDrawerTabPrefetch(id);
    // The V2 family-communication workspace is what the Activity Communications panel actually reads.
    void prewarmActivityFamilyCommunications(id);
}

/**
 * Warm the V2 family-communication workspace for the Activity Communications panel so the first thread
 * is on screen with no wait. Two hops, matching exactly what `useFamilyCommunicationRuntime` reads:
 *   1. the workspace VM (thread list) at the default channel — the runtime's initial `vm`;
 *   2. the FIRST non-empty thread's messages at that thread's channel — what the runtime auto-loads on
 *      open (its `load(firstThread.id)`), the step that produced the visible "Loading conversation…".
 * The first-thread + channel selection replicates the runtime's own logic, so the warmed cache keys
 * are the ones it looks up. Best-effort: any failure degrades to the old on-open fetch, never throws.
 */
async function prewarmActivityFamilyCommunications(entityId: string): Promise<void> {
    try {
        const workspace = await prefetchDrawerFamilyWorkspace({
            entityType: "opportunities",
            entityId,
            composerChannel: "email",
        });
        const firstThread = workspace?.threads.find((thread) => thread.messageCount > 0);
        if (!firstThread) return;
        const channel = threadChannelToWorkspaceMode(firstThread.channel) === "sms" ? "sms" : "email";
        await prefetchDrawerFamilyWorkspace({
            entityType: "opportunities",
            entityId,
            threadId: firstThread.id,
            composerChannel: channel,
        });
    } catch {
        /* prewarm is best-effort — never throw into the idle scheduler */
    }
}
