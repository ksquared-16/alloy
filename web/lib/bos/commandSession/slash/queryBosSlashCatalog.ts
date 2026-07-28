/**
 * Slash command catalog — adapter-ready Commands only.
 *
 * Discovery starts from `bosCommandAdapterRegistry` (not RegisteredAction alone),
 * so mutation / relationship / tour Commands can surface when they ship adapters.
 * Labels come from Capability Registry, with RegisteredAction as fallback for Create Lead.
 *
 * Eligibility authority (BOS Command Runtime Convergence):
 *   process-effective Command keys (command_set_v1 / legacy selection)
 *   ∩ adapter-ready allowlist
 *   ∩ authorization
 *
 * Surface / action_placements visibility does **not** gate BOS eligibility.
 */

import { getRegisteredAction } from "@/lib/adminV2/actions/actionRegistry";
import {
    getBosCommandAdapterRegistration,
    listBosCommandAdapterKeys,
} from "@/lib/bos/commandSession/adapters/bosCommandAdapterRegistry";
import type { BosSlashCommandDescriptor } from "@/lib/bos/commandSession/types";
import { getPlatformCapability } from "@/lib/platform/commands/capabilityRegistry";

/**
 * Commands that have a BOS command-session adapter today.
 * Sourced from the adapter registry — expand only when an adapter ships.
 */
export const BOS_SLASH_SESSION_ADAPTER_KEYS = listBosCommandAdapterKeys() as readonly string[];

export type QueryBosSlashCatalogInput = {
    /** Raw composer text (may include leading `/`). */
    query: string;
    /**
     * @deprecated Surface placement must not gate BOS eligibility. Ignored when present.
     */
    placedActionKeys?: readonly string[] | null;
    /**
     * Process-effective Command keys (P6.S2 / BOS convergence).
     * Required for eligibility — omit/null means process context is unknown (fail closed).
     * Empty set means the process selected no Commands.
     * Callers resolve via resolveBosProcessEffectiveCommandKeys.
     */
    processEffectiveCommandKeys?: ReadonlySet<string> | readonly string[] | null;
    /** When false, mark descriptors ineligible. */
    authorized?: boolean;
};

function tokenForAction(actionKey: string, label: string): string {
    const fromLabel = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    if (fromLabel) return fromLabel;
    return actionKey.replace(/_/g, "-");
}

function matchesQuery(descriptor: BosSlashCommandDescriptor, q: string): boolean {
    if (!q) return true;
    const hay = `${descriptor.token} ${descriptor.displayLabel} ${descriptor.actionKey}`.toLowerCase();
    return hay.includes(q);
}

function asKeySet(
    keys: ReadonlySet<string> | readonly string[] | null | undefined
): Set<string> | null {
    if (keys == null) return null;
    if (keys instanceof Set) return keys;
    return new Set([...keys].map((k) => k.trim()).filter(Boolean));
}

function describeCommand(actionKey: string): {
    displayLabel: string;
    description: string;
    requiresEntityId: boolean;
} {
    const registration = getBosCommandAdapterRegistration(actionKey);
    const capability = getPlatformCapability(actionKey);
    const registered = getRegisteredAction(actionKey);
    const displayLabel =
        registration?.label?.trim() ||
        capability?.operatorLabel?.trim() ||
        registered?.defaultLabel?.trim() ||
        actionKey.replace(/_/g, " ");
    const description =
        (registered?.description?.trim() && registered.description.trim()) ||
        (capability?.reason?.trim() && capability.reason.trim()) ||
        `Start ${displayLabel}`;
    const requiresEntityId = actionKey !== "create_lead";
    return {
        displayLabel,
        description:
            actionKey === "create_lead"
                ? "Capture a new lead through Conversation or Form"
                : actionKey === "update_lead_status"
                  ? "Change status on the open lead"
                  : actionKey === "add_parent_guardian"
                    ? "Add a guardian to the open household"
                    : actionKey === "cancel_tour"
                      ? "Cancel the active tour booking on this lead"
                      : description,
        requiresEntityId,
    };
}

/**
 * Build slash descriptors from the BOS adapter registry ∩ process-effective Commands.
 */
export function queryBosSlashCatalog(
    input: QueryBosSlashCatalogInput
): BosSlashCommandDescriptor[] {
    const raw = input.query.trim();
    if (!raw.startsWith("/")) return [];

    const q = raw.slice(1).trim().toLowerCase();
    const authorized = input.authorized !== false;
    // Placement intentionally ignored — Surfaces do not own BOS Command eligibility.
    void input.placedActionKeys;
    const processKeys = asKeySet(input.processEffectiveCommandKeys);
    const processContextKnown = processKeys != null;

    const out: BosSlashCommandDescriptor[] = [];
    for (const actionKey of listBosCommandAdapterKeys()) {
        const { displayLabel, description, requiresEntityId } = describeCommand(actionKey);
        const processOk = processContextKnown && processKeys!.has(actionKey);
        let eligible = authorized && processOk;
        let ineligibleReason: string | undefined;
        if (!authorized) ineligibleReason = "You don’t have permission to run commands here.";
        else if (!processContextKnown) {
            ineligibleReason =
                "Open a Business Process workspace so BOS can use process-selected Commands.";
        } else if (!processOk) {
            ineligibleReason = "This command isn’t selected for this process.";
        }

        const descriptor: BosSlashCommandDescriptor = {
            token: tokenForAction(actionKey, displayLabel),
            actionKey,
            displayLabel,
            description,
            eligible,
            ineligibleReason,
            placementContextRequired: requiresEntityId,
        };
        if (actionKey === "create_lead") {
            descriptor.token = "create-lead";
        }
        if (matchesQuery(descriptor, q)) out.push(descriptor);
    }

    out.sort((a, b) => {
        if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
        return a.displayLabel.localeCompare(b.displayLabel);
    });
    return out;
}

export function isBosSlashComposerQuery(text: string): boolean {
    return text.trim().startsWith("/");
}
