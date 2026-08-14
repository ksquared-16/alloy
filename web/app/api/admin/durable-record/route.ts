import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { composeDurablePersonSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/composeDurablePersonSubject";
import { composeDurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/composeDurableChildSubject";
import {
    focusPanelWorkModeModelFromDurableChild,
    focusPanelWorkModeModelFromDurablePerson,
} from "@/lib/adminV2/runtime/focusPanel/durableSubject/focusPanelWorkModeModelFromDurableSubject";
import { encodeDurableRecordModel } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableRecordModelWire";
import { resolveAttentionTarget } from "@/lib/workUnits/operatorFocusTarget";

/**
 * GET `/api/admin/durable-record?subject_type=person|child&subject_id=…`
 *
 * Composes the settled Focus Panel model for a DURABLE record — one that exists because the record
 * exists, not because a queue holds it. No provisioning answer, no Work Unit, no Opportunity created.
 *
 * ── ACCESS IS RESOLVED HERE, NOT ASSUMED ──
 *
 * The route runs the SAME `resolveAttentionTarget` the client gesture ran, under `durable_record`
 * semantics. That is not redundant: navigation does not grant access, so the surface must re-answer
 * "may this operator reach this record" on arrival. A subject the resolver refuses is a 404 here —
 * indistinguishable from a record that does not exist, exactly as the resolver's own contract
 * requires.
 *
 * The resolution ALSO supplies the optional operational host, which rides onto the model as
 * enrichment (Workstream E) — the composer never looks a case up for itself.
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: access.status });
    }

    const { searchParams } = new URL(request.url);
    const subjectType = (searchParams.get("subject_type") ?? "").trim().toLowerCase();
    const subjectId = (searchParams.get("subject_id") ?? "").trim();

    if (!subjectId || (subjectType !== "person" && subjectType !== "child")) {
        return NextResponse.json(
            {
                ok: false,
                error: "SUBJECT_REQUIRED",
                message: "subject_type must be person|child and subject_id is required.",
            },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();

    try {
        // Entity type vocabulary: the resolver speaks table names; the surface speaks grains.
        const resolution = await resolveAttentionTarget({
            supabase,
            orgId: ctx.orgId,
            dimensions: scopeDimensionsFromAccess(access),
            entityType: subjectType === "person" ? "persons" : "customer_members",
            entityId: subjectId,
        });
        if (!resolution) {
            return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
        }

        const operationalHost = resolution.operational_host
            ? {
                  opportunityId: resolution.operational_host.host_entity_id,
                  workUnitKey: resolution.operational_host.host_work_unit_key,
              }
            : null;

        const dimensions = scopeDimensionsFromAccess(access);

        if (subjectType === "person") {
            const composed = await composeDurablePersonSubject(supabase, ctx.orgId, subjectId, dimensions);
            if (!composed.ok) {
                return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
            }
            const model = focusPanelWorkModeModelFromDurablePerson({
                mode: "summary",
                subject: composed.subject,
                canMutate: false,
                operationalHost,
            });
            return NextResponse.json({ ok: true, model: encodeDurableRecordModel(model) });
        }

        const composed = await composeDurableChildSubject(supabase, ctx.orgId, subjectId, dimensions);
        if (!composed.ok) {
            return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
        }
        const model = focusPanelWorkModeModelFromDurableChild({
            mode: "summary",
            subject: composed.subject,
            canMutate: false,
            // The service date is the org's business day elsewhere; an age label only needs "today",
            // and passing it explicitly keeps the composer free of an implicit clock read.
            now: new Date(),
            operationalHost,
        });
        return NextResponse.json({ ok: true, model: encodeDurableRecordModel(model) });
    } catch (e) {
        console.error("[durable-record]", e);
        return NextResponse.json(
            {
                ok: false,
                error: "COMPOSE_FAILED",
                message: e instanceof Error ? e.message : "Durable record composition failed",
            },
            { status: 500 }
        );
    }
}
