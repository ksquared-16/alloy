"use client";

import clsx from "clsx";
/**
 * Nested Surface Composer — same interaction model as Queue Row and Focus Panel.
 *
 * click group → library → place → select → inspector → publish → runtime
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { ConfigurationPrimaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import NestedSurfaceRuntimeCanvas from "@/components/adminV2/settings/surfaces/composer/NestedSurfaceRuntimeCanvas";
import NestedSurfaceGroupInspector from "@/components/adminV2/settings/surfaces/composer/NestedSurfaceGroupInspector";
import SurfaceFieldInspector from "@/components/adminV2/settings/surfaces/composer/SurfaceFieldInspector";
import SurfaceItemLibraryPanel from "@/components/adminV2/settings/surfaces/composer/SurfaceItemLibraryPanel";
import { SurfaceBuilderInspectorRail } from "@/components/adminV2/settings/surfaces/SurfaceBuilderInspectorRail";
import { useTenantFieldDefinitions } from "@/lib/adminV2/settings/surfaces/useTenantFieldDefinitions";
import {
    addFieldToNestedGroup,
    defaultNestedSurfaceConfig,
    groupDefsFor,
    HOUSEHOLD_SURFACE_ID,
    CHILDREN_SURFACE_ID,
    moveFieldInNestedGroup,
    nestedSurfaceLabel,
    removeFieldFromNestedGroup,
    setFieldLayoutWidthInNestedGroup,
    fieldLayoutWidthForNestedGroup,
    identityTierContainingField,
    moveFieldToIdentityTierInNestedGroup,
    type NestedSurfaceConfig,
    type NestedSurfaceGroupConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    buildIdentityBuilderBreadcrumb,
    initialIdentityBuilderNavigation,
    identityBuilderPushPurpose,
    navigateIdentityBuilderBreadcrumb,
    type IdentityConfigurationPurpose,
} from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import IdentityBuilderDrillIn from "@/components/adminV2/settings/surfaces/composer/IdentityBuilderDrillIn";
import IdentityBuilderBreadcrumb from "@/components/adminV2/settings/surfaces/composer/IdentityBuilderBreadcrumb";
import IdentityContextFactsPanel from "@/components/adminV2/settings/surfaces/composer/IdentityContextFactsPanel";
import IdentityEvidenceCollectionsPanel from "@/components/adminV2/settings/surfaces/composer/IdentityEvidenceCollectionsPanel";
import IdentityNestedFieldLayoutPanel from "@/components/adminV2/settings/surfaces/composer/IdentityNestedFieldLayoutPanel";
import {
    HOUSEHOLD_CONTACT_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceDefinitionModel";
import {
    loadNestedSurfaceConfig,
    saveNestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceConfigService";
import {
    buildNestedSurfaceLibraryForGroup,
    nestedSurfaceLibraryCategories,
    type NestedSurfaceLibraryItem,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceBuilderLibrary";
import {
    listNestedPlacedFields,
    toSurfaceComposerPlacedItemRef,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceComposerModel";
import {
    SURFACE_COMPOSER_CANVAS_ATTR,
    SURFACE_COMPOSER_EMPTY_HINT,
    SURFACE_COMPOSER_INSPECTOR_ATTR,
} from "@/lib/adminV2/settings/surfaces/surfaceComposer";

type Props = {
    surfaceId: string;
    grainEntityType?: string;
    parentLabel?: string;
    cardLabel?: string;
    onBack?: () => void;
    onDrillInSurface?: (surfaceId: string) => void;
    /** Contact surface config when editing household (for live preview). */
    contactConfig?: NestedSurfaceConfig | null;
};

