/**
 * Surface-scoped LayoutDoc validation — Visual Layout Configuration Builder (Phase 1).
 *
 * Runs after structural parseLayoutDoc validation. Rejects closed-vocabulary
 * violations for registered surfaces (opportunity_drawer first).
 */

import type { ActionSurface } from "@/lib/admin/actions/types";
import {
    LAYOUT_EDITOR_BLOCK_CONFIG_METADATA_KEY,
    readLayoutEditorBlockConfig,
    validateLayoutEditorBlockConfig,
} from "@/lib/layout/layoutEditorBlockConfig";
import {
    validateLayoutEditorActionButtonConfig,
    readLayoutEditorActionButtonConfig,
} from "@/lib/layout/layoutEditorActionButton";
import {
    readLayoutEditorDisplayConfig,
    validateLayoutEditorDisplayConfig,
} from "@/lib/layout/layoutEditorDisplayConfig";
import type { LayoutDoc, LayoutItem, LayoutSection } from "@/lib/layout/layoutV2";
import { isLayoutItemKind, isLayoutQueueZone } from "@/lib/layout/layoutV2";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import { buildTenantLayoutFieldRefKeySet } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import {
    isAllowedDrawerRelatedListColumnRefKey,
    isLinkedChildBlockContext,
} from "@/lib/layout/drawerSurfaceFieldValidation";
import {
    LAYOUT_SECTION_COLLAPSED_SUMMARY_METADATA_KEY,
    LAYOUT_SECTION_PERSIST_COLLAPSE_STATE_METADATA_KEY,
} from "@/lib/layout/runtime/layoutRuntimeSectionCollapse";
import {
    isAllowedDrawerSurfaceFieldRefKey,
    isDrawerSurfaceLayoutZone,
    CHILD_DRAWER_SECTION_KEYS,
    CHILD_DRAWER_STRUCTURAL_REF_KEYS,
    CHILD_DRAWER_SURFACE,
    OPPORTUNITY_DRAWER_ACTION_PLACEMENTS,
    OPPORTUNITY_DRAWER_SECTION_KEYS,
    OPPORTUNITY_DRAWER_STRUCTURAL_REF_KEYS,
    OPPORTUNITY_DRAWER_SURFACE,
    PERSON_CHILD_DRAWER_ACTION_PLACEMENTS,
    PERSON_DRAWER_SECTION_KEYS,
    PERSON_DRAWER_STRUCTURAL_REF_KEYS,
    PERSON_DRAWER_SURFACE,
    PLATFORM_RESERVED_SECTION_KEYS,
    PLATFORM_SHELL_METADATA_KEYS,
    resolveSurfaceLayoutKeyFromDoc,
    type SurfaceLayoutKey,
} from "@/lib/layout/surfaceLayoutRegistry";
import {
    isLegacyInvalidBlockRefKey,
    isLegacyInvalidSectionKey,
    isValidCustomLayoutBlockItem,
    isValidCustomSectionKeyPattern,
    LAYOUT_EDITOR_CREATED_BY_VISUAL_EDITOR_METADATA_KEY,
    LAYOUT_EDITOR_CUSTOM_METADATA_KEY,
} from "@/lib/layout/layoutEditorGeneratedKeys";
import { LAYOUT_EDITOR_KPI_TILE_METADATA_KEY } from "@/lib/layout/layoutBuilderKpiTileRows";
import { LAYOUT_EDITOR_WIDGET_CARD_METADATA_KEY } from "@/lib/layout/layoutBuilderWidgetStrip";
import {
    LAYOUT_EDITOR_ACTIVITY_TIMELINE_CONFIG_METADATA_KEY,
    validateLayoutEditorActivityTimelineMetadata,
    type ActivityTimelineSurfaceKey,
} from "@/lib/layout/layoutEditorActivityTimelineConfig";
import { LAYOUT_EDITOR_RELATIONSHIP_WIDGET_CONFIG_METADATA_KEY } from "@/lib/layout/runtime/layoutRuntimeScopedRelationshipContacts";
import { LAYOUT_EDITOR_CROSS_FIELD_VISIBILITY_METADATA_KEY } from "@/lib/layout/layoutEditorVisibilityRules";

