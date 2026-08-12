"use client";

import { useEffect } from "react";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";
import {
    ADMINV2_OPEN_OPPORTUNITY_FROM_CONTEXT_EVENT,
    type OpenOpportunityFromContextDetail,
} from "@/lib/adminV2/contextualRecordOpen";

/**
 * Puts a record named by a contextual surface in front of the operator.
 *
 * The event stays — `QuickMessageModal` is mounted in shell chrome and cannot reach the runtime, so
 * stating intent and applying it here is the right shape. What changed is what "put it in front of
 * them" means: it is an attention movement onto the Work Unit that holds the record, not the generic
 * modal overlay stacked on whatever surface the operator happened to be on.
 *
 * When no active Work Unit holds the record the gesture does nothing. That is deliberate: the old
 * behaviour answered "here it is, in a box, detached from any queue", which is exactly the product
 * being removed.
 */
export default function ContextualRecordOpenListener() {
    const focusRecord = useOperatorRecordFocus();

    useEffect(() => {
        const onOpen = (ev: Event) => {
            const detail = (ev as CustomEvent<OpenOpportunityFromContextDetail>).detail;
            const id = detail?.opportunity_id?.trim();
            if (!id) return;
            void focusRecord({ entity_type: "opportunities", entity_id: id });
        };
        window.addEventListener(ADMINV2_OPEN_OPPORTUNITY_FROM_CONTEXT_EVENT, onOpen);
        return () => window.removeEventListener(ADMINV2_OPEN_OPPORTUNITY_FROM_CONTEXT_EVENT, onOpen);
    }, [focusRecord]);

    return null;
}
