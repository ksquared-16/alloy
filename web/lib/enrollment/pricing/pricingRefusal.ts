/**
 * The refusal code of a tuition accept/override, read from the execute route's response.
 *
 * `/api/admin/actions/execute` speaks the standard envelope: a refused action's blockers live under
 * `error.details.blockers` (see app/api/admin/actions/execute/route.ts). A caller that read a
 * top-level `blockers` saw no code at all — so a `stale_resolution` was indistinguishable from any
 * other refusal and its one re-resolve-and-retry never ran. The top-level shape is still read for
 * callers of the runtime's own ActionResult.
 */
export function pricingRefusalCode(body: unknown): string | null {
    if (!body || typeof body !== "object") return null;
    const b = body as {
        blockers?: Array<{ code?: unknown }>;
        error?: { code?: unknown; details?: { blockers?: Array<{ code?: unknown }> } } | string;
    };
    const nested = typeof b.error === "object" && b.error ? b.error.details?.blockers : undefined;
    const code = (nested ?? b.blockers)?.[0]?.code;
    return typeof code === "string" && code.trim() ? code.trim() : null;
}
