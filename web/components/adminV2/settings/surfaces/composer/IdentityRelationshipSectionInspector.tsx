"use client";

import clsx from "clsx";

import {
    isHouseholdRelationshipSectionKey,
    setNestedGroupRelationshipCriteria,
    setNestedGroupRoleOverride,
    setNestedGroupSectionLabel,
    setNestedGroupSectionVisibility,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { HOUSEHOLD_RELATIONSHIP_ROLE_OPTIONS } from "@/lib/adminV2/runtime/focusPanel/household/identityRelationshipSections";
import {
    isHouseholdParentGuardianRuntimeGroup,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRoleConfig";

export type IdentityRelationshipSectionInspectorProps = {
    surfaceId: string;
    groupKey: string;
    config: NestedSurfaceConfig;
    onChange: (next: NestedSurfaceConfig) => void;
};

/** Author relationship section label, visibility, criteria, and role override. */
export default function IdentityRelationshipSectionInspector({
    surfaceId,
    groupKey,
    config,
    onChange,
}: IdentityRelationshipSectionInspectorProps) {
    if (surfaceId !== "household_surface" || !isHouseholdRelationshipSectionKey(groupKey)) {
        return null;
    }

    const group = config.groups.find((g) => g.key === groupKey);
    if (!group) return null;

    const registryLabel = groupKey.replace(/_/g, " ");
    const label = group.sectionLabel?.trim() ?? registryLabel;
    const visibility = group.sectionVisibility ?? (groupKey === "primary_contact" || groupKey === "children" ? "always" : "when_nonempty");
    const criteria = group.relationshipCriteria?.roleKeys ?? [];
    const showCriteria = groupKey !== "primary_contact" && groupKey !== "children";
    const showRoleOverride = isHouseholdParentGuardianRuntimeGroup(groupKey);

    const toggleRole = (roleKey: string) => {
        const next = new Set(criteria);
        if (next.has(roleKey)) next.delete(roleKey);
        else next.add(roleKey);
        onChange(
            setNestedGroupRelationshipCriteria(
                config,
                groupKey,
                next.size > 0 ? { roleKeys: [...next] } : undefined,
            ),
        );
    };

    return (
        <div
            className="space-y-3 rounded-lg border border-alloy-stone/15 bg-alloy-paper/60 p-3"
            data-relationship-section-inspector={groupKey}
        >
            <p className="config-typo-sublabel font-medium text-alloy-midnight/80">Relationship section</p>

            <label className="block space-y-1">
                <span className="config-typo-sublabel text-alloy-midnight/60">Section label</span>
                <input
                    type="text"
                    className="w-full rounded-md border border-alloy-stone/20 px-2 py-1.5 text-sm"
                    value={label}
                    onChange={(e) => onChange(setNestedGroupSectionLabel(config, groupKey, e.target.value))}
                />
            </label>

            <label className="block space-y-1">
                <span className="config-typo-sublabel text-alloy-midnight/60">Visibility</span>
                <select
                    className="w-full rounded-md border border-alloy-stone/20 px-2 py-1.5 text-sm"
                    value={visibility}
                    onChange={(e) =>
                        onChange(
                            setNestedGroupSectionVisibility(
                                config,
                                groupKey,
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

            {showRoleOverride ?
                <label className="flex items-center gap-2 text-sm text-alloy-midnight/70">
                    <input
                        type="checkbox"
                        checked={group.roleOverride === true}
                        onChange={(e) => onChange(setNestedGroupRoleOverride(config, groupKey, e.target.checked))}
                    />
                    Override Parent / Guardian defaults for this section
                </label>
            :   null}

            {showCriteria ?
                <div className="space-y-1">
                    <span className="config-typo-sublabel text-alloy-midnight/60">Relationship criteria</span>
                    <div className="flex flex-wrap gap-1.5">
                        {HOUSEHOLD_RELATIONSHIP_ROLE_OPTIONS.map((option) => {
                            const active = criteria.includes(option.key);
                            return (
                                <button
                                    key={option.key}
                                    type="button"
                                    className={clsx(
                                        "rounded-full border px-2 py-0.5 text-[11px]",
                                        active ?
                                            "border-alloy-pine/40 bg-alloy-pine/10 text-alloy-pine"
                                        :   "border-alloy-stone/20 text-alloy-midnight/55",
                                    )}
                                    onClick={() => toggleRole(option.key)}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                    <p className="config-typo-sublabel text-alloy-midnight/45">
                        Contacts match the highest-priority section once. Leave empty to use platform defaults.
                    </p>
                </div>
            :   null}

            {groupKey === "children" ?
                <p className="config-typo-sublabel text-alloy-midnight/45">
                    Child identity fields are configured on the Children surface. This section controls visibility and handoff only.
                </p>
            :   null}
        </div>
    );
}
