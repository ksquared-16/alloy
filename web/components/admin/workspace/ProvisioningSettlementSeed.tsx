"use client";

import { useMemo } from "react";
import { applyFrameSettlement } from "@/lib/runtime/kernel/provisioningFrameLifecycle";
import { useRuntimeKernelOptional } from "@/lib/runtime/kernel/RuntimeKernelContext";
import type { ProvisioningSettlementPatch } from "@/lib/runtime/provisioning/provisioningSettlement";

/**
 * PHASE 2 delivery — the canonical capability results, arriving after the frame.
 *
 * It is mounted inside its own Suspense boundary on the page segment, so React flushes the FRAME
 * first and this whenever the producers finish. That ordering is the entire point: the frame used
 * to wait behind `card_producers_ms` (P50 740ms on deployed a5eb2f29) inside the server stream
 * hold, and nothing in those producers selects geometry.
 *
 * ── WHY IT ALSO COMMITS TO K3 ───────────────────────────────────────────────────────────────────
 *
 * `applyFrameSettlement` alone was not delivery. Measured on deployed f3c9e139 the settlement
 * classified `applied` with one registered frame — the addressing was correct — and the Focus Panel
 * still showed `data-financials-empty="loading"`. A source census explains it: `readFrame` and
 * `markFrameSettled` have ZERO production callers. The frame lifecycle had two writers and no
 * reader, so a correct settlement landed in a store nothing mounted consumes, and the only thing
 * reading it was the test suite — which is how it stayed green while delivering nothing.
 *
 * The mounted surface reads ONE thing: the committed Focus snapshot
 * (`useSyncExternalStore(subscribeFocus, getFocus)`). So Focus is the canonical owner, and the
 * settled answer is handed to it through `onPreparationTerminal`, K3's only commit entry point —
 * the same path phase 1 takes. The lifecycle keeps its job as the refusal guard; it simply stops
 * being the terminus.
 */
export default function ProvisioningSettlementSeed({
    patch,
}: {
    patch: ProvisioningSettlementPatch | null;
}) {
    const kernel = useRuntimeKernelOptional();
    useMemo(() => {
        if (!patch) return;
        const outcome = applyFrameSettlement(patch);
        if (!outcome.applied || !kernel) return;

        /*
         * THE SETTLEMENT MAY ONLY COMMIT UNDER THE SUBJECT IT DESCRIBES.
         *
         * `applyFrameSettlement` proved the patch matches the FRAME it was registered against. That
         * is not the same as matching what the operator is looking at NOW: this component settles a
         * route-load frame, and by the time the producers finish the operator may have clicked a
         * queue row. Committing on the committed ref's version without this check would put the
         * route-load subject's facts under the clicked subject's identity — precisely the
         * mixed-subject frame the whole progressive commit exists to prevent.
         *
         * Focus refuses a superseded terminal on its own, but that guard keys on attention VERSION,
         * and a settlement addressed to a different navigation can share one. So the navigation is
         * compared here, and the commit is abandoned rather than reshaped when it does not match.
         */
        const current = kernel.getFocus().current;
        if (!current) return;
        const nav = patch.navigation;
        const sameNavigation =
            nav.target === current.ref.target
            && (nav.lens ?? null) === (current.ref.lens ?? null)
            && (nav.subject ?? null) === ((current.ref as { subject?: string | null }).subject ?? null);
        if (!sameNavigation) return;

        kernel.focus.onPreparationTerminal({
            key: current.surfaceId,
            outcome: "operational",
            snapshot: outcome.answer,
            // The CURRENT committed version, so Focus applies its own staleness rules against the
            // attention actually on screen rather than a version this component invented.
            attentionVersion: current.ref.version,
            durationMs: 0,
        });
    }, [patch, kernel]);
    return null;
}
