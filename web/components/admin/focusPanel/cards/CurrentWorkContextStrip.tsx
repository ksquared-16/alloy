"use client";

/**
 * Compact operational context for What's Next — purpose, last attempt, due, outcomes.
 * Presentation only over existing CurrentWorkSurfaceVM fields (no new metadata).
 */

import type { CurrentWorkSurfaceVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

type Props = {
    surface: CurrentWorkSurfaceVM;
};

function primaryContactHint(truth: Record<string, unknown> | null | undefined): string | null {
    if (!truth) return null;
    const name =
        String(truth["person.primary_contact_name"] ?? truth._primary_contact_name ?? "").trim()
        || "";
    return name || null;
}

/** Dense context strip under the work purpose — answers who/what/recent/what remains. */
export default function CurrentWorkContextStrip({
    surface,
    truth,
}: Props & { truth?: Record<string, unknown> | null }) {
    const purpose = surface.description?.trim() || surface.readiness.reasonLabel?.trim() || null;
    const contact = primaryContactHint(truth ?? null);
    const work = surface.primaryWorkItem;
    const attemptCount = work?.attempt_count ?? 0;
    const lastOutcome = work?.last_outcome?.label?.trim() || null;
    const lastActivity = surface.lastActivity?.label?.trim() || null;
    const lastActivityWhen = surface.lastActivity?.occurredAt?.trim() || null;
    const dueAt = work?.due_at?.trim() || null;
    const outcomes = surface.showOutcomeCompletion
        ? surface.completionOutcomes.map((o) => o.label.trim()).filter(Boolean).slice(0, 4)
        : [];

    const lines: string[] = [];
    if (contact) lines.push(`Primary contact · ${contact}`);
    if (attemptCount > 0 || lastOutcome) {
        const attemptBit =
            attemptCount > 0 ? `${attemptCount} attempt${attemptCount === 1 ? "" : "s"}` : null;
        const outcomeBit = lastOutcome ? `Last · ${lastOutcome}` : null;
        lines.push([attemptBit, outcomeBit].filter(Boolean).join(" · "));
    } else if (lastActivity) {
        lines.push(
            lastActivityWhen ? `${lastActivity} · ${lastActivityWhen}` : lastActivity,
        );
    }
    if (dueAt) lines.push(`Due · ${dueAt}`);

    if (!purpose && lines.length === 0 && outcomes.length === 0) return null;

    return (
        <div className="alloy-os-currentwork__context" data-work-context="true">
            {purpose ?
                <p className="alloy-os-currentwork__context-purpose" data-work-purpose="true">
                    {purpose}
                </p>
            :   null}
            {lines.length > 0 ?
                <ul className="alloy-os-currentwork__context-lines">
                    {lines.map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            :   null}
            {outcomes.length > 0 ?
                <p className="alloy-os-currentwork__context-outcomes" data-work-possible-outcomes="true">
                    <span className="alloy-os-currentwork__context-outcomes-label">Results that advance</span>
                    {" · "}
                    {outcomes.join(" · ")}
                </p>
            :   null}
        </div>
    );
}
