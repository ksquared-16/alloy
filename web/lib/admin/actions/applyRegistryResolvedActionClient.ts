import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import {
    ADMIN_WORKFLOWS_HREF,
} from "@/lib/admin/canonicalAdminRoutes";
import {
    operatorWorkUnitHrefFromKey,
} from "@/lib/admin/canonicalOperatorRoutes";
import type { ApplyRegistryResolvedActionResult } from "@/lib/admin/actions/applyRegistryResolvedActionResult";
import {
    invocationFromApplyRegistryHost,
    launchContextualAskBos,
    launchContextualQuickMessage,
    type ContextualActionInvocation,
} from "@/lib/admin/actions/contextualActionInvocation";
import { invalidateCommunicationsDrawerPrefetch } from "@/lib/admin/communications/communicationsDrawerPrefetch";
import {
    dispatchFocusInquiryChildren,
    dispatchOpenEnrollmentPacketReview,
    type InquiryChildrenFocusField,
} from "@/lib/admin/actions/enrollmentActionClient";
import {
    ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS,
    ADMIN_V2_OPEN_CREATE_WORK_MODAL,
    type OpportunityOpenCreateWorkModalDetail,
} from "@/lib/adminV2/opportunityDrawerTaskEvents";
import {
    ADMINV2_OPEN_TOUR_OUTCOME_MODAL,
    ADMINV2_OPEN_TOUR_SCHEDULE_MODAL,
} from "@/lib/tours/actions/tourBookingActionClient";
import { dispatchActionPreflightBlocked } from "@/lib/admin/actions/actionPreflightDrawerEvents";
import { isBosCreateLeadSessionEnabled } from "@/lib/bos/commandSession/bosCreateLeadSessionFlag";
import { dispatchStartBosCommandSession } from "@/contexts/BosCommandSessionContext";
import {
    dispatchOpenAddInquiryChildModal,
    isAddInquiryChildActionKey,
    isAddInquiryChildFormKey,
    resolveAddInquiryChildMode,
} from "@/lib/admin/actions/addInquiryChildActionClient";
import {
    dispatchOpenAddPersonModal,
    isAddPersonActionKey,
    isAddPersonFormKey,
    resolveAddPersonActionKey,
} from "@/lib/admin/actions/addPersonActionClient";
import { formatRequirementValidationSummary } from "@/lib/completion/requirementValidationResult";
import type { RequirementValidationResult } from "@/lib/completion/requirementValidationTypes";
import { isScheduleTourRegistryAction } from "@/lib/admin/actions/scheduleTourWorkUnitActions";
import { isMakePrimaryContactActionKey, MAKE_PRIMARY_CONTACT_REQUIRES_CONTACT_TARGET_MESSAGE } from "@/lib/admin/actions/makePrimaryContactAction";
import {
    dispatchOpenRelationshipActionModal,
    isCanonicalRelationshipResolvedAction,
    mapRegistrySurfaceToRelationshipSource,
    resolveRelationshipActionKeyFromResolvedAction,
} from "@/lib/admin/relationship/relationshipActionClient";
import {
    dispatchOpenEnrollmentStatusModal,
    mapRegistrySurfaceToEnrollmentSource,
    resolveEnrollmentStatusActionFromResolvedAction,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionClient";
import {
    dispatchOpenChangeLeadLocationModal,
    resolveChangeLeadLocationActionFromResolvedAction,
} from "@/lib/admin/actions/changeLeadLocationActionClient";
import type { EnrollmentStatusTransitionScope } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";

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
    /** Work-unit rail: no record selected — open queue record picker before tour modal. */
    openScheduleTourRecordPicker?: () => void;
    /** Capture-first add child — same modal as shell chrome when set. */
    openAddInquiryChild?: (mode: "child" | "sibling") => void;
    /** Capture-first add person — same modal for add_family_member / add_related_person. */
    openAddPerson?: (actionKey: string) => void;
    /** Capture-first relationship action — shared wizard with layout buttons. */
    openRelationshipAction?: (input: {
        actionKey: import("@/lib/admin/relationship/relationshipActionContract").RelationshipActionKey;
        opportunityId: string;
        sourceSurface?: import("@/lib/admin/relationship/relationshipActionContract").RelationshipActionSourceSurface;
    }) => void;
    /** Change Enrollment Status — OCM-scoped transition modal. */
    openEnrollmentStatus?: (input: {
        opportunityId: string;
        sourceSurface?: import("@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract").EnrollmentStatusTransitionSourceSurface;
        initialScope?: Partial<EnrollmentStatusTransitionScope>;
    }) => void;
    /** Change lead location — family default site modal. */
    openChangeLeadLocation?: (input: { opportunityId: string }) => void;
    /** Dedicated modal — household primary contact (requires contact row target). */
    openMakePrimaryContact?: (input: { opportunityId: string; targetPersonId: string }) => void;
    openCreateLead?: () => void;
    /** VM / legacy drawer — open create-work modal without relying on window listeners. */
    openCreateWork?: (detail: OpportunityOpenCreateWorkModalDetail) => void;
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
    /** Contact row target for make_primary_contact from registry surfaces. */
    makePrimaryContactTargetPersonId?: string | null;
    /** Surface-authored runtime context (queue row, drawer, etc.). */
    invocationContext?: ContextualActionInvocation | null;
    /** Queue row / drawer child scope for enrollment status transitions. */
    enrollmentStatusScope?: Partial<EnrollmentStatusTransitionScope>;
    context: RegistryActionSurfaceContext;
};

