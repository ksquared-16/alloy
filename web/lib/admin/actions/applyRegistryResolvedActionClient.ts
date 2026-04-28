import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { ApplyRegistryResolvedActionResult } from "@/lib/admin/actions/applyRegistryResolvedActionResult";

export type RegistryActionSurfaceContext = {
    surface: string;
    department_id?: string | null;
    work_unit_id?: string | null;
    /** record_section: echoed for execute/analytics; must match placement.section_key */
    section_key?: string | null;
};

type DrawerOpenOpts =
    | { type: "opportunities"; id: string; defaultOpportunitySurface?: "quote_intake" }
    | { type: "jobs"; id: string; jobRecordSurface?: "drawer" }
    | { type: "schedules"; id: string };

export type ApplyRegistryResolvedActionHost = {
    router: { push: (href: string) => void; refresh: () => void };
    openDrawer: (opts: DrawerOpenOpts) => void;
    openForm?: (opts: { form_key: string; action: ResolvedActionForClient }) => void;
    departmentId?: string | null;
    workUnitId?: string | null;
    /** When set, used for mutating / open_drawer actions that target the current record. */
    entityId?: string | null;
    context: RegistryActionSurfaceContext;
};

/**
 * Client-side handling for resolver-shaped actions (same semantics as record header / queue row).
 * Navigate / external_link use payload only; mutating types POST /api/admin/actions/execute.
 */
export async function applyRegistryResolvedActionClient(
    a: ResolvedActionForClient,
    host: ApplyRegistryResolvedActionHost
): Promise<ApplyRegistryResolvedActionResult> {
    if (a.action_type === "open_form") {
        const formKey = a.payload?.form_key != null ? String(a.payload.form_key).trim() : "";
        if (formKey && host.openForm) {
            host.openForm({ form_key: formKey, action: a });
        }
        return { ok: true };
    }
    if (a.action_type === "navigate") {
        const href = a.payload?.href != null ? String(a.payload.href) : "";
        if (href) host.router.push(href);
        return { ok: true };
    }
    if (a.action_type === "external_link") {
        const href = a.payload?.href != null ? String(a.payload.href) : "";
        if (href) window.open(href, "_blank", "noopener,noreferrer");
        return { ok: true };
    }
    if (a.action_type === "open_drawer") {
        const d =
            a.payload?.drawer && typeof a.payload.drawer === "object"
                ? (a.payload.drawer as Record<string, unknown>)
                : {};
        const idFrom = d.idFrom != null ? String(d.idFrom) : "";
        const resolvedId =
            idFrom === "entity_id" && host.entityId?.trim()
                ? host.entityId.trim()
                : host.entityId?.trim() ?? "";
        if (!resolvedId) return { ok: true };
        const entityType = String(d.entityType ?? "opportunities").trim().toLowerCase();
        const defSurf = d.defaultSurface != null ? String(d.defaultSurface) : null;
        if (entityType === "jobs" || entityType === "job") {
            host.openDrawer({ type: "jobs", id: resolvedId, jobRecordSurface: "drawer" });
            return { ok: true };
        }
        if (entityType === "schedules" || entityType === "schedule") {
            host.openDrawer({ type: "schedules", id: resolvedId });
            return { ok: true };
        }
        if (defSurf === "quote_intake" || a.key === "start_quote") {
            host.openDrawer({ type: "opportunities", id: resolvedId, defaultOpportunitySurface: "quote_intake" });
            return { ok: true };
        }
        host.openDrawer({ type: "opportunities", id: resolvedId });
        return { ok: true };
    }
    if (a.action_type === "ui_intent") {
        void a.payload;
        return { ok: true };
    }

    const entityId = host.entityId?.trim();
    if (!entityId) {
        console.warn("[applyRegistryResolvedActionClient] mutating action needs entity_id", { key: a.key });
        return { ok: false, error: "entity_id required" };
    }

    const res = await fetch("/api/admin/actions/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action_key: a.key,
            entity_type: "opportunity",
            entity_id: entityId,
            context: host.context,
        }),
    });
    const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        execution_result?: Record<string, unknown> & {
            kind?: string;
            href?: string;
            drawer?: { defaultSurface?: string | null };
            workflow_run_id?: string;
        };
    };
    if (!res.ok || !json.ok) {
        console.warn("[applyRegistryResolvedActionClient] execute failed", json.error);
        return { ok: false, error: json.error ?? "Execute failed" };
    }
    const er = json.execution_result;
    if (er?.kind === "open_drawer") {
        if (er.drawer?.defaultSurface === "quote_intake") {
            host.openDrawer({ type: "opportunities", id: entityId, defaultOpportunitySurface: "quote_intake" });
        } else {
            host.openDrawer({ type: "opportunities", id: entityId });
        }
        host.router.refresh();
        return { ok: true, execution_result: er };
    }
    if (er?.kind === "navigate" && er.href) {
        host.router.push(String(er.href));
        return { ok: true, execution_result: er };
    }
    if (er?.kind === "external_link" && er.href) {
        window.open(String(er.href), "_blank", "noopener,noreferrer");
        return { ok: true, execution_result: er };
    }
    host.router.refresh();
    return { ok: true, execution_result: er };
}
