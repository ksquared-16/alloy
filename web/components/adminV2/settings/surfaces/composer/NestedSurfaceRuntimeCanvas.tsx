"use client";

/**
 * Nested Surface runtime canvas — renders the operator drill-in UI in the composer.
 *
 * The admin edits the same surface shape the operator sees at runtime (expanded
 * household detail, children roster, billing configuration, contact edit).
 */

import { useMemo } from "react";

import HouseholdCard from "@/components/admin/focusPanel/cards/HouseholdCard";
import ChildrenCard from "@/components/admin/focusPanel/cards/ChildrenCard";
import BillingPreviewCard from "@/components/admin/focusPanel/cards/BillingPreviewCard";
import HouseholdContactEditPreview from "@/components/adminV2/settings/surfaces/composer/HouseholdContactEditPreview";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import type { HouseholdEvidenceGroupKey } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import {
    householdDisplayViewFromConfig,
    readHouseholdContactNestedConfigFromDoc,
} from "@/lib/adminV2/runtime/focusPanel/household/householdNestedSurfaceRuntime";
import {
    childFocusViewFromConfig,
} from "@/lib/adminV2/runtime/focusPanel/children/childIdentityFieldRuntime";
import {
    CHILDREN_SURFACE_ID,
    FINANCIAL_CONFIG_SURFACE_ID,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    CHILD_SURFACE_ID,
    HOUSEHOLD_CONTACT_SURFACE_ID,
    HOUSEHOLD_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceDefinitionModel";
import { SURFACE_COMPOSER_CANVAS_ATTR } from "@/lib/adminV2/settings/surfaces/surfaceComposer";

export type NestedSurfaceRuntimeCanvasProps = {
    surfaceId: string;
    config: NestedSurfaceConfig;
    contactConfig?: NestedSurfaceConfig | null;
    selectedGroupKey?: string | null;
    onSelectGroup?: (groupKey: string) => void;
    onSelectContact?: (personId: string) => void;
    onDrillInSurface?: (surfaceId: string) => void;
};

export default function NestedSurfaceRuntimeCanvas({
    surfaceId,
    config,
    contactConfig,
    selectedGroupKey,
    onSelectGroup,
    onSelectContact,
    onDrillInSurface,
}: NestedSurfaceRuntimeCanvasProps) {
    const { context, cards } = useMemo(() => {
        const { vm, record } = buildDemoFocusPanelSummaryViewModel();
        const ctx = buildOperationalContext({
            subjectId: String(vm.entity.id),
            title: vm.header.title,
            subjectVm: vm,
            truth: record,
            perspective: null,
            statusLabel: "Tour scheduled",
            canMutate: false,
        });
        const presentation = deriveOpportunityFocusPanelPresentation({
            mode: "summary",
            displayVm: vm,
            record,
            title: vm.header.title,
            perspective: null,
            statusLabel: "Tour scheduled",
        });
        return { context: ctx, cards: presentation.cards };
    }, []);

    const householdModel = cards.get("household")!;
    const childrenModel = cards.get("children")!;
    const billingModel = cards.get("billing_preview")!;

    const householdDisplayView = useMemo(
        () => householdDisplayViewFromConfig(config, contactConfig ?? null),
        [config, contactConfig],
    );

    if (surfaceId === HOUSEHOLD_SURFACE_ID) {
        return (
            <div
                className="mx-auto max-w-lg"
                data-nested-runtime-canvas={surfaceId}
                data-surface-canvas-builder="true"
                {...{ [SURFACE_COMPOSER_CANVAS_ATTR]: "nested-runtime" }}
            >
                <div className="rounded-xl border border-alloy-stone/15 bg-alloy-stone/[0.03] p-3 shadow-sm">
                    <HouseholdCard
                        model={householdModel}
                        context={context}
                        composerPreview={{
                            perspective: selectedGroupKey ? "focused" : "expanded",
                            focusedGroup: (selectedGroupKey as HouseholdEvidenceGroupKey | null) ?? null,
                            displayView: householdDisplayView,
                            onSelectGroup: (key: HouseholdEvidenceGroupKey) => onSelectGroup?.(key),
                            onSelectContact: (personId: string) => {
                                onSelectContact?.(personId);
                                onDrillInSurface?.(HOUSEHOLD_CONTACT_SURFACE_ID);
                            },
                            onSelectChild: () => onDrillInSurface?.(CHILDREN_SURFACE_ID),
                        }}
                    />
                </div>
            </div>
        );
    }

    if (surfaceId === HOUSEHOLD_CONTACT_SURFACE_ID) {
        return (
            <div
                className="mx-auto max-w-md"
                data-nested-runtime-canvas={surfaceId}
                data-surface-canvas-builder="true"
                {...{ [SURFACE_COMPOSER_CANVAS_ATTR]: "nested-runtime" }}
            >
                <HouseholdContactEditPreview
                    config={config}
                    selectedGroupKey={selectedGroupKey}
                    onSelectGroup={onSelectGroup}
                />
            </div>
        );
    }

    if (surfaceId === CHILDREN_SURFACE_ID) {
        return (
            <div
                className="mx-auto max-w-lg"
                data-nested-runtime-canvas={surfaceId}
                data-surface-canvas-builder="true"
                {...{ [SURFACE_COMPOSER_CANVAS_ATTR]: "nested-runtime" }}
            >
                <div className="rounded-xl border border-alloy-stone/15 bg-alloy-stone/[0.03] p-3 shadow-sm">
                    <ChildrenCard
                        model={childrenModel}
                        context={context}
                        composerPreview={{
                            perspective: "roster",
                            onSelectChild: () => onDrillInSurface?.(CHILD_SURFACE_ID),
                        }}
                    />
                </div>
            </div>
        );
    }

    if (surfaceId === CHILD_SURFACE_ID) {
        const childFocusView = childFocusViewFromConfig(config);
        return (
            <div
                className="mx-auto max-w-lg"
                data-nested-runtime-canvas={surfaceId}
                data-surface-canvas-builder="true"
                {...{ [SURFACE_COMPOSER_CANVAS_ATTR]: "nested-runtime" }}
            >
                <div className="rounded-xl border border-alloy-stone/15 bg-alloy-stone/[0.03] p-3 shadow-sm">
                    <ChildrenCard
                        model={childrenModel}
                        context={context}
                        composerPreview={{
                            perspective: "child_focus",
                            focusedChildId: "demo-c-1",
                            childFocusView,
                        }}
                    />
                </div>
            </div>
        );
    }

    if (surfaceId === FINANCIAL_CONFIG_SURFACE_ID) {
        return (
            <div
                className="mx-auto max-w-lg"
                data-nested-runtime-canvas={surfaceId}
                data-surface-canvas-builder="true"
                {...{ [SURFACE_COMPOSER_CANVAS_ATTR]: "nested-runtime" }}
            >
                <div className="rounded-xl border border-alloy-stone/15 bg-alloy-stone/[0.03] p-3 shadow-sm">
                    <BillingPreviewCard
                        model={billingModel}
                        context={context}
                        composerPreview={{ perspective: "expanded" }}
                    />
                </div>
            </div>
        );
    }

    return (
        <p className="config-typo-sublabel" data-nested-runtime-canvas-unconfigured={surfaceId}>
            Runtime preview for this surface is not wired yet.
        </p>
    );
}
