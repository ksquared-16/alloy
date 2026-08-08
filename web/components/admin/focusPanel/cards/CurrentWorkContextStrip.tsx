"use client";

/**
 * Compact operational context facts for What's Next — presentation only.
 * Inline fact row (no oversized bordered box). Grows only when facts exist.
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

function formatFact(fact: WhatsNextContextFact): { primary: string; secondary: string | null } {
    // Prefer "Kelly Kurzman · Primary contact" / "Due Sat, Aug 8" when a label exists.
    if (fact.key === "primary_contact" && fact.label) {
        return { primary: fact.value, secondary: fact.label };
    }
    if (fact.key === "due" && fact.label) {
        return { primary: `${fact.label} ${fact.value}`, secondary: null };
    }
    if (fact.label) {
        return { primary: fact.value, secondary: fact.label };
    }
    return { primary: fact.value, secondary: null };
}

/** Dense inline context facts — omit entirely when empty. */
export default function CurrentWorkContextStrip({ surface, truth, facts }: Props) {
    const resolved = (facts && facts.length > 0 ? facts : legacyFacts(surface, truth)).slice(0, 4);
    if (resolved.length === 0) return null;

    return (
        <div className="alloy-os-currentwork__context" data-work-context="true">
            <div className="alloy-os-currentwork__context-inline" data-work-context-card="true">
                {resolved.map((fact, index) => {
                    const { primary, secondary } = formatFact(fact);
                    return (
                        <span
                            key={fact.key}
                            className="alloy-os-currentwork__context-fact"
                            data-work-context-fact={fact.key}
                        >
                            {index > 0 ?
                                <span className="alloy-os-currentwork__context-sep" aria-hidden>
                                    ·
                                </span>
                            :   null}
                            <span className="alloy-os-currentwork__context-value">{primary}</span>
                            {secondary ?
                                <span className="alloy-os-currentwork__context-label">{secondary}</span>
                            :   null}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
