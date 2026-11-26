"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";

import IdentityBuilderBreadcrumb from "@/components/adminV2/settings/surfaces/composer/IdentityBuilderBreadcrumb";
import IdentityBuilderPurposeNavigation from "@/components/adminV2/settings/surfaces/composer/IdentityBuilderPurposeNavigation";
import IdentityRelationshipSectionInspector from "@/components/adminV2/settings/surfaces/composer/IdentityRelationshipSectionInspector";
import RelationshipSectionsPanel from "@/components/adminV2/settings/surfaces/composer/RelationshipSectionsPanel";
import IdentityRelationshipSectionTabs from "@/components/adminV2/settings/surfaces/composer/IdentityRelationshipSectionTabs";
import {
    buildHouseholdRelationshipAuthoringTabs,
    authoringGroupKeyForTab,
    selectionGroupKeyForTab,
    type HouseholdRelationshipAuthoringTab,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipAuthoringTabs";
import { HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP } from "@/lib/adminV2/runtime/focusPanel/household/householdRoleConfig";
import { CHILDREN_SURFACE_ID, HOUSEHOLD_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import SurfaceFieldInspector from "@/components/adminV2/settings/surfaces/composer/SurfaceFieldInspector";
import {
    fieldLayoutWidthForNestedGroup,
    groupDefsFor,
    identityTierContainingField,
    moveFieldInNestedGroup,
    moveFieldToIdentityTierInNestedGroup,
    nestedSurfaceLabel,
    removeFieldFromNestedGroup,
    setFieldLayoutWidthInNestedGroup,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    buildIdentityBuilderBreadcrumb,
    initialIdentityBuilderNavigation,
    identityBuilderPushPurpose,
    navigateIdentityBuilderBreadcrumb,
    type IdentityConfigurationPurpose,
} from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import {
    listNestedPlacedFields,
    toSurfaceComposerPlacedItemRef,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceComposerModel";
import { useTenantFieldDefinitions } from "@/lib/adminV2/settings/surfaces/useTenantFieldDefinitions";
import { SURFACE_COMPOSER_EMPTY_HINT } from "@/lib/adminV2/settings/surfaces/surfaceComposer";
import { resolveIdentityBuilderGroupConfig, resolveIdentityBuilderSectionKey } from "@/lib/adminV2/settings/surfaces/resolveIdentityAuthoringGroupKey";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";

export type IdentitySurfaceBuilderInspectorProps = {
    surfaceId: string;
    config: NestedSurfaceConfig;
    onChange: (next: NestedSurfaceConfig) => void;
    selectedGroupKey: string | null;
    onSelectGroup: (groupKey: string | null) => void;
    selectedFieldId: string | null;
    onSelectField: (fieldId: string | null) => void;
    grainEntityType?: string;
    className?: string;
};

/** Shared identity Builder inspector — layout composer + evidence authoring for Household and Children. */
export default function IdentitySurfaceBuilderInspector({
    surfaceId,
    config,
    onChange,
    selectedGroupKey,
    onSelectGroup,
    selectedFieldId,
    onSelectField,
    grainEntityType = "opportunities",
    className,
}: IdentitySurfaceBuilderInspectorProps) {
    const composer = useFocusPanelComposer();
    const { tenantFieldDefinitions } = useTenantFieldDefinitions(grainEntityType);
    const [localPurpose, setLocalPurpose] = useState<IdentityConfigurationPurpose>("summary");

    const usesSharedPurpose = Boolean(composer?.enabled && composer.isComposingSurface(surfaceId));
    const activeConfigPurpose = usesSharedPurpose ? composer!.activeConfigPurpose : localPurpose;
    const setActiveConfigPurpose = (purpose: IdentityConfigurationPurpose) => {
        if (usesSharedPurpose) composer!.setActiveConfigPurpose(purpose);
        else setLocalPurpose(purpose);
    };

    const activeFieldTier = useMemo(() => {
        if (activeConfigPurpose === "evidence") return undefined;
        if (activeConfigPurpose === "context_facts") return "context_fact" as const;
        if (activeConfigPurpose === "details") return "details" as const;
        return "summary" as const;
    }, [activeConfigPurpose]);

    const builderNavigation = useMemo(() => {
        let state = initialIdentityBuilderNavigation(surfaceId, nestedSurfaceLabel(surfaceId));
        const sectionKey = resolveIdentityBuilderSectionKey(surfaceId, selectedGroupKey);
        if (!sectionKey) return state;
        const groupLabel = groupDefsFor(surfaceId).find((g) => g.key === sectionKey)?.label;
        return identityBuilderPushPurpose(state, {
            kind: "purpose",
            surfaceId,
            groupKey: sectionKey,
            purpose: activeConfigPurpose,
            groupLabel,
        });
    }, [activeConfigPurpose, selectedGroupKey, surfaceId]);

    const breadcrumbSegments = useMemo(
        () => buildIdentityBuilderBreadcrumb(builderNavigation),
        [builderNavigation],
    );

    const handleBreadcrumbNavigate = useCallback(
        (frameIndex: number) => {
            const next = navigateIdentityBuilderBreadcrumb(builderNavigation, frameIndex);
            const frame = next.stack[next.stack.length - 1];
            onSelectField(null);
            if (!frame || frame.kind === "surface") {
                onSelectGroup(null);
                setActiveConfigPurpose("summary");
                return;
            }
            onSelectGroup(frame.groupKey);
            setActiveConfigPurpose(frame.purpose);
        },
        [builderNavigation, onSelectField, onSelectGroup],
    );

    const handleIdentityBack = useCallback(() => {
        onSelectField(null);
        if (activeConfigPurpose !== "summary") {
            const order: IdentityConfigurationPurpose[] = [
                "summary",
                "context_facts",
                "details",
                "evidence",
            ];
            const idx = order.indexOf(activeConfigPurpose);
            if (idx > 0) {
                setActiveConfigPurpose(order[idx - 1]!);
                return;
            }
        }
        onSelectGroup(null);
        setActiveConfigPurpose("summary");
    }, [activeConfigPurpose, onSelectField, onSelectGroup]);

    const groupDefs = groupDefsFor(surfaceId);

    const placedByGroup = useMemo(() => {
        const map = new Map<string, ReturnType<typeof listNestedPlacedFields>>();
        const purpose =
            selectedGroupKey && activeConfigPurpose !== "evidence"
                ? (activeConfigPurpose as Exclude<IdentityConfigurationPurpose, "evidence">)
                : undefined;
        for (const def of groupDefs) {
            map.set(
                def.key,
                listNestedPlacedFields(surfaceId, def.key, config, tenantFieldDefinitions, purpose),
            );
        }
        return map;
    }, [activeConfigPurpose, config, groupDefs, selectedGroupKey, surfaceId, tenantFieldDefinitions]);

    const selectedPlacedField = useMemo(() => {
        if (!selectedFieldId) return null;
        for (const placed of placedByGroup.values()) {
            const found = placed.find((f) => f.id === selectedFieldId);
            if (found) return found;
        }
        return null;
    }, [placedByGroup, selectedFieldId]);

    const { sectionKey: effectiveSectionKey, groupConfig: effectiveGroupConfig, authoringGroupKey } = useMemo(
        () => resolveIdentityBuilderGroupConfig(config, surfaceId, selectedGroupKey),
        [config, selectedGroupKey, surfaceId],
    );

    const isHouseholdSurface = surfaceId === HOUSEHOLD_SURFACE_ID;

    if (selectedPlacedField) {
        return (
            <div className={clsx("process-config-setup-card p-4", className)} data-identity-surface-builder-inspector="field">
                <IdentityBuilderBreadcrumb
                    className="mb-3"
                    segments={breadcrumbSegments}
                    onNavigate={handleBreadcrumbNavigate}
                />
                <p className="config-typo-sublabel mb-3">
                    {groupDefs.find((g) => g.key === selectedPlacedField.groupKey)?.label}
                </p>
                {activeConfigPurpose !== "evidence" ?
                    <>
                        <div className="mb-2">
                            <p className="config-typo-sublabel mb-1">Disclosure layer</p>
                            <div className="flex flex-wrap gap-1">
                                {([
                                    ["summary", "Summary"],
                                    ["context_fact", "Context"],
                                    ["details", "Details"],
                                ] as const).map(([tier, label]) => (
                                    <button
                                        key={tier}
                                        type="button"
                                        className={clsx(
                                            "rounded-md border px-2 py-1 text-[11px]",
                                            identityTierContainingField(
                                                config,
                                                selectedPlacedField.groupKey,
                                                selectedPlacedField.fieldKey,
                                            ) === tier
                                                ? "border-alloy-pine/30 bg-alloy-pine/10 text-alloy-pine"
                                                : "border-alloy-stone/20 text-alloy-midnight/60",
                                        )}
                                        onClick={() =>
                                            onChange(
                                                moveFieldToIdentityTierInNestedGroup(
                                                    config,
                                                    selectedPlacedField.groupKey,
                                                    selectedPlacedField.fieldKey,
                                                    tier,
                                                ),
                                            )
                                        }
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="mb-3 flex gap-2">
                            <button
                                type="button"
                                className={clsx(
                                    "rounded-md border px-2 py-1 text-[11px]",
                                    fieldLayoutWidthForNestedGroup(
                                        config,
                                        selectedPlacedField.groupKey,
                                        selectedPlacedField.fieldKey,
                                        { purpose: activeConfigPurpose },
                                    ) !== "half"
                                        ? "border-alloy-pine/30 bg-alloy-pine/10 text-alloy-pine"
                                        : "border-alloy-stone/20 text-alloy-midnight/60",
                                )}
                                onClick={() =>
                                    onChange(
                                        setFieldLayoutWidthInNestedGroup(
                                            config,
                                            selectedPlacedField.groupKey,
                                            selectedPlacedField.fieldKey,
                                            "full",
                                            { purpose: activeConfigPurpose },
                                        ),
                                    )
                                }
                            >
                                Full width
                            </button>
                            <button
                                type="button"
                                className={clsx(
                                    "rounded-md border px-2 py-1 text-[11px]",
                                    fieldLayoutWidthForNestedGroup(
                                        config,
                                        selectedPlacedField.groupKey,
                                        selectedPlacedField.fieldKey,
                                        { purpose: activeConfigPurpose },
                                    ) === "half"
                                        ? "border-alloy-pine/30 bg-alloy-pine/10 text-alloy-pine"
                                        : "border-alloy-stone/20 text-alloy-midnight/60",
                                )}
                                onClick={() =>
                                    onChange(
                                        setFieldLayoutWidthInNestedGroup(
                                            config,
                                            selectedPlacedField.groupKey,
                                            selectedPlacedField.fieldKey,
                                            "half",
                                            { purpose: activeConfigPurpose },
                                        ),
                                    )
                                }
                            >
                                Half (50%)
                            </button>
                        </div>
                    </>
                :   null}
                <SurfaceFieldInspector
                    variant="nested"
                    field={toSurfaceComposerPlacedItemRef(selectedPlacedField)}
                    onChangeSection={() => {}}
                    onChangePlacement={() => {}}
                    onChangeLabel={() => {}}
                    onMoveEarlier={() => {
                        onChange(
                            moveFieldInNestedGroup(
                                config,
                                selectedPlacedField.groupKey,
                                selectedPlacedField.fieldKey,
                                -1,
                                { tier: activeFieldTier },
                            ),
                        );
                    }}
                    onMoveLater={() => {
                        onChange(
                            moveFieldInNestedGroup(
                                config,
                                selectedPlacedField.groupKey,
                                selectedPlacedField.fieldKey,
                                1,
                                { tier: activeFieldTier },
                            ),
                        );
                    }}
                    onRemove={() => {
                        onChange(
                            removeFieldFromNestedGroup(
                                config,
                                selectedPlacedField.groupKey,
                                selectedPlacedField.fieldKey,
                                { tier: activeFieldTier },
                            ),
                        );
                        onSelectField(null);
                    }}
                />
            </div>
        );
    }

    const inspectorMode = effectiveGroupConfig || isHouseholdSurface ? "group" : "sections";
    const householdTabs = isHouseholdSurface ? buildHouseholdRelationshipAuthoringTabs(config) : [];
    const activeHouseholdTab =
        householdTabs.find(
            (tab) =>
                tab.key === effectiveSectionKey
                || tab.instanceKey === effectiveSectionKey
                || (tab.kind === "parent_guardian_shared"
                    && (effectiveSectionKey === HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP
                        || effectiveSectionKey === "primary_contact"
                        || effectiveSectionKey === "other_parent_guardian"
                        || !effectiveSectionKey)),
        ) ?? householdTabs[0] ?? null;
    const layoutGroupKey = isHouseholdSurface && activeHouseholdTab
        ? authoringGroupKeyForTab(activeHouseholdTab.key)
        : authoringGroupKey ?? effectiveSectionKey ?? selectedGroupKey ?? "";
    const childrenHandoff = isHouseholdSurface && activeHouseholdTab?.kind === "children_handoff";

    const handleHouseholdTabSelect = (tab: HouseholdRelationshipAuthoringTab) => {
        onSelectGroup(selectionGroupKeyForTab(tab.key));
    };

    return (
        <>
            <div className={clsx("space-y-3", className)} data-identity-surface-builder-inspector={inspectorMode}>
                <IdentityBuilderBreadcrumb segments={breadcrumbSegments} onNavigate={handleBreadcrumbNavigate} />
                <IdentityBuilderPurposeNavigation
                    activePurpose={activeConfigPurpose}
                    onSelectPurpose={setActiveConfigPurpose}
                />
                {isHouseholdSurface ?
                    <RelationshipSectionsPanel
                        config={config}
                        onChange={onChange}
                        selectedInstanceKey={effectiveSectionKey ?? "primary_contact"}
                        onSelectInstance={(instanceKey) => onSelectGroup(instanceKey)}
                        defaultCollapsed
                        fieldAuthoringActive
                    />
                :   null}
                {isHouseholdSurface && activeHouseholdTab ?
                    <IdentityRelationshipSectionTabs
                        config={config}
                        activeTabKey={activeHouseholdTab.key}
                        onSelectTab={handleHouseholdTabSelect}
                    />
                :   null}
                {isHouseholdSurface && activeHouseholdTab && activeHouseholdTab.kind !== "children_handoff" ?
                    <IdentityRelationshipSectionInspector
                        surfaceId={surfaceId}
                        groupKey={activeHouseholdTab.instanceKey ?? activeHouseholdTab.key}
                        config={config}
                        onChange={onChange}
                        onOpenChildrenSurface={() => {
                            onSelectGroup("children");
                        }}
                    />
                :   null}
                {childrenHandoff ?
                    <div className="process-config-setup-card space-y-3 p-4" data-household-children-handoff="true">
                        <p className="config-typo-sublabel">
                            Children uses the Children surface presentation. Configure field layout on the Children surface.
                        </p>
                        <button
                            type="button"
                            className="text-[12px] font-medium text-alloy-pine hover:underline"
                            data-household-configure-children="true"
                            onClick={() => {
                                if (composer?.enabled) {
                                    composer.enterDrillIn("children", "children_surface");
                                    return;
                                }
                                onSelectGroup("children");
                            }}
                        >
                            Configure Children surface →
                        </button>
                    </div>
                :   null}
                {!isHouseholdSurface && !effectiveGroupConfig ?
                    <div className="process-config-setup-card p-4 text-center">
                        <p className="config-typo-sublabel">{SURFACE_COMPOSER_EMPTY_HINT}</p>
                    </div>
                :   null}
                {!childrenHandoff && layoutGroupKey ?
                    <p className="config-typo-sublabel" data-identity-inspector-canvas-hint="true">
                        Field layout is edited on the canvas composer for the selected section and disclosure level.
                    </p>
                :   null}
            </div>
        </>
    );
}
