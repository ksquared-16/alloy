import "server-only";

/**
 * THE FRAME, COMPOSED ONCE PER REQUEST, REACHABLE FROM ANY SERVER BOUNDARY.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
 *
 * The Focus Panel is rendered by `SurfaceHostProvider`, mounted in the WORKSPACE layout. The
 * provisioning answer was composed in the work-unit PAGE segment — a descendant. React renders
 * ancestors first, so the boundary that owns the surface could never see the answer, and the server
 * emitted no Focus Panel markup at all: measured 220,640 bytes of HTML with zero surface elements.
 *
 * Both boundaries can now ask for the same frame. `cache()` is request-scoped and keyed on the
 * arguments, so the layout and the page asking for the SAME address share ONE composition — this
 * adds no second read, and it is why the arguments are explicit rather than derived inside.
 *
 * ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────────────────────────
 *
 * It is not a cache in the product sense: `cache()` lives and dies with one request, holds no
 * maintained truth, and is never shared between requests or operators. It composes nothing for a
 * route that is not a work unit — every other workspace page pays a regex and nothing else.
 */
import { cache } from "react";

import { composeProvisioningAnswerForRoute } from "@/lib/runtime/provisioning/composeProvisioningAnswerForRoute";
import type { ProvisioningSettlementPatch } from "@/lib/runtime/provisioning/provisioningSettlement";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

export type ServerFrame = {
    answer: ProvisioningAnswer | null;
    settlement: Promise<ProvisioningSettlementPatch | null> | null;
};

/**
 * The work-unit route shape — the SAME reading `attentionFromUrl` uses, deliberately.
 *
 * This was anchored and prefixed (`^\/adminV2\/workspace\/work-unit\/`), which made it a SECOND
 * definition of "is this a work unit route". Deployed b283e341 reported
 * `data-alloy-ssr-frame-reason="not_a_work_unit"` on the very page the client happily resolved:
 * the header had arrived and the address was right, and only this pattern disagreed with the one
 * the browser applies. Matching the same substring keeps both answers from drifting again.
 */
const WORK_UNIT_PATH = /\/workspace\/work-unit\/([^/?#]+)/;

export type FrameAddress = {
    workUnitSlug: string;
    workViewId: string | null;
    subjectId: string | null;
    cohort: "none" | null;
    aspect: string | null;
};

/** Parse the forwarded address into the identity a compose needs, or null when it names no work unit. */
export function frameAddressFromPath(
    pathname: string,
    searchParams: URLSearchParams,
): FrameAddress | null {
    const m = WORK_UNIT_PATH.exec(pathname);
    if (!m) return null;
    const one = (k: string) => {
        const v = searchParams.get(k);
        return v != null && v.trim() !== "" ? v : null;
    };
    const cohort = one("cohort") === "none" ? ("none" as const) : null;
    return {
        workUnitSlug: decodeURIComponent(m[1]),
        workViewId: one("work_view_id"),
        subjectId: one("subject_id"),
        cohort,
        // The aspect only means anything when the operator selected no cohort, exactly as the page
        // segment reads it. Reading it unconditionally would let a stale aspect select a card.
        aspect: cohort === "none" ? one("aspect") : null,
    };
}

/**
 * Compose the frame for one address. Request-scoped and deduplicated: the layout and the page
 * calling this with the same arguments get the same promise, so the answer is composed once.
 *
 * `deferSettlement` is kept, because the whole point of two-phase emission survives here: the frame
 * is returned as soon as geometry and configuration are decided, and the capability settlement is
 * handed back as a promise for whoever can deliver a second payload.
 */
export const frameForAddress = cache(
    async (
        workUnitSlug: string,
        workViewId: string | null,
        subjectId: string | null,
        cohort: "none" | null,
        aspect: string | null,
    ): Promise<ServerFrame> => {
        try {
            const route = await composeProvisioningAnswerForRoute({
                rawSlug: workUnitSlug,
                requestedWorkViewId: workViewId,
                requestedSubjectId: subjectId,
                cohort,
                aspect,
                deferSettlement: true,
            });
            if (!route.ok) return { answer: null, settlement: null };
            // An error terminal seeds nothing, exactly as the page segment has always treated it.
            const answer = route.answer.terminal !== "error" ? route.answer : null;
            return { answer, settlement: route.settlement ?? null };
        } catch {
            // The frame is an enhancement to a surface that already works without it. A compose that
            // throws must leave the operator exactly where they were, never fail the document.
            return { answer: null, settlement: null };
        }
    },
);
