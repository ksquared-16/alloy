/**
 * Communications V2 — BOS rail card builder (PKG-18E). PURE, deterministic, no I/O, no React.
 *
 * Maps the deterministic PKG-17 intelligence into review-first card descriptors for the EXISTING
 * BOS command rail. No embedded BOS panel in communication content; no auto-send. The rail hookup
 * (via DrawerCommandRailActionsRegistrar) consumes these descriptors.
 */
import type { ConversationSignals, RiskFlag, FollowUpRecommendation } from "@/lib/communications/v2/bosIntelligence";

export type CommsRailCard = {
    id: string;
    kind: "summary" | "risk" | "follow_up" | "likelihood" | "missing_info";
    title: string;
    body: string;
};

export function buildCommsRailCards(input: {
    signals: ConversationSignals;
    riskFlags: RiskFlag[];
    followUp: FollowUpRecommendation;
    likelihood: number;
    missingInfo?: string[];
}): CommsRailCard[] {
    const cards: CommsRailCard[] = [];
    const s = input.signals;

    cards.push({
        id: "summary",
        kind: "summary",
        title: "Conversation summary",
        body: `${s.inbound} inbound · ${s.outbound} outbound${s.awaitingResponse ? " · awaiting reply" : ""}.`,
    });

    if (input.riskFlags.length > 0) {
        cards.push({
            id: "risk",
            kind: "risk",
            title: "Communication risk",
            body: input.riskFlags.join(", "),
        });
    }

    cards.push({
        id: "follow_up",
        kind: "follow_up",
        title: "Suggested follow-up",
        body: `${input.followUp.action} — ${input.followUp.reason}`,
    });

    cards.push({
        id: "likelihood",
        kind: "likelihood",
        title: "Response likelihood",
        body: `${Math.round(input.likelihood * 100)}%`,
    });

    if (input.missingInfo && input.missingInfo.length > 0) {
        cards.push({
            id: "missing_info",
            kind: "missing_info",
            title: "Missing information",
            body: input.missingInfo.join(", "),
        });
    }

    return cards;
}
