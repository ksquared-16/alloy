"use client";

import {
    CONFIGURATION_MODE_HUB_SUBTITLE,
    CONFIGURATION_MODE_HUB_TITLE,
    CONFIGURATION_MODE_NAV_GROUPS,
} from "@/lib/adminV2/configurationModeNav";
import { configurationModeNavLucideIcon } from "@/lib/adminV2/configurationModeNavIcons";
import { ConfigurationContext } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigurationSection,
    ConfigurationSectionItem,
} from "@/components/adminV2/settings/configurationPlatform";

export default function SettingsConfigurationHub() {
    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="settings-index-page">
            <div data-testid="settings-configuration-hub">
                <ConfigurationContext
                    title={CONFIGURATION_MODE_HUB_TITLE}
                    subtitle={CONFIGURATION_MODE_HUB_SUBTITLE}
                    testId="settings-configuration-context"
                />

                <div className="config-platform-index" data-testid="settings-configuration-sections">
                    {CONFIGURATION_MODE_NAV_GROUPS.map((group) => (
                        <ConfigurationSection
                            key={group.id}
                            sectionId={group.id}
                            title={group.label}
                            description={group.description}
                            testId={`settings-configuration-section-${group.id}`}
                        >
                            {group.items.map((item) => {
                                const Icon = configurationModeNavLucideIcon(item.icon);
                                return (
                                    <ConfigurationSectionItem
                                        key={item.href}
                                        href={item.href}
                                        title={item.label}
                                        description={item.description}
                                        icon={<Icon size={15} strokeWidth={1.75} />}
                                        testId={item.testId.replace("config-mode-nav-", "settings-section-item-")}
                                    />
                                );
                            })}
                        </ConfigurationSection>
                    ))}
                </div>
            </div>
        </div>
    );
}
