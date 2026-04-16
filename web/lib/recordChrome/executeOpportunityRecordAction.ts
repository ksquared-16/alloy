import { mapOpportunityRecordActionToPatch } from "@/lib/recordChrome/opportunityRecordActionMap";

export type ExecuteOpportunityRecordActionResult =
    | { ok: true; data: unknown }
    | { ok: false; error: string; status?: number };

/**
 * Thin client helper: same payload as manual PATCH from admin forms.
 */
export async function executeOpportunityRecordAction(params: {
    opportunityId: string;
    eventKey: string;
}): Promise<ExecuteOpportunityRecordActionResult> {
    const body = mapOpportunityRecordActionToPatch(params.eventKey);
    if (!body) {
        return { ok: false, error: "Unsupported action" };
    }
    const res = await fetch(`/api/admin/opportunities/${encodeURIComponent(params.opportunityId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
        return { ok: false, error: json.error ?? "Request failed", status: res.status };
    }
    return { ok: true, data: json };
}
