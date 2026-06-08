"use client";

import { useState } from "react";
import LifecycleHubClient from "@/components/adminV2/settings/LifecycleHubClient";
import LifecycleActivationClient from "@/components/adminV2/settings/lifecycle/LifecycleActivationClient";

export default function LifecycleSettingsShell() {
    const [showAdvanced, setShowAdvanced] = useState(false);

    return (
        <div className="space-y-2" data-testid="lifecycle-settings-shell">
            <LifecycleActivationClient />

            <p className="text-[11px] text-alloy-midnight/45">
                <button
                    type="button"
                    className="font-medium hover:text-alloy-pine hover:underline"
                    onClick={() => setShowAdvanced((v) => !v)}
                    data-testid="lifecycle-advanced-configuration-toggle"
                >
                    {showAdvanced ? "Hide advanced configuration" : "Advanced configuration"}
                </button>
            </p>

            {showAdvanced ? (
                <div
                    className="rounded-lg border border-alloy-forge/12 bg-alloy-stone/5 p-3"
                    data-testid="lifecycle-advanced-configuration"
                >
                    <LifecycleHubClient />
                </div>
            ) : null}
        </div>
    );
}
