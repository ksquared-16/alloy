"use client";

import type { ConfigScopeMode } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";

/**
 * Quiet ownership metadata — never competes with the object hero.
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
    const hint =
        ownershipHint ??
        (mode === "object" ? "Configured at this location" : "Organization-wide configuration");

    return (
        <div
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-alloy-midnight/45"
            data-testid={testId}
        >
            <button
                type="button"
                className={`font-medium underline-offset-2 hover:text-alloy-midnight/70 hover:underline ${
                    mode === "organization" ? "text-[#007d68]" : ""
                }`}
                onClick={() => onModeChange("organization")}
                data-testid={`${testId}-organization`}
            >
                {organizationLabel}
            </button>
            <span aria-hidden="true">·</span>
            <button
                type="button"
                className={`font-medium underline-offset-2 hover:text-alloy-midnight/70 hover:underline ${
                    mode === "object" ? "text-alloy-midnight/60" : ""
                }`}
                onClick={() => onModeChange("object")}
                data-testid={`${testId}-object`}
            >
                {objectLabel}
            </button>
            <span aria-hidden="true">·</span>
            <span>{hint}</span>
        </div>
    );
}
