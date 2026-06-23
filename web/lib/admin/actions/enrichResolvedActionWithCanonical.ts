import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import type {
    ResolvedActionCanonicalMetadata,
    ResolvedActionForClient,
} from "@/lib/admin/actions/types";

export type { ResolvedActionCanonicalMetadata };

/** Merge DB-resolved action rows with canonical registry metadata (labels, executor, wiring). */
export function enrichResolvedActionForClient(action: ResolvedActionForClient): ResolvedActionForClient {
    const def = canonicalActionDefinition(action.key);
    if (!def) return action;

    const executorKind =
        def.executor.kind === "relationship_execute" ? "relationship_execute"
        : def.executor.kind === "dedicated_modal" ? "dedicated_modal"
        : def.executor.kind === "admin_execute" ? "admin_execute"
        : def.executor.kind;

    return {
        ...action,
        label: action.label?.trim() ? action.label : def.label,
        description: action.description?.trim() ? action.description : def.description,
        canonical: {
            executor_kind: executorKind,
            input_schema: def.inputSchema,
            runtime_wired: def.runtimeWired,
            confirmation_policy: def.confirmationPolicy,
            category: def.category,
            bos_proposal_support: def.bosProposalSupport,
        },
    };
}

export function enrichResolvedActionsBySlot<T extends { key: string }>(actions: T[]): T[] {
    return actions.map(
        (action) =>
            enrichResolvedActionForClient(action as unknown as ResolvedActionForClient) as unknown as T,
    );
}
