"use client";

import type { ConfigurationMutationScope } from "@/lib/configRuntime/organizationLocationScope";

export function ConfigMutationScopeSelector({
    value,
    onChange,
    locationLabel,
    organizationDisabled,
    organizationDisabledReason,
    impactLines,
    testId = "config-mutation-scope",
}: {
    value: ConfigurationMutationScope;
    onChange: (next: ConfigurationMutationScope) => void;
    locationLabel: string;
    organizationDisabled?: boolean;
    organizationDisabledReason?: string;
    impactLines?: readonly string[];
    testId?: string;
}) {
    return (
        <fieldset
            className="space-y-2 rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.03] px-3 py-2.5"
            data-testid={testId}
        >
            <legend className="px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                Apply changes to
            </legend>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-alloy-midnight">
                <input
                    type="radio"
                    name={`${testId}-scope`}
                    className="mt-1"
                    checked={value === "location_only"}
                    onChange={() => onChange("location_only")}
                    data-testid={`${testId}-location`}
                />
                <span>
                    <span className="font-semibold">This Location only</span>
                    <span className="config-typo-sublabel mt-0.5 block">
                        Creates or updates a {locationLabel} override / local offering state.
                    </span>
                </span>
            </label>
            <label
                className={`flex items-start gap-2 text-sm ${
                    organizationDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer text-alloy-midnight"
                }`}
            >
                <input
                    type="radio"
                    name={`${testId}-scope`}
                    className="mt-1"
                    checked={value === "organization_default"}
                    disabled={organizationDisabled}
                    onChange={() => onChange("organization_default")}
                    data-testid={`${testId}-organization`}
                />
                <span>
                    <span className="font-semibold">Organization default</span>
                    <span className="config-typo-sublabel mt-0.5 block">
                        {organizationDisabledReason
                            ?? "Updates the shared definition for Locations still inheriting it."}
                    </span>
                </span>
            </label>
            {value === "organization_default" && impactLines && impactLines.length > 0 ?
                <div
                    className="rounded-md border border-alloy-forge/10 bg-white px-2.5 py-2 text-[11px] text-alloy-midnight/70"
                    data-testid={`${testId}-impact`}
                >
                    <p className="font-semibold text-alloy-midnight">Impact preview</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {impactLines.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                </div>
            :   null}
        </fieldset>
    );
}