export type LayoutSurfaceValidationResult = {
    ok: boolean;
    surfaceKey: SurfaceLayoutKey | null;
    errors: string[];
};

const ALLOWED_DOC_METADATA_KEYS = new Set([
    "seededFrom",
    "template",
    "action_placements",
]);

/**
 * The Enrollment Focus Panel Summary layout is persisted as an opportunities/drawer
 * entity layout, but it is NOT a drawer surface: its sections are Focus Panel CARDS
 * (household, readiness_kpi, …) and its doc metadata is Focus-Panel-specific
 * (`focusPanelMode`, `layoutKey`, `focusPanelLayout`). The generic drawer validator
 * does not know any of these, so without this exemption EVERY save/publish is rejected
 * as "Invalid layout doc" and the operator-published canvas layout never persists — so
 * the work-unit runtime falls back to the default and can't honor it. The Focus Panel
 * Summary content is validated by Focus-Panel-specific code (the editor's
 * validateFocusPanelCardConfig + isFocusPanelPublishedLayout at read time), not here.
 */
function isFocusPanelSummaryDoc(doc: LayoutDoc): boolean {
    const metadata = doc.metadata;
    return isObject(metadata) && metadata.focusPanelMode === "summary";
}

const ALLOWED_SECTION_METADATA_KEYS = new Set([
    "priority",
    "collapseWhenEmpty",
    "showWhenEmpty",
    "railSlot",
    "layoutZone",
    "actionPlacements",
    "compositionPrimaryColumnRefs",
    "enrollmentGridCellRoles",
    "layoutEditorHidden",
    "layoutEditorSectionRowGroup",
    "layoutEditorSectionRowSpan",
    "layoutEditorSectionRowStackRole",
    "layoutEditorSectionType",
    "layoutEditorRelatedListConfig",
    LAYOUT_EDITOR_KPI_TILE_METADATA_KEY,
    LAYOUT_EDITOR_WIDGET_CARD_METADATA_KEY,
    LAYOUT_EDITOR_CUSTOM_METADATA_KEY,
    LAYOUT_EDITOR_CREATED_BY_VISUAL_EDITOR_METADATA_KEY,
    LAYOUT_SECTION_PERSIST_COLLAPSE_STATE_METADATA_KEY,
    LAYOUT_SECTION_COLLAPSED_SUMMARY_METADATA_KEY,
]);

const ALLOWED_ITEM_METADATA_KEYS = new Set([
    "zone",
    "layoutZone",
    "actions",
    "layout",
    "compositionPrimaryColumnRefs",
    "enrollmentGridCellRoles",
    "actionPlacement",
    "actionPlacements",
    "binding",
    "futureModule",
    "layoutEditorDisplay",
    "layoutEditorContactRole",
    "layoutEditorBlockTemplate",
    "layoutEditorRowTemplate",
    "layoutEditorBlockConfig",
    "layoutEditorActionButton",
    "layoutEditorWidgetStyle",
    LAYOUT_EDITOR_ACTIVITY_TIMELINE_CONFIG_METADATA_KEY,
    LAYOUT_EDITOR_RELATIONSHIP_WIDGET_CONFIG_METADATA_KEY,
    "layoutEditorRelatedListConfig",
    LAYOUT_EDITOR_CROSS_FIELD_VISIBILITY_METADATA_KEY,
    "enrollmentRosterReadFirst",
    LAYOUT_EDITOR_CUSTOM_METADATA_KEY,
    LAYOUT_EDITOR_CREATED_BY_VISUAL_EDITOR_METADATA_KEY,
]);

const QUEUE_ONLY_DOC_METADATA_KEYS = new Set(["queue_record_layout", "queue_context", "renderAs"]);

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function collectUnknownKeys(obj: Record<string, unknown>, allowed: Set<string>, path: string, errors: string[]): void {
    for (const key of Object.keys(obj)) {
        if (!allowed.has(key)) {
            errors.push(`${path}: unknown metadata key "${key}"`);
        }
    }
}

