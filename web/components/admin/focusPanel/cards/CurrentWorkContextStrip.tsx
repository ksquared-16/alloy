"use client";

/**
 * Compact operational context for What's Next — labeled facts only (no boilerplate purpose).
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

type ContextRow = { label: string; value: string };

/** Dense labeled context under the work title — who / recent / due / outcomes. */
export default function CurrentWorkContextStrip({ surface, truth }: Props) {
    const contact = primaryContactHint(truth ?? null);
    const work = surface.primaryWorkItem;
    const attemptCount = work?.attempt_count ?? 0;
    const lastOutcome = work?.last_outcome?.label?.trim() || null;
    const lastActivity = surface.lastActivity?.label?.trim() || null;
    const lastActivityWhen = surface.lastActivity?.occurredAt?.trim() || null;
    const dueRaw = work?.due_at?.trim() || null;
    const dueAt = dueRaw ? formatTaskDueDate(dueRaw) || dueRaw : null;
    const outcomes = surface.showOutcomeCompletion
        ? surface.completionOutcomes.map((o) => o.label.trim()).filter(Boolean).slice(0, 4)
        : [];

    const rows: ContextRow[] = [];
    if (contact) rows.push({ label: "Primary contact", value: contact });
    if (attemptCount > 0 || lastOutcome) {
        const attemptBit =
            attemptCount > 0 ? `${attemptCount} attempt${attemptCount === 1 ? "" : "s"}` : null;
        const outcomeBit = lastOutcome ? `Last · ${lastOutcome}` : null;
        rows.push({
            label: "Contact attempts",
            value: [attemptBit, outcomeBit].filter(Boolean).join(" · "),
        });
    } else if (lastActivity) {
        rows.push({
            label: "Recent",
            value: lastActivityWhen ? `${lastActivity} · ${lastActivityWhen}` : lastActivity,
        });
    }
    if (dueAt) rows.push({ label: "Due", value: dueAt });

    if (rows.length === 0 && outcomes.length === 0) return null;

    return (
        <div className="alloy-os-currentwork__context" data-work-context="true">
            {rows.length > 0 ?
                <dl className="alloy-os-currentwork__context-rows">
                    {rows.map((row) => (
                        <div key={row.label} className="alloy-os-currentwork__context-row">
                            <dt className="alloy-os-currentwork__context-label">{row.label}</dt>
                            <dd className="alloy-os-currentwork__context-value">{row.value}</dd>
                        </div>
                    ))}
                </dl>
            :   null}
            {outcomes.length > 0 ?
                <div className="alloy-os-currentwork__context-row" data-work-possible-outcomes="true">
                    <p className="alloy-os-currentwork__context-label">Results that advance</p>
                    <p className="alloy-os-currentwork__context-value">{outcomes.join(" · ")}</p>
                </div>
            :   null}
        </div>
    );
}
