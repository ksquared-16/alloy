"use client";

import { useState } from "react";
import {
    HIGH_CONSEQUENCE_OFF,
    SERVICE_CAPABILITIES,
    SERVICE_CAPABILITY_REGISTRY,
    type ServiceCapability,
    type ServiceCapabilityMap,
} from "@/lib/financials/services/serviceCapabilities";

/**
 * The switchboard — the heart of Services (Alloy Services V1 blueprint §V1.2).
 * Six capability switches; each is an operational truth with a plain-language
 * read. Turning a live-operation capability OFF raises a consequence
 * confirmation that names the effect (never a generic "Are you sure?").
 */
export default function ServiceSwitchboard({
    capabilities,
    canMutate,
    busy,
    onToggle,
    confirmHighConsequence = true,
}: {
    capabilities: ServiceCapabilityMap;
    canMutate: boolean;
    busy: boolean;
    onToggle: (cap: ServiceCapability, value: boolean) => void;
    /** When false (authoring a brand-new service), skip the off-confirmation — nothing is live yet. */
    confirmHighConsequence?: boolean;
}) {
    const [confirming, setConfirming] = useState<ServiceCapability | null>(null);

    function handleClick(cap: ServiceCapability) {
        const next = !capabilities[cap];
        // Turning a high-consequence capability OFF requires a named confirmation.
        if (!next && confirmHighConsequence && HIGH_CONSEQUENCE_OFF[cap]) {
            setConfirming(cap);
            return;
        }
        onToggle(cap, next);
    }

    return (
        <div data-testid="service-switchboard">
            <p className="config-typo-queue-section-label mb-2">WHAT DOES THIS SERVICE POWER?</p>
            <div className="space-y-1">
                {SERVICE_CAPABILITIES.map((cap) => {
                    const on = capabilities[cap] === true;
                    const reg = SERVICE_CAPABILITY_REGISTRY[cap];
                    const isConfirming = confirming === cap;
                    return (
                        <div key={cap} className="rounded-lg px-1 py-1.5">
                            <div className="flex items-start gap-3">
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={on}
                                    disabled={!canMutate || busy}
                                    onClick={() => handleClick(cap)}
                                    data-testid={`capability-${cap}`}
                                    className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                                        on
                                            ? "justify-end border-[#00a283] bg-[#00a283]"
                                            : "justify-start border-alloy-stone bg-alloy-stone/40"
                                    } ${!canMutate || busy ? "opacity-50" : "cursor-pointer"}`}
                                >
                                    <span className="mx-0.5 h-4 w-4 rounded-full bg-white shadow-sm" />
                                </button>
                                <div className="min-w-0 flex-1">
                                    <p className={`config-typo-field-label normal-case ${on ? "text-alloy-forge" : "text-alloy-forge/55"}`}>
                                        {reg.label}
                                    </p>
                                    <p className="config-typo-meta">{on ? reg.onRead : reg.offRead}</p>
                                </div>
                            </div>
                            {isConfirming ? (
                                <div className="ml-12 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2" data-testid={`capability-confirm-${cap}`}>
                                    <p className="config-typo-meta text-amber-800">{HIGH_CONSEQUENCE_OFF[cap]} Continue?</p>
                                    <div className="mt-2 flex gap-2">
                                        <button
                                            type="button"
                                            className="config-secondary-btn"
                                            onClick={() => setConfirming(null)}
                                            disabled={busy}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            className="config-primary-btn"
                                            onClick={() => {
                                                onToggle(cap, false);
                                                setConfirming(null);
                                            }}
                                            disabled={busy}
                                            data-testid={`capability-confirm-off-${cap}`}
                                        >
                                            Turn off
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
