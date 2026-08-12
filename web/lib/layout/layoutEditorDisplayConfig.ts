/**
 * Layout editor display configuration — registry-validated presentation metadata.
 * Stored on LayoutItem.metadata.layoutEditorDisplay and column metadata bags.
 */

import type { LayoutAdornmentIcon, LayoutCollectionColumn, LayoutItem, LayoutRenderHint } from "@/lib/layout/layoutV2";
import { isLayoutRenderHint, LAYOUT_ADORNMENT_ICONS } from "@/lib/layout/layoutV2";

export const LAYOUT_EDITOR_DISPLAY_METADATA_KEY = "layoutEditorDisplay" as const;

export const LAYOUT_TYPOGRAPHY_INTENTS = ["primary", "secondary", "muted", "caption", "emphasis"] as const;
export type LayoutTypographyIntent = (typeof LAYOUT_TYPOGRAPHY_INTENTS)[number];

export const LAYOUT_LINK_BEHAVIORS = ["none", "open_record", "open_drawer", "open_modal", "external_url", "mailto", "tel"] as const;
export type LayoutLinkBehavior = (typeof LAYOUT_LINK_BEHAVIORS)[number];

/** Operator-facing labels; internal values remain stable for storage. */
export const LAYOUT_LINK_BEHAVIOR_LABELS: Record<LayoutLinkBehavior, string> = {
    none: "No action",
    open_record: "Link to record",
    /**
     * RETIRED. The record overlay it named does not exist: the inline Focus Panel is the one record
     * surface, and card/item focus is an attention ASPECT, not a link behaviour. The VALUE stays in
     * the union so published tenant layouts keep parsing — configuration data is not ours to rewrite
     * — but it is no longer offered for authoring, and no operator surface renders it.
     */
    open_drawer: "Open record (retired)",
    open_modal: "Open modal",
    external_url: "Open external URL",
    mailto: "Email",
    tel: "Call phone number",
};

/** MVP link behaviors shown in Experience Builder — advanced options remain in storage only. */
export const LAYOUT_LINK_BEHAVIORS_EDITOR: LayoutLinkBehavior[] = [
    "none",
    "open_record",
    "mailto",
    "tel",
];

export const LAYOUT_TYPOGRAPHY_INTENT_LABELS: Record<LayoutTypographyIntent, string> = {
    primary: "Primary",
    secondary: "Secondary",
    muted: "Muted",
    caption: "Small",
    emphasis: "Primary (bold)",
};

/** Typography presets exposed in Experience Builder field settings. */
export const LAYOUT_TYPOGRAPHY_INTENTS_EDITOR: LayoutTypographyIntent[] = [
    "primary",
    "secondary",
    "caption",
    "muted",
];

export const LAYOUT_LABEL_POSITIONS = ["above", "inline", "hidden"] as const;
export type LayoutLabelPosition = (typeof LAYOUT_LABEL_POSITIONS)[number];

export const LAYOUT_ICON_POSITIONS = ["left", "right", "above"] as const;
export type LayoutIconPosition = (typeof LAYOUT_ICON_POSITIONS)[number];

export const LAYOUT_AGE_FORMATS = ["years", "years_months", "months", "full_text"] as const;
export type LayoutAgeFormat = (typeof LAYOUT_AGE_FORMATS)[number];

export const LAYOUT_AGE_FORMAT_LABELS: Record<LayoutAgeFormat, string> = {
    years: "Years only (2y)",
    years_months: "Years + months (2y4m)",
    months: "Months only (28m)",
    full_text: "Full text (2 years 4 months)",
};

export const LAYOUT_DATE_FORMATS = ["short", "medium", "long", "relative"] as const;
export type LayoutDateFormat = (typeof LAYOUT_DATE_FORMATS)[number];

export const LAYOUT_CURRENCY_FORMATS = ["standard", "compact", "accounting"] as const;
export type LayoutCurrencyFormat = (typeof LAYOUT_CURRENCY_FORMATS)[number];

