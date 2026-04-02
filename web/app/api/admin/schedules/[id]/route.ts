import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import {
    postScheduleCompletion,
    isPostScheduleCompletionError,
    isPostScheduleCompletionSkipped,
} from "@/lib/admin/postScheduleCompletion";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";
import { upsertFieldValuesFromBody } from "@/lib/admin/fieldValues";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";
import { generateNextSubscriptionSchedule } from "@/lib/admin/generateNextSubscriptionSchedule";
import {
  effectiveScheduleStatusKey,
  fetchScheduleStatusKeyByFk,
  resolveScheduleStatusRowByKey,
} from "@/lib/admin/scheduleEffectiveStatusKey";
import { isScheduleCanceledStatusKey } from "@/lib/admin/scheduleCanceledStatus";
import { attachDirectFkRelationshipDisplays } from "@/lib/admin/relationshipDisplayAttach";
import { attachFieldDefinitionsAndValues } from "@/lib/admin/entityFieldRegistryAttach";

const ALLOWED_KEYS = ["start_at", "end_at", "timezone", "status", "status_key", "metadata"] as const;

function isCompletedStatus(s: string | null | undefined): boolean {
    const k = String(s ?? "").trim().toLowerCase();
    return k === "completed" || k === "complete" || k === "done";
}

