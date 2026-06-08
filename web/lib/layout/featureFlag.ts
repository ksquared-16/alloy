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

/** Client-side gate for the Layout V2 admin UI. Default: off. Also on when hard cutover runtime is active. */
export function isLayoutV2PreviewEnabledClient(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_LAYOUT_V2_PREVIEW_ENABLED, false);
}

/** Emergency rollback — restores VM/legacy as primary when set. Default: off. */
export function isLayoutRuntimeLegacyEmergencyFallbackEnabledServer(): boolean {
    return readFlag(process.env.LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK, false);
}

export function isLayoutRuntimeLegacyEmergencyFallbackEnabledClient(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK, false);
}

/**
 * Staging hard cutover — layout runtime is the primary path when master runtime is on
 * and emergency legacy fallback is off.
 */
export function isLayoutRuntimeHardCutoverActiveServer(): boolean {
    return isLayoutRuntimeEnabledServer() && !isLayoutRuntimeLegacyEmergencyFallbackEnabledServer();
}

export function isLayoutRuntimeHardCutoverActiveClient(): boolean {
    return isLayoutRuntimeEnabledClient() && !isLayoutRuntimeLegacyEmergencyFallbackEnabledClient();
}

/**
 * Layout config UI + entity-layouts write APIs — preview OR hard cutover runtime.
 * Staging operators configure layouts without a separate preview flag.
 */
export function isLayoutV2ConfigEnabledServer(): boolean {
    return isLayoutV2PreviewEnabledServer() || isLayoutRuntimeHardCutoverActiveServer();
}

export function isLayoutV2ConfigEnabledClient(): boolean {
    return isLayoutV2PreviewEnabledClient() || isLayoutRuntimeHardCutoverActiveClient();
}

/** Server-side gate for Layout V2 preview/config APIs. Default: off. Also on when hard cutover runtime is active. */
export function isLayoutV2PreviewEnabledServer(): boolean {
    return readFlag(process.env.LAYOUT_V2_PREVIEW_ENABLED, false);
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

/** Per-entity cutover gate — opportunity drawer (C1a/C1b). Default: off. */
export function isLayoutRuntimeOpportunityDrawerEnabledServer(): boolean {
    return readFlag(process.env.LAYOUT_RUNTIME_OPPORTUNITY_DRAWER, false);
}

export function isLayoutRuntimeOpportunityDrawerEnabledClient(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER, false);
}

/**
 * C1a production shadow mount — requires master runtime + opportunity drawer flag.
 * Does NOT enable visible layout runtime body. Default: off.
 */
export function isLayoutRuntimeOpportunityDrawerShadowReadPathEnabled(): boolean {
    return (
        isLayoutRuntimeEnabledServer() &&
        isLayoutRuntimeOpportunityDrawerEnabledServer() &&
        !isLayoutRuntimeOpportunityDrawerBodyEnabledServer()
    );
}

export function isLayoutRuntimeOpportunityDrawerShadowReadPathEnabledClient(): boolean {
    return (
        isLayoutRuntimeEnabledClient() &&
        isLayoutRuntimeOpportunityDrawerEnabledClient() &&
        !isLayoutRuntimeOpportunityDrawerBodyEnabledClient()
    );
}

/**
 * C1b — visible opportunity drawer overview body from layout runtime.
 * Requires hard cutover + opportunity drawer flag; blocked by emergency legacy fallback.
 */
export function isLayoutRuntimeOpportunityDrawerBodyEnabledServer(): boolean {
    return (
        isLayoutRuntimeHardCutoverActiveServer() &&
        isLayoutRuntimeOpportunityDrawerEnabledServer()
    );
}

export function isLayoutRuntimeOpportunityDrawerBodyEnabledClient(): boolean {
    return (
        isLayoutRuntimeHardCutoverActiveClient() &&
        isLayoutRuntimeOpportunityDrawerEnabledClient()
    );
}

