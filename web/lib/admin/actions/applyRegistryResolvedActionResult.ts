export type ApplyRegistryResolvedActionResult =
    | { ok: true; execution_result?: Record<string, unknown> }
    | { ok: false; error?: string };
