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
import { retainedDepartmentConfigIds } from "@/lib/adminV2/navigation/workspaceNavTreeCache";
import { heldFocusPanelSummaryIdentities } from "@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc";
import type { AttentionRef } from "./attention";
import type { EntryResource } from "./provisioning";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import {
    provisioningAnswerUrl,
    consumeFreshProvisioningForRoute,
    fetchProvisioningEntryDeduped,
} from "./workUnitProvisioningPrefetch";
import { logCurrentWorkInit } from "@/lib/adminV2/runtime/diagnostics/currentWorkInitDiagnostics";

export function workUnitEntryResourceClient(): EntryResource {
    return async (ref: AttentionRef, _signal: AbortSignal): Promise<ProvisioningAnswer> => {
        // The whole cause, including whether a cohort was selected at all. Dropping `cohort` here was
        // enough on its own to defeat contextual focus end to end: attention stated it, the URL carried
        // it, and this seam quietly asked for the default-lens answer instead.
        const heldDepartmentConfigIds = retainedDepartmentConfigIds();
        const heldSummaryIds = heldFocusPanelSummaryIdentities();
        const url = provisioningAnswerUrl(
            ref.target, ref.lens, ref.subject, ref.cohort, ref.aspect,
            // S6-1. Both provisioning paths compute this the same way from the same owner, so a
            // prewarm and the click that consumes it produce the SAME key and still coalesce.
            heldDepartmentConfigIds,
            heldSummaryIds,
        );

        // Blank-time removal: if operator intent (hover/focus) warmed this exact answer, K2's single
        // round-trip resolves from the warm cache — the click commits immediately. A warm miss or a
        // prefetch that errored falls through to the live fetch below; kernel semantics are unchanged.
        //
        // P0-7.6: the lookup goes through the KERNEL, which owns the key scheme, because the exact
        // key alone could never reach the SERVER SEED. The seed is composed where the browser's held
        // configuration is unknowable, so it is registered under the base key; an asserting consume
        // then missed it by construction, and the surface paid for a live fetch of an answer it
        // already held. The kernel tries the exact key first and the seed's base key second.
        const warm = consumeFreshProvisioningForRoute(
            { target: ref.target, lens: ref.lens, subject: ref.subject, cohort: ref.cohort, aspect: ref.aspect },
            heldDepartmentConfigIds,
            heldSummaryIds,
        );
        if (warm) {
            logCurrentWorkInit("provisioning.client.warm-hit", {
                cacheKey: warm.url,
                cache: "hit",
                preloadSource: warm.via === "seed-base" ? "seed" : "prefetch",
                note: warm.via === "seed-base" ? "server-composed seed consumed under its base key" : undefined,
            });
            try {
                const answer = await warm.promise;
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
