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
import {
    provisioningAnswerUrl,
    consumeFreshProvisioning,
    fetchProvisioningEntryDeduped,
} from "./workUnitProvisioningPrefetch";
import { logCurrentWorkInit } from "@/lib/adminV2/runtime/diagnostics/currentWorkInitDiagnostics";

export function workUnitEntryResourceClient(): EntryResource {
    return async (ref: AttentionRef, _signal: AbortSignal): Promise<ProvisioningAnswer> => {
        // The whole cause, including whether a cohort was selected at all. Dropping `cohort` here was
        // enough on its own to defeat contextual focus end to end: attention stated it, the URL carried
        // it, and this seam quietly asked for the default-lens answer instead.
        const url = provisioningAnswerUrl(ref.target, ref.lens, ref.subject, ref.cohort, ref.aspect);

        // Blank-time removal: if operator intent (hover/focus) warmed this exact answer, K2's single
        // round-trip resolves from the warm cache — the click commits immediately. A warm miss or a
        // prefetch that errored falls through to the live fetch below; kernel semantics are unchanged.
        const warm = consumeFreshProvisioning(url);
        if (warm) {
            logCurrentWorkInit("provisioning.client.warm-hit", { cacheKey: url, cache: "hit", preloadSource: "prefetch" });
            try {
                const answer = await warm;
                if (answer.terminal !== "error") return answer;
            } catch {
                /* fall through to a fresh fetch */
            }
        } else {
            logCurrentWorkInit("provisioning.client.warm-miss", { cacheKey: url, cache: "miss", note: "no intent-warmed answer — cold entry" });
        }

        // ONE round-trip per identical entry, even under React Strict Mode's dev double-invoke or a
        // fast unmount→remount: the cold fetch is in-flight de-duplicated so a second overlapping
        // request for the SAME answer reuses the first's promise instead of hitting the network twice.
        const result = await fetchProvisioningEntryDeduped(url);
        if (!result.ok) {
            // A transport fault is an honest terminal `error` — never a false-empty (U-O7). K2 will
            // map it 1:1; the surface commits an error that is a workable place with a reachable retry.
            return {
                terminal: "error",
                code: "records_unavailable",
                message: `provisioning answer unavailable (HTTP ${result.status})`,
                orgId: ref.tenant,
                workUnit: null,
                // Honestly null: the request never returned an answer, so there is no lens set to offer.
                navigationFrame: null,
                timings: {
                    authorization_ms: 0, work_unit_ms: 0, configuration_ms: 0, presentation_ms: 0,
                    records_ms: 0, projection_ms: 0, composition_ms: 0, total_ms: 0,
                },
            } as ProvisioningAnswer;
        }
        return result.answer;
    };
}
