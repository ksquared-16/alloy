/**
 * Wake backend POST /internal/messages/process for legacy `public.messages` + `communication_*` queued rows.
 * Mirrors web/lib/workflowRun.ts triggerInternalMessagesProcess semantics (env-gated).
 */
export async function triggerBackendMessagesQueue(opts?: {
    workflow_run_id?: string | null;
    /** Default 25 */
    limit?: number;
}): Promise<{ attempted: boolean; status?: number; error?: string }> {
    const url = (process.env.INTERNAL_MESSAGES_PROCESS_URL ?? "").trim();
    const token = (process.env.INTERNAL_CRON_TOKEN ?? "").trim();
    if (!url || !token) return { attempted: false };
    const wr = opts?.workflow_run_id != null && String(opts.workflow_run_id).trim() ? String(opts.workflow_run_id).trim() : null;
    const reqBody: Record<string, unknown> = { limit: opts?.limit ?? 25 };
    if (wr) reqBody.workflow_run_id = wr;
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-cron-token": token,
            },
            body: JSON.stringify(reqBody),
        });
        const text = await res.text().catch(() => "");
        console.log("[messages_process] trigger_backend", {
            status: res.status,
            workflow_run_id: wr ?? null,
            body_snippet: text.slice(0, 480),
        });
        return { attempted: true, status: res.status };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[messages_process] trigger_failed", msg);
        return { attempted: true, error: msg };
    }
}
