/**
 * C1b — diagnostic logging when layout runtime overview body render fails.
 *
 * Console-only; never shown to operators. VM overview body is the fallback UI.
 */

export type LayoutRuntimeDrawerSurface =
    | "opportunity_drawer_overview"
    | "person_drawer_overview"
    | "child_drawer_overview";

export type LayoutRuntimeBodyRenderFailureContext = {
    /** Entity record id (opportunity, person, or child). */
    entityId?: string | null;
    /** @deprecated Use entityId — kept for opportunity drawer call sites. */
    opportunityId?: string | null;
    layoutSource?: string | null;
    surface?: LayoutRuntimeDrawerSurface;
};

export function logLayoutRuntimeBodyRenderFailure(
    error: unknown,
    context: LayoutRuntimeBodyRenderFailureContext = {},
): void {
    if (typeof console === "undefined") return;
    const message = error instanceof Error ? error.message : String(error);
    const entityId = context.entityId ?? context.opportunityId ?? null;
    console.info("[layout_runtime_body:render_error]", {
        surface: context.surface ?? "opportunity_drawer_overview",
        entityId,
        layoutSource: context.layoutSource ?? null,
        message,
    });
}
