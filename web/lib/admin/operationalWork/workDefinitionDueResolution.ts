import type { WorkDefinitionDuePolicy } from "@/lib/admin/operationalWork/workDefinitionTypes";

export type ResolveWorkDefinitionDueAtResult =
    | { ok: true; dueAt: string }
    | { ok: false; error: string; message: string };

/** Resolve due_at from definition policy; operator override wins. */
export function resolveDueAtFromWorkDefinitionPolicy(params: {
    duePolicy: WorkDefinitionDuePolicy;
    dueAtOverride?: string | null;
    now?: Date;
}): ResolveWorkDefinitionDueAtResult {
    const override = params.dueAtOverride?.trim();
    if (override) {
        if (Number.isNaN(Date.parse(override))) {
            return { ok: false, error: "DUE_AT_INVALID", message: "dueAt override must be a parseable ISO-8601 timestamp." };
        }
        return { ok: true, dueAt: new Date(override).toISOString() };
    }

    if (params.duePolicy.kind === "none") {
        return {
            ok: false,
            error: "DUE_AT_REQUIRED",
            message: "dueAt is required when definition due policy is none.",
        };
    }

    const now = params.now ?? new Date();
    const due = new Date(now);
    const days = params.duePolicy.days ?? 0;
    const hours = params.duePolicy.hours ?? 0;

    if (days === 0 && hours === 0) {
        due.setUTCDate(due.getUTCDate() + 1);
    } else {
        if (days > 0) due.setUTCDate(due.getUTCDate() + days);
        if (hours > 0) due.setUTCHours(due.getUTCHours() + hours);
    }

    return { ok: true, dueAt: due.toISOString() };
}
