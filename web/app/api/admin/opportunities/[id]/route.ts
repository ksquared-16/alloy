import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, logAdminAudit } from "@/lib/adminAuth";
import { emitEvent } from "@/lib/emitEvent";
import { upsertFieldValuesFromBody } from "@/lib/admin/fieldValues";
import {
    mergeOpportunityQuotePricing,
    opportunityQuotePipelineActive,
    type OpportunityPricingExistingRow,
} from "@/lib/admin/opportunityQuotePatch";
import { normalizeOpportunityWritePayload } from "@/lib/opportunityIdentity";
import {
    mergeEnrollmentOperationalIntoMetadata,
    sanitizeEnrollmentOperationalPatch,
} from "@/lib/opportunities/enrollmentOperationalMetadata";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertExistingOpportunityMutableInAdminScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { ENROLLMENT_RECORD_MANAGE, requireEnrollmentCapability } from "@/lib/access/enrollmentAuthority";
import { fetchEffectiveRecordDrawerLayout } from "@/lib/admin/effectiveRecordDrawerLayout";
import {
    enforceDrawerFieldPoliciesOnPatch,
    fieldPolicyValidationResponse,
} from "@/lib/fields/enforceDrawerFieldPoliciesOnPatch";
import { opportunityBodyHasCustomFieldUpdates } from "@/lib/admin/drawer/opportunityDrawerFieldSave";
import { isUuidLike } from "@/lib/admin/overviewRelationshipLabels";

/**
 * PATCH allowlist intentionally excludes identity FKs (`primary_contact_id`, `primary_person_id`).
 * Prefer drawer/entity routes that maintain person-first invariants; do not widen this list with contact-only writes.
 */
const ALLOWED_KEYS = [
    "name",
    "job_date",
    "job_time_window",
    "status",
    "vertical_id",
    "location_id",
    "quote_total",
    "price_breakdown",
    "notes",
    "source",
    "assigned_to",
    "lost_reason",
    "appointment_id",
    "quote_subtotal",
    "discount_amount",
    "discount_code",
    "external_source",
    "external_id",
    "quote_is_overridden",
    "quote_override_total",
    "quote_override_reason",
] as const;

const PIPELINE_ONLY_KEYS = new Set([
    "quote_inputs",
    "apply_quote_discount",
    "clear_quote_discount",
    "clear_quote_override",
    "quote_discount_selection",
]);

