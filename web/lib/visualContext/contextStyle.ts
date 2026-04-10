import type { CSSProperties } from "react";
import { neutral, derived, brand, palette } from "@/styles/tokens/colors";
import type { AlloyVisualFamily, ResolvedVisualContext, VisualContextLayer } from "./types";
import { resolveVisualContext } from "./contextResolver";
import { laneKeyToVisualBias } from "./accentFamily";
import { departmentWorkspaceShellBaseStyle } from "./shellBaseTokens";
import type { OperationalVisualStyleInput, VisualContextResolveHints } from "./types";

/** Layer intensity: workspace light → department medium → work_unit strong → record focused. */
const LAYER_STRENGTH: Record<VisualContextLayer, number> = {
    workspace: 0.2,
    department: 0.42,
    work_unit: 0.78,
    record: 0.52,
};

/** Maps Alloy families to existing company tile CSS (`workspace.css`) without redesign. */
export function alloyFamilyToWorkspaceTileTone(
    family: AlloyVisualFamily
): "pine" | "amber" | "blue" | "neutral" {
    switch (family) {
        case "alloy_blue":
            return "blue";
        case "bend_pine":
            return "pine";
        case "amber":
            return "amber";
        case "midnight_blue":
            return "neutral";
        case "neutral":
        default:
            return "neutral";
    }
}

function chromaForAlloyFamily(family: AlloyVisualFamily): { primary: string; secondary: string } {
    switch (family) {
        case "alloy_blue":
            return { primary: palette.alloyBlue, secondary: palette.bendPine };
        case "bend_pine":
            return { primary: palette.alloyBlue, secondary: palette.bendPine };
        case "amber":
            return { primary: brand.accent, secondary: palette.bendPine };
        case "midnight_blue":
            return { primary: palette.midnightForge, secondary: palette.bendPine };
        case "neutral":
        default:
            return { primary: palette.midnightForge, secondary: palette.bendPine };
    }
}

/**
 * Context as signal, not surface tint: headers stay white; one right-edge rail carries identity.
 * Work panels use rails / rules / optional very light wash only.
 */
function buildContextualPresentationTokens(resolved: ResolvedVisualContext, strength: number): CSSProperties {
    const { primary, secondary } = chromaForAlloyFamily(resolved.alloyFamily);
    const fam = resolved.alloyFamily;
    const t = Math.min(1, strength);

    let labelAccent = primary;
    if (fam === "bend_pine") labelAccent = secondary;
    if (fam === "neutral" || fam === "midnight_blue") labelAccent = palette.midnightForge;

    /** Subtle vertical accent on the right edge of header/control deck (not a full-width wash). */
    const headerRailOpacity = Math.min(0.62, 0.28 + t * 0.22);
    const headerRailAccent =
        fam === "amber"
            ? `color-mix(in srgb, ${primary} ${Math.round(headerRailOpacity * 100)}%, #ffffff)`
            : fam === "bend_pine"
              ? `color-mix(in srgb, ${secondary} ${Math.round(headerRailOpacity * 100)}%, #ffffff)`
              : `color-mix(in srgb, ${primary} ${Math.round(headerRailOpacity * 100)}%, #ffffff)`;

    const rail =
        fam === "amber"
            ? `color-mix(in srgb, ${primary} 48%, var(--d-border))`
            : fam === "bend_pine"
              ? `color-mix(in srgb, ${secondary} 52%, var(--d-border))`
              : `color-mix(in srgb, ${primary} 45%, var(--d-border))`;

    const sectionWash = `color-mix(in srgb, #ffffff 96%, ${fam === "bend_pine" ? secondary : primary} 4%)`;

    return {
        ["--vc-label-accent" as string]: labelAccent,
        ["--vc-header-rail-accent" as string]: headerRailAccent,
        ["--vc-section-rail" as string]: rail,
        ["--vc-section-panel-wash" as string]: sectionWash,
    };
}

