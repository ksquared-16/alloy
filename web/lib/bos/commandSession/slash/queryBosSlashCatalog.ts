/**
 * Slash command catalog — registered + bosProposalSupport + adapter-ready allowlist.
 * Not a parallel command list: discovery always starts from the action registry.
 *
 * Eligibility authority (BOS Command Runtime Convergence):
 *   process-effective Command keys (command_set_v1 / legacy selection)
 *   ∩ adapter-ready allowlist
 *   ∩ authorization
 *
 * Surface / action_placements visibility does **not** gate BOS eligibility.
 */

import { getRegisteredAction, listRegisteredActionKeys } from "@/lib/adminV2/actions/actionRegistry";
import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import { listBosCommandAdapterKeys } from "@/lib/bos/commandSession/adapters/bosCommandAdapterRegistry";
import type { BosSlashCommandDescriptor } from "@/lib/bos/commandSession/types";

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
    // Placement intentionally ignored — Surfaces do not own BOS Command eligibility.
    void input.placedActionKeys;
    const processKeys = asKeySet(input.processEffectiveCommandKeys);
    const processContextKnown = processKeys != null;
    const adapterReady = new Set<string>(listBosCommandAdapterKeys());

    const out: BosSlashCommandDescriptor[] = [];
    for (const actionKey of listRegisteredActionKeys()) {
        const action = getRegisteredAction(actionKey);
        if (!action?.bosProposalSupport) continue;
        const canonical = canonicalActionDefinition(actionKey);
        if (canonical && canonical.bosProposalSupport === false) continue;

        const displayLabel = action.defaultLabel?.trim() || actionKey.replace(/_/g, " ");
        const hasAdapter = adapterReady.has(actionKey);
        const processOk = processContextKnown && processKeys!.has(actionKey);
        let eligible = authorized && hasAdapter && processOk;
        let ineligibleReason: string | undefined;
        if (!authorized) ineligibleReason = "You don’t have permission to run commands here.";
        else if (!hasAdapter) ineligibleReason = "This command isn’t available in BOS yet.";
        else if (!processContextKnown) {
            ineligibleReason =
                "Open a Business Process workspace so BOS can use process-selected Commands.";
        } else if (!processOk) {
            ineligibleReason = "This command isn’t selected for this process.";
        }

        // Round 2 product scope: hide non-adapter commands entirely (don’t clutter /).
        if (!hasAdapter) continue;

        const descriptor: BosSlashCommandDescriptor = {
            token: tokenForAction(actionKey, displayLabel),
            actionKey,
            displayLabel: displayLabel
                .replace(/\b\w/g, (c) => c.toUpperCase())
                .replace(/ Lead$/i, " Lead"),
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

export function isBosSlashComposerQuery(text: string): boolean {
    return text.trim().startsWith("/");
}
