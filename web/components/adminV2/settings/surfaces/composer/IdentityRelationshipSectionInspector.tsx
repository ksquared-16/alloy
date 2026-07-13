"use client";

import clsx from "clsx";

import {
    HOUSEHOLD_SURFACE_ID,
    CHILDREN_SURFACE_ID,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { HOUSEHOLD_RELATIONSHIP_ROLE_OPTIONS } from "@/lib/adminV2/runtime/focusPanel/household/identityRelationshipSections";
import {
    isHouseholdParentGuardianRuntimeGroup,
    HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRoleConfig";
import {
    listHouseholdRelationshipSectionInstances,
    renameHouseholdRelationshipSectionInstance,
    setHouseholdRelationshipSectionCriteria,
    setHouseholdRelationshipSectionVisibility,
    presentationGroupKeyForInstance,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipSectionInstances";
import { setNestedGroupRoleOverride } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { RelationshipCriteria } from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipSectionDefinitions";

export type IdentityRelationshipSectionInspectorProps = {
    surfaceId: string;
    groupKey: string;
    config: NestedSurfaceConfig;
    onChange: (next: NestedSurfaceConfig) => void;
    onOpenChildrenSurface?: () => void;
};

function instanceForSelection(config: NestedSurfaceConfig, groupKey: string) {
    const instances = listHouseholdRelationshipSectionInstances(config);
    return (
        instances.find((instance) => instance.instanceKey === groupKey)
        ?? instances.find((instance) => instance.presentationRef === groupKey)
        ?? instances.find((instance) => groupKey === HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP && instance.definitionKey === "parent_guardian")
    );
}

/** Author relationship section label, visibility, criteria, and handoff behavior. */
export default function IdentityRelationshipSectionInspector({
    surfaceId,
    groupKey,
    config,
    onChange,
    onOpenChildrenSurface,
}: IdentityRelationshipSectionInspectorProps) {
    if (surfaceId !== HOUSEHOLD_SURFACE_ID) return null;

    const instance = instanceForSelection(config, groupKey);
    if (!instance) return null;

    const instanceKey = instance.instanceKey;
    const includeKeys = instance.relationshipCriteria.roleKeys ?? [];
    const excludeKeys = instance.relationshipCriteria.excludeRoleKeys ?? [];
    const showCriteria = instance.definitionKey !== "parent_primary" && instance.definitionKey !== "children";
    const showRoleOverride = isHouseholdParentGuardianRuntimeGroup(presentationGroupKeyForInstance(config, instanceKey));

    const patchCriteria = (patch: Partial<RelationshipCriteria>) => {
        onChange(
            setHouseholdRelationshipSectionCriteria(config, instanceKey, {
                ...instance.relationshipCriteria,
                ...patch,
            }),
        );
    };

    const toggleInclude = (roleKey: string) => {
        const next = new Set(includeKeys);
        if (next.has(roleKey)) next.delete(roleKey);
        else next.add(roleKey);
        patchCriteria({ roleKeys: [...next] });
    };

    const toggleExclude = (roleKey: string) => {
        const next = new Set(excludeKeys);
        if (next.has(roleKey)) next.delete(roleKey);
        else next.add(roleKey);
        patchCriteria({ excludeRoleKeys: [...next] });
    };

    return (
        <div
            className="space-y-3 rounded-lg border border-alloy-stone/15 bg-alloy-paper/60 p-3"
            data-relationship-section-inspector={instanceKey}
        >
            <p className="config-typo-sublabel font-medium text-alloy-midnight/80">Relationship section</p>

            <label className="block space-y-1">
                <span className="config-typo-sublabel text-alloy-midnight/60">Section name</span>
                <input
                    type="text"
                    className="w-full rounded-md border border-alloy-stone/20 px-2 py-1.5 text-sm"
                    value={instance.label}
                    onChange={(e) => onChange(renameHouseholdRelationshipSectionInstance(config, instanceKey, e.target.value))}
                />
            </label>

            <label className="block space-y-1">
                <span className="config-typo-sublabel text-alloy-midnight/60">Visibility</span>
                <select
                    className="w-full rounded-md border border-alloy-stone/20 px-2 py-1.5 text-sm"
                    value={instance.visibility}
                    onChange={(e) =>
                        onChange(
                            setHouseholdRelationshipSectionVisibility(
                                config,
                                instanceKey,
                                e.target.value as "always" | "when_nonempty" | "hidden",
                            ),
                        )
                    }
                >
                    <option value="always">Always show</option>
                    <option value="when_nonempty">When not empty</option>
                    <option value="hidden">Hidden</option>
                </select>
            </label>

            {instance.definitionKey === "children" ?
                <div className="space-y-2 rounded-md border border-alloy-pine/15 bg-alloy-pine/5 p-2">
                    <p className="text-[12px] text-alloy-midnight/75">Uses Children surface presentation</p>
                    <p className="config-typo-sublabel text-alloy-midnight/50">
                        Child Summary, Context, Details, and Evidence remain owned by the Children card.
                    </p>
                    {onOpenChildrenSurface ?
                        <button
                            type="button"
                            className="text-[11px] font-medium text-alloy-pine underline"
                            data-children-surface-handoff="true"
                            onClick={onOpenChildrenSurface}
                        >
                            Configure Children card →
                        </button>
                    :   null}
                </div>
            :   null}

            {showRoleOverride ?
                <label className="flex items-center gap-2 text-sm text-alloy-midnight/70">
                    <input
                        type="checkbox"
                        checked={
                            config.groups.find((g) => (g.instanceKey ?? g.key) === instanceKey)?.roleOverride === true
                        }
                        onChange={(e) =>
                            onChange(
                                setNestedGroupRoleOverride(
                                    config,
                                    presentationGroupKeyForInstance(config, instanceKey),
                                    e.target.checked,
                                ),
                            )
                        }
                    />
                    Override Parent / Guardian defaults for this section
                </label>
            :   null}

            {showCriteria ?
                <div className="space-y-3">
                    <div className="space-y-1">
                        <span className="config-typo-sublabel text-alloy-midnight/60">Include when</span>
                        <div className="flex flex-wrap gap-1.5" data-criteria-include="true">
                            {HOUSEHOLD_RELATIONSHIP_ROLE_OPTIONS.map((option) => {
                                const active = includeKeys.includes(option.key);
                                return (
                                    <button
                                        key={`include-${option.key}`}
                                        type="button"
                                        className={clsx(
                                            "rounded-full border px-2 py-0.5 text-[11px]",
                                            active ?
                                                "border-alloy-pine/40 bg-alloy-pine/10 text-alloy-pine"
                                            :   "border-alloy-stone/20 text-alloy-midnight/55",
                                        )}
                                        onClick={() => toggleInclude(option.key)}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="space-y-1">
                        <span className="config-typo-sublabel text-alloy-midnight/60">Exclude when</span>
                        <div className="flex flex-wrap gap-1.5" data-criteria-exclude="true">
                            {HOUSEHOLD_RELATIONSHIP_ROLE_OPTIONS.map((option) => {
                                const active = excludeKeys.includes(option.key);
                                return (
                                    <button
                                        key={`exclude-${option.key}`}
                                        type="button"
                                        className={clsx(
                                            "rounded-full border px-2 py-0.5 text-[11px]",
                                            active ?
                                                "border-red-300/60 bg-red-50 text-red-700"
                                            :   "border-alloy-stone/20 text-alloy-midnight/55",
                                        )}
                                        onClick={() => toggleExclude(option.key)}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            :   null}
        </div>
    );
}
