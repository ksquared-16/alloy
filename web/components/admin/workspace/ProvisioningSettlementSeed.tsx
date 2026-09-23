"use client";

import { useMemo } from "react";
import { applyFrameSettlement } from "@/lib/runtime/kernel/provisioningFrameLifecycle";
import type { ProvisioningSettlementPatch } from "@/lib/runtime/provisioning/provisioningSettlement";

/**
 * PHASE 2 delivery — the canonical capability results, arriving after the frame.
 *
 * It is mounted inside its own Suspense boundary on the page segment, so React flushes the FRAME
 * first and this whenever the producers finish. That ordering is the entire point: the frame used
 * to wait behind `card_producers_ms` (P50 740ms on deployed a5eb2f29) inside the server stream
 * hold, and nothing in those producers selects geometry.
 *
 * Same seam as `ProvisioningAnswerSeed`: a render-phase write, no controller effects, renders
 * nothing. A null patch means the settlement did not resolve — the cells stay UNKNOWN and their
 * existing owners fill them, exactly as they would have without this delivery. It is never an
 * authoritative empty.
 *
 * NOT a second truth system. The patch is produced by the same canonical owners as before, and
 * `applyFrameSettlement` only transports it: it refuses a patch whose navigation or identity does
 * not match the frame, and applies what it accepts monotonically.
 */
export default function ProvisioningSettlementSeed({
    patch,
}: {
    patch: ProvisioningSettlementPatch | null;
}) {
    useMemo(() => {
        if (!patch) return;
        applyFrameSettlement(patch);
    }, [patch]);
    return null;
}
