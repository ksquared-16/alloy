/**
 * BOS command-session adapter registry — expand only when an adapter ships.
 * Discovery (`queryBosSlashCatalog`) reads keys from here; do not hardcode per-Command
 * branches in the BOS shell beyond dispatch.
 */

import type { BosCommandAdapter } from "@/lib/bos/commandSession/types";
import { createLeadBosCommandAdapter } from "@/lib/bos/commandSession/adapters/createLeadAdapter";

export type BosCommandAdapterRegistration = {
    commandKey: string;
    /** Human product label (never raw keys in operator UI). */
    label: string;
    /** Preparation model honesty for the coverage ledger. */
    preparationModel:
        | "create_lead_conversation_intake"
        | "generic_payload_fields"
        | "relationship_subject"
        | "confirmation_only"
        | "not_conversational";
    adapter: BosCommandAdapter;
};

const REGISTRY: BosCommandAdapterRegistration[] = [
    {
        commandKey: "create_lead",
        label: "Create Lead",
        preparationModel: "create_lead_conversation_intake",
        adapter: createLeadBosCommandAdapter,
    },
];

export function listBosCommandAdapterKeys(): readonly string[] {
    return REGISTRY.map((r) => r.commandKey);
}

export function getBosCommandAdapterRegistration(
    commandKey: string
): BosCommandAdapterRegistration | null {
    const want = commandKey.trim();
    return REGISTRY.find((r) => r.commandKey === want) ?? null;
}

export function getBosCommandAdapter(commandKey: string): BosCommandAdapter | null {
    return getBosCommandAdapterRegistration(commandKey)?.adapter ?? null;
}
