/**
 * Layout V2 — feature flags.
 *
 * Preview/config surface: LAYOUT_V2_PREVIEW_ENABLED (default off).
 * Runtime read path (Phase 0): LAYOUT_RUNTIME_ENABLED (default off).
 *
 * While runtime flag is off, no live drawer, queue, or workspace behavior changes.
 * The runtime modules resolve safely for tests and the effective API only.
 */

function readFlag(raw: string | undefined, defaultValue: boolean): boolean {
    if (raw === undefined || raw === "") return defaultValue;
    const v = raw.trim().toLowerCase();
    if (v === "0" || v === "false" || v === "off" || v === "no") return false;
    if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
    return defaultValue;
}

/** Server-side gate for Layout V2 preview/config APIs. Default: off. */
export function isLayoutV2PreviewEnabledServer(): boolean {
    return readFlag(process.env.LAYOUT_V2_PREVIEW_ENABLED, false);
}

/** Client-side gate for the Layout V2 admin UI. Default: off. */
export function isLayoutV2PreviewEnabledClient(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_LAYOUT_V2_PREVIEW_ENABLED, false);
}

/** Server-side gate for layout runtime read path (Phase 0). Default: off. */
export function isLayoutRuntimeEnabledServer(): boolean {
    return readFlag(process.env.LAYOUT_RUNTIME_ENABLED, false);
}

/** Client-side gate for layout runtime adoption (future cutover). Default: off. */
export function isLayoutRuntimeEnabledClient(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED, false);
}

/** Shadow parity compare (Phase 3). Default: off. Proof API may also allow preview flag. */
export function isLayoutRuntimeShadowEnabledServer(): boolean {
    return readFlag(process.env.LAYOUT_RUNTIME_SHADOW_ENABLED, false);
}

export function isLayoutRuntimeShadowEnabledClient(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_SHADOW_ENABLED, false);
}

/** Proof shadow parity when explicit shadow flag OR layout preview is on. Never enables live cutover. */
export function isLayoutRuntimeShadowReadPathEnabled(): boolean {
    return isLayoutRuntimeShadowEnabledServer() || isLayoutV2PreviewEnabledServer();
}

/**
 * Effective API + server resolve may read entity_layouts when preview OR runtime is on.
 * Live renderers must additionally check isLayoutRuntimeEnabled* before mounting.
 */
export function isLayoutRuntimeReadPathEnabled(): boolean {
    return isLayoutV2PreviewEnabledServer() || isLayoutRuntimeEnabledServer();
}
