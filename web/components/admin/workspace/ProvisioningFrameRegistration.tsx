"use client";

import { useMemo } from "react";
import { registerFrameReady } from "@/lib/runtime/kernel/provisioningFrameLifecycle";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import type { ProvisioningNavigation } from "@/lib/runtime/kernel/provisioningFrameLifecycle";

/**
 * PHASE 1 registration — records the frame under its navigation so a later settlement has something
 * to attach to, and so a settlement for a DIFFERENT navigation has something to be refused against.
 *
 * It is deliberately separate from `ProvisioningAnswerSeed`, which owns the K2 entry cache and its
 * consume-once contract. That contract is untouched here: this registration does not consume, does
 * not delete, and does not serve the entry. It only makes the navigation addressable.
 */
export default function ProvisioningFrameRegistration({
    navigation,
    answer,
}: {
    navigation: ProvisioningNavigation;
    answer: ProvisioningAnswer | null;
}) {
    useMemo(() => {
        if (!answer) return;
        registerFrameReady(navigation, answer);
    }, [navigation, answer]);
    return null;
}