function validateActionPlacementRef(
    raw: unknown,
    path: string,
    allowedSurfaces: readonly ActionSurface[],
    errors: string[],
): void {
    if (!isObject(raw)) {
        errors.push(`${path}: action placement must be an object`);
        return;
    }
    const surface = raw.surface;
    if (typeof surface !== "string" || !allowedSurfaces.includes(surface as ActionSurface)) {
        errors.push(
            `${path}: invalid action placement surface "${String(surface)}" (allowed: ${allowedSurfaces.join(", ")})`,
        );
    }
    if (raw.section_key !== undefined && typeof raw.section_key !== "string") {
        errors.push(`${path}: section_key must be a string when present`);
    }
}

function walkActionPlacements(
    raw: unknown,
    path: string,
    allowedSurfaces: readonly ActionSurface[],
    errors: string[],
): void {
    if (raw === undefined || raw === null) return;
    if (Array.isArray(raw)) {
        raw.forEach((entry, i) => validateActionPlacementRef(entry, `${path}[${i}]`, allowedSurfaces, errors));
        return;
    }
    validateActionPlacementRef(raw, path, allowedSurfaces, errors);
}

function walkItem(
    item: LayoutItem,
    path: string,
    ctx: {
        surfaceKey: SurfaceLayoutKey;
        allowedWidgetKeys: ReadonlySet<string>;
        allowedStructuralRefKeys: ReadonlySet<string>;
        allowedActionPlacements: readonly ActionSurface[];
        tenantFieldRefKeys?: ReadonlySet<string>;
        isDrawerSurface: boolean;
        linkedChildContext?: boolean;
        errors: string[];
    },
): void {
    if (!isLayoutItemKind(item.kind)) {
        ctx.errors.push(`${path}: unknown item kind "${String(item.kind)}"`);
    }

    const inLinkedChildContext = ctx.linkedChildContext === true || isLinkedChildBlockContext(item);

    const isAllowedFieldRefKey = (refKey: string) => {
        if (ctx.surfaceKey === "person_drawer" && inLinkedChildContext) {
            return isAllowedDrawerRelatedListColumnRefKey(ctx.surfaceKey, refKey, item, ctx.tenantFieldRefKeys);
        }
        return isAllowedDrawerSurfaceFieldRefKey(ctx.surfaceKey, refKey, ctx.tenantFieldRefKeys);
    };

    if (item.kind === "field" && item.refKey) {
        if (!ctx.allowedStructuralRefKeys.has(item.refKey) && !isAllowedFieldRefKey(item.refKey)) {
            ctx.errors.push(`${path}: unknown field refKey "${item.refKey}"`);
        }
    }

    if (item.kind === "field_group" && item.refKey) {
        if (isLegacyInvalidBlockRefKey(item.refKey)) {
            ctx.errors.push(`${path}: legacy_invalid_block_refKey "${item.refKey}"`);
        } else if (ctx.allowedStructuralRefKeys.has(item.refKey)) {
            if (item.refKey === "layout_block" && !readLayoutEditorBlockConfig(item.metadata).blockType) {
                ctx.errors.push(`${path}: layout_block requires layoutEditorBlockConfig.blockType`);
            }
        } else if (isValidCustomLayoutBlockItem(item)) {
            // custom freeform block — contents validated below via block config
        } else if (isValidCustomSectionKeyPattern(item.refKey)) {
            ctx.errors.push(`${path}: custom_block_missing_metadata for refKey "${item.refKey}"`);
        } else {
            ctx.errors.push(`${path}: unknown field_group refKey "${item.refKey}"`);
        }
    }

    if (item.kind === "related_list" && item.refKey) {
        if (!ctx.allowedStructuralRefKeys.has(item.refKey)) {
            ctx.errors.push(`${path}: unknown related_list refKey "${item.refKey}"`);
        }
        item.columns?.forEach((col, ci) => {
            if (
                col.refKey
                && !isAllowedDrawerRelatedListColumnRefKey(ctx.surfaceKey, col.refKey, item, ctx.tenantFieldRefKeys)
            ) {
                ctx.errors.push(`${path}.columns[${ci}]: unknown field refKey "${col.refKey}"`);
            }
            if (isObject(col.metadata)) {
                collectUnknownKeys(col.metadata, ALLOWED_ITEM_METADATA_KEYS, `${path}.columns[${ci}].metadata`, ctx.errors);
                const display = readLayoutEditorDisplayConfig({ metadata: col.metadata });
                ctx.errors.push(
                    ...validateLayoutEditorDisplayConfig(display, `${path}.columns[${ci}].metadata.layoutEditorDisplay`),
                );
            }
        });
    }

    if (item.kind === "widget_placeholder") {
        const widgetKey = item.refKey?.includes(".") ? item.refKey.split(".").pop()! : item.refKey;
        if (widgetKey && !ctx.allowedWidgetKeys.has(widgetKey)) {
            ctx.errors.push(`${path}: unknown widget key "${widgetKey}"`);
        }
        if (widgetKey === "activity_timeline" && isObject(item.metadata)) {
            const surfaceKey = ctx.surfaceKey as ActivityTimelineSurfaceKey;
            if (
                surfaceKey === "opportunity_drawer"
                || surfaceKey === "person_drawer"
                || surfaceKey === "child_drawer"
            ) {
                ctx.errors.push(
                    ...validateLayoutEditorActivityTimelineMetadata(
                        item.metadata,
                        surfaceKey,
                        `${path}.metadata.${LAYOUT_EDITOR_ACTIVITY_TIMELINE_CONFIG_METADATA_KEY}`,
                    ),
                );
            }
        }
    }

    if (isObject(item.metadata)) {
        collectUnknownKeys(item.metadata, ALLOWED_ITEM_METADATA_KEYS, `${path}.metadata`, ctx.errors);
        if (ctx.isDrawerSurface && typeof item.metadata.zone === "string" && isLayoutQueueZone(item.metadata.zone)) {
            ctx.errors.push(`${path}.metadata.zone: queue zone "${item.metadata.zone}" is not allowed on drawer surface`);
        }
        if (item.metadata.layoutZone !== undefined && !isDrawerSurfaceLayoutZone(item.metadata.layoutZone)) {
            ctx.errors.push(`${path}.metadata.layoutZone: unknown layout zone "${String(item.metadata.layoutZone)}"`);
        }
        walkActionPlacements(
            item.metadata.actionPlacement,
            `${path}.metadata.actionPlacement`,
            ctx.allowedActionPlacements,
            ctx.errors,
        );
        walkActionPlacements(
            item.metadata.actionPlacements,
            `${path}.metadata.actionPlacements`,
            ctx.allowedActionPlacements,
            ctx.errors,
        );
        const display = readLayoutEditorDisplayConfig({ metadata: item.metadata });
        ctx.errors.push(...validateLayoutEditorDisplayConfig(display, `${path}.metadata.layoutEditorDisplay`));
        const blockConfig = readLayoutEditorBlockConfig(item.metadata);
        ctx.errors.push(...validateLayoutEditorBlockConfig(blockConfig, `${path}.metadata.${LAYOUT_EDITOR_BLOCK_CONFIG_METADATA_KEY}`));
        const actionButton = readLayoutEditorActionButtonConfig(item.metadata);
        if (actionButton) {
            ctx.errors.push(
                ...validateLayoutEditorActionButtonConfig(
                    actionButton,
                    `${path}.metadata.layoutEditorActionButton`,
                ),
            );
        }
    }

    const childCtx = {
        ...ctx,
        linkedChildContext: inLinkedChildContext || readLayoutEditorBlockConfig(item.metadata).dataContext === "child",
    };

    item.items?.forEach((child, i) => walkItem(child, `${path}.items[${i}]`, childCtx));
    item.rows?.forEach((row, ri) =>
        row.columns.forEach((col, ci) =>
            col.items.forEach((child, ii) =>
                walkItem(child, `${path}.rows[${ri}].columns[${ci}].items[${ii}]`, childCtx),
            ),
        ),
    );
}

