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
import {
    isAllowedOpportunityDrawerFieldRefKey,
    isOpportunityDrawerLayoutZone,
    OPPORTUNITY_DRAWER_ACTION_PLACEMENTS,
    OPPORTUNITY_DRAWER_SECTION_KEYS,
    OPPORTUNITY_DRAWER_STRUCTURAL_REF_KEYS,
    OPPORTUNITY_DRAWER_SURFACE,
    PLATFORM_RESERVED_SECTION_KEYS,
    PLATFORM_SHELL_METADATA_KEYS,
    resolveSurfaceLayoutKeyFromDoc,
    type SurfaceLayoutKey,
} from "@/lib/layout/surfaceLayoutRegistry";
import {
    isLegacyInvalidBlockRefKey,
    isLegacyInvalidSectionKey,
    isOpportunityDrawerSectionKeyAllowed,
    isRegisteredOpportunityDrawerSectionKey,
    isValidCustomLayoutBlockItem,
    isValidCustomSectionKeyPattern,
    LAYOUT_EDITOR_CREATED_BY_VISUAL_EDITOR_METADATA_KEY,
    LAYOUT_EDITOR_CUSTOM_METADATA_KEY,
} from "@/lib/layout/layoutEditorGeneratedKeys";

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
    "layoutEditorSectionType",
    "layoutEditorRelatedListConfig",
    LAYOUT_EDITOR_CUSTOM_METADATA_KEY,
    LAYOUT_EDITOR_CREATED_BY_VISUAL_EDITOR_METADATA_KEY,
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
        allowedWidgetKeys: ReadonlySet<string>;
        allowedStructuralRefKeys: ReadonlySet<string>;
        allowedActionPlacements: readonly ActionSurface[];
        isDrawerSurface: boolean;
        errors: string[];
    },
): void {
    if (!isLayoutItemKind(item.kind)) {
        ctx.errors.push(`${path}: unknown item kind "${String(item.kind)}"`);
    }

    if (item.kind === "field" && item.refKey) {
        if (!ctx.allowedStructuralRefKeys.has(item.refKey) && !isAllowedOpportunityDrawerFieldRefKey(item.refKey)) {
            ctx.errors.push(`${path}: unknown field refKey "${item.refKey}"`);
        }
    }

    if (item.kind === "field_group" && item.refKey) {
        if (isLegacyInvalidBlockRefKey(item.refKey)) {
            ctx.errors.push(`${path}: legacy_invalid_block_refKey "${item.refKey}"`);
        } else if ((OPPORTUNITY_DRAWER_STRUCTURAL_REF_KEYS as readonly string[]).includes(item.refKey)) {
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
            if (col.refKey && !isAllowedOpportunityDrawerFieldRefKey(col.refKey)) {
                ctx.errors.push(`${path}.columns[${ci}]: unknown field refKey "${col.refKey}"`);
            }
        });
    }

    if (item.kind === "widget_placeholder") {
        const widgetKey = item.refKey?.includes(".") ? item.refKey.split(".").pop()! : item.refKey;
        if (widgetKey && !ctx.allowedWidgetKeys.has(widgetKey)) {
            ctx.errors.push(`${path}: unknown widget key "${widgetKey}"`);
        }
    }

    if (isObject(item.metadata)) {
        collectUnknownKeys(item.metadata, ALLOWED_ITEM_METADATA_KEYS, `${path}.metadata`, ctx.errors);
        if (ctx.isDrawerSurface && typeof item.metadata.zone === "string" && isLayoutQueueZone(item.metadata.zone)) {
            ctx.errors.push(`${path}.metadata.zone: queue zone "${item.metadata.zone}" is not allowed on drawer surface`);
        }
        if (item.metadata.layoutZone !== undefined && !isOpportunityDrawerLayoutZone(item.metadata.layoutZone)) {
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

    item.items?.forEach((child, i) => walkItem(child, `${path}.items[${i}]`, ctx));
    item.rows?.forEach((row, ri) =>
        row.columns.forEach((col, ci) =>
            col.items.forEach((child, ii) => walkItem(child, `${path}.rows[${ri}].columns[${ci}].items[${ii}]`, ctx)),
        ),
    );
}

function validateOpportunityDrawerSection(section: LayoutSection, index: number, errors: string[]): void {
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
    if (!isOpportunityDrawerSectionKeyAllowed(section)) {
        if (isValidCustomSectionKeyPattern(section.key)) {
            errors.push(`${path}: custom_section_missing_metadata for key "${section.key}"`);
        } else if (!isRegisteredOpportunityDrawerSectionKey(section.key)) {
            errors.push(`${path}: unknown section key "${section.key}"`);
        }
        return;
    }
    if (isObject(section.metadata)) {
        collectUnknownKeys(section.metadata, ALLOWED_SECTION_METADATA_KEYS, `${path}.metadata`, errors);
        if (section.metadata.layoutZone !== undefined && !isOpportunityDrawerLayoutZone(section.metadata.layoutZone)) {
            errors.push(`${path}.metadata.layoutZone: unknown layout zone "${String(section.metadata.layoutZone)}"`);
        }
        if (isValidCustomSectionKeyPattern(section.key) && section.metadata[LAYOUT_EDITOR_CUSTOM_METADATA_KEY] !== true) {
            errors.push(`${path}: custom_section_missing_metadata for key "${section.key}"`);
        }
        walkActionPlacements(
            section.metadata.actionPlacements,
            `${path}.metadata.actionPlacements`,
            OPPORTUNITY_DRAWER_ACTION_PLACEMENTS,
            errors,
        );
    } else if (isValidCustomSectionKeyPattern(section.key)) {
        errors.push(`${path}: custom_section_missing_metadata for key "${section.key}"`);
    }
}

function validateOpportunityDrawerDoc(doc: LayoutDoc): string[] {
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
            OPPORTUNITY_DRAWER_ACTION_PLACEMENTS,
            errors,
        );
    }

    const allowedWidgetKeys = new Set(OPPORTUNITY_DRAWER_SURFACE.allowedWidgetKeys);
    const allowedStructuralRefKeys = new Set(OPPORTUNITY_DRAWER_STRUCTURAL_REF_KEYS as readonly string[]);

    const seenSectionKeys = new Set<string>();
    doc.sections.forEach((section, si) => {
        if (seenSectionKeys.has(section.key)) {
            errors.push(`sections[${si}]: duplicate section key "${section.key}"`);
        }
        seenSectionKeys.add(section.key);
        validateOpportunityDrawerSection(section, si, errors);
    });

    const itemCtx = {
        allowedWidgetKeys,
        allowedStructuralRefKeys,
        allowedActionPlacements: OPPORTUNITY_DRAWER_ACTION_PLACEMENTS,
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

/** Validate a structurally valid LayoutDoc against a registered surface vocabulary. */
export function validateLayoutDocForSurface(
    doc: LayoutDoc,
    surfaceKey?: SurfaceLayoutKey | null,
): LayoutSurfaceValidationResult {
    const resolved = surfaceKey ?? resolveSurfaceLayoutKeyFromDoc(doc);
    if (!resolved) {
        return { ok: true, surfaceKey: null, errors: [] };
    }

    if (resolved === "opportunity_drawer") {
        const errors = validateOpportunityDrawerDoc(doc);
        return { ok: errors.length === 0, surfaceKey: resolved, errors };
    }

    return { ok: true, surfaceKey: resolved, errors: [] };
}

/** Surface validation helper for admin write paths. */
export function validateLayoutDocForWrite(
    doc: LayoutDoc,
    options?: { surfaceKey?: SurfaceLayoutKey | null; inferSurfaceKey?: boolean },
): LayoutSurfaceValidationResult {
    const surfaceKey =
        options?.surfaceKey ??
        (options?.inferSurfaceKey !== false ? resolveSurfaceLayoutKeyFromDoc(doc) : null);
    return validateLayoutDocForSurface(doc, surfaceKey);
}
