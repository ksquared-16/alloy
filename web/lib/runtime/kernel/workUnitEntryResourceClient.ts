/**
 * The browser-side Entry Resource: K2 asks the D1 seam for truth.
 *
 * Kernel §K2: "One round-trip per Preparation Contract. A dependent chain across a network is a
 * design error, not a latency problem." This is that one round-trip — the ONLY network call on the
 * operational critical path.
 *
 * It is called at GESTURE TIME by K2, not at route commit and not at destination mount. Nothing here
 * touches the router, the pathname, or the DOM: the AttentionRef carries the whole cause.
 */
import type { AttentionRef } from "./attention";
import type { EntryResource } from "./provisioning";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

export function workUnitEntryResourceClient(): EntryResource {
    return async (ref: AttentionRef, signal: AbortSignal): Promise<ProvisioningAnswer> => {
        const q = new URLSearchParams();
        if (ref.lens) q.set("work_view_id", ref.lens);
        if (ref.subject) q.set("subject_id", ref.subject);
        const qs = q.toString();
        const url = `/api/admin/work-units/${encodeURIComponent(ref.target)}/provisioning-answer${qs ? `?${qs}` : ""}`;

        const res = await fetch(url, { signal, headers: { accept: "application/json" } });
        if (!res.ok) {
            // A transport fault is an honest terminal `error` — never a false-empty (U-O7). K2 will
            // map it 1:1; the surface commits an error that is a workable place with a reachable retry.
            return {
                terminal: "error",
                code: "records_unavailable",
                message: `provisioning answer unavailable (HTTP ${res.status})`,
                orgId: ref.tenant,
                workUnit: null,
                timings: {
                    authorization_ms: 0, work_unit_ms: 0, configuration_ms: 0, presentation_ms: 0,
                    records_ms: 0, projection_ms: 0, composition_ms: 0, total_ms: 0,
                },
            } as ProvisioningAnswer;
        }
        return (await res.json()) as ProvisioningAnswer;
    };
}
