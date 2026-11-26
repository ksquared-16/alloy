/**
 * Surfaces navigation breadcrumb model (Presentation Runtime V3).
 *
 * Builds the trail shown while editing a surface:
 *
 *     Settings / Surfaces / [Surface]
 *     Settings / Surfaces / Focus Panel / Children Card / Children Surface   (nested)
 *
 * Pure + testable. Each crumb declares whether it is clickable (navigates) and,
 * for nested editing, how far back it pops. The last crumb is the current view
 * and is not a link.
 */

export type BreadcrumbCrumb = {
    /** Operator-facing label. */
    label: string;
    /**
     * Navigation target when clicked:
     *  - "root"   → back to the Surfaces library (clears selection)
     *  - "surface"→ back to the top surface being edited (pops nested trail)
     *  - number   → pop to this depth in the nested trail (0-based)
     *  - null     → current view, not clickable
     */
    target: "root" | "surface" | number | null;
};

/**
 * Build the breadcrumb trail. `nestedTrail` is the drill path inside a surface
 * (e.g. ["Children Card", "Children Surface"]); omit/empty for a flat surface.
 */
export function buildSurfacesBreadcrumb(opts: {
    sectionLabel: string;
    surfaceTitle: string;
    nestedTrail?: readonly string[];
}): BreadcrumbCrumb[] {
    const { sectionLabel, surfaceTitle, nestedTrail = [] } = opts;
    const crumbs: BreadcrumbCrumb[] = [
        { label: "Surfaces", target: "root" },
        { label: sectionLabel, target: "root" },
    ];
    // The surface itself: clickable only when we're deeper than it.
    crumbs.push({ label: surfaceTitle, target: nestedTrail.length > 0 ? "surface" : null });
    // Nested drill segments: each clickable to pop to its depth, except the last.
    nestedTrail.forEach((label, i) => {
        const isLast = i === nestedTrail.length - 1;
        crumbs.push({ label, target: isLast ? null : i });
    });
    return crumbs;
}

/** The current (deepest) crumb label — what the operator is editing right now. */
export function currentCrumbLabel(crumbs: readonly BreadcrumbCrumb[]): string {
    return crumbs[crumbs.length - 1]?.label ?? "";
}
