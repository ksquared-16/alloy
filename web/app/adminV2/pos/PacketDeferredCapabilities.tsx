"use client";

import { PauseCircle } from "lucide-react";

export type PacketDeferredCapability = {
    obligation?: string;
    owner_label?: string;
    reason?: string;
    clause?: string;
    source_document_title?: string | null;
    section_title?: string;
    deferred_artifact_ids?: string[];
};

const OBLIGATION_LABELS: Record<string, string> = {
    PAYMENT_SETUP_REQUIRED: "Payment setup",
};

/**
 * What this packet knowingly does not ask for.
 *
 * Without this panel the two states below are the same screen, and an operator cannot tell them
 * apart at any distance:
 *
 *     an obligation held because its owner is not built    vs.    an obligation quietly lost
 *
 * So it names the obligation, the owner who will take it, and the sentence in the school's own
 * paperwork that raised it — enough for an operator to recognise the thing and decide whether the
 * packet is honest. It is deliberately not styled as an error: nothing here is wrong.
 */
export default function PacketDeferredCapabilities({ items }: { items: PacketDeferredCapability[] }) {
    if (!items.length) return null;
    return (
        <section
            data-testid="packet-deferred-capabilities"
            className="mb-4 rounded-[14px] border border-alloy-stone/20 bg-white p-4"
            aria-label="Deferred capabilities"
        >
            <div className="flex items-center gap-2">
                <PauseCircle aria-hidden className="h-4 w-4 text-alloy-midnight/45" />
                <h3 className="text-[13px] font-semibold text-alloy-midnight">Held for another area</h3>
                <span className="text-[12px] text-alloy-midnight/45">
                    {items.length} {items.length === 1 ? "requirement" : "requirements"} this packet does not ask for
                </span>
            </div>
            <ul className="mt-3 space-y-3">
                {items.map((c, i) => (
                    <li key={`${c.obligation ?? "deferred"}-${i}`} className="rounded-[10px] bg-alloy-stone/[0.35] p-3">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="text-[13px] font-semibold text-alloy-midnight">
                                {OBLIGATION_LABELS[c.obligation ?? ""] ?? c.obligation ?? "Held requirement"}
                            </span>
                            {c.owner_label ? (
                                <span className="rounded-full bg-alloy-midnight/[0.06] px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/70">
                                    {c.owner_label}
                                </span>
                            ) : null}
                        </div>
                        {c.reason ? <p className="mt-1.5 text-[12px] leading-[1.5] text-alloy-midnight/70">{c.reason}</p> : null}
                        {c.clause ? (
                            // The school's own sentence, verbatim. A summary would not let an
                            // operator recognise which requirement this is.
                            <blockquote className="mt-2 border-l-2 border-alloy-stone pl-3 text-[12px] italic leading-[1.5] text-alloy-midnight/55">
                                “{c.clause}”
                                {c.source_document_title ? (
                                    <span className="not-italic"> — {c.source_document_title}</span>
                                ) : null}
                            </blockquote>
                        ) : null}
                        {c.deferred_artifact_ids?.length ? (
                            <p className="mt-2 text-[12px] text-alloy-midnight/55">
                                The paper form for this is kept with the case and is not part of what families fill in.
                            </p>
                        ) : null}
                    </li>
                ))}
            </ul>
        </section>
    );
}
