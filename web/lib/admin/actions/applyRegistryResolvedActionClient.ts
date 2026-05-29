import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { ApplyRegistryResolvedActionResult } from "@/lib/admin/actions/applyRegistryResolvedActionResult";
import {
    invocationFromApplyRegistryHost,
    launchContextualAskBos,
    launchContextualQuickMessage,
    type ContextualActionInvocation,
} from "@/lib/admin/actions/contextualActionInvocation";
import { invalidateCommunicationsDrawerPrefetch } from "@/lib/admin/communications/communicationsDrawerPrefetch";

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
    /**
     * Optional invalidation hook to refresh local data without blowing away UI state.
     * When omitted, we fall back to `router.refresh()` (legacy behavior).
     */
    invalidate?: (opts?: { entity_type?: string; entity_id?: string; action_key?: string }) => void;
    departmentId?: string | null;
    workUnitId?: string | null;
    /** Deep link for `view_needs_attention` (needs-attention work unit + queue). */
    needsAttentionHref?: string | null;
    /** When set, used for mutating / open_drawer actions that target the current record. */
    entityId?: string | null;
    /** Surface-authored runtime context (queue row, drawer, etc.). */
    invocationContext?: ContextualActionInvocation | null;
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
        const p = a.payload && typeof a.payload === "object" ? (a.payload as Record<string, unknown>) : {};
        const intent = p.intent != null ? String(p.intent).trim() : "";
        const message = p.message != null ? String(p.message).trim() : "";
        if (intent === "review_automations") {
            host.router.push("/adminV2/workflows");
            return { ok: true };
        }
        if (intent === "create_inquiry") {
            window.alert("Coming next: Create inquiry in AdminV2.");
            return { ok: true };
        }
        if (intent === "open_enrollment_pipeline") {
            if (host.departmentId?.trim()) {
                host.router.push(`/adminV2/workspace/dept/${encodeURIComponent(host.departmentId.trim())}`);
            } else {
                host.router.push("/adminV2/workspace");
            }
            return { ok: true };
        }
        if (intent === "view_needs_attention") {
            const href = host.needsAttentionHref?.trim();
            if (href) {
                host.router.push(href);
                return { ok: true };
            }
            if (host.departmentId?.trim()) {
                host.router.push(`/adminV2/workspace/dept/${encodeURIComponent(host.departmentId.trim())}`);
            } else {
                host.router.push("/adminV2/workspace");
            }
            return { ok: true };
        }
        if (intent === "send_message_placeholder") {
            const eid = host.entityId?.trim();
            if (eid) {
                invalidateCommunicationsDrawerPrefetch("opportunities", eid);
                if (typeof window !== "undefined") {
                    window.dispatchEvent(
                        new CustomEvent("adminv2:opportunity-focus-comms", { detail: { opportunity_id: eid } })
                    );
                }
            }
            return { ok: true };
        }
        if (intent === "quick_message") {
            const invocation = invocationFromApplyRegistryHost(host);
            const personId =
                invocation?.person_id?.trim() ||
                (p.person_id != null
                    ? String(p.person_id).trim()
                    : p.personId != null
                      ? String(p.personId).trim()
                      : "");
            const opportunityId = invocation?.opportunity_id?.trim() || host.entityId?.trim() || "";
            if (!personId && !opportunityId) return { ok: true };
            await launchContextualQuickMessage({
                surface: invocation?.surface ?? "record_drawer",
                record_id: opportunityId || personId,
                entity_type: "opportunity",
                opportunity_id: opportunityId || personId,
                person_id: personId || null,
                display_name:
                    invocation?.display_name ??
                    (p.display_name != null ? String(p.display_name) : null),
                email: invocation?.email ?? (p.email != null ? String(p.email) : null),
                phone: invocation?.phone ?? (p.phone != null ? String(p.phone) : null),
                department_id: invocation?.department_id ?? host.departmentId ?? null,
                work_unit_id: invocation?.work_unit_id ?? host.workUnitId ?? null,
                bos_source_surface: invocation?.bos_source_surface,
            });
            return { ok: true };
        }
        if (intent === "ask_bos") {
            const invocation = invocationFromApplyRegistryHost(host);
            const eid = invocation?.opportunity_id?.trim() || host.entityId?.trim();
            if (eid) {
                await launchContextualAskBos({
                    surface: invocation?.surface ?? "record_drawer",
                    record_id: eid,
                    entity_type: "opportunity",
                    opportunity_id: eid,
                    display_name: invocation?.display_name ?? null,
                    queue_preview: invocation?.queue_preview ?? null,
                    department_id: invocation?.department_id ?? host.departmentId ?? null,
                    work_unit_id: invocation?.work_unit_id ?? host.workUnitId ?? null,
                    bos_source_surface: invocation?.bos_source_surface ?? "opportunity_drawer",
                });
            }
            return { ok: true };
        }
        if (intent === "send_form") {
            const eid = host.entityId?.trim();
            if (eid && typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("adminv2:open-send-form", { detail: { opportunity_id: eid } }));
            }
            return { ok: true };
        }
        if (intent === "send_enrollment_packet") {
            const eid = host.entityId?.trim();
            if (eid && typeof window !== "undefined") {
                window.dispatchEvent(
                    new CustomEvent("adminv2:open-enrollment-packet", { detail: { opportunity_id: eid } })
                );
            }
            return { ok: true };
        }
        if (message) {
            window.alert(message);
            return { ok: true };
        }
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
        if (host.invalidate) host.invalidate({ entity_type: "opportunity", entity_id: entityId, action_key: a.key });
        else host.router.refresh();
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
    if (host.invalidate) host.invalidate({ entity_type: "opportunity", entity_id: entityId, action_key: a.key });
    else host.router.refresh();
    return { ok: true, execution_result: er };
}