/** Per-entity cutover gate — person drawer body. Default: off. */
export function isLayoutRuntimePersonDrawerEnabledServer(): boolean {
    return readFlag(process.env.LAYOUT_RUNTIME_PERSON_DRAWER, false);
}

export function isLayoutRuntimePersonDrawerEnabledClient(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_PERSON_DRAWER, false);
}

export function isLayoutRuntimePersonDrawerBodyEnabledServer(): boolean {
    return isLayoutRuntimeHardCutoverActiveServer() && isLayoutRuntimePersonDrawerEnabledServer();
}

export function isLayoutRuntimePersonDrawerBodyEnabledClient(): boolean {
    return isLayoutRuntimeHardCutoverActiveClient() && isLayoutRuntimePersonDrawerEnabledClient();
}

/** Per-entity cutover gate — child drawer body. Default: off. */
export function isLayoutRuntimeChildDrawerEnabledServer(): boolean {
    return readFlag(process.env.LAYOUT_RUNTIME_CHILD_DRAWER, false);
}

export function isLayoutRuntimeChildDrawerEnabledClient(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_CHILD_DRAWER, false);
}

export function isLayoutRuntimeChildDrawerBodyEnabledServer(): boolean {
    return isLayoutRuntimeHardCutoverActiveServer() && isLayoutRuntimeChildDrawerEnabledServer();
}

export function isLayoutRuntimeChildDrawerBodyEnabledClient(): boolean {
    return isLayoutRuntimeHardCutoverActiveClient() && isLayoutRuntimeChildDrawerEnabledClient();
}

/** Per-entity cutover gate — opportunity queue rows (C4 foundation). Default: off. */
export function isLayoutRuntimeOpportunityQueueEnabledServer(): boolean {
    return readFlag(process.env.LAYOUT_RUNTIME_OPPORTUNITY_QUEUE, false);
}

export function isLayoutRuntimeOpportunityQueueEnabledClient(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_QUEUE, false);
}

/** C4 shadow/proof read path — when queue body cutover is off. Default: off. */
export function isLayoutRuntimeOpportunityQueueShadowReadPathEnabled(): boolean {
    return (
        isLayoutRuntimeEnabledServer() &&
        isLayoutRuntimeOpportunityQueueEnabledServer() &&
        !isLayoutRuntimeOpportunityQueueBodyEnabledServer()
    );
}

export function isLayoutRuntimeOpportunityQueueShadowReadPathEnabledClient(): boolean {
    return (
        isLayoutRuntimeEnabledClient() &&
        isLayoutRuntimeOpportunityQueueEnabledClient() &&
        !isLayoutRuntimeOpportunityQueueBodyEnabledClient()
    );
}

/** C4 visible queue row body — hard cutover + opportunity queue flag. Default: off. */
export function isLayoutRuntimeOpportunityQueueBodyEnabledServer(): boolean {
    return isLayoutRuntimeHardCutoverActiveServer() && isLayoutRuntimeOpportunityQueueEnabledServer();
}

export function isLayoutRuntimeOpportunityQueueBodyEnabledClient(): boolean {
    return isLayoutRuntimeHardCutoverActiveClient() && isLayoutRuntimeOpportunityQueueEnabledClient();
}

/** Optional dev/staging diagnostics panel inside opportunity drawer. Default: off. */
export function isLayoutRuntimeOpportunityDrawerShadowDiagnosticsEnabledClient(): boolean {
    return (
        isLayoutRuntimeOpportunityDrawerShadowReadPathEnabledClient() &&
        readFlag(process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER_SHADOW_DIAGNOSTICS, false)
    );
}

/**
 * Effective API + server resolve may read entity_layouts when preview OR runtime is on.
 * Live renderers must additionally check isLayoutRuntimeEnabled* before mounting.
 */
export function isLayoutRuntimeReadPathEnabled(): boolean {
    return isLayoutV2PreviewEnabledServer() || isLayoutRuntimeEnabledServer();
}
