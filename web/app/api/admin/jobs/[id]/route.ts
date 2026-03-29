import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import { executeWorkflowRun } from "@/lib/workflowRun";
import { inferJobDiscountSelectionToken, parseJobDiscountSelectionInput, resolveJobDiscountSelection, buildJobDiscountDisplayLabel } from "@/lib/admin/jobDiscountSelection";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";
import { upsertFieldValuesFromBody } from "@/lib/admin/fieldValues";
import { vendorRowToDisplayStub, type VendorRowForLabel } from "@/lib/admin/vendorOptionLabel";
import {
    computeJobDisplayTotalCents,
    computeJobGrossBasisCents,
    normalizeJobDiscountAmountToCents,
    type JobPriceInput,
} from "@/lib/admin/jobDisplayPrice";
import { assertAllowedStatusKey, resolveStatusLabel } from "@/lib/admin/statusDefinitionsResolve";
import { attachJobWorkUnitDisplay } from "@/lib/admin/attachJobWorkUnitDisplay";
import { fetchActiveJobLineItemsForAdmin } from "@/lib/admin/fetchActiveJobLineItems";
import { buildOverrideLinesFromAdminJobRow, overrideJobPricing } from "@/lib/pricing/overrideJobPricing";

const ALLOWED_KEYS = [
    "title",
    "description",
    "job_type",
    "service_key",
    "status_key",
    "is_recurring",
    "assigned_vendor_id",
    "metadata",
    "scheduled_at",
    "service_frequency_key",
    "internal_notes",
    "completed_at",
    "gross_price_cents",
    "primary_contact_id",
    "customer_id",
    "opportunity_id",
    "location_id",
    "discount_code_id",
    "discount_code",
    "discount_amount",
    "discounted",
] as const;

const JOB_ACTIONS = ["assign_vendor", "mark_completed"] as const;

