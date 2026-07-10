"use client";

import AlloyModeSwitch, { type AlloyModeOption } from "@/components/workspace/AlloyModeSwitch";

/**
 * Operational Workspace Doctrine V2 — Work | Studio mode rail.
 */
export default function WorkspaceModeTabs<M extends string>({
    modes,
    activeMode,
    onModeChange,
    ariaLabel,
    fill,
    className = "",
}: {
    modes: ReadonlyArray<AlloyModeOption<M>>;
    activeMode: M;
    onModeChange: (mode: M) => void;
    ariaLabel: string;
    fill?: boolean;
    className?: string;
}) {
    return (
        <div className={`border-b border-alloy-stone/15 pb-2.5 ${className}`} data-workspace-mode-tabs="true">
            <AlloyModeSwitch
                modes={modes}
                active={activeMode}
                onChange={onModeChange}
                ariaLabel={ariaLabel}
                fill={fill}
            />
        </div>
    );
}