/**
 * Client-side handling for resolver-shaped actions (same semantics as record header / queue row).
 * Navigate / external_link use payload only; mutating types POST /api/admin/actions/execute.
 */
function applyScheduleTourWithoutSelectedRecord(
    a: ResolvedActionForClient,
    host: ApplyRegistryResolvedActionHost
): ApplyRegistryResolvedActionResult | null {
    const formKey =
        a.key.trim() === "reschedule_tour"
            ? "reschedule_tour"
            : a.payload?.form_key != null && String(a.payload.form_key).trim() === "reschedule_tour"
              ? "reschedule_tour"
              : "schedule_tour";
    if (host.openForm) {
        host.openForm({ form_key: formKey, action: a });
        return { ok: true };
    }
    if (host.openScheduleTourRecordPicker) {
        host.openScheduleTourRecordPicker();
        return { ok: true };
    }
    return null;
}

export async function applyRegistryResolvedActionClient(
    a: ResolvedActionForClient,
    host: ApplyRegistryResolvedActionHost
): Promise<ApplyRegistryResolvedActionResult> {
    if (isMakePrimaryContactActionKey(a.key)) {
        const targetPersonId =
            host.makePrimaryContactTargetPersonId?.trim()
            || host.invocationContext?.person_id?.trim()
            || null;
        if (!targetPersonId) {
            return {
                ok: false,
                error: MAKE_PRIMARY_CONTACT_REQUIRES_CONTACT_TARGET_MESSAGE,
            };
        }
        const oid = host.entityId?.trim();
        if (!oid) {
            return {
                ok: false,
                error: MAKE_PRIMARY_CONTACT_REQUIRES_CONTACT_TARGET_MESSAGE,
            };
        }
        if (host.openMakePrimaryContact) {
            host.openMakePrimaryContact({ opportunityId: oid, targetPersonId });
            return { ok: true };
        }
        return {
            ok: false,
            error: MAKE_PRIMARY_CONTACT_REQUIRES_CONTACT_TARGET_MESSAGE,
        };
    }

    const relationshipKey = resolveRelationshipActionKeyFromResolvedAction(a);
    if (relationshipKey && isCanonicalRelationshipResolvedAction(a)) {
        const oid = host.entityId?.trim();
        if (!oid) {
            return {
                ok: false,
                error: "Select a record first.",
            };
        }
        const sourceSurface = mapRegistrySurfaceToRelationshipSource(host.context.surface);
        if (host.openRelationshipAction) {
            host.openRelationshipAction({
                actionKey: relationshipKey,
                opportunityId: oid,
                sourceSurface,
            });
            return { ok: true };
        }
        dispatchOpenRelationshipActionModal({
            action_key: relationshipKey,
            opportunity_id: oid,
            source_surface: sourceSurface,
        });
        return { ok: true };
    }

    if (resolveEnrollmentStatusActionFromResolvedAction(a)) {
        const oid = host.entityId?.trim();
        if (!oid) {
            return {
                ok: false,
                error: "Select a record first.",
            };
        }
        const sourceSurface = mapRegistrySurfaceToEnrollmentSource(host.context.surface);
        const initialScope = host.enrollmentStatusScope;
        if (host.openEnrollmentStatus) {
            host.openEnrollmentStatus({ opportunityId: oid, sourceSurface, initialScope });
            return { ok: true };
        }
        dispatchOpenEnrollmentStatusModal({
            opportunity_id: oid,
            source_surface: sourceSurface,
            scope: initialScope,
        });
        return { ok: true };
    }

    if (resolveChangeLeadLocationActionFromResolvedAction(a)) {
        const oid = host.entityId?.trim();
        if (!oid) {
            return {
                ok: false,
                error: "Select a record first.",
            };
        }
        if (host.openChangeLeadLocation) {
            host.openChangeLeadLocation({ opportunityId: oid });
            return { ok: true };
        }
        dispatchOpenChangeLeadLocationModal({ opportunity_id: oid });
        return { ok: true };
    }

    if (isScheduleTourRegistryAction(a) && !host.entityId?.trim()) {
        const delegated = applyScheduleTourWithoutSelectedRecord(a, host);
        if (delegated) return delegated;
        return {
            ok: false,
            error: "Select a record from the work unit queue to schedule a tour.",
        };
    }

    if (a.action_type === "open_form") {
        const formKey = a.payload?.form_key != null ? String(a.payload.form_key).trim() : "";
        if (isAddInquiryChildFormKey(formKey) || isAddInquiryChildActionKey(a.key)) {
            const oid = host.entityId?.trim();
            if (!oid) return { ok: false, error: "entity_id required" };
            const p = a.payload && typeof a.payload === "object" ? (a.payload as Record<string, unknown>) : {};
            const mode = resolveAddInquiryChildMode({
                actionKey: a.key,
                payloadMode: p.mode != null ? String(p.mode) : null,
            });
            if (host.openAddInquiryChild) {
                host.openAddInquiryChild(mode);
                return { ok: true };
            }
            dispatchOpenAddInquiryChildModal({
                opportunity_id: oid,
                mode,
                action_key: a.key,
            });
            return { ok: true };
        }
        if (isAddPersonFormKey(formKey) || isAddPersonActionKey(a.key)) {
            const oid = host.entityId?.trim();
            if (!oid) return { ok: false, error: "entity_id required" };
            const actionKey = resolveAddPersonActionKey({ actionKey: a.key, formKey });
            if (host.openAddPerson) {
                host.openAddPerson(actionKey);
                return { ok: true };
            }
            dispatchOpenAddPersonModal({
                opportunity_id: oid,
                action_key: actionKey,
                entity_type: "opportunity",
            });
            return { ok: true };
        }
        if (formKey === "create_lead") {
            if (isBosCreateLeadSessionEnabled()) {
                dispatchStartBosCommandSession({
                    actionKey: "create_lead",
                    displayLabel: a.label?.trim() || "Create Lead",
                    placement: host.workUnitId ? "work_unit_actions" : "workspace_actions_menu",
                    contextResolution: "bos_proposal",
                    workspace: {
                        departmentId: host.departmentId ?? null,
                        workUnitId: host.workUnitId ?? null,
                        surface: host.workUnitId ? "work_unit" : "workspace",
                    },
                });
                return { ok: true };
            }
            if (host.openCreateLead) {
                host.openCreateLead();
                return { ok: true };
            }
            if (typeof window !== "undefined") {
                window.dispatchEvent(
                    new CustomEvent("adminv2:open-create-lead", {
                        detail: {
                            department_id: host.departmentId ?? null,
                            work_unit_id: host.workUnitId ?? null,
                        },
                    })
                );
            }
            return { ok: true };
        }
        if (formKey === "record_tour_outcome") {
            if (host.openForm) {
                host.openForm({ form_key: formKey, action: a });
                return { ok: true };
            }
            const oid = host.entityId?.trim();
            if (oid && typeof window !== "undefined") {
                window.dispatchEvent(
                    new CustomEvent(ADMINV2_OPEN_TOUR_OUTCOME_MODAL, { detail: { opportunity_id: oid } })
                );
            }
            return { ok: true };
        }
        if (formKey === "schedule_tour" || a.key === "schedule_tour" || a.key === "reschedule_tour") {
            const oid = host.entityId?.trim();
            if (!oid) {
                const delegated = applyScheduleTourWithoutSelectedRecord(a, host);
                if (delegated) return delegated;
                return { ok: false, error: "Select a record from the work unit queue to schedule a tour." };
            }
            if (host.openForm) {
                host.openForm({ form_key: formKey || "schedule_tour", action: a });
                return { ok: true };
            }
            if (typeof window !== "undefined") {
                window.dispatchEvent(
                    new CustomEvent(ADMINV2_OPEN_TOUR_SCHEDULE_MODAL, { detail: { opportunity_id: oid } })
                );
            }
            return { ok: true };
        }
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
        const actionKey = a.key.trim();
        const message = p.message != null ? String(p.message).trim() : "";
        const invocation = invocationFromApplyRegistryHost(host);
        const eid = invocation?.opportunity_id?.trim() || host.entityId?.trim() || "";

        if (actionKey === "confirm_tour" || intent === "confirm_tour") {
            if (!eid) return { ok: false, error: "entity_id required" };
            // confirm_tour is a registered action; this POST routes through the canonical
            // Actions Runtime (runRegisteredAction) which returns a string `error` envelope.
            const res = await fetch("/api/admin/actions/execute", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action_key: "confirm_tour",
                    entity_type: "opportunity",
                    entity_id: eid,
                    context: host.context,
                }),
            });
            const json = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string | { message?: string };
            };
            if (!res.ok || json.ok === false) {
                const message =
                    typeof json.error === "string" ? json.error : json.error?.message ?? "Confirm tour failed";
                return { ok: false, error: message };
            }
            if (host.invalidate) host.invalidate({ entity_type: "opportunity", entity_id: eid, action_key: "confirm_tour" });
            else host.router.refresh();
            return { ok: true };
        }
        if (actionKey === "send_tour_invitation" || intent === "send_tour_invitation") {
            if (!eid) return { ok: false, error: "entity_id required" };

            // Provisioning the command made it VISIBLE. This branch is what makes it
            // RUN: `ui_intent` dispatch is a hardcoded chain keyed on action key, so a
            // provisioned command with no branch here renders in the menu and does
            // nothing when clicked — visible and inert, which reads to an operator as
            // "I sent it" while nothing was created.
            //
            // Explicit confirmation first; the action declares confirmationPolicy
            // "required" and this is where that is honoured on the Manage path.
            const parentName = invocation?.display_name?.trim() || "this family";
            const channels: string[] = [];
            if (invocation?.email?.trim()) channels.push("email");
            if (invocation?.phone?.trim()) channels.push("SMS");
            const channelPhrase = channels.length ? channels.join(" and ") : "the contact details on file";
            if (typeof window !== "undefined") {
                const proceed = window.confirm(`Send this tour invitation to ${parentName} by ${channelPhrase}?`);
                if (!proceed) return { ok: true };
            }

            // Registered action → canonical Actions Runtime, exactly as confirm_tour
            // does. Recipient identity, offered times and send authority are all
            // resolved server-side; nothing assembled here is trusted as input.
            const res = await fetch("/api/admin/actions/execute", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action_key: "send_tour_invitation",
                    entity_type: "opportunity",
                    entity_id: eid,
                    context: host.context,
                }),
            });
            let json:
                | {
                      ok?: boolean;
                      error?: string | { message?: string };
                      result?: { detail?: Record<string, unknown> };
                      data?: { execution_result?: Record<string, unknown> };
                  }
                | null = null;
            try {
                json = await res.json();
            } catch {
                json = null;
            }

            // A body we cannot read is not a success. Silence is the failure mode
            // this whole correction exists to remove.
            if (!json || typeof json !== "object") {
                return {
                    ok: false,
                    error: "The invitation could not be confirmed — the server response could not be read. Nothing was sent.",
                };
            }
            if (!res.ok || json.ok === false) {
                const message =
                    typeof json.error === "string"
                        ? json.error
                        : json.error?.message ?? "Send tour invitation failed";
                return { ok: false, error: message };
            }

            // Per-channel truth, never a generic "Invitation sent". A channel the
            // canonical enqueue refused is reported as refused — claiming otherwise is
            // precisely the failure this capability exists to avoid.
            // The route's documented success envelope is
            //   { ok: true, data: { execution_result, affected_id? }, correlation_id }
            // so the action's `detail` arrives under data.execution_result.detail.
            // `result.detail` is accepted as a fallback only; reading the wrong
            // path silently degraded a real send into "no eligible delivery
            // channel", which is the same class of lie in the other direction.
            const execResult = (json.data?.execution_result ?? {}) as Record<string, unknown>;
            const detail = ((execResult.detail as Record<string, unknown>) ??
                json.result?.detail ??
                null) as Record<string, unknown> | null;

            // Success must be DERIVED from the server result. A 2xx with no
            // recognisable invitation detail is not something to celebrate.
            if (!detail || !Array.isArray(detail.sent_channels)) {
                return {
                    ok: false,
                    error: "The invitation result could not be read, so it is not confirmed. Check the record's Communications before retrying.",
                };
            }

            const sent = detail.sent_channels as string[];
            const skipped = Array.isArray(detail.skipped) ? (detail.skipped as string[]) : [];
            const replay = detail.idempotent_replay === true;
            const parts: string[] = [];
            for (const ch of sent) parts.push(`${String(ch).toLowerCase() === "sms" ? "SMS" : "Email"} queued`);
            for (const reason of skipped) parts.push(`not sent — ${String(reason).replace(/_/g, " ")}`);
            if (!parts.length) parts.push("no eligible delivery channel");
            if (typeof window !== "undefined") {
                window.alert(
                    `${replay ? "Existing invitation reused" : "Invitation created"} · ${parts.join(" · ")}`
                );
            }

            if (host.invalidate)
                host.invalidate({ entity_type: "opportunity", entity_id: eid, action_key: "send_tour_invitation" });
            else host.router.refresh();
            return { ok: true };
        }
        if (actionKey === "send_email" || intent === "send_email") {
            if (!eid) return { ok: false, error: "entity_id required" };
            await launchContextualQuickMessage({
                surface: invocation?.surface ?? "record_drawer",
                record_id: eid,
                entity_type: "opportunity",
                opportunity_id: eid,
                person_id: invocation?.person_id ?? null,
                display_name: invocation?.display_name ?? null,
                email: invocation?.email ?? null,
                phone: invocation?.phone ?? null,
                department_id: invocation?.department_id ?? host.departmentId ?? null,
                work_unit_id: invocation?.work_unit_id ?? host.workUnitId ?? null,
                bos_source_surface: invocation?.bos_source_surface,
                defaultChannel: "email",
            });
            return { ok: true };
        }
        if (actionKey === "send_sms" || intent === "send_sms") {
            if (!eid) return { ok: false, error: "entity_id required" };
            await launchContextualQuickMessage({
                surface: invocation?.surface ?? "record_drawer",
                record_id: eid,
                entity_type: "opportunity",
                opportunity_id: eid,
                person_id: invocation?.person_id ?? null,
                display_name: invocation?.display_name ?? null,
                email: invocation?.email ?? null,
                phone: invocation?.phone ?? null,
                department_id: invocation?.department_id ?? host.departmentId ?? null,
                work_unit_id: invocation?.work_unit_id ?? host.workUnitId ?? null,
                bos_source_surface: invocation?.bos_source_surface,
                defaultChannel: "sms",
            });
            return { ok: true };
        }
        if (actionKey === "call_parent" || intent === "call_parent") {
            const phone =
                invocation?.phone?.trim() ||
                (p.phone != null ? String(p.phone).trim() : "") ||
                (p.phone_e164 != null ? String(p.phone_e164).trim() : "");
            if (!phone) {
                window.alert("No parent phone on file. Add contact info before calling.");
                return { ok: false, error: "No parent phone on file." };
            }
            const digits = phone.replace(/\D/g, "");
            window.location.href = digits ? `tel:${digits}` : `tel:${phone}`;
            return { ok: true };
        }
        if (actionKey === "create_task" || intent === "create_task") {
            if (eid) {
                if (host.openCreateWork) {
                    host.openCreateWork({ opportunity_id: eid });
                    return { ok: true };
                }
                if (typeof window !== "undefined") {
                    window.dispatchEvent(
                        new CustomEvent(ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS, {
                            detail: { opportunity_id: eid },
                        })
                    );
                    window.dispatchEvent(
                        new CustomEvent<OpportunityOpenCreateWorkModalDetail>(ADMIN_V2_OPEN_CREATE_WORK_MODAL, {
                            detail: { opportunity_id: eid },
                        })
                    );
                }
            } else if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("adminv2:open-tasks-panel", { detail: { opportunity_id: null } }));
            }
            return { ok: true };
        }
        if (actionKey === "upload_document" || intent === "upload_document") {
            if (eid && typeof window !== "undefined") {
                window.dispatchEvent(
                    new CustomEvent("adminv2:opportunity-focus-documents", { detail: { opportunity_id: eid } })
                );
            }
            return { ok: true };
        }

        if (intent === "review_automations") {
            host.router.push(ADMIN_WORKFLOWS_HREF);
            return { ok: true };
        }
        if (intent === "create_inquiry") {
            window.alert("Coming next: Create inquiry in AdminV2.");
            return { ok: true };
        }
        if (intent === "open_enrollment_pipeline") {
            host.router.push(operatorWorkUnitHrefFromKey("new_leads"));
            return { ok: true };
        }
        if (intent === "view_needs_attention") {
            const href = host.needsAttentionHref?.trim();
            if (href) {
                host.router.push(href);
                return { ok: true };
            }
            host.router.push(operatorWorkUnitHrefFromKey("needs_attention"));
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
        if (actionKey === "review_enrollment_packet" || intent === "review_enrollment_packet") {
            if (!eid) return { ok: false, error: "entity_id required" };
            dispatchOpenEnrollmentPacketReview(eid);
            return { ok: true };
        }
        if (actionKey === "request_missing_information" || intent === "request_missing_information") {
            if (eid && typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("adminv2:open-send-form", { detail: { opportunity_id: eid } }));
            }
            return { ok: true };
        }
        if (
            actionKey === "assign_classroom" ||
            actionKey === "assign_schedule" ||
            actionKey === "set_start_date" ||
            intent === "assign_classroom" ||
            intent === "assign_schedule" ||
            intent === "set_start_date"
        ) {
            if (!eid) return { ok: false, error: "entity_id required" };
            const field =
                (p.focus_field != null ? String(p.focus_field).trim() : "") ||
                (actionKey === "assign_classroom" || intent === "assign_classroom"
                    ? "program_room_cohort_key"
                    : actionKey === "assign_schedule" || intent === "assign_schedule"
                      ? "schedule_type"
                      : "start_date");
            dispatchFocusInquiryChildren(eid, field as InquiryChildrenFocusField);
            return { ok: true };
        }
        if (message) {
            window.alert(message);
            return { ok: true };
        }
        // NO generic success fall-through.
        //
        // Reaching here means a provisioned `ui_intent` has no branch above, so
        // NOTHING was executed — no request was issued, no server result was
        // validated. Returning `{ ok: true }` here told operators their command
        // ran when it had not: `send_tour_invitation` reported "completed" while
        // creating no invitation, no message and no event. A command that cannot
        // run must say so.
        //
        // This is deliberately not special-cased to one action. Any future
        // provisioned intent without a branch fails loudly on its first click
        // instead of silently lying for however long it takes someone to notice.
        console.warn("[applyRegistryResolvedActionClient] unhandled ui_intent — nothing executed", {
            key: actionKey,
            intent,
        });
        return {
            ok: false,
            error: "This command is not available yet. Nothing was sent.",
        };
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
        error?: {
            message?: string;
            details?: {
                completion_requirements?: RequirementValidationResult;
                action_preflight?: import("@/lib/admin/actions/actionPreflightPresentation").ActionPreflightUiPayload;
            };
        };
        data?: {
            execution_result?: Record<string, unknown> & {
                kind?: string;
                href?: string;
                drawer?: { defaultSurface?: string | null };
                workflow_run_id?: string;
            };
        };
    };
    if (!res.ok || json.ok === false) {
        const completion = json.error?.details?.completion_requirements;
        const preflight = json.error?.details?.action_preflight;
        const summary =
            preflight?.summary ||
            (completion ? formatRequirementValidationSummary(completion) : "") ||
            json.error?.message ||
            "Execute failed";
        console.warn("[applyRegistryResolvedActionClient] execute failed", summary);
        dispatchActionPreflightBlocked({
            action_key: a.key,
            opportunity_id: entityId,
            error: summary,
            completion_requirements: completion,
            action_preflight: preflight,
        });
        return {
            ok: false,
            error: summary,
            completion_requirements: completion,
            action_preflight: preflight,
        };
    }
    const er = json.data?.execution_result;
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
