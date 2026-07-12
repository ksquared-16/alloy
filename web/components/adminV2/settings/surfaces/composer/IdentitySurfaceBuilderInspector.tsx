"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";

import IdentityBuilderBreadcrumb from "@/components/adminV2/settings/surfaces/composer/IdentityBuilderBreadcrumb";
import IdentityBuilderDrillIn from "@/components/adminV2/settings/surfaces/composer/IdentityBuilderDrillIn";
import IdentityContextFactsPanel from "@/components/adminV2/settings/surfaces/composer/IdentityContextFactsPanel";
import IdentityEvidenceCollectionsPanel from "@/components/adminV2/settings/surfaces/composer/IdentityEvidenceCollectionsPanel";
import IdentityNestedFieldLayoutPanel from "@/components/adminV2/settings/surfaces/composer/IdentityNestedFieldLayoutPanel";
import SurfaceFieldInspector from "@/components/adminV2/settings/surfaces/composer/SurfaceFieldInspector";
import SurfaceItemLibraryPanel from "@/components/adminV2/settings/surfaces/composer/SurfaceItemLibraryPanel";
import {
    addFieldToNestedGroup,
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
    buildNestedSurfaceLibraryForGroup,
    nestedSurfaceLibraryCategories,
    type NestedSurfaceLibraryItem,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceBuilderLibrary";
import {
    listNestedPlacedFields,
    toSurfaceComposerPlacedItemRef,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceComposerModel";
import { useTenantFieldDefinitions } from "@/lib/adminV2/settings/surfaces/useTenantFieldDefinitions";
import { SURFACE_COMPOSER_EMPTY_HINT } from "@/lib/adminV2/settings/surfaces/surfaceComposer";
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
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [libraryGroupKey, setLibraryGroupKey] = useState<string | null>(null);

    const usesSharedPurpose = Boolean(composer?.enabled && composer.isComposingSurface(surfaceId));
    const activeConfigPurpose = usesSharedPurpose ? composer!.activeConfigPurpose : localPurpose;
    const setActiveConfigPurpose = (purpose: IdentityConfigurationPurpose) => {
        if (usesSharedPurpose) composer!.setActiveConfigPurpose(purpose);
        else setLocalPurpose(purpose);
    };

    useEffect(() => {
        if (usesSharedPurpose) return;
        setLocalPurpose("summary");
    }, [selectedGroupKey, usesSharedPurpose]);

    const activeFieldTier = useMemo(() => {
        if (activeConfigPurpose === "evidence") return undefined;
        if (activeConfigPurpose === "context_facts") return "context_fact" as const;
        if (activeConfigPurpose === "details") return "details" as const;
        return "summary" as const;
    }, [activeConfigPurpose]);

    const builderNavigation = useMemo(() => {
        let state = initialIdentityBuilderNavigation(surfaceId, nestedSurfaceLabel(surfaceId));
        if (!selectedGroupKey) return state;
        const groupLabel = groupDefsFor(surfaceId).find((g) => g.key === selectedGroupKey)?.label;
        return identityBuilderPushPurpose(state, {
            kind: "purpose",
            surfaceId,
            groupKey: selectedGroupKey,
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

    const selectedGroupConfig = useMemo(
        () => (selectedGroupKey ? config.groups.find((g) => g.key === selectedGroupKey) ?? null : null),
        [config.groups, selectedGroupKey],
    );

    const libraryItems: NestedSurfaceLibraryItem[] = useMemo(() => {
        if (!libraryGroupKey) return [];
        return buildNestedSurfaceLibraryForGroup(
            surfaceId,
            libraryGroupKey,
            config,
            tenantFieldDefinitions,
        );
    }, [config, libraryGroupKey, surfaceId, tenantFieldDefinitions]);

    const libraryCategories = useMemo(
        () => nestedSurfaceLibraryCategories(libraryItems),
        [libraryItems],
    );

    const openLibrary = useCallback(
        (groupKey: string) => {
            setLibraryGroupKey(groupKey);
            onSelectGroup(groupKey);
            onSelectField(null);
            setLibraryOpen(true);
        },
        [onSelectField, onSelectGroup],
    );

    const handleLibraryPick = useCallback(
        (item: NestedSurfaceLibraryItem) => {
            if (item.kind !== "field") return;
            const tier =
                activeConfigPurpose !== "evidence"
                    ? activeConfigPurpose === "context_facts"
                        ? "context_fact"
                        : activeConfigPurpose
                    : "summary";
            onChange(addFieldToNestedGroup(config, item.groupKey, item.fieldKey, { tier }));
            onSelectGroup(item.groupKey);
            onSelectField(`${item.groupKey}:${item.fieldKey}`);
            setLibraryOpen(false);
            setLibraryGroupKey(null);
        },
        [activeConfigPurpose, config, onChange, onSelectField, onSelectGroup],
    );

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
                                    fieldLayoutWidthForNestedGroup(config, selectedPlacedField.groupKey, selectedPlacedField.fieldKey) !== "half"
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
                                    fieldLayoutWidthForNestedGroup(config, selectedPlacedField.groupKey, selectedPlacedField.fieldKey) === "half"
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

    if (!selectedGroupKey || !selectedGroupConfig) {
        return (
            <div
                className={clsx("process-config-setup-card flex h-full items-center justify-center p-6 text-center", className)}
                data-identity-surface-builder-inspector="empty"
            >
                <p className="config-typo-sublabel">{SURFACE_COMPOSER_EMPTY_HINT}</p>
            </div>
        );
    }

    return (
        <>
            <div className={clsx("space-y-3", className)} data-identity-surface-builder-inspector="group">
                <IdentityBuilderBreadcrumb segments={breadcrumbSegments} onNavigate={handleBreadcrumbNavigate} />
                <IdentityBuilderDrillIn
                    activePurpose={activeConfigPurpose}
                    onSelectPurpose={setActiveConfigPurpose}
                    onBack={handleIdentityBack}
                    groupLabel={groupDefs.find((g) => g.key === selectedGroupKey)?.label ?? selectedGroupKey}
                />
                {activeConfigPurpose === "summary" ?
                    <IdentityNestedFieldLayoutPanel
                        surfaceId={surfaceId}
                        groupKey={selectedGroupKey}
                        config={config}
                        purpose="summary"
                        onChange={onChange}
                        onOpenLibrary={() => openLibrary(selectedGroupKey)}
                        onSelectField={(fieldKey) => onSelectField(`${selectedGroupKey}:${fieldKey}`)}
                    />
                :   null}
                {activeConfigPurpose === "context_facts" ?
                    <IdentityContextFactsPanel
                        surfaceId={surfaceId}
                        groupKey={selectedGroupKey}
                        config={config}
                        onChange={onChange}
                        onOpenLibrary={() => openLibrary(selectedGroupKey)}
                        onSelectField={(fieldKey) => onSelectField(`${selectedGroupKey}:${fieldKey}`)}
                    />
                :   null}
                {activeConfigPurpose === "details" ?
                    <IdentityNestedFieldLayoutPanel
                        surfaceId={surfaceId}
                        groupKey={selectedGroupKey}
                        config={config}
                        purpose="details"
                        onChange={onChange}
                        onOpenLibrary={() => openLibrary(selectedGroupKey)}
                        onSelectField={(fieldKey) => onSelectField(`${selectedGroupKey}:${fieldKey}`)}
                    />
                :   null}
                {activeConfigPurpose === "evidence" ?
                    <IdentityEvidenceCollectionsPanel
                        surfaceId={surfaceId}
                        groupKey={selectedGroupKey}
                        config={config}
                        onChange={onChange}
                    />
                :   null}
            </div>

            <SurfaceItemLibraryPanel<NestedSurfaceLibraryItem>
                open={libraryOpen}
                categories={libraryCategories}
                sectionLabel="Add to group"
                subtitle="Choose a field to place in this evidence group."
                itemKey={(item) => item.fieldKey}
                itemLabel={(item) => item.label}
                itemMeta={(item) => (item.isSystemField ? null : "Custom")}
                onPick={handleLibraryPick}
                onClose={() => {
                    setLibraryOpen(false);
                    setLibraryGroupKey(null);
                }}
            />
        </>
    );
}
