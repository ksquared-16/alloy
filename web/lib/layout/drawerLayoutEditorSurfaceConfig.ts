/**
 * Experience Builder — drawer surface configuration (opportunity, person, child).
 */

import { buildChildDrawerDefaultDoc } from "@/lib/layout/defaultChildLayouts";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import type { LayoutCatalogGroup } from "@/lib/layout/fieldCatalog";
import { buildChildDrawerEditorFieldPickerGroups } from "@/lib/layout/childDrawerLayoutEditorFieldCatalog";
import { buildOpportunityDrawerEditorFieldPickerGroups } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import { buildPersonDrawerEditorFieldPickerGroups } from "@/lib/layout/personDrawerLayoutEditorFieldCatalog";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    childOverviewVisualEditorCompositionHints,
    partitionChildOverviewBodySections,
} from "@/lib/layout/runtime/childOverviewComposition";
import {
    leadOverviewVisualEditorCompositionHints,
    partitionLeadOverviewBodySections,
} from "@/lib/layout/runtime/leadOverviewComposition";
import {
    personOverviewVisualEditorCompositionHints,
    partitionPersonOverviewBodySections,
} from "@/lib/layout/runtime/personOverviewComposition";
import type { LayoutRuntimeCompositionHints } from "@/lib/layout/runtime/layoutRuntimeCompositionContext";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import { buildProofChildRecord } from "@/lib/layout/runtime/buildProofChildRecord";
import { buildProofPersonRecord } from "@/lib/layout/runtime/buildProofPersonRecord";
import { LAYOUT_DRAWER_PREVIEW_RECORD } from "@/lib/layout/runtime/layoutDrawerPreviewRecord";
import {
    CHILD_DRAWER_SECTION_DEFAULT_ZONE,
    CHILD_DRAWER_SECTION_KEYS,
    OPPORTUNITY_DRAWER_SECTION_DEFAULT_ZONE,
    OPPORTUNITY_DRAWER_SECTION_KEYS,
    PERSON_DRAWER_SECTION_DEFAULT_ZONE,
    PERSON_DRAWER_SECTION_KEYS,
    isAllowedDrawerSurfaceFieldRefKey,
    resolveSurfaceLayoutKeyFromDoc,
    type DrawerSurfaceLayoutZone,
    type SurfaceLayoutKey,
} from "@/lib/layout/surfaceLayoutRegistry";

export type DrawerLayoutEditorSurfaceKey = Extract<
    SurfaceLayoutKey,
    "opportunity_drawer" | "person_drawer" | "child_drawer"
>;

export type DrawerLayoutEditorSurfaceConfig = {
    surfaceKey: DrawerLayoutEditorSurfaceKey;
    label: string;
    defaultDoc: () => LayoutDoc;
    sectionKeys: readonly string[];
    sectionDefaultZone: Readonly<Record<string, DrawerSurfaceLayoutZone>>;
    shellPartitionKind: "opportunity" | "person" | "child";
    buildFieldPickerGroups: () => LayoutCatalogGroup[];
    visualEditorCompositionHints: (
        overrides?: Partial<LayoutRuntimeCompositionHints>,
    ) => LayoutRuntimeCompositionHints;
    partitionBodySections: (doc: LayoutDoc) => Record<string, unknown>;
    previewRecord: ProofRuntimeRecord;
    layoutRuntimeBodyApiPath: string;
    testIdPrefix: string;
};

const SURFACE_CONFIG: Record<DrawerLayoutEditorSurfaceKey, DrawerLayoutEditorSurfaceConfig> = {
    opportunity_drawer: {
        surfaceKey: "opportunity_drawer",
        label: "Opportunity drawer",
        defaultDoc: buildLeadDrawerDefaultDoc,
        sectionKeys: OPPORTUNITY_DRAWER_SECTION_KEYS,
        sectionDefaultZone: OPPORTUNITY_DRAWER_SECTION_DEFAULT_ZONE,
        shellPartitionKind: "opportunity",
        buildFieldPickerGroups: buildOpportunityDrawerEditorFieldPickerGroups,
        visualEditorCompositionHints: leadOverviewVisualEditorCompositionHints,
        partitionBodySections: partitionLeadOverviewBodySections,
        previewRecord: LAYOUT_DRAWER_PREVIEW_RECORD,
        layoutRuntimeBodyApiPath: "/api/admin/layout-runtime/opportunity-drawer-body",
        testIdPrefix: "opportunity-drawer",
    },
    person_drawer: {
        surfaceKey: "person_drawer",
        label: "Person drawer",
        defaultDoc: buildPersonDrawerDefaultDoc,
        sectionKeys: PERSON_DRAWER_SECTION_KEYS,
        sectionDefaultZone: PERSON_DRAWER_SECTION_DEFAULT_ZONE,
        shellPartitionKind: "person",
        buildFieldPickerGroups: buildPersonDrawerEditorFieldPickerGroups,
        visualEditorCompositionHints: personOverviewVisualEditorCompositionHints,
        partitionBodySections: partitionPersonOverviewBodySections,
        previewRecord: buildProofPersonRecord(),
        layoutRuntimeBodyApiPath: "/api/admin/layout-runtime/person-drawer-body",
        testIdPrefix: "person-drawer",
    },
    child_drawer: {
        surfaceKey: "child_drawer",
        label: "Child drawer",
        defaultDoc: buildChildDrawerDefaultDoc,
        sectionKeys: CHILD_DRAWER_SECTION_KEYS,
        sectionDefaultZone: CHILD_DRAWER_SECTION_DEFAULT_ZONE,
        shellPartitionKind: "child",
        buildFieldPickerGroups: buildChildDrawerEditorFieldPickerGroups,
        visualEditorCompositionHints: childOverviewVisualEditorCompositionHints,
        partitionBodySections: partitionChildOverviewBodySections,
        previewRecord: buildProofChildRecord(),
        layoutRuntimeBodyApiPath: "/api/admin/layout-runtime/child-drawer-body",
        testIdPrefix: "child-drawer",
    },
};

export function getDrawerLayoutEditorSurfaceConfig(
    surfaceKey: DrawerLayoutEditorSurfaceKey,
): DrawerLayoutEditorSurfaceConfig {
    return SURFACE_CONFIG[surfaceKey];
}

export function resolveDrawerLayoutEditorSurfaceKeyFromDoc(
    doc: Pick<LayoutDoc, "entityType" | "surface">,
): DrawerLayoutEditorSurfaceKey | null {
    const resolved = resolveSurfaceLayoutKeyFromDoc(doc);
    if (resolved === "opportunity_drawer" || resolved === "person_drawer" || resolved === "child_drawer") {
        return resolved;
    }
    return null;
}

export function isAllowedFieldRefKeyForDrawerSurface(surfaceKey: DrawerLayoutEditorSurfaceKey, refKey: string): boolean {
    return isAllowedDrawerSurfaceFieldRefKey(surfaceKey, refKey);
}
