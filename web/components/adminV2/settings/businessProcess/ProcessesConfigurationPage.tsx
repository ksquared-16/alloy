"use client";

import { useState, type ReactNode } from "react";
import LifecycleBuilderPrimary from "@/components/adminV2/settings/lifecycle/LifecycleBuilderPrimary";

/**
 * Configuration Mode — Processes surface.
 * Context → Configuration Queue → Configuration Workspace → BOS (shell-owned).
 * Collection → Selected Process → Focused Workspace pattern (same family as Access/Tuition).
 */
export default function ProcessesConfigurationPage({
    initialSection,
    initialProcessId,
}: {
    initialSection?: string;
    initialProcessId?: string;
}) {
    const [contextActions, setContextActions] = useState<ReactNode>(null);

    return (
        <div className="process-config-page" data-testid="settings-processes-page">
            <LifecycleBuilderPrimary
                contextActions={contextActions}
                onContextActionsChange={setContextActions}
                initialSection={initialSection}
                initialProcessId={initialProcessId}
            />
        </div>
    );
}
