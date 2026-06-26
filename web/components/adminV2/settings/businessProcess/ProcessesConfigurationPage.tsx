"use client";

import { useState, type ReactNode } from "react";
import LifecycleBuilderPrimary from "@/components/adminV2/settings/lifecycle/LifecycleBuilderPrimary";

/**
 * Configuration Mode — Processes surface.
 * Context → Configuration Queue → Configuration Workspace → BOS (shell-owned).
 */
export default function ProcessesConfigurationPage() {
    const [contextActions, setContextActions] = useState<ReactNode>(null);

    return (
        <div className="process-config-page" data-testid="settings-processes-page">
            <LifecycleBuilderPrimary
                contextActions={contextActions}
                onContextActionsChange={setContextActions}
            />
        </div>
    );
}