function isRegisteredDrawerSectionKey(key: string, allowed: readonly string[]): boolean {
    return (allowed as readonly string[]).includes(key);
}

function isDrawerSectionKeyAllowed(section: LayoutSection, allowed: readonly string[]): boolean {
    if (isRegisteredDrawerSectionKey(section.key, allowed)) return true;
    if (isValidCustomSectionKeyPattern(section.key) && section.metadata?.[LAYOUT_EDITOR_CUSTOM_METADATA_KEY] === true) {
        return true;
    }
    return false;
}

function validateDrawerSurfaceSection(
    section: LayoutSection,
    index: number,
    allowedSectionKeys: readonly string[],
    allowedActionPlacements: readonly ActionSurface[],
    errors: string[],
): void {
    const path = `sections[${index}]`;
    if (!section.key?.trim()) {
        errors.push(`${path}: empty section key`);
        return;
    }
    if (PLATFORM_RESERVED_SECTION_KEYS.has(section.key)) {
        errors.push(`${path}: section key "${section.key}" is platform shell-owned`);
        return;
    }
    if (isLegacyInvalidSectionKey(section.key)) {
        errors.push(`${path}: legacy_invalid_section_key "${section.key}"`);
        return;
    }
    if (!isDrawerSectionKeyAllowed(section, allowedSectionKeys)) {
        if (isValidCustomSectionKeyPattern(section.key)) {
            errors.push(`${path}: custom_section_missing_metadata for key "${section.key}"`);
        } else if (!isRegisteredDrawerSectionKey(section.key, allowedSectionKeys)) {
            errors.push(`${path}: unknown section key "${section.key}"`);
        }
        return;
    }
    if (isObject(section.metadata)) {
        collectUnknownKeys(section.metadata, ALLOWED_SECTION_METADATA_KEYS, `${path}.metadata`, errors);
        if (section.metadata.layoutZone !== undefined && !isDrawerSurfaceLayoutZone(section.metadata.layoutZone)) {
            errors.push(`${path}.metadata.layoutZone: unknown layout zone "${String(section.metadata.layoutZone)}"`);
        }
        if (isValidCustomSectionKeyPattern(section.key) && section.metadata[LAYOUT_EDITOR_CUSTOM_METADATA_KEY] !== true) {
            errors.push(`${path}: custom_section_missing_metadata for key "${section.key}"`);
        }
        walkActionPlacements(
            section.metadata.actionPlacements,
            `${path}.metadata.actionPlacements`,
            allowedActionPlacements,
            errors,
        );
    } else if (isValidCustomSectionKeyPattern(section.key)) {
        errors.push(`${path}: custom_section_missing_metadata for key "${section.key}"`);
    }
}

