"use client";

import type { ConfigScope } from "@/lib/configRuntime/scope";

export type ScopedLocation = { id: string; name: string };

type Props = {
    scope: ConfigScope;
    locations: ScopedLocation[];
    onChange: (scope: ConfigScope) => void;
    loading?: boolean;
    className?: string;
};

/**
 * Config Runtime primitive — scope picker.
 * Renders "Organization default" and one button per location.
 * Extracted from TuitionGridWorkspace; reused in Compare view.
 */
export function ConfigScopeSelector({ scope, locations, onChange, loading, className }: Props) {
    const orgId = scope.orgId;

    const tabs: { key: string; label: string; scope: ConfigScope }[] = [
        { key: "org", label: "Organization default", scope: { kind: "org", orgId } },
        ...locations.map((loc) => ({
            key: loc.id,
            label: loc.name,
            scope: { kind: "location" as const, orgId, locationId: loc.id },
        })),
    ];

    const activeKey = scope.kind === "org" ? "org" : scope.locationId;

    return (
        <div className={`flex flex-wrap gap-1 ${className ?? ""}`}>
            {tabs.map((tab) => (
                <button
                    key={tab.key}
                    type="button"
                    disabled={loading}
                    onClick={() => onChange(tab.scope)}
                    className={[
                        "px-3 py-1 rounded-full text-sm font-medium transition-colors",
                        tab.key === activeKey
                            ? "bg-pine-500 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                        loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                    ].join(" ")}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
