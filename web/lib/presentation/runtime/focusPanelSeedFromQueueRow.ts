/**
 * INSTANT-IDENTITY SEED — the clicked/default queue row's identity, for the Focus Panel's
 * pending header, sourced from the SAME committed queue rows the surface already holds.
 *
 * WHY THIS EXISTS. On a cold Focus Panel open (default subject / first open / work-unit nav)
 * the panel has no record VM yet, so `FocusPanelCompactHeader` had nothing to show but the
 * generic entity noun ("Lead"). The clicked/default row already carries the operator-facing
 * identity — the family name and status the queue card renders — so the pending header can
 * show it immediately instead of waiting ~14 requests for the VM.
 *
 * SINGLE OWNER. The seed is derived from `model.queue.rows` keyed by the committed
 * `recordOfAttention.id` — NOT from a side registry, NOT from the drawer store. It is the
 * same committed queue the row was rendered from, so it can never drift from what the operator
 * clicked, and it disappears the instant the VM resolves (the resolved header replaces it).
 *
 * It reuses the exact display helpers `CondensedQueueRow` renders from
 * (`resolveCompactSlotDisplay` / `queueRowSubjectDisplayName`), so the seed name is byte-for-byte
 * the name already on screen in the queue — no second derivation to drift.
 */
import type { OpportunityDrawerQueuePreviewSeed } from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import { resolveCompactSlotDisplay } from "@/lib/presentation/runtime/resolveCompactSlotDisplay";
import { queueRowSubjectDisplayName, type CompactRowSlots, type QueueRowModel } from "@/lib/presentation/runtime";

/** A row answers to a subject id by its own entity id or its grouped drawer-open anchor. */
function rowAnswersToSubject(row: QueueRowModel, subjectId: string): boolean {
    return row.entityId === subjectId || row.context?.drawer_open.entity_id === subjectId;
}

/**
 * Build the instant-identity seed for one queue row. Opportunity + child rows (Focus Panel
 * Settlement is opportunity-shaped; child Attention still seeds the pending header from the row).
 * Returns null when the row has no frozen context to read an identity from.
 */
export function focusPanelSeedFromQueueRow(
    row: QueueRowModel,
    defaultRowConfig: CompactRowSlots | null | undefined,
): OpportunityDrawerQueuePreviewSeed | null {
    if (row.entityType !== "opportunity" && row.entityType !== "child") return null;
    const context = row.context;
    if (!context) return null;

    const rowConfig = row.rowConfig ?? defaultRowConfig ?? undefined;
    const focus = row.focus;

    const title =
        resolveCompactSlotDisplay("subject", context, rowConfig?.subject, focus)?.trim() ||
        focus?.primary.display_name?.trim() ||
        queueRowSubjectDisplayName(context).trim() ||
        (row.entityType === "child" ? context.case_context?.display_name?.trim() : null) ||
        "";
    if (!title) return null;

    // The compact card carries ONE status/stage pill (the `status` slot). Seed it as the header's
    // status chip only. The loading header must NOT carry the primary contact's phone/email (Kelly:
    // it produced a second header variant that flickered against the resolved one) — the identity is
    // the family name + status; contact details belong to the settled record surface, not the seed.
    const statusLabel =
        resolveCompactSlotDisplay("status", context, rowConfig?.status, focus)?.trim() ||
        context.row_stage?.trim() ||
        null;

    return { title, statusLabel };
}

/**
 * Find the committed subject's row in the queue and build its instant-identity seed. The default
 * and clicked subjects are always rows in the committed queue, so the lookup is present at commit
 * time — no fetch, no waterfall.
 */
export function focusPanelSeedForSubject(
    subjectId: string | null,
    rows: readonly QueueRowModel[] | null | undefined,
    defaultRowConfig: CompactRowSlots | null | undefined,
): OpportunityDrawerQueuePreviewSeed | null {
    if (!subjectId || !rows?.length) return null;
    const row = rows.find((candidate) => rowAnswersToSubject(candidate, subjectId));
    if (!row) return null;
    return focusPanelSeedFromQueueRow(row, defaultRowConfig);
}
