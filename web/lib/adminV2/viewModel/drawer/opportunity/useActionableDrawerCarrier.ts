"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { ActionableDrawerCarrier } from "@/lib/adminV2/viewModel/drawer/opportunity/actionableDrawerCarrier";
import {
    peekActionableDrawerCarrier,
    subscribeToActionableDrawerCarriers,
} from "@/lib/adminV2/viewModel/drawer/opportunity/actionableDrawerCarrierStore";

/**
 * The phase-1 carrier for the subject this surface has SELECTED, or null.
 *
 * Keyed on the caller's own selection rather than on whatever arrived last, which is what makes
 * rapid navigation safe without any cancellation logic: a carrier for B landing after the operator
 * has moved to C is simply not the carrier this hook is asking for, so it is never read and never
 * mounted. `useSyncExternalStore` keeps that read consistent within a render pass.
 *
 * The server render has no store, so it answers null — phase 1 is a client-side arrival by
 * definition, and pretending otherwise would hydrate one action set over another.
 */
export function useActionableDrawerCarrier(selected: {
    opportunityId: string | null | undefined;
    attentionSubjectId?: string | null;
}): ActionableDrawerCarrier | null {
    const opportunityId = selected.opportunityId?.trim() || null;
    const attentionSubjectId = selected.attentionSubjectId?.trim() || null;

    const getSnapshot = useCallback(
        () => peekActionableDrawerCarrier({ opportunityId, attentionSubjectId }),
        [opportunityId, attentionSubjectId],
    );

    return useSyncExternalStore(subscribeToActionableDrawerCarriers, getSnapshot, () => null);
}
