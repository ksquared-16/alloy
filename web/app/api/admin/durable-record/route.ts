import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess, type AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { composeDurablePersonSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/composeDurablePersonSubject";
import { composeDurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/composeDurableChildSubject";
import { composeDurableHouseholdSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/composeDurableHouseholdSubject";
import { composeDurableChildScheduling } from "@/lib/adminV2/runtime/focusPanel/durableSubject/composeDurableChildScheduling";
import {
    focusPanelWorkModeModelFromDurableChild,
    focusPanelWorkModeModelFromDurableHousehold,
    focusPanelWorkModeModelFromDurablePerson,
} from "@/lib/adminV2/runtime/focusPanel/durableSubject/focusPanelWorkModeModelFromDurableSubject";
import { encodeDurableRecordModel } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableRecordModelWire";
import { resolveAttentionTarget } from "@/lib/workUnits/operatorFocusTarget";
import { loadSubjectContexts } from "@/lib/context/loadSubjectContexts";
import { durableRecordContextOptions } from "@/lib/context/durableRecordContextOptions";

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
 *
 * ── CONTEXTS RIDE ALONG, FROM THE SHARED PROJECTION ──
 *
 * The response carries the subject's selectable business contexts so the host can offer them and,
 * on selection, resolve the SAME published composition the native operational panel resolves. They
 * come from `lib/context` — the one projection Search also reads — so the two surfaces cannot
 * disagree about which contexts a subject is in. Enumeration failure is not fatal: the record still
 * opens on its identity, because a context is enrichment and identity is not.
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

    if (
        !subjectId
        || (subjectType !== "person" && subjectType !== "child" && subjectType !== "household")
    ) {
        return NextResponse.json(
            {
                ok: false,
                error: "SUBJECT_REQUIRED",
                message: "subject_type must be person|child|household and subject_id is required.",
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
            entityType:
                subjectType === "person" ? "persons"
                : subjectType === "household" ? "customers"
                : "customer_members",
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
            return NextResponse.json({
                ok: true,
                model: encodeDurableRecordModel(model),
                contexts: await contextOptionsFor({
                    supabase,
                    orgId: ctx.orgId,
                    dimensions,
                    grain: "person",
                    id: subjectId,
                    personId: subjectId,
                }),
            });
        }

        if (subjectType === "household") {
            const composed = await composeDurableHouseholdSubject(supabase, ctx.orgId, subjectId);
            if (!composed.ok) {
                return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
            }
            const model = focusPanelWorkModeModelFromDurableHousehold({
                mode: "summary",
                subject: composed.subject,
                canMutate: false,
                operationalHost,
            });
            return NextResponse.json({
                ok: true,
                model: encodeDurableRecordModel(model),
                // NO contexts. `loadSubjectContexts` reads `process_instances` by SUBJECT, and a
                // household is never a process subject — only its children are. Asking would return
                // an empty list that reads as "this family is in nothing", which is a claim, whereas
                // omitting the key says the question does not apply at this grain.
                contexts: [],
            });
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
        const contexts = await contextOptionsFor({
            supabase,
            orgId: ctx.orgId,
            dimensions,
            grain: "child",
            id: subjectId,
            personId: composed.subject.personId,
        });

        /*
         * THE SCHEDULE CONTEXT'S FACTS, composed here rather than fetched by the card.
         *
         * Same first-paint doctrine the opportunity host follows: the Scheduling card reveals WITH
         * the record instead of opening a loading gate on mount. It is composed only when the
         * subject actually HAS that context — the option carries the site, so no site means no
         * commitment and there is nothing to compose.
         *
         * A failure here costs the Schedule card, never the record. The other contexts and the
         * child's identity are unaffected, which is the same rule context enumeration follows above.
         */
        const scheduleContext = contexts.find(
            (option) => option.surface === "canonical_operational" && option.siteLocationId,
        );
        const schedulingProjection = scheduleContext?.siteLocationId
            ? await composeDurableChildScheduling({
                  supabase,
                  orgId: ctx.orgId,
                  memberId: subjectId,
                  subjectName: composed.subject.label,
                  siteLocationId: scheduleContext.siteLocationId,
              }).catch((e) => {
                  console.error("[durable-record] scheduling composition failed", e);
                  return null;
              })
            : null;

        return NextResponse.json({
            ok: true,
            model: encodeDurableRecordModel(model),
            // The composed child, carried so the CONTEXTUAL card can resolve its configured field
            // values without a second round trip. It is the same object the model was built from —
            // not a re-read, which could disagree with the panel rendered beside it.
            childSubject: composed.subject,
            contexts,
            schedulingProjection,
        });
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

/**
 * Selectable contexts, or an empty list.
 *
 * Enumeration failure must never cost the operator the RECORD. A context is enrichment: it adds
 * meaning to a record that already exists on its own terms, and refusing the record because an
 * enrichment failed would be the queue-scoped mistake this grain removed, in a new place.
 */
async function contextOptionsFor(input: {
    supabase: SupabaseClientForContexts;
    orgId: string;
    dimensions: AdminAccessScopeDimensions;
    grain: "child" | "person";
    id: string;
    personId: string | null;
}) {
    try {
        const contexts = await loadSubjectContexts({
            supabase: input.supabase,
            orgId: input.orgId,
            dimensions: input.dimensions,
            subject: { grain: input.grain, id: input.id, personId: input.personId },
        });
        return durableRecordContextOptions(contexts);
    } catch (e) {
        console.error("[durable-record] context enumeration failed", e);
        return [];
    }
}

type SupabaseClientForContexts = Parameters<typeof loadSubjectContexts>[0]["supabase"];
