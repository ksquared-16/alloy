/**
 * Admin-side document composition preview helpers (FD-12 / FD-14.6).
 * Shared layout contract for native preview, future public runtime, and embed runtime.
 */

import type { DocumentFieldRegionBlock } from "@/lib/forms/documentComposition";

export type FieldRegionPreviewLayout = DocumentFieldRegionBlock["layout"];

/** Tailwind grid/flex classes for preview field regions — must match authoring layout enum. */
export function fieldRegionPreviewLayoutClass(layout: FieldRegionPreviewLayout | undefined): string {
    switch (layout) {
        case "two_column":
            return "grid grid-cols-2 gap-x-3 gap-y-2";
        case "three_column":
            return "grid grid-cols-3 gap-x-2 gap-y-2";
        case "inline_compact":
            return "flex flex-col gap-1.5";
        default:
            return "grid grid-cols-1 gap-2";
    }
}

export function fieldRegionPreviewLayoutLabel(layout: FieldRegionPreviewLayout | undefined): string {
    switch (layout) {
        case "two_column":
            return "Two columns";
        case "three_column":
            return "Three columns";
        case "inline_compact":
            return "Compact rows";
        default:
            return "One column";
    }
}

export function fieldRegionPreviewFieldClass(layout: FieldRegionPreviewLayout | undefined): string {
    if (layout === "inline_compact") {
        return "flex items-center justify-between gap-2 rounded-md bg-white/90 px-2 py-1 ring-1 ring-alloy-midnight/[0.06]";
    }
    return "rounded-md bg-white/90 px-2 py-1.5 ring-1 ring-alloy-midnight/[0.06]";
}

export function spacerPreviewHeight(size: "sm" | "md" | "lg" | undefined): string {
    switch (size) {
        case "sm":
            return "h-2";
        case "lg":
            return "h-6";
        default:
            return "h-4";
    }
}