type DrawerSurfaceValidationConfig = {
    surfaceKey: SurfaceLayoutKey;
    allowedSectionKeys: readonly string[];
    allowedStructuralRefKeys: readonly string[];
    allowedWidgetKeys: readonly string[];
    allowedActionPlacements: readonly ActionSurface[];
    tenantFieldRefKeys?: ReadonlySet<string>;
};

function validateRegisteredDrawerSurfaceDoc(doc: LayoutDoc, config: DrawerSurfaceValidationConfig): string[] {
    const errors: string[] = [];

    if (isObject(doc.metadata)) {
        for (const key of Object.keys(doc.metadata)) {
            if (PLATFORM_SHELL_METADATA_KEYS.has(key)) {
                errors.push(`root.metadata.${key}: platform shell area is not layout-configurable`);
            }
            if (QUEUE_ONLY_DOC_METADATA_KEYS.has(key)) {
                errors.push(`root.metadata.${key}: queue-only metadata is not allowed on drawer surface`);
            }
            if (!ALLOWED_DOC_METADATA_KEYS.has(key)) {
                errors.push(`root.metadata: unknown metadata key "${key}"`);
            }
        }
        walkActionPlacements(
            doc.metadata.action_placements,
            "root.metadata.action_placements",
            config.allowedActionPlacements,
            errors,
        );
    }

    const allowedWidgetKeys = new Set(config.allowedWidgetKeys);
    const allowedStructuralRefKeys = new Set(config.allowedStructuralRefKeys);

    const seenSectionKeys = new Set<string>();
    doc.sections.forEach((section, si) => {
        if (seenSectionKeys.has(section.key)) {
            errors.push(`sections[${si}]: duplicate section key "${section.key}"`);
        }
        seenSectionKeys.add(section.key);
        validateDrawerSurfaceSection(
            section,
            si,
            config.allowedSectionKeys,
            config.allowedActionPlacements,
            errors,
        );
    });

    const itemCtx = {
        surfaceKey: config.surfaceKey,
        allowedWidgetKeys,
        allowedStructuralRefKeys,
        allowedActionPlacements: config.allowedActionPlacements,
        tenantFieldRefKeys: config.tenantFieldRefKeys,
        isDrawerSurface: true,
        errors,
    };

    doc.sections.forEach((section, si) => {
        section.rows.forEach((row, ri) => {
            row.columns.forEach((col, ci) => {
                col.items.forEach((item, ii) => {
                    walkItem(item, `sections[${si}].rows[${ri}].columns[${ci}].items[${ii}]`, itemCtx);
                });
            });
        });
    });

    return errors;
}

