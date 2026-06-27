/**
 * Focus Panel — Edit Mode primitives (Experience Builder V2: runtime editing).
 *
 * Doctrine ("the runtime IS the editor"): the editor renders the *real* runtime
 * presentation components and layout behavior — it does NOT mean operators edit
 * from the live frontend. The product access point for editing Design Surfaces is
 * `/settings/surfaces`, where an editable replica reuses the Focus Panel grid with
 * `editing` enabled. The operator workspace exposes no editing controls.
 *
 * The edit surfaces / labels below are shared by the edit-bar chrome. The
 * `?edit=1` helpers remain only as a framework-free, unit-testable developer seam
 * (e.g. ad-hoc inspection); they are intentionally NOT wired into the operator
 * runtime or product routing.
 */

/** URL query param that opts the Focus Panel surface into Edit Mode. */
export const FOCUS_PANEL_EDIT_PARAM = "edit" as const;

/** The only truthy value — `?edit=1`. */
export const FOCUS_PANEL_EDIT_PARAM_ON = "1" as const;

/** Two editing mental models (Experience Builder V2 doctrine), kept lightweight. */
export const FOCUS_PANEL_EDIT_SURFACES = ["structure", "content"] as const;
export type FocusPanelEditSurface = (typeof FOCUS_PANEL_EDIT_SURFACES)[number];

export const FOCUS_PANEL_EDIT_SURFACE_LABELS: Record<FocusPanelEditSurface, string> = {
    structure: "Structure",
    content: "Content",
};

/** Pure: is the Focus Panel edit affordance requested for this query? */
export function isFocusPanelEditModeRequested(
    searchParams: Pick<URLSearchParams, "get"> | null | undefined,
): boolean {
    return searchParams?.get(FOCUS_PANEL_EDIT_PARAM) === FOCUS_PANEL_EDIT_PARAM_ON;
}

/**
 * Pure: returns a new query string with the edit param removed. "Done" exits Edit
 * Mode by dropping `?edit=1` while preserving every other param (queue, mode, etc.).
 * Returns "" when no params remain (caller renders a bare pathname).
 */
export function buildFocusPanelEditExitQuery(search: string | URLSearchParams): string {
    const params = new URLSearchParams(typeof search === "string" ? search : search.toString());
    params.delete(FOCUS_PANEL_EDIT_PARAM);
    return params.toString();
}
