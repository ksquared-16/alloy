"use client";

/**
 * WHAT BOS IS TOLD ABOUT THIS WORKSPACE — and the four things it is deliberately not told.
 *
 * BOS is a reasoning surface. It may explain what an operator is looking at and recommend a next
 * step, and it may execute only through the registered action registry, which owns eligibility,
 * authorization, idempotency and audit. It may not become a place where money is decided.
 *
 * So what this seeds is a DISPLAY LINE: which workspace, which section, which scope. No amount, no
 * balance, no count, no metric value. That is not caution for its own sake — a figure handed to a
 * reasoning surface is a figure it can restate, and a restated balance is a second answer with no
 * owner. When BOS needs a number it resolves it server-side from the canonical owner, the same way
 * every other consumer does.
 *
 * ── AND A FINDING, RECORDED RATHER THAN WORKED AROUND ──
 *
 * `GlobalAssistantEntityContext.entity_type` is the single value `"opportunities"`, and
 * `available_actions` is a comms/scheduling vocabulary (`draft_sms`, `draft_email`, `schedule`,
 * `reminder`). There is no household, account or charge subject, and no financial verb. A
 * Financials workspace therefore has no truthful ENTITY context to seed — seeding a household id
 * under `entity_type: "opportunities"` would tell BOS the household was an opportunity, which is
 * how a reasoning surface comes to answer confidently about the wrong subject.
 *
 * Widening that vocabulary is the assistant contract's own work, not a Financials workspace's, so
 * it is reported as a finding and the surface label — which asserts nothing about identity — is
 * what this seeds instead.
 */

import { useEffect } from "react";

import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";

export function useFinancialsBosSurface(args: { open: boolean; sectionLabel: string; scopeLabel: string }) {
    const assistant = useGlobalAssistantOptional();
    const setSurfaceOperationalLabel = assistant?.setSurfaceOperationalLabel;

    useEffect(() => {
        if (!setSurfaceOperationalLabel) return;
        if (!args.open) return;
        setSurfaceOperationalLabel(`Financials — ${args.sectionLabel} — ${args.scopeLabel}`);
        return () => {
            // The label follows the surface. Leaving it behind would have BOS describing a
            // workspace the operator has already closed.
            setSurfaceOperationalLabel(null);
        };
    }, [setSurfaceOperationalLabel, args.open, args.sectionLabel, args.scopeLabel]);
}
