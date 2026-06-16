/**
 * Layout editor display configuration — registry-validated presentation metadata.
 * Stored on LayoutItem.metadata.layoutEditorDisplay and column metadata bags.
 */

import type { LayoutAdornmentIcon, LayoutCollectionColumn, LayoutItem, LayoutRenderHint } from "@/lib/layout/layoutV2";
import { isLayoutRenderHint, LAYOUT_ADORNMENT_ICONS } from "@/lib/layout/layoutV2";

export const LAYOUT_EDITOR_DISPLAY_METADATA_KEY = "layoutEditorDisplay" as const;

export const LAYOUT_TYPOGRAPHY_INTENTS = ["primary", "secondary", "muted", "caption", "emphasis"] as const;
export type LayoutTypographyIntent = (typeof LAYOUT_TYPOGRAPHY_INTENTS)[number];

export const LAYOUT_LINK_BEHAVIORS = ["none", "open_record", "open_drawer", "mailto", "tel"] as const;
export type LayoutLinkBehavior = (typeof LAYOUT_LINK_BEHAVIORS)[number];

/** Operator-facing labels; internal values remain stable for storage. */
export const LAYOUT_LINK_BEHAVIOR_LABELS: Record<LayoutLinkBehavior, string> = {
    none: "No action",
    open_record: "Open related record page",
    open_drawer: "Open related record drawer",
    mailto: "Open email composer",
    tel: "Call phone number",
};

/** Editor-facing display types mapped to renderHint where supported. */
export const LAYOUT_EDITOR_DISPLAY_TYPES = [
    "text",
    "email",
    "phone",
    "date",
    "badge",
    "status",
    "link",
    "avatar",
    "pill",
] as const;
export type LayoutEditorDisplayType = (typeof LAYOUT_EDITOR_DISPLAY_TYPES)[number];

export type LayoutEditorDisplayConfig = {
    showLabel?: boolean;
    typographyIntent?: LayoutTypographyIntent;
    emptyState?: string;
    helperText?: string;
    linkBehavior?: LayoutLinkBehavior;
    icon?: LayoutAdornmentIcon;
    displayType?: LayoutEditorDisplayType;
};

const DISPLAY_TYPE_TO_RENDER_HINT: Partial<Record<LayoutEditorDisplayType, LayoutRenderHint>> = {
    text: "text",
    email: "text",
    phone: "phone",
    date: "date",
    badge: "badge",
    status: "status",
    link: "link",
    pill: "badge",
};

export function readLayoutEditorDisplayConfig(source: {
    metadata?: Record<string, unknown>;
    label?: string;
    renderHint?: LayoutRenderHint;
    adornment?: LayoutItem["adornment"];
}): LayoutEditorDisplayConfig {
    const raw = source.metadata?.[LAYOUT_EDITOR_DISPLAY_METADATA_KEY];
    if (!raw || typeof raw !== "object") return {};
    const bag = raw as Record<string, unknown>;
    const out: LayoutEditorDisplayConfig = {};
    if (typeof bag.showLabel === "boolean") out.showLabel = bag.showLabel;
    if (typeof bag.typographyIntent === "string" && isTypographyIntent(bag.typographyIntent)) {
        out.typographyIntent = bag.typographyIntent;
    }
    if (typeof bag.emptyState === "string") out.emptyState = bag.emptyState.trim();
    if (typeof bag.helperText === "string") out.helperText = bag.helperText.trim();
    if (typeof bag.linkBehavior === "string" && isLinkBehavior(bag.linkBehavior)) out.linkBehavior = bag.linkBehavior;
    if (typeof bag.icon === "string" && isAdornmentIcon(bag.icon)) out.icon = bag.icon;
    if (typeof bag.displayType === "string" && isDisplayType(bag.displayType)) out.displayType = bag.displayType;
    return out;
}

