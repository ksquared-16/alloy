"use client";

/**
 * Compact operational context facts for What's Next — presentation only.
 * Prefers the Card V2 contextFacts DTO; falls back to contact + due from surface/truth.
 */

import { formatTaskDueDate } from "@/lib/presentation/presentationDateFormat";
import type { CurrentWorkSurfaceVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import type { WhatsNextContextFact } from "@/lib/adminV2/runtime/focusPanel/currentWork/whatsNextCardTypes";

type Props = {
    surface: CurrentWorkSurfaceVM;
    truth?: Record<string, unknown> | null;
    /** Card V2 context facts — when provided, replaces the legacy contact/due-only strip. */
    facts?: WhatsNextContextFact[] | null;
};

function primaryContactHint(truth: Record<string, unknown> | null | undefined): string | null {
    if (!truth) return null;
    const name =
        String(truth["person.primary_contact_name"] ?? truth._primary_contact_name ?? "").trim()
        || "";
    return name || null;
}

function legacyFacts(
    surface: CurrentWorkSurfaceVM,
    truth: Record<string, unknown> | null | undefined,
): WhatsNextContextFact[] {
    const out: WhatsNextContextFact[] = [];
    const contact = primaryContactHint(truth);
    if (contact) out.push({ key: "primary_contact", label: "Primary contact", value: contact });
    const dueRaw = surface.primaryWorkItem?.due_at?.trim() || null;
    const dueAt = dueRaw ? formatTaskDueDate(dueRaw) || dueRaw : null;
    if (dueAt) out.push({ key: "due", label: "Due", value: dueAt });
    return out;
}

/** Dense labeled context facts — omit entirely when empty. */
export default function CurrentWorkContextStrip({ surface, truth, facts }: Props) {
    const resolved = (facts && facts.length > 0 ? facts : legacyFacts(surface, truth)).slice(0, 4);
    if (resolved.length === 0) return null;

    return (
        <div className="alloy-os-currentwork__context" data-work-context="true">
            <div className="alloy-os-currentwork__context-card" data-work-context-card="true">
                {resolved.map((fact) => (
                    <div
                        key={fact.key}
                        className="alloy-os-currentwork__context-fact"
                        data-work-context-fact={fact.key}
                    >
                        {fact.label ?
                            <span className="alloy-os-currentwork__context-label">{fact.label}</span>
                        :   null}
                        <span className="alloy-os-currentwork__context-value">{fact.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
