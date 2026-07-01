export const MESSAGING_BOS_ENHANCE_TECHNICAL_GAP =
    "BOS message enhancement is not wired to an LLM rewrite endpoint yet. Next step: route composer intents through web/lib/adminV2/bos/communication/generateOperationalDraft.ts (or a dedicated messaging enhance API) with operator review before replacing draft text.";

export const MESSAGING_BOS_ENHANCE_INTENTS = [
    { id: "clearer", label: "Make clearer" },
    { id: "warmer", label: "Make warmer" },
    { id: "shorter", label: "Shorten" },
    { id: "professional", label: "More professional" },
] as const;

export type MessagingBosEnhanceIntentId = (typeof MESSAGING_BOS_ENHANCE_INTENTS)[number]["id"];

export function messagingBosEnhanceComingNextMessage(intentLabel: string): string {
    return `“${intentLabel}” is coming next. ${MESSAGING_BOS_ENHANCE_TECHNICAL_GAP}`;
}
