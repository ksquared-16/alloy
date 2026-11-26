"use client";

import type { ReactNode } from "react";
import {
    ConfigurationContext,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";

/** Platform Configuration shell for settings surfaces that still embed legacy workspace clients. */
export default function SettingsConfigurationSurfaceShell({
    title,
    subtitle,
    eyebrow = "Platform Configuration",
    testId = "settings-configuration-surface",
    contextChildren,
    children,
}: {
    title: string;
    subtitle?: string;
    eyebrow?: string;
    testId?: string;
    contextChildren?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-4 pb-4" data-testid={testId}>
            <ConfigurationContext
                eyebrow={eyebrow}
                title={title}
                subtitle={subtitle}
                testId={`${testId}-context`}
            >
                {contextChildren}
            </ConfigurationContext>
            <ConfigurationShell testId={`${testId}-shell`}>
                <div className="min-h-0 min-w-0">{children}</div>
            </ConfigurationShell>
        </div>
    );
}
