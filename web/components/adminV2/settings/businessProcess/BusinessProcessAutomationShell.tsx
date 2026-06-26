"use client";

import { BUSINESS_PROCESS_NAV_AUTOMATION } from "@/lib/lifecycle/businessProcessUiLabels";

export default function BusinessProcessAutomationShell() {
    return (
        <div
            className="process-config-setup-card flex min-h-[16rem] flex-col items-center justify-center gap-3 px-6 py-10 text-center"
            data-testid="business-process-automation-workspace"
        >
            <div className="config-mode-icon-tile h-12 w-12 text-lg">↻</div>
            <div>
                <h3 className="text-lg font-semibold text-alloy-midnight">{BUSINESS_PROCESS_NAV_AUTOMATION}</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-alloy-midnight/60">
                    Automation defines platform-triggered behavior — workflows that run when records move, timers
                    fire, or outcomes complete. Process-level automation authoring is coming next.
                </p>
            </div>
            <button
                type="button"
                disabled
                className="rounded-lg border border-alloy-forge/15 bg-alloy-stone/[0.03] px-4 py-2 text-sm font-semibold text-alloy-midnight/40"
                data-testid="business-process-automation-create"
            >
                Create automation (pending)
            </button>
        </div>
    );
}
