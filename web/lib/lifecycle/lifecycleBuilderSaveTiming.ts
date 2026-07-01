/** Development-only timing logs for Lifecycle Builder saves. */

export function logLifecycleBuilderSaveTiming(
    operation: string,
    startedAt: number,
    extra?: Record<string, unknown>
): void {
    if (process.env.NODE_ENV === "production") return;
    const elapsed_ms = Date.now() - startedAt;
    console.info("[lifecycle-builder-save]", { operation, elapsed_ms, ...extra });
}
