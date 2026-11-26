/**
 * Optional performance instrumentation for the Children card save path
 * (`ChildFocusEdit` → `saveInquiryChild`). Marks are best-effort: environments without
 * the Performance API (SSR, older test runners) simply no-op.
 */

export const CHILDREN_SAVE_PERF_MARK = {
    click: "children-save-click",
    request: "children-save-request",
    response: "children-save-response",
    done: "children-save-done",
} as const;

function perf(): Performance | null {
    return typeof performance !== "undefined" ? performance : null;
}

/** Record a named instant in the Children save lifecycle. No-op when unsupported. */
export function markChildrenSavePerf(name: string): void {
    const p = perf();
    if (!p || typeof p.mark !== "function") return;
    try {
        p.mark(name);
    } catch {
        // Best-effort only — never let instrumentation break the save path.
    }
}

/** Measure between two prior marks (e.g. request → response). No-op when unsupported. */
export function measureChildrenSavePerf(measureName: string, startMark: string, endMark: string): void {
    const p = perf();
    if (!p || typeof p.measure !== "function") return;
    try {
        p.measure(measureName, startMark, endMark);
    } catch {
        // Marks may be absent (e.g. save short-circuited with no changes) — ignore.
    }
}
