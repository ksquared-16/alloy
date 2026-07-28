/**
 * Slash command catalog — registered + bosProposalSupport + adapter-ready allowlist.
 * Not a parallel command list: discovery always starts from the action registry.
 */

import { getRegisteredAction, listRegisteredActionKeys } from "@/lib/adminV2/actions/actionRegistry";
import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import type { BosSlashCommandDescriptor } from "@/lib/bos/commandSession/types";

/**
 * Commands that have a BOS command-session adapter today.
 * Expand only when an adapter ships — other bosProposalSupport keys stay hidden.
 */
export const BOS_SLASH_SESSION_ADAPTER_KEYS = ["create_lead"] as const;

export type QueryBosSlashCatalogInput = {
    /** Raw composer text (may include leading `/`). */
    query: string;
    /**
     * Optional placement-resolved action keys (from Actions menu / DB placements).
     * When provided, slash results must also be in this set.
     */
    placedActionKeys?: readonly string[] | null;
    /**
     * Optional process-effective Command keys (P6.S2).
     * When provided, slash results must also be process-selected.
     * Does not invent process selection — callers resolve via projectProcessRuntimeCommands.
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

/**
 * Build slash descriptors from the registered action registry.
 * Round 2: only Create Lead is adapter-ready and therefore visible when eligible.
 */
export function queryBosSlashCatalog(
    input: QueryBosSlashCatalogInput
): BosSlashCommandDescriptor[] {
    const raw = input.query.trim();
    if (!raw.startsWith("/")) return [];

    const q = raw.slice(1).trim().toLowerCase();
    const authorized = input.authorized !== false;
    const placed =
        input.placedActionKeys == null
            ? null
            : new Set(input.placedActionKeys.map((k) => k.trim()).filter(Boolean));
    const processKeys =
        input.processEffectiveCommandKeys == null
            ? null
            : input.processEffectiveCommandKeys instanceof Set
              ? input.processEffectiveCommandKeys
              : new Set(
                    [...input.processEffectiveCommandKeys].map((k) => k.trim()).filter(Boolean)
                );
    const adapterReady = new Set<string>(BOS_SLASH_SESSION_ADAPTER_KEYS);

    const out: BosSlashCommandDescriptor[] = [];
    for (const actionKey of listRegisteredActionKeys()) {
        const action = getRegisteredAction(actionKey);
        if (!action?.bosProposalSupport) continue;
        const canonical = canonicalActionDefinition(actionKey);
        if (canonical && canonical.bosProposalSupport === false) continue;

        const displayLabel = action.defaultLabel?.trim() || actionKey.replace(/_/g, " ");
        const hasAdapter = adapterReady.has(actionKey);
        const placedOk = placed == null || placed.has(actionKey);
        const processOk = processKeys == null || processKeys.has(actionKey);
        let eligible = authorized && hasAdapter && placedOk && processOk;
        let ineligibleReason: string | undefined;
        if (!authorized) ineligibleReason = "You don’t have permission to run commands here.";
        else if (!hasAdapter) ineligibleReason = "This command isn’t available in BOS yet.";
        else if (!placedOk) ineligibleReason = "This command isn’t available in this workspace.";
        else if (!processOk) ineligibleReason = "This command isn’t selected for this process.";

        // Round 2 product scope: hide non-adapter commands entirely (don’t clutter /).
        if (!hasAdapter) continue;

        const descriptor: BosSlashCommandDescriptor = {
            token: tokenForAction(actionKey, displayLabel),
            actionKey,
            displayLabel: displayLabel.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/ Lead$/i, " Lead"),
            description: action.description?.trim() || `Start ${displayLabel}`,
            eligible,
            ineligibleReason,
            placementContextRequired: Boolean(action.requiredContext?.requiresEntityId),
        };
        // Prefer title case "Create Lead"
        if (actionKey === "create_lead") {
            descriptor.displayLabel = "Create Lead";
            descriptor.token = "create-lead";
            descriptor.description = "Capture a new lead through Conversation or Form";
        }
        if (matchesQuery(descriptor, q)) out.push(descriptor);
    }

    out.sort((a, b) => {
        if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
        return a.displayLabel.localeCompare(b.displayLabel);
    });
    return out;
}

export function isBosSlashComposerQuery(value: string): boolean {
    return value.trimStart().startsWith("/");
}
