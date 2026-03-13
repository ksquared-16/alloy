import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import { executeWorkflowRun } from "@/lib/workflowRun";
import { validateDiscountCodeForJob } from "@/lib/admin/validateDiscountCode";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";
import { upsertFieldValuesFromBody } from "@/lib/admin/fieldValues";

const ALLOWED_KEYS = [
    "title",
    "description",
    "job_type",
    "service_key",
    "job_status_id",
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
        const { data: vendor } = await supabase.from("vendors").select("name").eq("id", vendorId).maybeSingle();
        _assigned_vendor_name = (vendor as { name?: string | null } | null)?.name ?? null;
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

    return NextResponse.json({
        ...j,
        _customer_name,
        _assigned_vendor_name,
        _primary_person_name,
        _primary_contact_name,
    });
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
                const { data: jobAfter } = await supabase.from("jobs").select("*").eq("id", id).eq("org_id", ctx.orgId).single();
                if (jobAfter && Object.keys(updates).length === 0) {
                    logAdminAudit({ entity: "jobs", id, changed_fields: ["action:" + action], actor_user_id: ctx.userId, role: ctx.role });
                    return NextResponse.json(jobAfter);
                }
            }
        }

        // Discount fields: validate and recompute when discount_code_id is present
        const bodyDiscountCodeId = typeof body.discount_code_id === "string" && body.discount_code_id.trim() ? body.discount_code_id.trim() : null;
        if (body.discount_code_id !== undefined) {
            if (bodyDiscountCodeId) {
                const { data: jobRow } = await supabase.from("jobs").select("gross_price_cents, vertical_id").eq("id", id).eq("org_id", ctx.orgId).single();
                const currentGross = (jobRow as { gross_price_cents?: number | null } | null)?.gross_price_cents ?? 0;
                const gross = typeof body.gross_price_cents === "number" && Number.isFinite(body.gross_price_cents) ? Math.round(body.gross_price_cents) : currentGross;
                const verticalId = (jobRow as { vertical_id?: string | null } | null)?.vertical_id ?? null;
                let jobVerticalSlug: string | null = null;
                if (verticalId) {
                    const { data: vert } = await supabase.from("verticals").select("slug").eq("id", verticalId).maybeSingle();
                    jobVerticalSlug = (vert as { slug?: string | null } | null)?.slug ?? null;
                }
                const { data: codeRow, error: codeErr } = await supabase
                    .from("discount_codes")
                    .select("id, code, is_active, discount_type, discount_value, applies_to_vertical_slug, starts_at, ends_at")
                    .eq("id", bodyDiscountCodeId)
                    .maybeSingle();
                if (codeErr) {
                    return NextResponse.json({ error: codeErr.message }, { status: 500 });
                }
                const result = validateDiscountCodeForJob(
                    codeRow as Parameters<typeof validateDiscountCodeForJob>[0],
                    gross,
                    jobVerticalSlug
                );
                if ("error" in result) {
                    return NextResponse.json({ error: result.error }, { status: 400 });
                }
                updates.discount_code_id = bodyDiscountCodeId;
                updates.discount_code = result.code;
                updates.discount_amount = result.discount_amount_cents;
                updates.discounted = true;
            } else {
                updates.discount_code_id = null;
                updates.discount_code = null;
                updates.discount_amount = 0;
                updates.discounted = false;
            }
        }

        for (const key of ALLOWED_KEYS) {
            if (body[key] === undefined) continue;
            if (key === "discount_code_id" || key === "discount_code" || key === "discount_amount" || key === "discounted") continue; // handled above
            if (key === "assigned_vendor_id" || key === "primary_contact_id" || key === "customer_id" || key === "opportunity_id" || key === "location_id") {
                updates[key] = body[key] === "" || body[key] == null ? null : body[key];
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

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
        }

        const { data: existingJob } = await supabase
            .from("jobs")
            .select("status_key, customer_id, assigned_vendor_id")
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        const oldStatusKey = (existingJob as { status_key?: string | null } | null)?.status_key ?? null;

        const { data, error } = await supabase
            .from("jobs")
            .update(updates)
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

        await upsertFieldValuesFromBody(supabase, ctx.orgId, "job", id, body, ALLOWED_KEYS);

        const newStatusKey = updates.status_key !== undefined ? (updates.status_key as string | null) : oldStatusKey;
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
        return NextResponse.json(data);
    } catch (e: unknown) {
        console.error("[ADMIN_PATCH_JOB]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
