/**
 * C1b — diagnostic logging when layout runtime overview body render fails.
 *
 * Console-only; never shown to operators. VM overview body is the fallback UI.
 */

export type LayoutRuntimeBodyRenderFailureContext = {
    opportunityId?: string | null;
    layoutSource?: string | null;
    surface?: "opportunity_drawer_overview";
};

export function logLayoutRuntimeBodyRenderFailure(
    error: unknown,
    context: LayoutRuntimeBodyRenderFailureContext = {},
): void {
    if (typeof console === "undefined") return;
    const message = error instanceof Error ? error.message : String(error);
    console.info("[layout_runtime_body:render_error]", {
        surface: context.surface ?? "opportunity_drawer_overview",
        opportunityId: context.opportunityId ?? null,
        layoutSource: context.layoutSource ?? null,
        message,
    });
}
