"use client";

/**
 * Compact operational context for What's Next — primary contact + due on one card row.
 * Presentation only over existing CurrentWorkSurfaceVM fields (no new metadata).
 */

import { formatTaskDueDate } from "@/lib/presentation/presentationDateFormat";
import type { CurrentWorkSurfaceVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

type Props = {
    surface: CurrentWorkSurfaceVM;
    truth?: Record<string, unknown> | null;
};

function primaryContactHint(truth: Record<string, unknown> | null | undefined): string | null {
    if (!truth) return null;
    const name =
        String(truth["person.primary_contact_name"] ?? truth._primary_contact_name ?? "").trim()
        || "";
    return name || null;
}

/** Dense labeled context — contact + due share one quiet card. */
export default function CurrentWorkContextStrip({ surface, truth }: Props) {
    const contact = primaryContactHint(truth ?? null);
    const work = surface.primaryWorkItem;
    const dueRaw = work?.due_at?.trim() || null;
    const dueAt = dueRaw ? formatTaskDueDate(dueRaw) || dueRaw : null;

    if (!contact && !dueAt) return null;

    return (
        <div className="alloy-os-currentwork__context" data-work-context="true">
            <div className="alloy-os-currentwork__context-card" data-work-context-card="true">
                {contact ?
                    <div className="alloy-os-currentwork__context-fact" data-work-context-fact="contact">
                        <span className="alloy-os-currentwork__context-label">Primary contact</span>
                        <span className="alloy-os-currentwork__context-value">{contact}</span>
                    </div>
                :   null}
                {dueAt ?
                    <div className="alloy-os-currentwork__context-fact" data-work-context-fact="due">
                        <span className="alloy-os-currentwork__context-label">Due</span>
                        <span className="alloy-os-currentwork__context-value">{dueAt}</span>
                    </div>
                :   null}
            </div>
        </div>
    );
}
