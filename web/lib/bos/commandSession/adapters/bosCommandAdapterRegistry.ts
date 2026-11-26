/**
 * BOS command-session adapter registry — expand only when an adapter ships.
 * Discovery (`queryBosSlashCatalog`) reads keys from here; do not hardcode per-Command
 * branches in the BOS shell beyond dispatch.
 */

import type { BosCommandAdapter } from "@/lib/bos/commandSession/types";
import { createLeadBosCommandAdapter } from "@/lib/bos/commandSession/adapters/createLeadAdapter";
import { updateLeadStatusBosCommandAdapter } from "@/lib/bos/commandSession/adapters/updateLeadStatusAdapter";
import { addParentGuardianBosCommandAdapter } from "@/lib/bos/commandSession/adapters/addParentGuardianAdapter";
import { cancelTourBosCommandAdapter } from "@/lib/bos/commandSession/adapters/cancelTourBosAdapter";

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
    {
        commandKey: "update_lead_status",
        label: "Update Lead Status",
        preparationModel: "generic_payload_fields",
        adapter: updateLeadStatusBosCommandAdapter,
    },
    {
        commandKey: "add_parent_guardian",
        label: "Add Parent / Guardian",
        preparationModel: "relationship_subject",
        adapter: addParentGuardianBosCommandAdapter,
    },
    {
        commandKey: "cancel_tour",
        label: "Cancel Tour",
        preparationModel: "confirmation_only",
        adapter: cancelTourBosCommandAdapter,
    },
];

export function listBosCommandAdapterKeys(): readonly string[] {
    return REGISTRY.map((r) => r.commandKey);
}

export function listBosCommandAdapterRegistrations(): readonly BosCommandAdapterRegistration[] {
    return REGISTRY;
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
