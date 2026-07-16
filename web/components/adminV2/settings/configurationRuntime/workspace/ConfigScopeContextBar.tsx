"use client";

import type { ConfigScopeMode } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";

/**
 * Configuration scope — Organization vs the selected location.
 * Minimal operator language only.
 */
export function ConfigScopeContextBar({
    mode,
    organizationLabel = "Organization",
    objectLabel,
    onModeChange,
    ownershipHint,
    testId = "config-scope-context",
}: {
    mode: ConfigScopeMode;
    organizationLabel?: string;
    objectLabel: string;
    onModeChange: (mode: ConfigScopeMode) => void;
    /** Optional; prefer omitting — keep the bar scannable. */
    ownershipHint?: string;
    testId?: string;
}) {
    return (
        <div
            className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-alloy-forge/10 bg-white px-3 py-2"
            data-testid={testId}
        >
            <p className="mr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-alloy-midnight/40">
                Configuration
            </p>
            <button
                type="button"
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    mode === "organization" ?
                        "bg-alloy-bend-pine/15 text-[#007d68]"
                    :   "text-alloy-midnight/55 hover:bg-alloy-stone/15"
                }`}
                onClick={() => onModeChange("organization")}
                data-testid={`${testId}-organization`}
            >
                {organizationLabel}
            </button>
            <button
                type="button"
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    mode === "object" ?
                        "bg-alloy-bend-pine/15 text-[#007d68]"
                    :   "text-alloy-midnight/55 hover:bg-alloy-stone/15"
                }`}
                onClick={() => onModeChange("object")}
                data-testid={`${testId}-object`}
            >
                {objectLabel}
            </button>
            {ownershipHint ?
                <p className="ml-auto text-[11px] text-alloy-midnight/45">{ownershipHint}</p>
            :   null}
        </div>
    );
}