function mergeTokensForResolved(
    resolved: ResolvedVisualContext,
    layer: VisualContextLayer,
    laneKey: string | null | undefined
): CSSProperties {
    let strength = LAYER_STRENGTH[layer] + laneKeyToVisualBias(laneKey) * 0.12;
    if (resolved.alloyFamily === "amber" && resolved.amberEmphasis === "strong") {
        strength = Math.min(1, strength * 1.12);
    }
    strength = Math.min(1, strength);

    const family = resolved.alloyFamily;
    const { primary, secondary } = chromaForAlloyFamily(family);

    const mixTowardPrimary = (base: string, pct: number) =>
        `color-mix(in srgb, ${primary} ${Math.round(pct * strength * 100)}%, ${base})`;

    const mixTowardSecondary = (base: string, pct: number) =>
        `color-mix(in srgb, ${secondary} ${Math.round(pct * strength * 100)}%, ${base})`;

    let pineSlot = secondary;
    let brandSlot = primary;

    switch (family) {
        case "alloy_blue":
            pineSlot = mixTowardPrimary(secondary, 0.55);
            brandSlot = mixTowardPrimary(primary, 0.25);
            break;
        case "bend_pine":
            pineSlot = secondary;
            brandSlot = primary;
            break;
        case "amber":
            pineSlot = mixTowardSecondary(secondary, 0.35);
            brandSlot = primary;
            break;
        case "midnight_blue":
            pineSlot = mixTowardPrimary(secondary, 0.2);
            brandSlot = mixTowardPrimary(primary, 0.18);
            break;
        case "neutral":
        default:
            pineSlot = mixTowardPrimary(secondary, 0.15);
            brandSlot = primary;
            break;
    }

    const ambientCore = mixTowardSecondary(derived.ambientLifeBloomMid, 0.85);
    const fieldVeil = mixTowardPrimary(derived.canvasFieldWash, 0.5);
    const kpiBusiness = mixTowardSecondary(derived.kpiBandBusinessLight, 0.9);

    const presentation = buildContextualPresentationTokens(resolved, strength);

    return {
        ...presentation,
        ["--d-pine" as string]: pineSlot,
        ["--d-brand" as string]: brandSlot,
        ["--d-ambient-core" as string]: ambientCore,
        ["--d-field-veil" as string]: fieldVeil,
        ["--d-kpi-tint" as string]: kpiBusiness,
        ["--vc-alloy-family" as string]: family,
        ["--vc-context-key" as string]: "",
        ["--vc-layer-strength" as string]: String(strength),
    };
}

export function mergeOperationalVisualTokens(input: OperationalVisualStyleInput): CSSProperties {
    const { layer, ...hints } = input;
    const resolved = resolveVisualContext(hints);
    const merged = mergeTokensForResolved(resolved, layer, hints.laneKey);
    return {
        ...merged,
        ["--vc-context-key" as string]: resolved.contextKey,
    };
}

export function operationalWorkspaceShellStyle(input: OperationalVisualStyleInput): CSSProperties {
    return {
        ...departmentWorkspaceShellBaseStyle,
        ...mergeOperationalVisualTokens(input),
    };
}

export function workspaceTileContextStyle(hints: VisualContextResolveHints): CSSProperties {
    const resolved = resolveVisualContext(hints);
    const strength = LAYER_STRENGTH.workspace;
    const { primary, secondary } = chromaForAlloyFamily(resolved.alloyFamily);
    const family = resolved.alloyFamily;

    const edge =
        family === "alloy_blue"
            ? `color-mix(in srgb, ${primary} ${Math.round(14 + 22 * strength)}%, transparent)`
            : family === "amber"
              ? `color-mix(in srgb, ${primary} ${Math.round(12 + 18 * strength)}%, transparent)`
              : family === "bend_pine"
                ? `color-mix(in srgb, ${secondary} ${Math.round(16 + 24 * strength)}%, transparent)`
                : family === "midnight_blue"
                  ? `color-mix(in srgb, ${primary} ${Math.round(10 + 14 * strength)}%, transparent)`
                  : `color-mix(in srgb, ${palette.midnightForge} ${Math.round(8 + 10 * strength)}%, transparent)`;

    return {
        ["--vc-tile-rail" as string]: edge,
        ["--vc-alloy-family" as string]: family,
        ["--vc-context-key" as string]: resolved.contextKey,
    };
}

export function recordSurfaceContextStyle(hints: VisualContextResolveHints): CSSProperties {
    const resolved = resolveVisualContext(hints);
    const merged = mergeOperationalVisualTokens({ ...hints, layer: "record" });
    let strength = Math.min(1, LAYER_STRENGTH.record + laneKeyToVisualBias(hints.laneKey) * 0.12);
    if (resolved.alloyFamily === "amber" && resolved.amberEmphasis === "strong") {
        strength = Math.min(1, strength * 1.08);
    }

    /** Record modal: Bend Pine–led chrome — precise, not themed; semantic resolver unchanged above. */
    const pine = palette.bendPine;
    const rim = `color-mix(in srgb, ${pine} ${Math.round(26 + 18 * strength)}%, ${neutral.surface})`;
    const labelForRecord = `color-mix(in srgb, ${pine} 38%, ${palette.midnightForge})`;
    const headerRailRecord = `color-mix(in srgb, ${pine} 52%, #ffffff)`;
    const tabUnderline = `color-mix(in srgb, ${pine} 55%, transparent)`;

    return {
        ...departmentWorkspaceShellBaseStyle,
        ...merged,
        ["--vc-record-rim" as string]: rim,
        ["--vc-label-accent" as string]: labelForRecord,
        ["--vc-header-rail-accent" as string]: headerRailRecord,
        ["--vc-drawer-header-bg" as string]: "#ffffff",
        ["--vc-drawer-body-veil" as string]: neutral.background,
        ["--vc-record-tab-underline" as string]: tabUnderline,
    };
}
