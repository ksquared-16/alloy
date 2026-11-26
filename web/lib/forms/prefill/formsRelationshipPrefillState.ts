/**
 * Read-only relationship prefill UX states for Forms / Documents runtime.
 */

import type { RelationshipResolutionStatus } from "@/lib/fields/relationship/canonicalRelationshipResolution";
import type { RelationshipResolutionDiagnostic } from "@/lib/fields/relationship/relationshipResolutionMetadata";

export type FormsRelationshipPrefillState =
    | { kind: "resolved"; value: string; operatorDiagnostics?: RelationshipResolutionDiagnostic[] }
    | { kind: "missing"; label: string }
    | { kind: "ambiguous"; label: string }
    | { kind: "unavailable"; label: string }
    | { kind: "unsupported"; label: string }
    | { kind: "invalid_context"; label: string };

const ROLE_LABELS: Record<string, string> = {
    primary: "Primary Contact",
    secondary: "Secondary Contact",
    parents: "Parent/Guardian",
    emergency: "Emergency Contact",
    billing: "Billing Contact",
};

export function formsRelationshipPrefillStateFromResolution(args: {
    status: RelationshipResolutionStatus;
    role?: string;
    reason?: string;
    value?: string | null;
    diagnostics?: RelationshipResolutionDiagnostic[];
}): FormsRelationshipPrefillState {
    const roleLabel = ROLE_LABELS[args.role ?? ""] ?? "Contact";
    if (args.status === "resolved" && args.value?.trim()) {
        return {
            kind: "resolved",
            value: args.value.trim(),
            ...(args.diagnostics?.length ? { operatorDiagnostics: args.diagnostics } : {}),
        };
    }
    if (args.status === "missing") {
        return { kind: "missing", label: `No ${roleLabel}` };
    }
    if (args.status === "ambiguous") {
        return { kind: "ambiguous", label: `${roleLabel} is ambiguous` };
    }
    if (args.status === "invalid_context") {
        return { kind: "invalid_context", label: args.reason ?? "Invalid form context for this contact role" };
    }
    if (args.status === "unsupported") {
        return { kind: "unsupported", label: args.reason ?? "Unsupported relationship" };
    }
    return { kind: "unavailable", label: args.reason ?? "Contact data unavailable" };
}

export function relationshipPrefillValueForSubmission(state: FormsRelationshipPrefillState): string | undefined {
    if (state.kind === "resolved") return state.value;
    return undefined;
}
