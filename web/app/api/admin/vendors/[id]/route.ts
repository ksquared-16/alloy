import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";
import { upsertFieldValuesFromBody } from "@/lib/admin/fieldValues";
import { getAdminAuthCached, requireAdminOrOps, logAdminAudit } from "@/lib/adminAuth";
import { assertAllowedStatusKey, resolveStatusLabel } from "@/lib/admin/statusDefinitionsResolve";
import { resolveVendorStatusById, resolveVendorStatusByKey } from "@/lib/vendors/vendorStatusSync";

const ALLOWED_KEYS = [
    "status_key",
    "primary_person_id",
    "name",
    "company_name",
    "phone",
    "email",
    "address_line1",
    "city",
    "state",
    "postal_code",
    "days_available",
    "operating_hours_open",
    "operating_hours_close",
    "owns_supplies",
    "max_daily_jobs",
    "payout_percent",
    "service_area_zip_codes",
    "external_source",
    "external_id",
    "w9_received",
    "ach_verified",
    "consent_contractor_agreement",
    "consent_legal",
    "consent_marketing",
    "payout_override_type",
    "payout_override_value",
    "vendor_status_id",
] as const;

function toNull(v: unknown): unknown {
    if (v === "" || v === undefined) return null;
    return v;
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    try {
        const ctx = await getAdminContextCached();
        if (!ctx.ok) return adminContextFailureResponse(ctx);
        const body = await request.json();
        const auth = await getAdminAuthCached();
        if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const supabase = createAdminClient();
        if (!(await assertRowOrg(supabase, "vendors", id, ctx.orgId)).ok) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const updates: Record<string, unknown> = {};
        for (const key of ALLOWED_KEYS) {
            if (body[key] === undefined) continue;
            const raw = body[key];
            if (key === "primary_person_id") {
                updates[key] = raw === "" || raw === null ? null : raw;
            } else if (key === "status_key") {
                // Empty string from full-form PATCH means "do not change status" (NOT NULL vendor_status_id must stay set).
                if (raw === "" || raw === undefined || raw === null) {
                    continue;
                }
                updates[key] = typeof raw === "string" ? raw.trim() : raw;
            } else if (key === "vendor_status_id") {
                if (raw === "" || raw === undefined || raw === null) {
                    continue;
                }
                updates[key] = typeof raw === "string" ? raw.trim() : raw;
            } else if (key === "days_available" || key === "service_area_zip_codes") {
                updates[key] = Array.isArray(raw) ? raw : null;
            } else if (key === "owns_supplies" || key === "w9_received" || key === "ach_verified" || key === "consent_contractor_agreement" || key === "consent_legal" || key === "consent_marketing") {
                updates[key] = !!raw;
            } else if (key === "max_daily_jobs" || key === "payout_percent" || key === "payout_override_value") {
                updates[key] = raw === "" || raw === null ? null : (typeof raw === "number" ? raw : Number(raw));
            } else if (key === "payout_override_type") {
                updates[key] = raw === "" || raw === null ? null : (typeof raw === "string" ? raw.trim() : raw);
            } else {
                updates[key] = toNull(raw);
            }
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
        }

        const { data: existing } = await supabase
            .from("vendors")
            .select("org_id, status_key")
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        const existingRow = existing as { org_id?: string; status_key?: string | null } | null;
        if (!existingRow) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        const oldStatusKey = existingRow.status_key ?? null;
        const orgId = existingRow.org_id;

        const hasStatusKey = updates.status_key !== undefined;
        const hasVendorStatusId = updates.vendor_status_id !== undefined;

        if (hasStatusKey && hasVendorStatusId) {
            const sk = updates.status_key as string;
            if (sk == null || String(sk).trim() === "") {
                return NextResponse.json(
                    {
                        error:
                            "Vendor status cannot be cleared: vendor_status_id is required. Choose a status from the list.",
                    },
                    { status: 400 }
                );
            }
            const byKey = await resolveVendorStatusByKey(supabase, sk);
            const byId = await resolveVendorStatusById(supabase, updates.vendor_status_id as string);
            if (!byKey || !byId || byKey.vendor_status_id !== byId.vendor_status_id) {
                return NextResponse.json(
                    { error: "status_key and vendor_status_id refer to different vendor statuses." },
                    { status: 400 }
                );
            }
            const chk = await assertAllowedStatusKey(supabase, orgId!, "vendors", byKey.status_key);
            if (!chk.ok) {
                return NextResponse.json({ error: chk.message }, { status: 400 });
            }
            (updates as Record<string, unknown>).vendor_status_id = byKey.vendor_status_id;
            (updates as Record<string, unknown>).status_key = byKey.status_key;
            (updates as Record<string, unknown>).status = byKey.status;
        } else if (hasStatusKey) {
            const sk = updates.status_key as string | null;
            if (sk == null || String(sk).trim() === "") {
                return NextResponse.json(
                    {
                        error:
                            "Vendor status cannot be cleared: vendor_status_id is required. Choose a status from the list.",
                    },
                    { status: 400 }
                );
            }
            const chk = await assertAllowedStatusKey(supabase, orgId!, "vendors", sk);
            if (!chk.ok) {
                return NextResponse.json({ error: chk.message }, { status: 400 });
            }
            const aligned = await resolveVendorStatusByKey(supabase, sk);
            if (!aligned) {
                return NextResponse.json(
                    {
                        error: `No vendor_statuses row matches status_key "${sk}". Add a vendor_statuses row with this key or align status_definitions with vendor_statuses.`,
                    },
                    { status: 400 }
                );
            }
            (updates as Record<string, unknown>).vendor_status_id = aligned.vendor_status_id;
            (updates as Record<string, unknown>).status_key = aligned.status_key;
            (updates as Record<string, unknown>).status = aligned.status;
        } else if (hasVendorStatusId) {
            const aligned = await resolveVendorStatusById(supabase, updates.vendor_status_id as string);
            if (!aligned) {
                return NextResponse.json({ error: "Invalid vendor_status_id (no matching vendor_statuses row)." }, { status: 400 });
            }
            const chk = await assertAllowedStatusKey(supabase, orgId!, "vendors", aligned.status_key);
            if (!chk.ok) {
                return NextResponse.json({ error: chk.message }, { status: 400 });
            }
            (updates as Record<string, unknown>).vendor_status_id = aligned.vendor_status_id;
            (updates as Record<string, unknown>).status_key = aligned.status_key;
            (updates as Record<string, unknown>).status = aligned.status;
        }

        const { data, error } = await supabase
            .from("vendors")
            .update(updates)
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        if (orgId) {
            await upsertFieldValuesFromBody(supabase, orgId, "vendor", id, body, ALLOWED_KEYS);
        }
        if (updates.status_key !== undefined && orgId) {
            const newStatusKey = (data as { status_key?: string | null }).status_key ?? null;
            await emitStatusChangedEvent({
                supabase,
                orgId,
                entityType: "vendors",
                entityId: id,
                oldStatusKey,
                newStatusKey,
            });
        }
        logAdminAudit({
            entity: "vendors",
            id,
            changed_fields: Object.keys(updates),
            actor_user_id: auth.user.id,
            role: auth.role,
        });
        const row = data as Record<string, unknown> & { status_key?: string | null; status?: string | null };
        const skOut = row.status_key ?? row.status ?? null;
        const statusDisplay =
            orgId != null ? await resolveStatusLabel(supabase, orgId, "vendors", skOut) : skOut;
        return NextResponse.json({
            ...row,
            _status_display: statusDisplay ?? skOut ?? null,
            _vendor_status_label: statusDisplay ?? skOut ?? null,
        });
    } catch (e: unknown) {
        console.error("[ADMIN_PATCH_VENDOR]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
