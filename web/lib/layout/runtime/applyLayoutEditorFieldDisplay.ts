/**
 * Experience Builder field display — runtime formatting + publish guard helpers.
 */

import type { LayoutEditorDisplayConfig, LayoutDateFormat } from "@/lib/layout/layoutEditorDisplayConfig";
import {
    formatDisplayDate,
    formatDisplayDateTime,
    parsePresentationDateInput,
} from "@/lib/presentation/presentationDateFormat";
import {
    formatLayoutRuntimeOperatorDateIfRefKey,
    isLayoutRuntimeOperatorDateRefKey,
} from "@/lib/layout/runtime/formatLayoutRuntimeOperatorDate";
import type { LayoutItem } from "@/lib/layout/layoutV2";

export function shouldShowLayoutEditorFieldLabel(config: LayoutEditorDisplayConfig): boolean {
    if (config.showLabel === false) return false;
    if (config.labelPosition === "hidden") return false;
    return true;
}

export function isLayoutEditorInlineFieldLabel(config: LayoutEditorDisplayConfig): boolean {
    return config.labelPosition === "inline";
}

export function shouldShowLayoutEditorFieldIcon(
    item: LayoutItem,
    config: LayoutEditorDisplayConfig,
): boolean {
    if (config.showIcon === false) return false;
    return Boolean(config.icon ?? item.adornment?.icon);
}

export function formatLayoutEditorFieldDateValue(
    refKey: string,
    raw: string,
    renderHint: string | undefined,
    dateFormat: LayoutDateFormat | undefined,
): string {
    const isDate = renderHint === "date" || isLayoutRuntimeOperatorDateRefKey(refKey);
    if (!isDate) return raw;

    const parsed = parsePresentationDateInput(raw);
    if (!parsed) return formatLayoutRuntimeOperatorDateIfRefKey(refKey, raw, renderHint);

    const format = dateFormat ?? "medium";
    if (format === "relative") {
        const now = Date.now();
        const diffMs = parsed.date.getTime() - now;
        const dayMs = 86_400_000;
        const days = Math.round(diffMs / dayMs);
        if (days === 0) return "Today";
        if (days === -1) return "Yesterday";
        if (days === 1) return "Tomorrow";
        if (days > 1 && days < 7) return `In ${days} days`;
        if (days < -1 && days > -7) return `${Math.abs(days)} days ago`;
    }

    if (parsed.hasTime) {
        if (format === "short") return formatDisplayDateTime(parsed.date).replace(/, \d{1,2}:\d{2} [AP]M$/, "");
        return formatDisplayDateTime(parsed.date);
    }

    if (format === "short") {
        return parsed.date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
    }
    if (format === "long") {
        return parsed.date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    }
    return formatDisplayDate(parsed.date);
}

export function layoutEditorStatusFormatClass(
    config: LayoutEditorDisplayConfig,
    renderHint?: string,
): string {
    const format = config.statusFormat ?? (config.displayType === "pill" ? "pill" : "badge");
    if (format === "text" || renderHint !== "status" && config.displayType !== "badge" && config.displayType !== "pill") {
        return "";
    }
    if (format === "pill") {
        return "inline-block rounded-full border border-alloy-juniper/20 bg-alloy-juniper/8 px-2 py-0.5 text-xs font-medium text-alloy-midnight/90";
    }
    return "inline-block rounded-full border border-alloy-juniper/20 bg-alloy-juniper/8 px-2 py-0.5 text-xs font-medium text-alloy-midnight/90";
}

export function collectLayoutEditorDisplayPublishGuardErrors(
    config: LayoutEditorDisplayConfig,
    path: string,
): string[] {
    const errors: string[] = [];
    if (config.linkBehavior === "open_modal") {
        errors.push(`${path}: "Open modal" is not live yet. Choose a supported link action or remove it before publishing.`);
    }
    if (config.linkBehavior === "external_url") {
        errors.push(`${path}: "Open external URL" is not live yet. Choose a supported link action or remove it before publishing.`);
    }
    if (config.currencyFormat) {
        errors.push(`${path}: currency formatting is preview-only and cannot be published yet.`);
    }
    if (config.labelPosition === "inline") {
        errors.push(`${path}: inline label position is preview-only and cannot be published yet.`);
    }
    if (config.iconPosition === "above") {
        errors.push(`${path}: icon position "above" is preview-only and cannot be published yet.`);
    }
    return errors;
}
