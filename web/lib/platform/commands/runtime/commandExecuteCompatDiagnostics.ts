/**
 * Temporary migration diagnostics for Command execute compatibility paths (P1.S2).
 * No payloads, PII, or secrets. Debug-level / sampled for drain measurement.
 */

import { tryResolvePlatformCapability } from "@/lib/platform/commands/capabilityRegistry";

export type CompatibilityExecutePath =
    | "command_runtime_registered_action"
    | "command_runtime_lead_status_mutation"
    | "command_runtime_child_enrollment_mutation"
    | "execute_admin_action_fallback"
    | "mutations_execute_compat"
    | "registered_action_direct_legacy";

export function logCommandExecutePathDiagnostic(input: {
    requestedKey: string;
    path: CompatibilityExecutePath;
    facadeSupported: boolean;
    origin?: string | null;
    operationalContext?: string | null;
    resultCategory: "success" | "failure" | "blocked" | "rejected";
    invocationId?: string | null;
    mode?: "preview" | "execute" | null;
    adapter?: string | null;
    mutationDomain?: string | null;
    delegated?: boolean | null;
}): void {
    // Avoid production spam: only emit when explicitly enabled or in non-production.
    const enabled =
        process.env.COMMAND_RUNTIME_COMPAT_LOG === "1" ||
        process.env.NODE_ENV !== "production";
    if (!enabled) return;

    const resolved = tryResolvePlatformCapability(input.requestedKey);
    const canonical =
        resolved.status === "known" ? resolved.capability.canonicalCommandKey : null;
    const owner =
        resolved.status === "known" ? resolved.capability.executionOwner : "unknown";

    console.info("[command-runtime-compat]", {
        requested_key: input.requestedKey,
        canonical_capability_key: canonical,
        execution_owner: owner,
        facade_execution_supported: input.facadeSupported,
        compatibility_path: input.path,
        adapter: input.adapter ?? null,
        mutation_domain: input.mutationDomain ?? null,
        invocation_id: input.invocationId ?? null,
        mode: input.mode ?? null,
        delegated: input.delegated ?? null,
        origin: input.origin ?? null,
        operational_context: input.operationalContext ?? null,
        result_category: input.resultCategory,
    });
}