export default function NestedSurfaceEditor({
    surfaceId,
    grainEntityType = "opportunities",
    parentLabel = "Enrollment Focus Panel",
    cardLabel,
    onBack,
    onDrillInSurface,
    contactConfig,
}: Props) {
    const { tenantFieldDefinitions } = useTenantFieldDefinitions(grainEntityType);
    const [config, setConfig] = useState<NestedSurfaceConfig>(() => defaultNestedSurfaceConfig(surfaceId));
    const [loading, setLoading] = useState(true);
    const [dirty, setDirty] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [publishedAt, setPublishedAt] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [libraryGroupKey, setLibraryGroupKey] = useState<string | null>(null);
    const [activeConfigPurpose, setActiveConfigPurpose] = useState<IdentityConfigurationPurpose>("summary");

    const isIdentitySurface = surfaceId === HOUSEHOLD_SURFACE_ID || surfaceId === CHILDREN_SURFACE_ID;

    const activeFieldTier = useMemo(() => {
        if (!isIdentitySurface || activeConfigPurpose === "evidence") return undefined;
        if (activeConfigPurpose === "context_facts") return "context_fact" as const;
        if (activeConfigPurpose === "details") return "details" as const;
        return "summary" as const;
    }, [activeConfigPurpose, isIdentitySurface]);

    const builderNavigation = useMemo(() => {
        let state = initialIdentityBuilderNavigation(surfaceId, nestedSurfaceLabel(surfaceId));
        if (!isIdentitySurface || !selectedGroupKey) return state;
        const groupLabel = groupDefsFor(surfaceId).find((g) => g.key === selectedGroupKey)?.label;
        return identityBuilderPushPurpose(state, {
            kind: "purpose",
            surfaceId,
            groupKey: selectedGroupKey,
            purpose: activeConfigPurpose,
            groupLabel,
        });
    }, [activeConfigPurpose, isIdentitySurface, selectedGroupKey, surfaceId]);

    const breadcrumbSegments = useMemo(
        () => (isIdentitySurface ? buildIdentityBuilderBreadcrumb(builderNavigation) : []),
        [builderNavigation, isIdentitySurface],
    );

    const handleBreadcrumbNavigate = useCallback(
        (frameIndex: number) => {
            const next = navigateIdentityBuilderBreadcrumb(builderNavigation, frameIndex);
            const frame = next.stack[next.stack.length - 1];
            setSelectedFieldId(null);
            if (!frame || frame.kind === "surface") {
                setSelectedGroupKey(null);
                setActiveConfigPurpose("summary");
                return;
            }
            setSelectedGroupKey(frame.groupKey);
            setActiveConfigPurpose(frame.purpose);
        },
        [builderNavigation],
    );

    const handleIdentityBack = useCallback(() => {
        setSelectedFieldId(null);
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
        setSelectedGroupKey(null);
        setActiveConfigPurpose("summary");
    }, [activeConfigPurpose]);

    const [contactConfigState, setContactConfigState] = useState<NestedSurfaceConfig | null>(null);

    useEffect(() => {
        if (surfaceId !== HOUSEHOLD_SURFACE_ID) {
            setContactConfigState(null);
            return;
        }
        let cancelled = false;
        loadNestedSurfaceConfig(HOUSEHOLD_CONTACT_SURFACE_ID)
            .then((c) => {
                if (!cancelled) setContactConfigState(c);
            })
            .catch(() => {
                if (!cancelled) setContactConfigState(null);
            });
        return () => {
            cancelled = true;
        };
    }, [surfaceId]);

    const effectiveContactConfig = contactConfig ?? contactConfigState;

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        loadNestedSurfaceConfig(surfaceId)
            .then((c) => {
                if (!cancelled) {
                    setConfig(c);
                    setDirty(false);
                }
            })
            .catch(() => {
                if (!cancelled) setConfig(defaultNestedSurfaceConfig(surfaceId));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [surfaceId]);

    const mutate = useCallback((next: NestedSurfaceConfig) => {
        setConfig(next);
        setDirty(true);
        setPublishedAt(false);
    }, []);

    const groupDefs = groupDefsFor(surfaceId);
    const surfaceTitle = nestedSurfaceLabel(surfaceId);

    const placedByGroup = useMemo(() => {
        const map = new Map<string, ReturnType<typeof listNestedPlacedFields>>();
        const purpose =
            isIdentitySurface && selectedGroupKey && activeConfigPurpose !== "evidence"
                ? (activeConfigPurpose as Exclude<IdentityConfigurationPurpose, "evidence">)
                : undefined;
        for (const def of groupDefs) {
            map.set(
                def.key,
                listNestedPlacedFields(surfaceId, def.key, config, tenantFieldDefinitions, purpose),
            );
        }
        return map;
    }, [activeConfigPurpose, config, groupDefs, isIdentitySurface, selectedGroupKey, surfaceId, tenantFieldDefinitions]);

    const selectedPlacedField = useMemo(() => {
        if (!selectedFieldId) return null;
        for (const placed of placedByGroup.values()) {
            const found = placed.find((f) => f.id === selectedFieldId);
            if (found) return found;
        }
        return null;
    }, [placedByGroup, selectedFieldId]);

    const selectedGroupConfig = useMemo((): NestedSurfaceGroupConfig | null => {
        if (!selectedGroupKey) return null;
        return config.groups.find((g) => g.key === selectedGroupKey) ?? null;
    }, [config.groups, selectedGroupKey]);

    function patchGroupConfig(groupKey: string, next: NestedSurfaceGroupConfig) {
        mutate({
            ...config,
            groups: config.groups.map((g) => (g.key === groupKey ? next : g)),
        });
    }

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

    const openLibrary = useCallback((groupKey: string) => {
        setLibraryGroupKey(groupKey);
        setSelectedGroupKey(groupKey);
        setSelectedFieldId(null);
        setLibraryOpen(true);
    }, []);

    const handleLibraryPick = useCallback(
        (item: NestedSurfaceLibraryItem) => {
            if (item.kind !== "field") return;
            const tier =
                isIdentitySurface && activeConfigPurpose !== "evidence"
                    ? activeConfigPurpose === "context_facts"
                        ? "context_fact"
                        : activeConfigPurpose
                    : "summary";
            mutate(addFieldToNestedGroup(config, item.groupKey, item.fieldKey, { tier }));
            setSelectedGroupKey(item.groupKey);
            setSelectedFieldId(`${item.groupKey}:${item.fieldKey}`);
            setLibraryOpen(false);
            setLibraryGroupKey(null);
        },
        [activeConfigPurpose, config, isIdentitySurface, mutate],
    );

    async function handlePublish() {
        setPublishing(true);
        setError(null);
        try {
            await saveNestedSurfaceConfig(surfaceId, config);
            setDirty(false);
            setPublishedAt(true);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setPublishing(false);
        }
    }

    const statusLabel = loading
        ? "Loading…"
        : dirty
          ? "Unsaved changes"
          : publishedAt
            ? "Saved to draft"
            : "No changes";

    return (
        <div className="flex h-full min-h-0 flex-col gap-3" data-nested-surface-editor={surfaceId}>
            <div
                className="process-config-workspace-toolbar flex flex-wrap items-center justify-between gap-3"
                data-testid="surface-publish-toolbar"
            >
                <div className="min-w-0">
                    <nav className="mb-1 flex flex-wrap items-center gap-1 text-[11px] text-alloy-midnight/45" data-nested-surface-breadcrumb="true">
                        {onBack ?
                            <button type="button" onClick={onBack} className="font-medium text-alloy-pine hover:underline" data-nested-surface-back>
                                ← {parentLabel}
                            </button>
                        :   null}
                        {cardLabel ?
                            <>
                                <span aria-hidden>/</span>
                                <span>{cardLabel}</span>
                            </>
                        :   null}
                        <span aria-hidden>/</span>
                        <span className="text-alloy-midnight/70">{surfaceTitle}</span>
                    </nav>
                    <div className="flex items-baseline gap-2">
                        <span className="config-typo-workspace-title">{surfaceTitle}</span>
                        <span
                            data-testid="surface-publish-status"
                            data-surface-dirty={dirty ? "true" : "false"}
                            className={[
                                "config-typo-sublabel",
                                dirty ? "text-amber-800" : publishedAt ? "text-alloy-pine" : "",
                            ].join(" ")}
                        >
                            {statusLabel}
                        </span>
                    </div>
                </div>
                <ConfigurationPrimaryButton
                    data-testid="surface-publish"
                    data-nested-surface-save
                    onClick={handlePublish}
                    disabled={!dirty || publishing || loading}
                >
                    {publishing ? "Saving…" : "Save draft"}
                </ConfigurationPrimaryButton>
            </div>

            {error ?
                <p className="config-typo-sublabel text-alloy-ember" data-testid="surface-publish-note">{error}</p>
            :   null}

            {!selectedFieldId && !libraryOpen ?
                <p className="text-[12px] text-alloy-midnight/45" data-nested-composer-hint="true">
                    {SURFACE_COMPOSER_EMPTY_HINT}
                </p>
            :   null}

            {loading ?
                <div className="h-24 animate-pulse rounded-xl border border-alloy-stone/12 bg-alloy-stone/5" />
            :   <div className="flex min-h-0 flex-1 gap-4">
                    <div className="min-w-0 flex-1 overflow-auto">
                        <NestedSurfaceRuntimeCanvas
                            surfaceId={surfaceId}
                            config={config}
                            contactConfig={effectiveContactConfig}
                            selectedGroupKey={selectedGroupKey}
                            onSelectGroup={(key) => {
                                setSelectedGroupKey(key);
                                setSelectedFieldId(null);
                                setActiveConfigPurpose("summary");
                            }}
                            onDrillInSurface={onDrillInSurface}
                        />
                    </div>

                    <SurfaceBuilderInspectorRail
                        widthClassName="w-[360px]"
                        testId="nested-surface-inspector-rail"
                        aria-label="Nested Surface configuration"
                    >
                    <div
                        className="h-full overflow-y-auto"
                        data-surface-inspector="true"
                        {...{ [SURFACE_COMPOSER_INSPECTOR_ATTR]: true }}
                    >
                        {selectedPlacedField ?
                            <div className="process-config-setup-card p-4">
                                {isIdentitySurface ?
                                    <IdentityBuilderBreadcrumb
                                        className="mb-3"
                                        segments={breadcrumbSegments}
                                        onNavigate={handleBreadcrumbNavigate}
                                    />
                                :   null}
                                <p className="config-typo-sublabel mb-3">
                                    {groupDefs.find((g) => g.key === selectedPlacedField.groupKey)?.label}
                                </p>
                                {isIdentitySurface && activeConfigPurpose !== "evidence" ?
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
                                                        mutate(
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
                                                    {
                                                        purpose:
                                                            activeConfigPurpose === "evidence"
                                                                ? "summary"
                                                                : activeConfigPurpose,
                                                    },
                                                ) !== "half"
                                                    ? "border-alloy-pine/30 bg-alloy-pine/10 text-alloy-pine"
                                                    : "border-alloy-stone/20 text-alloy-midnight/60",
                                            )}
                                            onClick={() =>
                                                mutate(
                                                    setFieldLayoutWidthInNestedGroup(
                                                        config,
                                                        selectedPlacedField.groupKey,
                                                        selectedPlacedField.fieldKey,
                                                        "full",
                                                        {
                                                            purpose:
                                                                activeConfigPurpose === "evidence"
                                                                    ? "summary"
                                                                    : activeConfigPurpose,
                                                        },
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
                                                    {
                                                        purpose:
                                                            activeConfigPurpose === "evidence"
                                                                ? "summary"
                                                                : activeConfigPurpose,
                                                    },
                                                ) === "half"
                                                    ? "border-alloy-pine/30 bg-alloy-pine/10 text-alloy-pine"
                                                    : "border-alloy-stone/20 text-alloy-midnight/60",
                                            )}
                                            onClick={() =>
                                                mutate(
                                                    setFieldLayoutWidthInNestedGroup(
                                                        config,
                                                        selectedPlacedField.groupKey,
                                                        selectedPlacedField.fieldKey,
                                                        "half",
                                                        {
                                                            purpose:
                                                                activeConfigPurpose === "evidence"
                                                                    ? "summary"
                                                                    : activeConfigPurpose,
                                                        },
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
                                        mutate(
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
                                        mutate(
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
                                        mutate(
                                            removeFieldFromNestedGroup(
                                                config,
                                                selectedPlacedField.groupKey,
                                                selectedPlacedField.fieldKey,
                                                { tier: activeFieldTier },
                                            ),
                                        );
                                        setSelectedFieldId(null);
                                    }}
                                />
                            </div>
                        : selectedGroupKey && selectedGroupConfig ?
                            <div className="space-y-3">
                                {isIdentitySurface ?
                                    <>
                                        <IdentityBuilderBreadcrumb
                                            segments={breadcrumbSegments}
                                            onNavigate={handleBreadcrumbNavigate}
                                        />
                                        <IdentityBuilderDrillIn
                                            activePurpose={activeConfigPurpose}
                                            onSelectPurpose={setActiveConfigPurpose}
                                            onBack={handleIdentityBack}
                                            groupLabel={
                                                groupDefs.find((g) => g.key === selectedGroupKey)?.label
                                                ?? selectedGroupKey
                                            }
                                        />
                                    </>
                                :   null}
                                {isIdentitySurface && activeConfigPurpose === "summary" ?
                                    <IdentityNestedFieldLayoutPanel
                                        surfaceId={surfaceId}
                                        groupKey={selectedGroupKey}
                                        config={config}
                                        purpose="summary"
                                        onChange={mutate}
                                        onOpenLibrary={() => openLibrary(selectedGroupKey)}
                                        onSelectField={(fieldKey) =>
                                            setSelectedFieldId(`${selectedGroupKey}:${fieldKey}`)
                                        }
                                    />
                                :   null}
                                {isIdentitySurface && activeConfigPurpose === "context_facts" ?
                                    <IdentityContextFactsPanel
                                        surfaceId={surfaceId}
                                        groupKey={selectedGroupKey}
                                        config={config}
                                        onChange={mutate}
                                        onOpenLibrary={() => openLibrary(selectedGroupKey)}
                                        onSelectField={(fieldKey) =>
                                            setSelectedFieldId(`${selectedGroupKey}:${fieldKey}`)
                                        }
                                    />
                                :   null}
                                {isIdentitySurface && activeConfigPurpose === "details" ?
                                    <IdentityNestedFieldLayoutPanel
                                        surfaceId={surfaceId}
                                        groupKey={selectedGroupKey}
                                        config={config}
                                        purpose="details"
                                        onChange={mutate}
                                        onOpenLibrary={() => openLibrary(selectedGroupKey)}
                                        onSelectField={(fieldKey) =>
                                            setSelectedFieldId(`${selectedGroupKey}:${fieldKey}`)
                                        }
                                    />
                                :   null}
                                {isIdentitySurface && activeConfigPurpose === "evidence" ?
                                    <IdentityEvidenceCollectionsPanel
                                        surfaceId={surfaceId}
                                        groupKey={selectedGroupKey}
                                        config={config}
                                        onChange={mutate}
                                    />
                                :   null}
                                {!isIdentitySurface ?
                                    <NestedSurfaceGroupInspector
                                        surfaceId={surfaceId}
                                        groupDef={groupDefs.find((g) => g.key === selectedGroupKey)!}
                                        groupConfig={selectedGroupConfig}
                                        onChange={(next) => patchGroupConfig(selectedGroupKey, next)}
                                        onOpenLibrary={() => openLibrary(selectedGroupKey)}
                                    />
                                :   null}
                            </div>
                        :   <div className="process-config-setup-card flex h-full items-center justify-center p-6 text-center" data-surface-inspector-empty="true">
                                <p className="config-typo-sublabel">{SURFACE_COMPOSER_EMPTY_HINT}</p>
                            </div>
                        }
                    </div>
                    </SurfaceBuilderInspectorRail>
                </div>
            }

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
        </div>
    );
}
