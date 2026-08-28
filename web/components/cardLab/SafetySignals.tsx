"use client";

import clsx from "clsx";

import type { SafetySignal } from "@/lib/cardLab/cardLabTypes";

/**
 * Safety Signals — configured PROJECTIONS of canonical health facts onto surfaces outside the
 * Health card, where they materially affect safe operation.
 *
 *   canonical health fact → configured signal eligibility → permission/context evaluation
 *   → Safety Signal projection
 *
 * They are never copied or stored as generic tags. Health remains the single owner; an
 * organization configures which fact TYPES project and to which surfaces, and the projection is
 * evaluated against access permissions, health visibility policy and subject scope at read time.
 *
 * **Minimum operationally useful fact only.** A signal says "Peanut allergy · severe", never the
 * medical note behind it. Broad health information does not become ambient just because it exists.
 */
export default function SafetySignals({
    signals,
    surface,
    dense = false,
}: {
    signals: SafetySignal[];
    /** Only signals configured for THIS surface project here. */
    surface: string;
    dense?: boolean;
}) {
    const visible = signals.filter((s) => s.surfaces.includes(surface));
    if (!visible.length) return null;

    return (
        <span className={clsx("alloy-os-signals", dense && "alloy-os-signals--dense")} data-signal-surface={surface}>
            {visible.map((s) => (
                <span key={s.label} className="alloy-os-signal" data-signal-tone={s.tone}>
                    {s.tone === "critical" ? (
                        <svg viewBox="0 0 16 16" width="9" height="9" fill="none" aria-hidden="true">
                            <path d="M8 1.8 15 14.2H1L8 1.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                            <path d="M8 6.3v3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                    ) : null}
                    {s.label}
                </span>
            ))}
        </span>
    );
}
