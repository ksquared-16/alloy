/**
 * Optional BOS metadata for command-surface action cards (no behavior change).
 */

import type { BosCapabilityKey } from "@/lib/bos/bosCapability";
import type { CommandSurfaceThreadTurn } from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadTypes";

export type CommandSurfaceActionCard = Extract<
    CommandSurfaceThreadTurn,
    { kind: "action_card" }
>["card"];

/** Maps native card `type` → BOS capability_key. */
export const COMMAND_SURFACE_CARD_CAPABILITY_KEY: Readonly<
    Record<CommandSurfaceActionCard["type"], BosCapabilityKey>
> = {
    task_assist: "task_assist",
    job_layout: "job_overview_layout",
    workflow_assist_proposal: "workflow_assist",
    config_layout_assist_proposal: "config_layout_assist",
    config_layout_assist_field_setup: "config_layout_assist",
    config_layout_assist_ready: "config_layout_assist",
};

export function capabilityKeyForCommandSurfaceCardType(
    cardType: CommandSurfaceActionCard["type"]
): BosCapabilityKey {
    return COMMAND_SURFACE_CARD_CAPABILITY_KEY[cardType];
}

/** Returns a shallow copy with optional `capability_key` when missing (backward compatible). */
export function withCommandSurfaceCardCapabilityKey<T extends CommandSurfaceActionCard>(card: T): T & {
    capability_key: BosCapabilityKey;
} {
    if ("capability_key" in card && card.capability_key) {
        return card as T & { capability_key: BosCapabilityKey };
    }
    return {
        ...card,
        capability_key: capabilityKeyForCommandSurfaceCardType(card.type),
    };
}
