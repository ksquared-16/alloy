/**
 * A BROWSER STAND-IN FOR NODE'S `crypto`, for the geometry bundles only.
 *
 * `UniversalCard` → `focusPanelDisplayLabels` → `loadEffectiveEnrollmentStagesByOpportunity` →
 * `enrollmentProcessTemplate`, which opens with `import { randomUUID } from "crypto"`. That module
 * is a lifecycle-builder authoring helper; nothing in a geometry fixture calls it. It is in the
 * bundle because it is in the import graph, and esbuild cannot resolve a node builtin for a browser
 * target, so the whole bundle failed to build.
 *
 * Shimming it keeps the module graph under certification the SHIPPED one — the alternative was to
 * stop importing the real `UniversalCard`, which would have meant certifying a stand-in for the
 * exact component whose painted box is the thing in question.
 *
 * `globalThis.crypto.randomUUID` is the browser's own implementation, so if some future fixture
 * does reach this path it gets a real UUID rather than a fake that quietly diverges.
 */

export function randomUUID(): string {
    return globalThis.crypto.randomUUID();
}

export default { randomUUID };