/** GET: single schedule by id, org-scoped. Returns schedule + _job_title, _customer_name, _assigned_vendor_name. */
export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: schedule, error } = await supabase
        .from("schedules")
        .select("*")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .single();

    if (error || !schedule) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const s = schedule as Record<string, unknown>;
    const jobId = s.job_id as string | null | undefined;
    let _job_title: string | null = null;
    let _customer_name: string | null = null;
    let _assigned_vendor_name: string | null = null;

    if (jobId) {
        const { data: job } = await supabase.from("jobs").select("id, title, customer_id, assigned_vendor_id").eq("id", jobId).maybeSingle();
        if (job) {
            const j = job as { title?: string | null; customer_id?: string | null; assigned_vendor_id?: string | null };
            _job_title = j.title ?? null;
            const customerId = j.customer_id ?? null;
            if (customerId) {
                const { data: cust } = await supabase.from("customers").select("name").eq("id", customerId).maybeSingle();
                _customer_name = (cust as { name?: string | null } | null)?.name ?? null;
            }
            const jobVendorId = j.assigned_vendor_id ?? null;
            const { data: assign } = await supabase.from("assignments").select("vendor_id").eq("schedule_id", id).maybeSingle();
            const scheduleVendorId = (assign as { vendor_id?: string } | null)?.vendor_id ?? null;
            const vendorId = scheduleVendorId ?? jobVendorId;
            if (vendorId) {
                const { data: vendor } = await supabase.from("vendors").select("name").eq("id", vendorId).maybeSingle();
                _assigned_vendor_name = (vendor as { name?: string | null } | null)?.name ?? null;
            }
        }
    }

    const out: Record<string, unknown> = {
        ...s,
        _job_title,
        _customer_name,
        _assigned_vendor_name,
    };
    await attachFieldDefinitionsAndValues(supabase, out, "schedules", id);
    await attachDirectFkRelationshipDisplays(supabase, ctx.orgId, "schedules", out);
    return NextResponse.json(out);
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
        if ("metadata" in body && body.metadata == null) body.metadata = {};
        const updates: Record<string, unknown> = {};
        for (const key of ALLOWED_KEYS) {
            if (body[key] === undefined) continue;
            if (key === "metadata") {
                updates[key] = body.metadata != null && typeof body.metadata === "object" ? body.metadata : {};
                continue;
            }
            if (key === "status") {
                if (body.status_key !== undefined) continue;
                const v = body.status;
                updates.status_key = v === "" || v == null ? null : typeof v === "string" ? v.trim() || null : v;
                continue;
            }
            if (key === "status_key") {
                const v = body[key];
                updates.status_key = v === "" || v == null ? null : typeof v === "string" ? v.trim() || null : v;
                continue;
            }
            updates[key] = body[key];
        }

        const supabase = createAdminClient();
        const { data: schedule, error: fetchErr } = await supabase
            .from("schedules")
            .select("job_id, start_at, end_at, status_key, schedule_status_id, assigned_vendor_id, customer_subscription_id")
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .single();
        if (fetchErr || !schedule) {
            return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
        }

        const previousStatusKey = (schedule as { status_key?: string | null }).status_key;
        const norm = (x: string | null | undefined) =>
            x == null || String(x).trim() === "" ? null : String(x).trim();

        if (updates.status_key !== undefined) {
            const newSk = norm(updates.status_key as string | null);
            if (newSk && isScheduleCanceledStatusKey(newSk)) {
                return NextResponse.json(
                    {
                        error:
                            "To cancel a schedule use POST /api/admin/schedules/[id]/cancel (sets canceled_at, cancel_reason, and fee logic). PATCH cannot set canceled status.",
                    },
                    { status: 400 }
                );
            }
            const prevSk = norm(previousStatusKey);
            if (newSk !== prevSk) {
                const chk = await assertAllowedStatusKey(supabase, ctx.orgId, "schedules", updates.status_key as string | null);
                if (!chk.ok) {
                    return NextResponse.json({ error: chk.message }, { status: 400 });
                }
            }
            if (newSk) {
                const row = await resolveScheduleStatusRowByKey(supabase, newSk);
                if (row) updates.schedule_status_id = row.id;
                else
                    console.warn("[ADMIN_PATCH_SCHEDULE] status_key has no matching schedule_statuses row", {
                        scheduleId: id,
                        status_key: newSk,
                    });
            } else {
                updates.schedule_status_id = null;
            }
        }

        const keyByFkPrev = await fetchScheduleStatusKeyByFk(supabase, [
            (schedule as { schedule_status_id?: string | null }).schedule_status_id,
        ]);
        const previousEffective = effectiveScheduleStatusKey(
            {
                status_key: (schedule as { status_key?: string | null }).status_key,
                schedule_status_id: (schedule as { schedule_status_id?: string | null }).schedule_status_id,
            },
            keyByFkPrev
        );

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
        }

        const startAt = (updates.start_at as string) ?? body.start_at;
        const endAt = (updates.end_at as string) ?? body.end_at;
        if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
            return NextResponse.json({ error: "end_at must be after start_at" }, { status: 400 });
        }
        const finalStart = (updates.start_at as string) ?? (schedule as { start_at?: string }).start_at;
        const finalEnd = (updates.end_at as string) ?? (schedule as { end_at?: string }).end_at;
        if (finalStart && finalEnd) {
            const durationMs = new Date(finalEnd).getTime() - new Date(finalStart).getTime();
            const durationMinutes = Math.round(durationMs / 60000);
            if (durationMinutes > 0) updates.duration_minutes = durationMinutes;
        }

        const { data, error } = await supabase
            .from("schedules")
            .update(updates)
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

        await upsertFieldValuesFromBody(supabase, ctx.orgId, "schedule", id, body, ALLOWED_KEYS);

        const keyByFkPost = await fetchScheduleStatusKeyByFk(supabase, [
            (data as { schedule_status_id?: string | null }).schedule_status_id,
        ]);
        const newEffective = effectiveScheduleStatusKey(
            {
                status_key: (data as { status_key?: string | null }).status_key,
                schedule_status_id: (data as { schedule_status_id?: string | null }).schedule_status_id,
            },
            keyByFkPost
        );
        const transitionedToCompleted = !isCompletedStatus(previousEffective) && isCompletedStatus(newEffective);
        const subscriptionIdAfter = (data as { customer_subscription_id?: string | null }).customer_subscription_id ?? null;

        if (isCompletedStatus(newEffective)) {
            console.info("[ADMIN_PATCH_SCHEDULE] completion_path", {
                scheduleId: id,
                previousStatusRaw: previousStatusKey ?? null,
                previousStatusEffective: previousEffective ?? null,
                newStatusRaw: (data as { status_key?: string | null }).status_key ?? null,
                newStatusEffective: newEffective ?? null,
                transitionedIntoCompleted: transitionedToCompleted,
                customer_subscription_id: subscriptionIdAfter,
            });
        }

        if (transitionedToCompleted) {
            if (!subscriptionIdAfter) {
                console.info("[ADMIN_PATCH_SCHEDULE] generateNextSubscriptionSchedule skipped: no customer_subscription_id", {
                    scheduleId: id,
                });
            } else {
                const gen = await generateNextSubscriptionSchedule(supabase, subscriptionIdAfter);
                console.info("[ADMIN_PATCH_SCHEDULE] generateNextSubscriptionSchedule", {
                    scheduleId: id,
                    subscriptionId: subscriptionIdAfter,
                    ok: gen.ok,
                    ...(gen.ok ? { created_schedule_id: gen.schedule_id, duplicate: gen.duplicate } : { error: gen.error, code: gen.code }),
                });
                if (!gen.ok) {
                    console.error("[ADMIN_PATCH_SCHEDULE] generate next subscription schedule failed", {
                        scheduleId: id,
                        subscriptionId: subscriptionIdAfter,
                        error: gen.error,
                        code: gen.code,
                    });
                }
            }

            const postResult = await postScheduleCompletion({
                supabase,
                orgId: ctx.orgId,
                scheduleId: id,
            });
            if (isPostScheduleCompletionSkipped(postResult)) {
                console.info("[ADMIN_PATCH_SCHEDULE] GL post skipped (zero amount)", { scheduleId: id });
            } else if (isPostScheduleCompletionError(postResult)) {
                const err = postResult;
                if (err.code === "schedule_not_completed") {
                    return NextResponse.json(
                        { error: "Schedule status is not completed; cannot post GL" },
                        { status: 400 }
                    );
                }
                if (err.code === "missing_mappings") {
                    return NextResponse.json(
                        { error: `Missing GL account mappings: ${err.keys.join(", ")}` },
                        { status: 400 }
                    );
                }
                if (err.code === "entry_unbalanced") {
                    return NextResponse.json(
                        {
                            error: "GL entry unbalanced",
                            total_debits: err.total_debits,
                            total_credits: err.total_credits,
                        },
                        { status: 500 }
                    );
                }
                if (err.code === "schedule_not_found" || err.code === "job_not_found") {
                    return NextResponse.json({ error: "Schedule or job not found for GL posting" }, { status: 500 });
                }
            }
        }

        if (updates.status_key !== undefined) {
            const metadata: Record<string, unknown> = {};
            const jobId = (schedule as { job_id?: string }).job_id;
            const assignedVendorId = (schedule as { assigned_vendor_id?: string | null }).assigned_vendor_id;
            if (jobId) metadata.job_id = jobId;
            if (assignedVendorId != null) metadata.assigned_vendor_id = assignedVendorId;
            if ((schedule as { start_at?: string }).start_at) metadata.start_at = (schedule as { start_at: string }).start_at;
            await emitStatusChangedEvent({
                supabase,
                orgId: ctx.orgId,
                entityType: "schedules",
                entityId: id,
                oldStatusKey: previousEffective ?? null,
                newStatusKey: (newEffective ?? null) as string | null,
                metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
            });
        }

        const jobId = (schedule as { job_id?: string }).job_id;
        if (jobId && updates.start_at) {
            await supabase.from("jobs").update({ scheduled_at: updates.start_at }).eq("id", jobId);
        }

        logAdminAudit({
            entity: "schedules",
            id,
            changed_fields: Object.keys(updates),
            actor_user_id: ctx.userId,
            role: ctx.role,
        });
        return NextResponse.json(data);
    } catch (e: unknown) {
        console.error("[ADMIN_PATCH_SCHEDULE]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