export function writeLayoutEditorDisplayConfig(
    metadata: Record<string, unknown> | undefined,
    patch: LayoutEditorDisplayConfig,
): Record<string, unknown> {
    const next = { ...(metadata ?? {}) };
    const prev = readLayoutEditorDisplayConfig({ metadata: next });
    const merged = { ...prev, ...patch };
    const cleaned: Record<string, unknown> = {};
    if (merged.showLabel !== undefined) cleaned.showLabel = merged.showLabel;
    if (merged.typographyIntent) cleaned.typographyIntent = merged.typographyIntent;
    if (merged.emptyState) cleaned.emptyState = merged.emptyState;
    if (merged.helperText) cleaned.helperText = merged.helperText;
    if (merged.linkBehavior) cleaned.linkBehavior = merged.linkBehavior;
    if (merged.icon) cleaned.icon = merged.icon;
    if (merged.displayType) cleaned.displayType = merged.displayType;
    if (Object.keys(cleaned).length === 0) {
        delete next[LAYOUT_EDITOR_DISPLAY_METADATA_KEY];
    } else {
        next[LAYOUT_EDITOR_DISPLAY_METADATA_KEY] = cleaned;
    }
    return next;
}

export function validateLayoutEditorDisplayConfig(config: LayoutEditorDisplayConfig, path: string): string[] {
    const errors: string[] = [];
    if (config.typographyIntent && !isTypographyIntent(config.typographyIntent)) {
        errors.push(`${path}: invalid typographyIntent "${config.typographyIntent}"`);
    }
    if (config.linkBehavior && !isLinkBehavior(config.linkBehavior)) {
        errors.push(`${path}: invalid linkBehavior "${config.linkBehavior}"`);
    }
    if (config.icon && !isAdornmentIcon(config.icon)) {
        errors.push(`${path}: invalid icon "${config.icon}"`);
    }
    if (config.displayType && !isDisplayType(config.displayType)) {
        errors.push(`${path}: invalid displayType "${config.displayType}"`);
    }
    return errors;
}

export function renderHintForDisplayType(displayType: LayoutEditorDisplayType | undefined): LayoutRenderHint | undefined {
    if (!displayType) return undefined;
    return DISPLAY_TYPE_TO_RENDER_HINT[displayType];
}

export function typographyIntentClass(intent: LayoutTypographyIntent | undefined): string {
    switch (intent) {
        case "secondary":
            return "text-sm text-alloy-midnight/70";
        case "muted":
            return "text-alloy-midnight/50";
        case "caption":
            return "text-[10px] text-alloy-midnight/45";
        case "emphasis":
            return "font-semibold text-alloy-midnight";
        default:
            return "";
    }
}

export function applyDisplayConfigToItemPatch(
    item: LayoutItem,
    config: LayoutEditorDisplayConfig,
): Partial<LayoutItem> {
    const patch: Partial<LayoutItem> = {
        metadata: writeLayoutEditorDisplayConfig(item.metadata, config),
    };
    if (config.displayType) {
        const hint = renderHintForDisplayType(config.displayType);
        if (hint) patch.renderHint = hint;
    }
    if (config.icon) {
        patch.adornment = {
            position: item.adornment?.position ?? "left",
            icon: config.icon,
            ...(item.adornment?.action ? { action: item.adornment.action } : {}),
        };
    }
    return patch;
}

export function applyDisplayConfigToColumnPatch(
    col: LayoutCollectionColumn,
    config: LayoutEditorDisplayConfig,
): Partial<LayoutCollectionColumn> {
    const patch: Partial<LayoutCollectionColumn> = {};
    if (config.displayType) {
        const hint = renderHintForDisplayType(config.displayType);
        if (hint) patch.renderHint = hint;
    }
    if (config.icon) {
        patch.adornment = {
            position: col.adornment?.position ?? "left",
            icon: config.icon,
            ...(col.adornment?.action ? { action: col.adornment.action } : {}),
        };
    }
    return patch;
}

function isTypographyIntent(v: string): v is LayoutTypographyIntent {
    return (LAYOUT_TYPOGRAPHY_INTENTS as readonly string[]).includes(v);
}

function isLinkBehavior(v: string): v is LayoutLinkBehavior {
    return (LAYOUT_LINK_BEHAVIORS as readonly string[]).includes(v);
}

function isDisplayType(v: string): v is LayoutEditorDisplayType {
    return (LAYOUT_EDITOR_DISPLAY_TYPES as readonly string[]).includes(v);
}

function isAdornmentIcon(v: string): v is LayoutAdornmentIcon {
    return (LAYOUT_ADORNMENT_ICONS as readonly string[]).includes(v);
}

export function isLayoutRenderHintValue(v: unknown): boolean {
    return typeof v === "string" && isLayoutRenderHint(v);
}
