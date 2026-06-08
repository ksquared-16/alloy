"use client";

/**
 * LayoutRuntimeQueueCard — the canonical production queue card for Layout V2.
 *
 * Renders a resolved `queue` LayoutDoc (a variant chosen by queue context via
 * {@link resolveQueueLayoutVariant}) against a values record, placing fields and
 * widgets into the configured zones (header / context / body / actions). VALUES
 * come from QueueService / VM data only; structure and refKeys come from the doc.
 * Missing optional values render blank.
 *
 * This is the single named queue-card renderer: the settings-editor live preview
 * and the proof routes both render through the same engine, so there is no
 * separate proof-only queue card. The engine implementation lives in
 * {@link QueueCardProofRenderer} (kept for backwards-compatible imports); this
 * module is the production entry point that live surfaces should bind to.
 */

import QueueCardEngine, {
    type QueueCardAdornmentActionHandler,
} from "@/components/layout/QueueCardProofRenderer";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

export type LayoutRuntimeQueueCardProps = {
    /** Resolved queue LayoutDoc variant. */
    doc: LayoutDoc;
    /** Operator-safe values record (QueueService/VM data adapted to refKeys). */
    record: Record<string, unknown>;
    /** Open the underlying record (drawer) — wired by the host queue. */
    onOpen?: () => void;
    /** Run a card action (status, message, …) — wired by the host queue. */
    onAction?: (label: string) => void;
    /** Adornment (open related drawer) handler. */
    onAdornmentAction?: QueueCardAdornmentActionHandler;
    /** Group-config toggle: hide the header runtime-position chip when false. */
    showRuntimePosition?: boolean;
};

export default function LayoutRuntimeQueueCard(props: LayoutRuntimeQueueCardProps) {
    return <QueueCardEngine {...props} />;
}
