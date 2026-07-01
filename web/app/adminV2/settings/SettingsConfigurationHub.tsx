"use client";

import {
    CONFIGURATION_MODE_HUB_SUBTITLE,
    CONFIGURATION_MODE_HUB_TITLE,
    CONFIGURATION_MODE_NAV_GROUPS,
} from "@/lib/adminV2/configurationModeNav";
import { configurationModeNavLucideIcon } from "@/lib/adminV2/configurationModeNavIcons";
import { ConfigurationContext } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigRuntimePrimaryTile } from "@/components/adminV2/settings/configurationRuntime/ConfigurationRuntimePrimitives";

export default function SettingsConfigurationHub() {
    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="settings-index-page">
            <div data-testid="settings-configuration-hub">
                <ConfigurationContext
                    title={CONFIGURATION_MODE_HUB_TITLE}
                    subtitle={CONFIGURATION_MODE_HUB_SUBTITLE}
                    testId="settings-configuration-context"
                />

                <div className="settings-configuration-tiles space-y-6" data-testid="settings-configuration-tiles">
                    {CONFIGURATION_MODE_NAV_GROUPS.map((group, index) => (
                        <section
                            key={group.label ?? `hub-group-${index}`}
                            data-testid={`settings-configuration-group-${index}`}
                        >
                            {group.label ?
                                <h2 className="config-typo-field-label mb-2 px-0.5">{group.label}</h2>
                            :   null}
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {group.items.map((item) => {
                                    const Icon = configurationModeNavLucideIcon(item.icon);
                                    return (
                                        <ConfigRuntimePrimaryTile
                                            key={item.href}
                                            href={item.href}
                                            title={item.label}
                                            description={item.description}
                                            icon={<Icon size={18} strokeWidth={1.75} />}
                                            testId={item.testId.replace("config-mode-nav-", "settings-tile-")}
                                        />
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}
