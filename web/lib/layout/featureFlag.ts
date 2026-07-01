/**
 * Layout V2 — feature flags.
 *
 * Default: layout config + runtime ON everywhere. No env vars required.
 *
 * Emergency rollback only: `LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK=1` restores VM paths.
 * Optional kill switch: `LAYOUT_RUNTIME_ENABLED=0` / `NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED=0`.
 */

function readFlag(raw: string | undefined, defaultValue: boolean): boolean {
    if (raw === undefined || raw === "") return defaultValue;
    const v = raw.trim().toLowerCase();
    if (v === "0" || v === "false" || v === "off" || v === "no") return false;
    if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
    return defaultValue;
}

/** Per-entity flag — default ON when master runtime is on; explicit env overrides. */
function readLayoutRuntimeEntityFlag(raw: string | undefined, masterOn: boolean): boolean {
    if (!masterOn) return false;
    return readFlag(raw, true);
}

/** Client-side gate for the Layout V2 admin UI preview flag. Default: off (config uses runtime cutover). */
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
 * Hard cutover — layout runtime is the primary path when master runtime is on
 * and emergency legacy fallback is off.
 */
export function isLayoutRuntimeHardCutoverActiveServer(): boolean {
    return isLayoutRuntimeEnabledServer() && !isLayoutRuntimeLegacyEmergencyFallbackEnabledServer();
}

export function isLayoutRuntimeHardCutoverActiveClient(): boolean {
    return isLayoutRuntimeEnabledClient() && !isLayoutRuntimeLegacyEmergencyFallbackEnabledClient();
}

/**
 * Layout config UI + entity-layouts write APIs — always on unless emergency fallback
 * or explicit master runtime kill switch.
 */
export function isLayoutV2ConfigEnabledServer(): boolean {
    return isLayoutV2PreviewEnabledServer() || isLayoutRuntimeHardCutoverActiveServer();
}

export function isLayoutV2ConfigEnabledClient(): boolean {
    return isLayoutV2PreviewEnabledClient() || isLayoutRuntimeHardCutoverActiveClient();
}

/** Server-side gate for Layout V2 preview/config APIs. Default: off. */
export function isLayoutV2PreviewEnabledServer(): boolean {
    return readFlag(process.env.LAYOUT_V2_PREVIEW_ENABLED, false);
}

/** Server-side gate for layout runtime read path. Default: on. */
export function isLayoutRuntimeEnabledServer(): boolean {
    return readFlag(process.env.LAYOUT_RUNTIME_ENABLED, true);
}

/** Client-side gate for layout runtime adoption. Default: on. */
export function isLayoutRuntimeEnabledClient(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED, true);
}

/** Shadow parity compare (Phase 3). Default: off. */
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

/** Per-entity cutover gate — opportunity drawer. Default: on (when master on). */
export function isLayoutRuntimeOpportunityDrawerEnabledServer(): boolean {
    return readLayoutRuntimeEntityFlag(process.env.LAYOUT_RUNTIME_OPPORTUNITY_DRAWER, isLayoutRuntimeEnabledServer());
}