function validateOpportunityDrawerDoc(doc: LayoutDoc): string[] {
    return validateRegisteredDrawerSurfaceDoc(doc, {
        surfaceKey: "opportunity_drawer",
        allowedSectionKeys: OPPORTUNITY_DRAWER_SECTION_KEYS,
        allowedStructuralRefKeys: OPPORTUNITY_DRAWER_STRUCTURAL_REF_KEYS,
        allowedWidgetKeys: OPPORTUNITY_DRAWER_SURFACE.allowedWidgetKeys,
        allowedActionPlacements: OPPORTUNITY_DRAWER_ACTION_PLACEMENTS,
    });
}

function validatePersonDrawerDoc(doc: LayoutDoc): string[] {
    return validateRegisteredDrawerSurfaceDoc(doc, {
        surfaceKey: "person_drawer",
        allowedSectionKeys: PERSON_DRAWER_SECTION_KEYS,
        allowedStructuralRefKeys: PERSON_DRAWER_STRUCTURAL_REF_KEYS,
        allowedWidgetKeys: PERSON_DRAWER_SURFACE.allowedWidgetKeys,
        allowedActionPlacements: PERSON_CHILD_DRAWER_ACTION_PLACEMENTS,
    });
}

function validateChildDrawerDoc(doc: LayoutDoc): string[] {
    return validateRegisteredDrawerSurfaceDoc(doc, {
        surfaceKey: "child_drawer",
        allowedSectionKeys: CHILD_DRAWER_SECTION_KEYS,
        allowedStructuralRefKeys: CHILD_DRAWER_STRUCTURAL_REF_KEYS,
        allowedWidgetKeys: CHILD_DRAWER_SURFACE.allowedWidgetKeys,
        allowedActionPlacements: PERSON_CHILD_DRAWER_ACTION_PLACEMENTS,
    });
}

export type LayoutSurfaceValidationOptions = {
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
};

function tenantFieldRefKeysForSurface(
    surfaceKey: SurfaceLayoutKey,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): ReadonlySet<string> | undefined {
    if (!tenantFieldDefinitions?.length) return undefined;
    if (surfaceKey === "opportunity_drawer") {
        return buildTenantLayoutFieldRefKeySet(tenantFieldDefinitions, "opportunity_drawer");
    }
    if (surfaceKey === "person_drawer") {
        return buildTenantLayoutFieldRefKeySet(tenantFieldDefinitions, "person_drawer");
    }
    if (surfaceKey === "child_drawer") {
        return buildTenantLayoutFieldRefKeySet(tenantFieldDefinitions, "child_drawer");
    }
    return undefined;
}

