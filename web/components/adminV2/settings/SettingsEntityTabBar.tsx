"use client";

import type { CSSProperties } from "react";
import { derived, neutral, brand } from "@/styles/tokens/colors";

const tabListStyle: CSSProperties = {
    backgroundColor: derived.maskOverlay,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: derived.border,
};

type TabItem<K extends string = string> = { key: K; label: string };

/**
 * Horizontal entity tabs for AdminV2 Settings (matches JobDrawerV2TabBar / workspace record nav).
 */
export default function SettingsEntityTabBar<K extends string>({
    tabs,
    activeKey,
    onSelect,
    "aria-label": ariaLabel = "Field entity",
}: {
    tabs: TabItem<K>[];
    activeKey: K;
    onSelect: (key: K) => void;
    "aria-label"?: string;
}) {
    return (
        <div
            className="flex flex-wrap gap-1 rounded-xl p-1"
            style={tabListStyle}
            role="tablist"
            aria-label={ariaLabel}
        >
            {tabs.map((tab) => {
                const isOn = activeKey === tab.key;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={isOn}
                        onClick={() => onSelect(tab.key)}
                        className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                        style={
                            isOn
                                ? {
                                      backgroundColor: neutral.surface,
                                      color: brand.primary,
                                      boxShadow: derived.cardShadow,
                                  }
                                : { color: derived.textSecondary }
                        }
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}