export function isLayoutRuntimeOpportunityDrawerEnabledClient(): boolean {
    return readLayoutRuntimeEntityFlag(process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER, isLayoutRuntimeEnabledClient());
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

/**
 * Phase 4 — adopt entity_layouts visual surface config (layoutEditorHidden) on opportunity drawer runtime.
 * Requires opportunity drawer body runtime. Default on when body is on; kill switch: `…_ENTITY_LAYOUTS_VISUAL_CONFIG=0`.
 */
export function isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledServer(): boolean {
    return (
        isLayoutRuntimeOpportunityDrawerBodyEnabledServer() &&
        readFlag(process.env.LAYOUT_RUNTIME_OPPORTUNITY_DRAWER_ENTITY_LAYOUTS_VISUAL_CONFIG, true)
    );
}

export function isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledClient(): boolean {
    return (
        isLayoutRuntimeOpportunityDrawerBodyEnabledClient() &&
        readFlag(process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER_ENTITY_LAYOUTS_VISUAL_CONFIG, true)
    );
}

/** Per-entity cutover gate — person drawer body. Default: on (when master on). */
export function isLayoutRuntimePersonDrawerEnabledServer(): boolean {
    return readLayoutRuntimeEntityFlag(process.env.LAYOUT_RUNTIME_PERSON_DRAWER, isLayoutRuntimeEnabledServer());
}

export function isLayoutRuntimePersonDrawerEnabledClient(): boolean {
    return readLayoutRuntimeEntityFlag(process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_PERSON_DRAWER, isLayoutRuntimeEnabledClient());
}

export function isLayoutRuntimePersonDrawerBodyEnabledServer(): boolean {
    return isLayoutRuntimeHardCutoverActiveServer() && isLayoutRuntimePersonDrawerEnabledServer();
}

export function isLayoutRuntimePersonDrawerBodyEnabledClient(): boolean {
    return isLayoutRuntimeHardCutoverActiveClient() && isLayoutRuntimePersonDrawerEnabledClient();
}

/** Per-entity cutover gate — child drawer body. Default: on (when master on). */
export function isLayoutRuntimeChildDrawerEnabledServer(): boolean {
    return readLayoutRuntimeEntityFlag(process.env.LAYOUT_RUNTIME_CHILD_DRAWER, isLayoutRuntimeEnabledServer());
}

export function isLayoutRuntimeChildDrawerEnabledClient(): boolean {
    return readLayoutRuntimeEntityFlag(process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_CHILD_DRAWER, isLayoutRuntimeEnabledClient());
}

export function isLayoutRuntimeChildDrawerBodyEnabledServer(): boolean {
    return isLayoutRuntimeHardCutoverActiveServer() && isLayoutRuntimeChildDrawerEnabledServer();
}

export function isLayoutRuntimeChildDrawerBodyEnabledClient(): boolean {
    return isLayoutRuntimeHardCutoverActiveClient() && isLayoutRuntimeChildDrawerEnabledClient();
}

/** Per-entity cutover gate — opportunity queue rows. Default: on (when master on). */
export function isLayoutRuntimeOpportunityQueueEnabledServer(): boolean {
    return readLayoutRuntimeEntityFlag(process.env.LAYOUT_RUNTIME_OPPORTUNITY_QUEUE, isLayoutRuntimeEnabledServer());
}

export function isLayoutRuntimeOpportunityQueueEnabledClient(): boolean {
    return readLayoutRuntimeEntityFlag(process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_QUEUE, isLayoutRuntimeEnabledClient());
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

/** C4 visible queue row body — hard cutover + opportunity queue flag. Default: on. */
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
 */
export function isLayoutRuntimeReadPathEnabled(): boolean {
    return isLayoutV2PreviewEnabledServer() || isLayoutRuntimeEnabledServer();
}

/**
 * Enrollment Focus Panel Summary — config-driven composition.
 *
 * Default: ON. The Focus Panel Summary grid is derived from a `LayoutDoc`
 * (config read path); the card models + renderer are unchanged, so output is
 * visually identical to the legacy hardcoded `SUMMARY_GRID` (parity verified by
 * the round-trip test). No env var is required to QA the config-driven path.
 *
 * Emergency kill switch only: `FOCUS_PANEL_LAYOUT_RUNTIME_ENABLED=0` (server),
 * `NEXT_PUBLIC_FOCUS_PANEL_LAYOUT_RUNTIME_ENABLED=0` (client) restore the
 * hardcoded grid.
 */
export function isFocusPanelLayoutRuntimeEnabledServer(): boolean {
    return readFlag(process.env.FOCUS_PANEL_LAYOUT_RUNTIME_ENABLED, true);
}

export function isFocusPanelLayoutRuntimeEnabledClient(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_FOCUS_PANEL_LAYOUT_RUNTIME_ENABLED, true);
}

/**
 * Non-production default for drawer summary strip boundary.
 * Production stays off until explicitly enabled; staging/preview/dev default on.
 */
function isDrawerSummaryStripBoundaryDefaultOn(): boolean {
    if (process.env.NEXT_PUBLIC_APP_ENV === "production") return false;
    if (process.env.APP_ENV === "production") return false;
    if (process.env.VERCEL_ENV === "production" && process.env.NEXT_PUBLIC_APP_ENV !== "staging") {
        return false;
    }
    if (process.env.NEXT_PUBLIC_APP_ENV === "staging") return true;
    if (process.env.VERCEL_ENV === "preview") return true;
    if (process.env.NODE_ENV === "development") return true;
    return false;
}

/**
 * Drawer summary strip shell boundary — routes layout summary sections into
 * EntityDrawerOperatingShell.summaryStrip.
 *
 * Default: on in development + staging/preview; off in production.
 * Override: `NEXT_PUBLIC_DRAWER_SUMMARY_STRIP_BOUNDARY=0|1` (client),
 * `DRAWER_SUMMARY_STRIP_BOUNDARY=0|1` (server).
 */
export function isDrawerSummaryStripBoundaryEnabledServer(): boolean {
    return readFlag(process.env.DRAWER_SUMMARY_STRIP_BOUNDARY, isDrawerSummaryStripBoundaryDefaultOn());
}

export function isDrawerSummaryStripBoundaryEnabledClient(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_DRAWER_SUMMARY_STRIP_BOUNDARY, isDrawerSummaryStripBoundaryDefaultOn());
}
