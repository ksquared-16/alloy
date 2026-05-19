/**
 * Append command-surface action cards with optional BOS envelope metadata (internal thread only).
 */

import { appendThreadTurn } from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadState";
import type { CommandSurfaceThreadState } from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadTypes";
import type { CommandSurfaceActionCard } from "@/lib/bos/commandSurfaceBosMetadata";
import {
    type BosCommandSurfaceEnvelopeContext,
    enrichCommandSurfaceCardWithBosMetadata,
} from "@/lib/bos/bosCommandSurfaceEnvelope";

export function appendActionCardTurnWithBosMetadata(
    state: CommandSurfaceThreadState,
    card: CommandSurfaceActionCard,
    context?: BosCommandSurfaceEnvelopeContext
): CommandSurfaceThreadState {
    const { card: enrichedCard, bos_envelope } = enrichCommandSurfaceCardWithBosMetadata(card, context);
    return appendThreadTurn(state, {
        kind: "action_card",
        card: enrichedCard,
        ...(bos_envelope ? { bos_envelope } : {}),
    });
}
