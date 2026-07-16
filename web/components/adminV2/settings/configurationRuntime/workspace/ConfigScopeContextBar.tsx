"use client";

import type { ConfigScopeMode } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";

/**
 * Scope context bar — Organization (global) vs the selected configuration object.
 * Reusable across Settings domains; labels are supplied by the domain.
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
    ownershipHint?: string;
    testId?: string;
}) {
    return (
        <div
            className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-alloy-forge/10 bg-white px-2.5 py-2"
            data-testid={testId}
        >
            <p className="config-typo-meta mr-1 uppercase tracking-[0.14em]">Scope</p>
            <button
                type="button"
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    mode === "organization" ?
                        "bg-[#00a283]/15 text-[#007d68]"
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
                        "bg-[#00a283]/15 text-[#007d68]"
                    :   "text-alloy-midnight/55 hover:bg-alloy-stone/15"
                }`}
                onClick={() => onModeChange("object")}
                data-testid={`${testId}-object`}
            >
                {objectLabel}
            </button>
            {ownershipHint ?
                <p className="config-typo-sublabel ml-auto">{ownershipHint}</p>
            :   null}
        </div>
    );
}
