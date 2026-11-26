"use client";

/**
 * Compact operational context facts for What's Next — presentation only.
 * Reuses Household/Children identity-field label/value grammar. Grows only when facts exist.
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

/** Dense identity-field fact row — omit entirely when empty. */
export default function CurrentWorkContextStrip({ surface, truth, facts }: Props) {
    const resolved = (facts && facts.length > 0 ? facts : legacyFacts(surface, truth)).slice(0, 4);
    if (resolved.length === 0) return null;

    const pair = resolved.length >= 2;

    return (
        <div className="alloy-os-currentwork__context" data-work-context="true">
            <div
                className={
                    pair
                        ? "identity-field-grid alloy-os-currentwork__context-facts"
                        : "identity-field-grid alloy-os-currentwork__context-facts alloy-os-currentwork__context-facts--single"
                }
                data-work-context-card="true"
            >
                <div
                    className={
                        pair
                            ? "identity-field-grid__row identity-field-grid__row--pair"
                            : "identity-field-grid__row"
                    }
                >
                    {resolved.map((fact) => (
                        <div
                            key={fact.key}
                            className={
                                pair
                                    ? "identity-field-value identity-field-grid__cell--half"
                                    : "identity-field-value"
                            }
                            data-work-context-fact={fact.key}
                        >
                            {fact.label ?
                                <span className="identity-field-value__label identity-field-value__label--eyebrow">
                                    {fact.label}
                                </span>
                            :   null}
                            <span className="identity-field-value__value alloy-os-currentwork__context-value">
                                {fact.value}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