function logOpportunityPatchRejected(
    reason: string,
    detail: Record<string, unknown>,
): void {
    console.warn("[ADMIN_PATCH_OPPORTUNITY] rejected", { reason, ...detail });
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const auth = await getAdminAuthCached();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    try {
        const ctx = await getAdminContextCached();
        if (!ctx.ok) return adminContextFailureResponse(ctx);
        const body = (await request.json()) as Record<string, unknown>;

        const supabase = createAdminClient();
        if (!(await assertRowOrg(supabase, "opportunities", id, ctx.orgId)).ok) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const { data: existing } = await supabase
            .from("opportunities")
            .select(
                "org_id, status_key, customer_id, primary_contact_id, primary_person_id, vertical_id, metadata, work_unit_id, location_id, quote_subtotal, quote_total, price_breakdown, discount_amount, discount_code, discount_code_id, discount_program_id, discount_validated_at, quote_is_overridden, quote_override_total, quote_override_reason, estimated_price_cents, monetary_value_cents"
            )
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        const existingRow = existing as {
            org_id?: string;
            status_key?: string | null;
            customer_id?: string | null;
            primary_contact_id?: string | null;
            primary_person_id?: string | null;
            vertical_id?: string | null;
            metadata?: Record<string, unknown> | null;
            work_unit_id?: string | null;
            quote_subtotal?: number | null;
            quote_total?: number | null;
            price_breakdown?: string | null;
            discount_amount?: number | null;
            discount_code?: string | null;
            discount_code_id?: string | null;
            discount_program_id?: string | null;
            discount_validated_at?: string | null;
            quote_is_overridden?: boolean | null;
            quote_override_total?: number | null;
            quote_override_reason?: string | null;
            estimated_price_cents?: number | null;
            monetary_value_cents?: number | null;
        } | null;
        if (!existingRow?.org_id) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const access = await getAdminAccessContextCached();
        if (!access.ok) return adminContextFailureResponse(access);
        /*
         * ENROLLMENT RECORD AUTHORITY — editing the Lead/Inquiry record itself.
         *
         * Authority here was a 401 check and nothing more: any session that resolved an admin
         * context could rewrite a family's inquiry. `enrollment.record.manage` is the authority
         * now, held by grant and by nothing else — no role title, and not the inert
         * `crm.opportunities.write` this route's table shares a name with.
         */
        const capDenied = requireEnrollmentCapability(access, ENROLLMENT_RECORD_MANAGE);
        if (capDenied) return capDenied;
        const scopeDim = scopeDimensionsFromAccess(access);
        if (!(await assertExistingOpportunityMutableInAdminScope(supabase, ctx.orgId, scopeDim, id))) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const layoutResolved = await fetchEffectiveRecordDrawerLayout(supabase, ctx.orgId, "opportunity");
        const opportunityLayoutConfig =
            layoutResolved.ok && layoutResolved.layout ? layoutResolved.layout.config_json : null;

        const policyCheck = await enforceDrawerFieldPoliciesOnPatch({
            supabase,
            orgId: ctx.orgId,
            entityType: "opportunity",
            entityId: id,
            body,
            persistedRow: existingRow as Record<string, unknown>,
            layoutConfig: opportunityLayoutConfig,
        });
        if (!policyCheck.ok) {
            logOpportunityPatchRejected("field_policy", {
                opportunity_id: id,
                body_keys: Object.keys(body),
                violations: policyCheck.violations,
            });
            return NextResponse.json(fieldPolicyValidationResponse(policyCheck.violations), { status: 400 });
        }

        const orgId = existingRow.org_id;
        const oldStatusKey = existingRow.status_key ?? null;

        const updates: Record<string, unknown> = {};
        let ownedKeys = new Set<string>();

        const metadataBase = (existingRow?.metadata as Record<string, unknown> | null) ?? {};
        const metadataUpdates: Record<string, unknown> = {};
        if (body.notes !== undefined) {
            metadataUpdates.notes = body.notes === "" ? null : body.notes;
        }

        if (opportunityQuotePipelineActive(body)) {
            const merged = await mergeOpportunityQuotePricing({
                supabase,
                orgId,
                existing: existingRow as OpportunityPricingExistingRow,
                body,
            });
            if ("error" in merged) {
                return NextResponse.json({ error: merged.error }, { status: merged.status });
            }
            Object.assign(updates, merged.updates);
            Object.assign(metadataUpdates, merged.metadataFragment);
            ownedKeys = merged.ownedKeys;
        }

        for (const key of ALLOWED_KEYS) {
            if (ownedKeys.has(key)) continue;
            if (body[key] === undefined) continue;
            if (key === "notes") continue;
            let val = body[key];
            if (key === "vertical_id" && val === "") val = null;
            if (key === "quote_total" && (val === "" || val === null)) val = null;
            if (key === "quote_subtotal" && (val === "" || val === null)) val = null;
            if (key === "discount_amount" && (val === "" || val === null)) val = null;
            if (key === "quote_override_total" && (val === "" || val === null)) val = null;
            if (key === "quote_is_overridden" && val === "") val = false;
            if (
                [
                    "name",
                    "source",
                    "assigned_to",
                    "lost_reason",
                    "appointment_id",
                    "location_id",
                    "discount_code",
                    "external_source",
                    "external_id",
                    "quote_override_reason",
                ].includes(key)
            ) {
                val = typeof val === "string" ? val.trim() || null : val;
            }
            updates[key] = val;
        }

        // Legacy quote_inputs path removed — handled exclusively by mergeOpportunityQuotePricing when present.

        const metadataMergedBase = { ...metadataBase, ...metadataUpdates };
        if (body.enrollment_operational !== undefined) {
            const rawEo = body.enrollment_operational;
            const eoPatch = sanitizeEnrollmentOperationalPatch(rawEo);
            if (eoPatch) {
                updates.metadata = mergeEnrollmentOperationalIntoMetadata(metadataMergedBase, eoPatch);
            } else if (
                rawEo != null &&
                typeof rawEo === "object" &&
                !Array.isArray(rawEo) &&
                Object.keys(rawEo as Record<string, unknown>).length > 0
            ) {
                console.warn("[ADMIN_PATCH_OPPORTUNITY] enrollment_operational ignored after validation", {
                    opportunity_id: id,
                    org_id: orgId,
                    keys: Object.keys(rawEo as Record<string, unknown>),
                });
            }
        }
        if (!updates.metadata && Object.keys(metadataUpdates).length > 0) {
            updates.metadata = metadataMergedBase;
        }

        /*
         * ── GOVERNED LIFECYCLE STATE IS NOT WRITABLE HERE ──
         *
         * This route edits the enrollment RECORD. It is not lifecycle authority, and as of
         * erun_fbaf1ac1049f1050 it has no supported caller that treats it as one: Quote Intake was
         * unreachable and was removed, Current Work was rewired onto the canonical transition
         * boundary once that boundary acquired prior-stage reconciliation, and the record-action
         * helper that turned `mark_lost` into a raw `{status_key, close_reason_key}` PATCH had zero
         * callers and is gone.
         *
         * Refusing is the point. A generic field writer that also persists governed status is how the
         * lifecycle acquires a second authority: it skips destination resolution, transition policy,
         * prior-stage reconciliation, outcome consequences and the destination-stage spawn, and
         * nothing about the request says so. The refusal names where the intent belongs instead.
         *
         * Closing a case as lost is `executeGovernedFamilyClose`. Any other governed transition is
         * `POST /api/admin/enrollment-status-transition/execute`, which takes a configured transition
         * reference and resolves it server-side.
         */
        const GOVERNED_LIFECYCLE_KEYS = ["status_key", "close_reason_key", "stage_key"] as const;
        const attemptedLifecycleKeys = GOVERNED_LIFECYCLE_KEYS.filter((k) =>
            Object.prototype.hasOwnProperty.call(body, k),
        );
        if (attemptedLifecycleKeys.length > 0) {
            logOpportunityPatchRejected("lifecycle_not_writable_here", {
                opportunity_id: id,
                body_keys: Object.keys(body),
                attempted: attemptedLifecycleKeys,
            });
            return NextResponse.json(
                {
                    error:
                        `Governed lifecycle state (${attemptedLifecycleKeys.join(", ")}) cannot be changed through the record ` +
                        "endpoint. Use the canonical transition: POST /api/admin/enrollment-status-transition/execute " +
                        "with a configured transition reference, or the governed family-close action to close a case.",
                    lifecycle_authority: "canonical_transition_required",
                    attempted_keys: attemptedLifecycleKeys,
                },
                { status: 400 },
            );
        }

        if (updates.location_id != null && updates.location_id !== "") {
            const locationId = String(updates.location_id).trim();
            if (!isUuidLike(locationId)) {
                logOpportunityPatchRejected("invalid_location_id_format", {
                    opportunity_id: id,
                    body_keys: Object.keys(body),
                    location_id: locationId,
                    update_keys: Object.keys(updates),
                });
                return NextResponse.json({ error: "Invalid location_id" }, { status: 400 });
            }
            const { data: locationRow } = await supabase
                .from("locations")
                .select("id")
                .eq("id", locationId)
                .eq("org_id", ctx.orgId)
                .maybeSingle();
            if (!locationRow?.id) {
                logOpportunityPatchRejected("location_not_in_org", {
                    opportunity_id: id,
                    body_keys: Object.keys(body),
                    location_id: locationId,
                });
                return NextResponse.json({ error: "Location not found" }, { status: 400 });
            }
            updates.location_id = locationId;
        }

        const hasNativeUpdates = Object.keys(updates).length > 0;
        const hasCustomFieldUpdates = opportunityBodyHasCustomFieldUpdates(body, PIPELINE_ONLY_KEYS);

        if (!hasNativeUpdates && !hasCustomFieldUpdates) {
            logOpportunityPatchRejected("no_allowed_fields", {
                opportunity_id: id,
                body_keys: Object.keys(body),
                allowed_keys: [...ALLOWED_KEYS],
                update_keys: Object.keys(updates),
            });
            return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
        }

        let data: Record<string, unknown> | null = null;

        if (hasNativeUpdates) {
            await normalizeOpportunityWritePayload(supabase, updates, "admin/opportunities/PATCH");

            const { data: updated, error } = await supabase
                .from("opportunities")
                .update(updates)
                .eq("id", id)
                .eq("org_id", ctx.orgId)
                .select()
                .single();

            if (error) {
                logOpportunityPatchRejected("supabase_update", {
                    opportunity_id: id,
                    body_keys: Object.keys(body),
                    update_keys: Object.keys(updates),
                    error: error.message,
                });
                return NextResponse.json({ error: error.message }, { status: 400 });
            }
            data = updated as Record<string, unknown>;
        } else {
            const { data: existingRowOut, error: readErr } = await supabase
                .from("opportunities")
                .select()
                .eq("id", id)
                .eq("org_id", ctx.orgId)
                .maybeSingle();
            if (readErr || !existingRowOut) {
                return NextResponse.json({ error: "Not found" }, { status: 404 });
            }
            data = existingRowOut as Record<string, unknown>;
        }

        await upsertFieldValuesFromBody(supabase, orgId, "opportunity", id, body, [
            ...ALLOWED_KEYS,
            ...Array.from(PIPELINE_ONLY_KEYS),
        ]);

        if (body.notes !== undefined && orgId) {
            const oldNotes =
                metadataBase.notes != null && String(metadataBase.notes).trim() !== "" ? String(metadataBase.notes) : "";
            const newNotes =
                metadataUpdates.notes != null && String(metadataUpdates.notes).trim() !== ""
                    ? String(metadataUpdates.notes)
                    : "";
            if (oldNotes !== newNotes) {
                const t = newNotes.trim();
                const bodyPreview =
                    t.length === 0 ? null : t.length <= 120 ? t : `${t.slice(0, 119)}…`;
                try {
                    await emitEvent({
                        org_id: orgId,
                        event_type: "note_added",
                        entity_type: "opportunities",
                        entity_id: id,
                        payload: {
                            body_preview: bodyPreview,
                            actor_user_id: auth.user.id,
                        },
                    });
                } catch (e) {
                    console.error("[ADMIN_PATCH_OPPORTUNITY] note_added emit", e);
                }
            }
        }

        const auditFields = Object.keys(updates)
            .filter((k) => k !== "metadata")
            .concat(updates.metadata ? ["metadata"] : []);
        logAdminAudit({
            entity: "opportunities",
            id,
            changed_fields: auditFields,
            actor_user_id: auth.user.id,
            role: auth.role,
        });
        return NextResponse.json(data);
    } catch (e: unknown) {
        console.error("[ADMIN_PATCH_OPPORTUNITY]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
