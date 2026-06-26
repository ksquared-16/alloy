"use client";

import {
    CONFIGURATION_MODE_HUB_SUBTITLE,
    CONFIGURATION_MODE_HUB_TITLE,
    CONFIGURATION_MODE_NAV_ITEMS,
} from "@/lib/adminV2/configurationModeNav";
import { configurationModeNavLucideIcon } from "@/lib/adminV2/configurationModeNavIcons";
import {
    ConfigRuntimeHero,
    ConfigRuntimePrimaryTile,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationRuntimePrimitives";

export default function SettingsConfigurationHub() {
    return (
        <div className="mx-auto w-full max-w-6xl space-y-4" data-testid="settings-index-page">
            <ConfigRuntimeHero
                title={CONFIGURATION_MODE_HUB_TITLE}
                subtitle={CONFIGURATION_MODE_HUB_SUBTITLE}
                testId="settings-configuration-hero"
            />

            <section
                className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
                data-testid="settings-configuration-tiles"
            >
                {CONFIGURATION_MODE_NAV_ITEMS.map((item) => {
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
            </section>
        </div>
    );
}