/** GET: single job by id, org-scoped. Returns job + _customer_name + _assigned_vendor_name. Admin/ops. */
export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: job, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .single();

    if (error || !job) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const j = job as Record<string, unknown>;
    const customerId = j.customer_id as string | null | undefined;
    const vendorId = j.assigned_vendor_id as string | null | undefined;
    const primaryPersonId = j.primary_person_id as string | null | undefined;
    const primaryContactId = j.primary_contact_id as string | null | undefined;

    let _customer_name: string | null = null;
    let _assigned_vendor_name: string | null = null;
    let _primary_person_name: string | null = null;
    let _primary_contact_name: string | null = null;
    if (customerId) {
        const { data: cust } = await supabase.from("customers").select("name").eq("id", customerId).maybeSingle();
        _customer_name = (cust as { name?: string | null } | null)?.name ?? null;
    }
    if (vendorId) {
        const { data: row } = await supabase
            .from("vendors")
            .select("id, name, company_name, email, phone, primary_person_id")
            .eq("id", vendorId)
            .maybeSingle();
        const r = row as VendorRowForLabel | null;
        if (r) {
            let person: { first_name?: string | null; last_name?: string | null } | null = null;
            if (r.primary_person_id) {
                const { data: p } = await supabase.from("persons").select("first_name, last_name").eq("id", r.primary_person_id).maybeSingle();
                person = p;
            }
            _assigned_vendor_name = vendorRowToDisplayStub(r, person).name;
        }
    }
    if (primaryPersonId) {
        const { data: person } = await supabase.from("persons").select("first_name, last_name").eq("id", primaryPersonId).maybeSingle();
        if (person) {
            const p = person as { first_name?: string | null; last_name?: string | null };
            _primary_person_name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null;
        }
    }
    if (primaryContactId) {
        const { data: contact } = await supabase.from("contacts").select("first_name, last_name").eq("id", primaryContactId).maybeSingle();
        if (contact) {
            const c = contact as { first_name?: string | null; last_name?: string | null };
            _primary_contact_name = [c.first_name, c.last_name].filter(Boolean).join(" ") || null;
        }
    }

    const _discount_selection = await inferJobDiscountSelectionToken(supabase, {
        discount_program_id: (j.discount_program_id as string | null | undefined) ?? null,
        discount_code_id: (j.discount_code_id as string | null | undefined) ?? null,
    });
    const _discount_label = await buildJobDiscountDisplayLabel(supabase, {
        discount_program_id: (j.discount_program_id as string | null | undefined) ?? null,
        discount_code_id: (j.discount_code_id as string | null | undefined) ?? null,
        discount_code: (j.discount_code as string | null | undefined) ?? null,
    });

    const jPrice = j as JobPriceInput;
    const grossBasis = computeJobGrossBasisCents(jPrice) ?? 0;
    const _discount_amount_cents = normalizeJobDiscountAmountToCents(jPrice.discount_amount, grossBasis);
    const display_total_cents = computeJobDisplayTotalCents(jPrice);

    let sk = j.status_key as string | null | undefined;
    const jobStatusFk = j.job_status_id as string | null | undefined;
    if ((!sk || !String(sk).trim()) && jobStatusFk) {
        const { data: jst } = await supabase.from("job_statuses").select("key").eq("id", jobStatusFk).maybeSingle();
        const k = (jst as { key?: string | null } | null)?.key;
        if (k && String(k).trim()) sk = String(k).trim();
    }
    const _status_display = sk ? await resolveStatusLabel(supabase, ctx.orgId, "jobs", sk) : null;

    const _job_line_items = await fetchActiveJobLineItemsForAdmin(supabase, ctx.orgId, id);
    const payload = {
        ...j,
        status_key: sk ?? (j.status_key as string | null) ?? null,
        _customer_name,
        _assigned_vendor_name,
        _primary_person_name,
        _primary_contact_name,
        _discount_selection,
        _discount_label,
        _discount_amount_cents,
        display_total_cents,
        _price_display: display_total_cents != null ? display_total_cents / 100 : null,
        _status_display,
        _job_line_items,
    };
    const withWu = await attachJobWorkUnitDisplay(supabase, ctx.orgId, payload as Record<string, unknown>);
    return NextResponse.json(withWu);
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    try {
        const body = (await request.json()) as Record<string, unknown>;
        const supabase = createAdminClient();

        const { data: existingJob, error: existingErr } = await supabase
            .from("jobs")
            .select("status_key, customer_id, assigned_vendor_id")
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        if (existingErr || !existingJob) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        const oldStatusKey = (existingJob as { status_key?: string | null }).status_key ?? null;

        const updates: Record<string, unknown> = {};

        const action = body.action as string | undefined;
        if (action && (JOB_ACTIONS as readonly string[]).includes(action)) {
            const { data: jobRow } = await supabase
                .from("jobs")
                .select("*")
                .eq("id", id)
                .eq("org_id", ctx.orgId)
                .single();
            if (jobRow) {
                let wq = supabase.from("workflows").select("id").eq("enabled", true).eq("event_type", "job_action").eq("entity_type", "job");
                wq = wq.or(`org_id.eq.${ctx.orgId},org_id.is.null`);
                const { data: wfs } = await wq;
                const eventPayload: Record<string, unknown> = {
                    event_type: "job_action",
                    occurred_at: new Date().toISOString(),
                    org_id: ctx.orgId,
                    action,
                    job: jobRow,
                };
                for (const wf of wfs ?? []) {
                    try {
                        await executeWorkflowRun(supabase, (wf as { id: string }).id, eventPayload);
                    } catch (_) {
                        // log and continue
                    }
                }
            }
        }

        // Discount: body.discount_code_id carries selection token (program:uuid | code:uuid) or legacy plain code uuid
        if (body.discount_code_id !== undefined) {
            const raw =
                body.discount_code_id === null || body.discount_code_id === ""
                    ? null
                    : typeof body.discount_code_id === "string"
                      ? body.discount_code_id.trim()
                      : null;
            const parsed = raw ? parseJobDiscountSelectionInput(raw) : null;
            if (!raw) {
                updates.discount_code_id = null;
                updates.discount_program_id = null;
                updates.discount_code = null;
                updates.discount_amount = 0;
                updates.discounted = false;
            } else {
                const { data: jobRow } = await supabase.from("jobs").select("gross_price_cents, vertical_id").eq("id", id).eq("org_id", ctx.orgId).single();
                const currentGross = (jobRow as { gross_price_cents?: number | null } | null)?.gross_price_cents ?? 0;
                const gross = typeof body.gross_price_cents === "number" && Number.isFinite(body.gross_price_cents) ? Math.round(body.gross_price_cents) : currentGross;
                const verticalId = (jobRow as { vertical_id?: string | null } | null)?.vertical_id ?? null;
                let jobVerticalSlug: string | null = null;
                if (verticalId) {
                    const { data: vert } = await supabase.from("verticals").select("slug").eq("id", verticalId).maybeSingle();
                    jobVerticalSlug = (vert as { slug?: string | null } | null)?.slug ?? null;
                }
                const resolved = await resolveJobDiscountSelection(supabase, parsed, gross, jobVerticalSlug, ctx.orgId);
                if (!resolved.ok) {
                    return NextResponse.json({ error: resolved.error }, { status: 400 });
                }
                updates.discount_code_id = resolved.value.discount_code_id;
                updates.discount_program_id = resolved.value.discount_program_id;
                updates.discount_code = resolved.value.discount_code;
                updates.discount_amount = resolved.value.discount_amount;
                updates.discounted = resolved.value.discounted;
            }
        }

        const JOB_TIMESTAMPTZ_KEYS = ["scheduled_at", "completed_at"] as const;

        if (body.work_unit_id !== undefined) {
            const raw = body.work_unit_id;
            if (raw === "" || raw == null) {
                updates.work_unit_id = null;
            } else if (typeof raw === "string" && raw.trim()) {
                const wuId = raw.trim();
                const { data: wuRow, error: wuErr } = await supabase
                    .from("work_units")
                    .select("id")
                    .eq("id", wuId)
                    .eq("org_id", ctx.orgId)
                    .maybeSingle();
                if (wuErr || !wuRow) {
                    return NextResponse.json(
                        { error: "Work unit not found in this organization" },
                        { status: 400 }
                    );
                }
                updates.work_unit_id = wuId;
            } else {
                return NextResponse.json({ error: "Invalid work_unit_id" }, { status: 400 });
            }
        }

        for (const key of ALLOWED_KEYS) {
            if (body[key] === undefined) continue;
            if (key === "discount_code_id" || key === "discount_code" || key === "discount_amount" || key === "discounted") continue; // handled above
            if (key === "status_key") {
                const v = body[key];
                updates.status_key = v === "" || v == null ? null : typeof v === "string" ? v.trim() || null : v;
                continue;
            }
            if (key === "assigned_vendor_id" || key === "primary_contact_id" || key === "customer_id" || key === "opportunity_id" || key === "location_id") {
                updates[key] = body[key] === "" || body[key] == null ? null : body[key];
                continue;
            }
            if ((JOB_TIMESTAMPTZ_KEYS as readonly string[]).includes(key)) {
                const v = body[key];
                if (v === "" || v == null) {
                    updates[key] = null;
                } else if (typeof v === "string" && v.trim() === "") {
                    updates[key] = null;
                } else {
                    updates[key] = v;
                }
                continue;
            }
            if (key === "gross_price_cents" && (body[key] === "" || body[key] == null)) {
                updates[key] = null;
                continue;
            }
            if (key === "internal_notes") {
                const { data: existing } = await supabase.from("jobs").select("metadata").eq("id", id).eq("org_id", ctx.orgId).single();
                const meta = ((existing as { metadata?: unknown })?.metadata as Record<string, unknown>) || {};
                updates.metadata = { ...meta, internal_notes: body.internal_notes === "" ? null : body.internal_notes };
                continue;
            }
            updates[key] = body[key];
        }

        if (updates.status_key !== undefined) {
            const norm = (x: string | null | undefined) =>
                x == null || String(x).trim() === "" ? null : String(x).trim();
            const newSk = norm(updates.status_key as string | null);
            const prevSk = norm(oldStatusKey);
            if (newSk !== prevSk) {
                const check = await assertAllowedStatusKey(supabase, ctx.orgId, "jobs", updates.status_key as string | null);
                if (!check.ok) {
                    return NextResponse.json({ error: check.message }, { status: 400 });
                }
            }
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
        }

        const { data, error } = await supabase
            .from("jobs")
            .update(updates)
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const pricingTouched =
            Object.prototype.hasOwnProperty.call(updates, "gross_price_cents") ||
            Object.prototype.hasOwnProperty.call(updates, "discount_code_id") ||
            Object.prototype.hasOwnProperty.call(updates, "discount_amount") ||
            Object.prototype.hasOwnProperty.call(updates, "discounted") ||
            Object.prototype.hasOwnProperty.call(updates, "discount_program_id");

        if (pricingTouched) {
            const jobRow = data as JobPriceInput & { discount_code?: string | null };
            const over = await overrideJobPricing({
                supabase,
                orgId: ctx.orgId,
                jobId: id,
                changes: buildOverrideLinesFromAdminJobRow(jobRow),
                reason: "admin_job_update",
                actorUserId: ctx.userId,
            });
            if (!over.ok) {
                return NextResponse.json({ error: over.error }, { status: 500 });
            }
        }

        await upsertFieldValuesFromBody(supabase, ctx.orgId, "job", id, body, [
            ...ALLOWED_KEYS,
            "work_unit_id",
        ]);

        const newStatusKey =
            updates.status_key !== undefined ? (updates.status_key as string | null) : oldStatusKey;
        if (updates.status_key !== undefined) {
            const metadata: Record<string, unknown> = {};
            if ((existingJob as { customer_id?: string | null } | null)?.customer_id != null) metadata.customer_id = (existingJob as { customer_id: string }).customer_id;
            if ((existingJob as { assigned_vendor_id?: string | null } | null)?.assigned_vendor_id != null) metadata.assigned_vendor_id = (existingJob as { assigned_vendor_id: string }).assigned_vendor_id;
            await emitStatusChangedEvent({
                supabase,
                orgId: ctx.orgId,
                entityType: "jobs",
                entityId: id,
                oldStatusKey,
                newStatusKey: newStatusKey ?? null,
                metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
            });
        }

        logAdminAudit({
            entity: "jobs",
            id,
            changed_fields: Object.keys(updates),
            actor_user_id: ctx.userId,
            role: ctx.role,
        });
        const out = await attachJobWorkUnitDisplay(supabase, ctx.orgId, data as Record<string, unknown>);
        return NextResponse.json(out);
    } catch (e: unknown) {
        console.error("[ADMIN_PATCH_JOB]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