/** Validate a structurally valid LayoutDoc against a registered surface vocabulary. */
export function validateLayoutDocForSurface(
    doc: LayoutDoc,
    surfaceKey?: SurfaceLayoutKey | null,
    options?: LayoutSurfaceValidationOptions,
): LayoutSurfaceValidationResult {
    const resolved = surfaceKey ?? resolveSurfaceLayoutKeyFromDoc(doc);
    if (!resolved) {
        return { ok: true, surfaceKey: null, errors: [] };
    }

    // The Focus Panel Summary layout is stored as an opportunities/drawer entity layout
    // but is not a drawer surface — exempt it from the generic drawer validator (see
    // isFocusPanelSummaryDoc) so its publish/save is not rejected as "Invalid layout doc".
    if (isFocusPanelSummaryDoc(doc)) {
        return { ok: true, surfaceKey: resolved, errors: [] };
    }

    const tenantFieldRefKeys = tenantFieldRefKeysForSurface(resolved, options?.tenantFieldDefinitions);

    if (resolved === "opportunity_drawer") {
        const errors = validateRegisteredDrawerSurfaceDoc(doc, {
            surfaceKey: "opportunity_drawer",
            allowedSectionKeys: OPPORTUNITY_DRAWER_SECTION_KEYS,
            allowedStructuralRefKeys: OPPORTUNITY_DRAWER_STRUCTURAL_REF_KEYS,
            allowedWidgetKeys: OPPORTUNITY_DRAWER_SURFACE.allowedWidgetKeys,
            allowedActionPlacements: OPPORTUNITY_DRAWER_ACTION_PLACEMENTS,
            tenantFieldRefKeys,
        });
        return { ok: errors.length === 0, surfaceKey: resolved, errors };
    }

    if (resolved === "person_drawer") {
        const errors = validateRegisteredDrawerSurfaceDoc(doc, {
            surfaceKey: "person_drawer",
            allowedSectionKeys: PERSON_DRAWER_SECTION_KEYS,
            allowedStructuralRefKeys: PERSON_DRAWER_STRUCTURAL_REF_KEYS,
            allowedWidgetKeys: PERSON_DRAWER_SURFACE.allowedWidgetKeys,
            allowedActionPlacements: PERSON_CHILD_DRAWER_ACTION_PLACEMENTS,
            tenantFieldRefKeys,
        });
        return { ok: errors.length === 0, surfaceKey: resolved, errors };
    }

    if (resolved === "child_drawer") {
        const errors = validateRegisteredDrawerSurfaceDoc(doc, {
            surfaceKey: "child_drawer",
            allowedSectionKeys: CHILD_DRAWER_SECTION_KEYS,
            allowedStructuralRefKeys: CHILD_DRAWER_STRUCTURAL_REF_KEYS,
            allowedWidgetKeys: CHILD_DRAWER_SURFACE.allowedWidgetKeys,
            allowedActionPlacements: PERSON_CHILD_DRAWER_ACTION_PLACEMENTS,
            tenantFieldRefKeys,
        });
        return { ok: errors.length === 0, surfaceKey: resolved, errors };
    }

    return { ok: true, surfaceKey: resolved, errors: [] };
}

/** Surface validation helper for admin write paths. */
export function validateLayoutDocForWrite(
    doc: LayoutDoc,
    options?: {
        surfaceKey?: SurfaceLayoutKey | null;
        inferSurfaceKey?: boolean;
        tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
    },
): LayoutSurfaceValidationResult {
    const surfaceKey =
        options?.surfaceKey ??
        (options?.inferSurfaceKey !== false ? resolveSurfaceLayoutKeyFromDoc(doc) : null);
    return validateLayoutDocForSurface(doc, surfaceKey, {
        tenantFieldDefinitions: options?.tenantFieldDefinitions,
    });
}
