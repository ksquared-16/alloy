"use client";

import type { ConfigRuleScopeType } from "@/lib/childcareOperational/config/configRuleTypes";
import {
    ConfigFieldLabel,
    ConfigSelectInput,
} from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";

/**
 * Reusable scope picker for Operational Configuration authoring (Operational
 * Configuration V1, Phase 4). Replaces raw scope-target-ID entry with labeled
 * selects following the inheritance model:
 *   Org default → Location override → Program override → Room override.
 *
 * It shows human labels ("Austin Campus", "Toddler"), never UUIDs, and emits a
 * structured selection that maps directly to the scoped columns the authoring
 * services expect. Generic across Financials (rate plans) and Locations
 * (capacity / ratio / operating windows / schedule rules).
 */

export type ScopeOption = { id: string; label: string };

export type ScopeOptions = {
    sites: ScopeOption[];
    programs: ScopeOption[];
    rooms: ScopeOption[];
};

export type ScopeSelection = {
    scopeType: ConfigRuleScopeType;
    siteLocationId: string | null;
    programCategoryId: string | null;
    roomLocationId: string | null;
};

export const ORG_SCOPE_SELECTION: ScopeSelection = {
    scopeType: "org",
    siteLocationId: null,
    programCategoryId: null,
    roomLocationId: null,
};

const SCOPE_TYPE_OPTIONS: { value: ConfigRuleScopeType; label: string }[] = [
    { value: "org", label: "Org default" },
    { value: "site", label: "Location override" },
    { value: "program", label: "Program override" },
    { value: "room", label: "Room override" },
];

/** Map a selection to the API scope columns (only the relevant id is set). */
export function scopeSelectionToPayload(selection: ScopeSelection): Record<string, unknown> {
    switch (selection.scopeType) {
        case "site":
            return { scope_type: "site", site_location_id: selection.siteLocationId };
        case "program":
            return { scope_type: "program", program_category_id: selection.programCategoryId };
        case "room":
            return { scope_type: "room", room_location_id: selection.roomLocationId };
        default:
            return { scope_type: "org" };
    }
}

/** Whether the selection is complete enough to submit (a target chosen for non-org). */
export function isScopeSelectionComplete(selection: ScopeSelection): boolean {
    switch (selection.scopeType) {
        case "site":
            return !!selection.siteLocationId;
        case "program":
            return !!selection.programCategoryId;
        case "room":
            return !!selection.roomLocationId;
        default:
            return true;
    }
}

function targetOptions(scopeType: ConfigRuleScopeType, options: ScopeOptions): ScopeOption[] {
    if (scopeType === "site") return options.sites;
    if (scopeType === "program") return options.programs;
    if (scopeType === "room") return options.rooms;
    return [];
}

function targetLabel(scopeType: ConfigRuleScopeType): string {
    if (scopeType === "site") return "Location";
    if (scopeType === "program") return "Program";
    if (scopeType === "room") return "Room";
    return "";
}

export function ScopePicker({
    value,
    onChange,
    options,
    disabled,
    testIdPrefix = "scope-picker",
}: {
    value: ScopeSelection;
    onChange: (next: ScopeSelection) => void;
    options: ScopeOptions;
    disabled?: boolean;
    testIdPrefix?: string;
}) {
    const scopeType = value.scopeType;
    const targets = targetOptions(scopeType, options);

    function setScopeType(next: ConfigRuleScopeType) {
        // Reset target ids; default the target to the first available option.
        const first = targetOptions(next, options)[0]?.id ?? null;
        onChange({
            scopeType: next,
            siteLocationId: next === "site" ? first : null,
            programCategoryId: next === "program" ? first : null,
            roomLocationId: next === "room" ? first : null,
        });
    }

    function setTarget(id: string) {
        onChange({
            ...value,
            siteLocationId: scopeType === "site" ? id : null,
            programCategoryId: scopeType === "program" ? id : null,
            roomLocationId: scopeType === "room" ? id : null,
        });
    }

    const currentTargetId =
        scopeType === "site"
            ? value.siteLocationId
            : scopeType === "program"
              ? value.programCategoryId
              : scopeType === "room"
                ? value.roomLocationId
                : null;

    return (
        <div className="grid grid-cols-2 gap-3" data-testid={testIdPrefix}>
            <ConfigFieldLabel label="Scope">
                <ConfigSelectInput
                    value={scopeType}
                    onChange={(v) => setScopeType(v as ConfigRuleScopeType)}
                    options={SCOPE_TYPE_OPTIONS}
                    disabled={disabled}
                    testId={`${testIdPrefix}-type`}
                />
            </ConfigFieldLabel>
            {scopeType !== "org" ? (
                <ConfigFieldLabel label={targetLabel(scopeType)}>
                    {targets.length === 0 ? (
                        <p className="config-typo-sublabel text-amber-700" data-testid={`${testIdPrefix}-empty`}>
                            No {targetLabel(scopeType).toLowerCase()}s available
                        </p>
                    ) : (
                        <ConfigSelectInput
                            value={currentTargetId ?? ""}
                            onChange={setTarget}
                            options={targets.map((o) => ({ value: o.id, label: o.label }))}
                            disabled={disabled}
                            testId={`${testIdPrefix}-target`}
                        />
                    )}
                </ConfigFieldLabel>
            ) : null}
        </div>
    );
}
