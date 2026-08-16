"use client";

/**
 * COMMIT-CRITICAL destination preparation — the one canonical prep path.
 *
 * A work-unit destination is not "ready to commit" until BOTH its provisioning answer AND its
 * first-operational-view subject's complete VM (VM + stage-work) are in hand — the Focus Panel cannot
 * reveal usefully without them, so they are commit-critical, NOT Settlement (Kelly, Blocker 2).
 *
 * This prepares both through ONE identity:
 *   1. `kernel.provisioning.prepare(ref)` — K2's canonical preparation (deduped by provisioningKey:
 *      target/lens/subject/principal/tenant). The real commit (`attention.move`) REUSES this exact
 *      completed answer — no separate URL cache, no scope-mismatched second fetch.
 *   2. From the operational terminal's snapshot, `recordOfAttention.id` is the destination's default
 *      subject. `prewarmRecordWork` warms that subject's COMPLETE VM (VM + stage-work) into the same
 *      caches `useRecordWorkRuntime` reads, so the click commits a complete Focus Panel with zero
 *      network on the prepared path.
 *
 * Used for: the process entry destinations (Workspace prep), sibling Work-View destinations (Phase H),
 * and any hover/adjacency intent. Best-effort and non-throwing.
 */
import type { AttentionRef } from "@/lib/runtime/kernel/attention";
import type { PreparationTerminal } from "@/lib/runtime/kernel/provisioning";
import { prewarmRecordWork } from "@/lib/presentation/runtime/useRecordWorkRuntime";

/** The minimal kernel surface this prep needs — satisfied by the runtime kernel. */
export type DestinationPrepKernel = {
    provisioning: { prepare: (ref: AttentionRef) => Promise<PreparationTerminal | null> };
};

/**
 * Prepare a destination's provisioning answer AND its default subject's complete VM. Awaitable so
 * callers can chain, but every failure is swallowed — preparation must never surface an error.
 */
export async function prepareOperationalDestination(
    kernel: DestinationPrepKernel,
    ref: AttentionRef,
): Promise<void> {
    try {
        const terminal = await kernel.provisioning.prepare(ref);
        const snapshot = terminal?.snapshot;
        /**
         * `prewarmRecordWork` loads the OPPORTUNITY record-work VM. On a child-grain work view
         * `recordOfAttention` is a child PARTICIPATION, not an opportunity, so warming it issued
         * `GET /api/admin/view-models/drawer/opportunity/<participation-id>` — a 404.
         *
         * Observed on Firefly: preparing the Waitlist destination (`subjectGrain.subjectType` =
         * `child`, two real children) 404'd on entry to views that never open that subject,
         * including All.
         *
         * The answer states its own subject type, so ask it rather than assuming. A child
         * destination has no opportunity VM to warm — the click prepares live, which is the
         * documented best-effort contract. Absent subject type keeps the previous behaviour.
         */
        if (snapshot && snapshot.terminal === "operational" && snapshot.recordOfAttention?.id) {
            // `subjectGrain` belongs to the OPERATIONAL arm of the answer union — the contextual
            // arm names its subject as `subject.subjectType` and carries no `subjectGrain` — so
            // the read has to sit inside this narrow. Prewarm only ever applied to the operational
            // arm, so nothing about the behaviour changes.
            const subjectType = snapshot.subjectGrain?.subjectType;
            const warmsOpportunityVm = subjectType == null || subjectType === "opportunity";
            if (warmsOpportunityVm) {
                await prewarmRecordWork(String(snapshot.recordOfAttention.id));
            }
        }
    } catch {
        /* preparation is best-effort — a miss just means the click prepares live */
    }
}
