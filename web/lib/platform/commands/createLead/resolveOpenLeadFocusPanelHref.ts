/**
 * Resolve Open Lead Focus Panel href when Create Lead succeeds without a
 * session-owned Work Unit (e.g. BOS started from workspace home).
 *
 * Prefers an already-correct href; otherwise loads the created opportunity's
 * `work_unit_id` → work-unit `key` and builds the canonical subject_id route.
 * Does not invent a navigation system — reuses resolveCreatedRecordProcessContextHref.
 */

import { resolveCreatedRecordProcessContextHref } from "@/lib/platform/commands/createLead/resolveCreatedRecordProcessContextHref";

const WORKSPACE_HOME = "/workspace";

function isCanonicalFocusPanelHref(href: string): boolean {
    return (
        href !== WORKSPACE_HOME &&
        href.includes("subject_id=") &&
        /\/workspace\/work-unit\//.test(href)
    );
}

async function readOpportunityWorkUnitId(
    opportunityId: string,
    fetchFn: typeof fetch,
): Promise<string> {
    try {
        const res = await fetchFn(
            `/api/admin/entity/opportunities/${encodeURIComponent(opportunityId)}`,
            { credentials: "include" },
        );
        if (!res.ok) return "";
        const body = (await res.json()) as {
            data?: { entity?: { work_unit_id?: string | null } };
            entity?: { work_unit_id?: string | null };
            work_unit_id?: string | null;
        };
        const fromEnvelope = body.data?.entity?.work_unit_id;
        const fromLegacy = body.entity?.work_unit_id ?? body.work_unit_id;
        const raw = typeof fromEnvelope === "string" ? fromEnvelope : fromLegacy;
        return typeof raw === "string" ? raw.trim() : "";
    } catch {
        return "";
    }
}

async function readWorkUnitKey(workUnitId: string, fetchFn: typeof fetch): Promise<string> {
    try {
        const res = await fetchFn(`/api/admin/work-units/${encodeURIComponent(workUnitId)}`, {
            credentials: "include",
        });
        if (!res.ok) return "";
        const body = (await res.json()) as { key?: string | null };
        return typeof body.key === "string" ? body.key.trim() : "";
    } catch {
        return "";
    }
}

export async function resolveOpenLeadFocusPanelHref(args: {
    preferredHref?: string | null;
    opportunityId: string | null | undefined;
    /** Optional: when the command was started inside a Work Unit. */
    sessionWorkUnitId?: string | null;
    fetchImpl?: typeof fetch;
}): Promise<string> {
    const fetchFn = args.fetchImpl ?? fetch;
    const opportunityId =
        typeof args.opportunityId === "string" ? args.opportunityId.trim() : "";
    const preferred = typeof args.preferredHref === "string" ? args.preferredHref.trim() : "";

    if (preferred && isCanonicalFocusPanelHref(preferred)) {
        return preferred;
    }

    if (!opportunityId) {
        return preferred || WORKSPACE_HOME;
    }

    let workUnitId =
        typeof args.sessionWorkUnitId === "string" ? args.sessionWorkUnitId.trim() : "";

    if (!workUnitId) {
        workUnitId = await readOpportunityWorkUnitId(opportunityId, fetchFn);
    }

    if (!workUnitId) {
        return preferred || WORKSPACE_HOME;
    }

    const key = await readWorkUnitKey(workUnitId, fetchFn);
    if (!key) {
        return preferred || WORKSPACE_HOME;
    }

    return resolveCreatedRecordProcessContextHref({
        recordId: opportunityId,
        workUnitKey: key,
    });
}
