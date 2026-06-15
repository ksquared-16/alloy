"use client";

import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import { buildCommsRailCards, type CommsRailCard } from "@/lib/communications/v2/bosRailCards";
import {
    buildConversationSignals,
    detectCommunicationRisk,
    recommendFollowUp,
    estimateResponseLikelihood,
    type IntelMessage,
} from "@/lib/communications/v2/bosIntelligence";

/**
 * Communications intelligence cards for the BOS rail (PKG-18E) — DARK (self-gated behind comms_v2_bos).
 * Review-first, deterministic; NO auto-send and NO embedded BOS panel in communication content — these
 * descriptors are surfaced through the EXISTING command rail (DrawerCommandRailActionsRegistrar hookup
 * is the real-gate-validated wiring step).
 */
export default function CommunicationsRailIntelligence(props: {
    messages?: IntelMessage[];
    slaState?: string | null;
    missingInfo?: string[];
}) {
    if (!isCommsV2FlagEnabled("comms_v2_bos")) return null;

    const signals = buildConversationSignals(props.messages ?? []);
    const riskFlags = detectCommunicationRisk({ signals, slaState: props.slaState ?? null });
    const followUp = recommendFollowUp(signals, riskFlags);
    const likelihood = estimateResponseLikelihood(signals);
    const cards = buildCommsRailCards({ signals, riskFlags, followUp, likelihood, missingInfo: props.missingInfo });

    return (
        <div data-cc-bos-intelligence className="space-y-2">
            {cards.map((c: CommsRailCard) => (
                <div key={c.id} data-cc-bos-card={c.kind} className="rounded-lg border border-alloy-stone/15 p-2 text-xs">
                    <div className="font-semibold text-alloy-midnight">{c.title}</div>
                    <div className="text-alloy-midnight/70">{c.body}</div>
                </div>
            ))}
        </div>
    );
}
