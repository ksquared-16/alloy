import type { ReactNode } from "react";
import ConfigurationJourneyGuide from "@/components/adminV2/settings/ConfigurationJourneyGuide";
import { SettingsNavGroup, SettingsNavTile } from "@/components/adminV2/settings/SettingsNavTile";
import {
    CONFIGURATION_WORKSPACE_ADVANCED_ITEMS,
    CONFIGURATION_WORKSPACE_DOMAINS,
    CONFIGURATION_WORKSPACE_HUB_SUBTITLE,
    CONFIGURATION_WORKSPACE_HUB_TITLE,
} from "@/lib/adminV2/configurationWorkspaceDomains";
import { SETTINGS_PAGE_INTRO_CLASS, SETTINGS_PAGE_SHELL_CLASS } from "@/lib/adminV2/settingsPageLayout";

export const dynamic = "force-dynamic";

function SettingsLink(props: {
    href: string;
    title: string;
    children: React.ReactNode;
    emphasis?: boolean;
    mode?: import("@/lib/adminV2/settingsSurfaceModes").SettingsSurfaceMode;
}) {
    return <SettingsNavTile {...props} />;
}

function SettingsGroup({
    label,
    description,
    children,
}: {
    label: string;
    description?: string;
    children: ReactNode;
}) {
    return <SettingsNavGroup label={label} description={description}>{children}</SettingsNavGroup>;
}

function DiagnosticLink(props: { href: string; title: string; children: React.ReactNode }) {
    return <SettingsNavTile {...props} variant="diagnostic" />;
}

export default function AdminV2SettingsIndexPage() {
    return (
        <div className={SETTINGS_PAGE_SHELL_CLASS} data-testid="settings-index-page">
            <header className="rounded-xl border border-alloy-forge/12 border-l-4 border-l-alloy-pine bg-white/90 px-5 py-4 shadow-sm">
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">
                    {CONFIGURATION_WORKSPACE_HUB_TITLE}
                </h1>
                <p className={`mt-1 ${SETTINGS_PAGE_INTRO_CLASS}`}>{CONFIGURATION_WORKSPACE_HUB_SUBTITLE}</p>
            </header>

            <ConfigurationJourneyGuide />

            <div className="space-y-8">
                {CONFIGURATION_WORKSPACE_DOMAINS.map((domain) => (
                    <SettingsGroup key={domain.id} label={domain.label} description={domain.description}>
                        {domain.items
                            .filter((item) => !item.advanced)
                            .map((item) => (
                                <SettingsLink
                                    key={item.href}
                                    href={item.href}
                                    title={item.label}
                                    mode="editable"
                                    emphasis={item.emphasis}
                                >
                                    {item.description ?? item.label}
                                </SettingsLink>
                            ))}
                    </SettingsGroup>
                ))}
            </div>

            <aside className="rounded-xl border border-dashed border-alloy-forge/20 bg-alloy-stone/[0.05] p-4">
                <div>
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        Advanced
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-alloy-midnight/50">
                        Diagnostics and org-wide defaults — not everyday configuration. Attention stage rules
                        live in Business Processes; work units are runtime output.
                    </p>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {CONFIGURATION_WORKSPACE_ADVANCED_ITEMS.map((item) => (
                        <DiagnosticLink key={item.href} href={item.href} title={item.label}>
                            {item.description ?? item.label}
                        </DiagnosticLink>
                    ))}
                </div>
            </aside>
        </div>
    );
}