export const LAYOUT_STATUS_FORMATS = ["badge", "pill", "text"] as const;
export type LayoutStatusFormat = (typeof LAYOUT_STATUS_FORMATS)[number];

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
    "action_button",
] as const;
export type LayoutEditorDisplayType = (typeof LAYOUT_EDITOR_DISPLAY_TYPES)[number];

export type LayoutEditorDisplayConfig = {
    showLabel?: boolean;
    labelPosition?: LayoutLabelPosition;
    typographyIntent?: LayoutTypographyIntent;
    emptyState?: string;
    helperText?: string;
    linkBehavior?: LayoutLinkBehavior;
    externalUrl?: string;
    icon?: LayoutAdornmentIcon;
    showIcon?: boolean;
    iconPosition?: LayoutIconPosition;
    displayType?: LayoutEditorDisplayType;
    dateFormat?: LayoutDateFormat;
    currencyFormat?: LayoutCurrencyFormat;
    statusFormat?: LayoutStatusFormat;
    /** Computed age display when refKey is child.dob_age (derived from DOB at runtime). */
    ageFormat?: LayoutAgeFormat;
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
    action_button: "link",
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
    if (typeof bag.labelPosition === "string" && isLabelPosition(bag.labelPosition)) out.labelPosition = bag.labelPosition;
    if (typeof bag.typographyIntent === "string" && isTypographyIntent(bag.typographyIntent)) {
        out.typographyIntent = bag.typographyIntent;
    }
    if (typeof bag.emptyState === "string") out.emptyState = bag.emptyState.trim();
    if (typeof bag.helperText === "string") out.helperText = bag.helperText.trim();
    if (typeof bag.linkBehavior === "string" && isLinkBehavior(bag.linkBehavior)) out.linkBehavior = bag.linkBehavior;
    if (typeof bag.externalUrl === "string") out.externalUrl = bag.externalUrl.trim();
    if (typeof bag.icon === "string" && isAdornmentIcon(bag.icon)) out.icon = bag.icon;
    if (typeof bag.showIcon === "boolean") out.showIcon = bag.showIcon;
    if (typeof bag.iconPosition === "string" && isIconPosition(bag.iconPosition)) out.iconPosition = bag.iconPosition;
    if (typeof bag.displayType === "string" && isDisplayType(bag.displayType)) out.displayType = bag.displayType;
    if (typeof bag.dateFormat === "string" && isDateFormat(bag.dateFormat)) out.dateFormat = bag.dateFormat;
    if (typeof bag.currencyFormat === "string" && isCurrencyFormat(bag.currencyFormat)) out.currencyFormat = bag.currencyFormat;
    if (typeof bag.statusFormat === "string" && isStatusFormat(bag.statusFormat)) out.statusFormat = bag.statusFormat;
    if (typeof bag.ageFormat === "string" && isAgeFormat(bag.ageFormat)) out.ageFormat = bag.ageFormat;
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
    if (merged.labelPosition) cleaned.labelPosition = merged.labelPosition;
    if (merged.typographyIntent) cleaned.typographyIntent = merged.typographyIntent;
    if (merged.emptyState) cleaned.emptyState = merged.emptyState;
    if (merged.helperText) cleaned.helperText = merged.helperText;
    if (merged.linkBehavior) cleaned.linkBehavior = merged.linkBehavior;
    if (merged.externalUrl) cleaned.externalUrl = merged.externalUrl;
    if (merged.icon) cleaned.icon = merged.icon;
    if (merged.showIcon !== undefined) cleaned.showIcon = merged.showIcon;
    if (merged.iconPosition) cleaned.iconPosition = merged.iconPosition;
    if (merged.displayType) cleaned.displayType = merged.displayType;
    if (merged.dateFormat) cleaned.dateFormat = merged.dateFormat;
    if (merged.currencyFormat) cleaned.currencyFormat = merged.currencyFormat;
    if (merged.statusFormat) cleaned.statusFormat = merged.statusFormat;
    if (merged.ageFormat) cleaned.ageFormat = merged.ageFormat;
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
        case "primary":
            return "text-sm font-medium text-alloy-midnight";
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

function defaultAdornmentIconForRefKey(
    refKey: string | undefined,
    linkBehavior?: LayoutLinkBehavior,
): LayoutAdornmentIcon {
    if (linkBehavior === "mailto") return "mail";
    if (linkBehavior === "tel") return "phone";
    const key = refKey?.trim() ?? "";
    if (key.includes("location")) return "location";
    if (key.includes("dob") || key.includes("age") || key.includes("birth") || key.includes("start_date")) return "calendar";
    if (key.startsWith("person.")) return "person";
    if (key.startsWith("child.") || key.startsWith("inquiry_child.")) return "child";
    if (key.startsWith("opportunity.")) return "opportunity";
    if (key.includes("phone")) return "phone";
    if (key.includes("email") || key.includes("mail")) return "mail";
    if (key.includes("program") || key.includes("room")) return "school";
    return "person";
}

/** Default icon for a layout refKey — used when show-icon is enabled without an explicit pick. */
export function resolveLayoutEditorDefaultIconForRefKey(
    refKey: string | undefined,
    linkBehavior?: LayoutLinkBehavior,
): LayoutAdornmentIcon {
    return defaultAdornmentIconForRefKey(refKey, linkBehavior);
}

export function resolveLayoutCollectionColumnShowIcon(col: Pick<LayoutCollectionColumn, "refKey" | "adornment" | "metadata">): boolean {
    const config = readLayoutEditorDisplayConfig(col);
    if (config.showIcon === false) return false;
    if (config.showIcon === true) return true;
    return Boolean(config.icon ?? col.adornment?.icon);
}

export function resolveLayoutCollectionColumnAdornment(
    col: Pick<LayoutCollectionColumn, "refKey" | "adornment" | "metadata">,
): LayoutItem["adornment"] | undefined {
    const config = readLayoutEditorDisplayConfig(col);
    if (!resolveLayoutCollectionColumnShowIcon(col)) return undefined;
    const icon =
        config.icon
        ?? col.adornment?.icon
        ?? defaultAdornmentIconForRefKey(col.refKey, config.linkBehavior);
    const position =
        config.iconPosition === "right" ? "right"
        : config.iconPosition === "above" ? "left"
        : col.adornment?.position ?? "left";
    const action =
        col.adornment?.action
        ?? ((config.linkBehavior === "open_drawer" || config.linkBehavior === "open_record") ?
            resolveOpenDrawerActionForRefKey(col.refKey)
        :   undefined);
    return {
        position,
        icon,
        ...(action ? { action } : {}),
    };
}

/** Full column adornment including linkBehavior-driven open_drawer action (runtime parity). */
export function resolveLayoutCollectionColumnLinkAdornment(
    col: Pick<LayoutCollectionColumn, "refKey" | "adornment" | "metadata">,
): LayoutItem["adornment"] | undefined {
    const config = readLayoutEditorDisplayConfig(col);
    const linkBehavior = config.linkBehavior;
    if (linkBehavior === "open_drawer" || linkBehavior === "open_record") {
        const action = resolveOpenDrawerActionForRefKey(col.refKey) ?? col.adornment?.action;
        if (!action) return resolveLayoutCollectionColumnAdornment(col);
        const icon =
            config.icon
            ?? col.adornment?.icon
            ?? defaultAdornmentIconForRefKey(col.refKey, linkBehavior);
        const position =
            config.iconPosition === "right" ? "right"
            : config.iconPosition === "above" ? "left"
            : col.adornment?.position ?? "left";
        return { position, icon, action };
    }
    return resolveLayoutCollectionColumnAdornment(col);
}

function resolveOpenDrawerActionForRefKey(
    refKey: string | undefined,
): { type: "open_drawer"; entity: "person" | "child" | "opportunity"; idPath?: string } | undefined {
    const key = refKey?.trim() ?? "";
    if (key.startsWith("person.")) {
        return { type: "open_drawer", entity: "person", idPath: "opportunity.primary_person_id" };
    }
    if (key.startsWith("child.") || key.startsWith("inquiry_child.")) {
        return { type: "open_drawer", entity: "child", idPath: "child.id" };
    }
    if (key.startsWith("opportunity.")) {
        return { type: "open_drawer", entity: "opportunity", idPath: "id" };
    }
    return undefined;
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

    const linkBehavior = config.linkBehavior;
    const icon = config.icon ?? item.adornment?.icon;
    const position = item.adornment?.position ?? (config.iconPosition === "right" ? "right" : "left");

    if (linkBehavior === "open_drawer") {
        const action = resolveOpenDrawerActionForRefKey(item.refKey);
        if (action) {
            patch.adornment = {
                position,
                icon: icon ?? defaultAdornmentIconForRefKey(item.refKey, linkBehavior),
                action,
            };
        }
    } else if (linkBehavior === "open_record") {
        const action = resolveOpenDrawerActionForRefKey(item.refKey);
        if (action) {
            patch.adornment = {
                position,
                icon: icon ?? defaultAdornmentIconForRefKey(item.refKey, linkBehavior),
                action,
            };
        }
    } else if (linkBehavior === "mailto" || linkBehavior === "tel" || linkBehavior === "none") {
        if (icon) {
            patch.adornment = {
                position,
                icon,
            };
        } else if (linkBehavior === "none" && item.adornment?.action) {
            patch.adornment = {
                position: item.adornment.position,
                icon: item.adornment.icon,
            };
        }
    } else if (config.icon) {
        patch.adornment = {
            position,
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
    const patch: Partial<LayoutCollectionColumn> = {
        metadata: writeLayoutEditorDisplayConfig(col.metadata, config),
    };
    if (config.displayType) {
        const hint = renderHintForDisplayType(config.displayType);
        if (hint) patch.renderHint = hint;
    }

    const linkBehavior = config.linkBehavior;
    const icon = config.icon ?? col.adornment?.icon;
    const position = col.adornment?.position ?? (config.iconPosition === "right" ? "right" : "left");

    if (linkBehavior === "open_drawer" || linkBehavior === "open_record") {
        const action = resolveOpenDrawerActionForRefKey(col.refKey);
        if (action) {
            patch.adornment = {
                position,
                icon: icon ?? defaultAdornmentIconForRefKey(col.refKey, linkBehavior),
                action,
            };
        }
    } else if (linkBehavior === "mailto" || linkBehavior === "tel" || linkBehavior === "none") {
        if (icon) {
            patch.adornment = { position, icon };
        } else if (linkBehavior === "none" && col.adornment?.action) {
            patch.adornment = {
                position: col.adornment.position,
                icon: col.adornment.icon,
            };
        }
    } else if (config.icon || config.showIcon === true) {
        const resolvedIcon = config.icon ?? defaultAdornmentIconForRefKey(col.refKey, config.linkBehavior);
        patch.adornment = {
            position,
            icon: resolvedIcon,
            ...(col.adornment?.action ? { action: col.adornment.action } : {}),
        };
    } else if (config.showIcon === false) {
        if (col.adornment?.action) {
            patch.adornment = { position: col.adornment.position, icon: col.adornment.icon, action: col.adornment.action };
        }
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

function isLabelPosition(v: string): v is LayoutLabelPosition {
    return (LAYOUT_LABEL_POSITIONS as readonly string[]).includes(v);
}

function isIconPosition(v: string): v is LayoutIconPosition {
    return (LAYOUT_ICON_POSITIONS as readonly string[]).includes(v);
}

function isDateFormat(v: string): v is LayoutDateFormat {
    return (LAYOUT_DATE_FORMATS as readonly string[]).includes(v);
}

function isCurrencyFormat(v: string): v is LayoutCurrencyFormat {
    return (LAYOUT_CURRENCY_FORMATS as readonly string[]).includes(v);
}

function isStatusFormat(v: string): v is LayoutStatusFormat {
    return (LAYOUT_STATUS_FORMATS as readonly string[]).includes(v);
}

function isAgeFormat(v: string): v is LayoutAgeFormat {
    return (LAYOUT_AGE_FORMATS as readonly string[]).includes(v);
}

export function isLayoutRenderHintValue(v: unknown): boolean {
    return typeof v === "string" && isLayoutRenderHint(v);
}
