import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { getAdminAuth, requireAdminOrOps, logAdminAudit } from "@/lib/adminAuth";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";
import { upsertFieldValuesFromBody } from "@/lib/admin/fieldValues";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";

const ALLOWED_KEYS = [
    "name",
    "job_date",
    "job_time_window",
    "status",
    "vertical_id",
    "quote_total",
    "price_breakdown",
    "notes",
    "status_key",
    "source",
    "assigned_to",
    "lost_reason",
    "appointment_id",
    "quote_subtotal",
    "discount_amount",
    "discount_code",
    "external_source",
    "external_id",
] as const;

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    try {
        const ctx = await getAdminContext();
        if (!ctx.ok) return adminContextFailureResponse(ctx);
        const body = (await request.json()) as Record<string, unknown>;
        const auth = await getAdminAuth();
        if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const supabase = createAdminClient();
        if (!(await assertRowOrg(supabase, "opportunities", id, ctx.orgId)).ok) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const { data: existing } = await supabase
            .from("opportunities")
            .select("org_id, status_key, customer_id, primary_contact_id, vertical_id, metadata")
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        const existingRow = existing as {
            org_id?: string;
            status_key?: string | null;
            customer_id?: string | null;
            primary_contact_id?: string | null;
            vertical_id?: string | null;
            metadata?: Record<string, unknown> | null;
        } | null;
        if (!existingRow?.org_id) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        const orgId = existingRow.org_id;
        const oldStatusKey = existingRow.status_key ?? null;

        const updates: Record<string, unknown> = {};
        for (const key of ALLOWED_KEYS) {
            if (body[key] === undefined) continue;
            if (key === "notes") continue;
            let val = body[key];
            if (key === "vertical_id" && val === "") val = null;
            if (key === "quote_total" && (val === "" || val === null)) val = null;
            if (key === "quote_subtotal" && (val === "" || val === null)) val = null;
            if (key === "discount_amount" && (val === "" || val === null)) val = null;
            if (key === "status_key") {
                updates.status_key =
                    val === "" || val == null ? null : typeof val === "string" ? val.trim() || null : val;
                continue;
            }
            if (
                [
                    "name",
                    "source",
                    "assigned_to",
                    "lost_reason",
                    "appointment_id",
                    "discount_code",
                    "external_source",
                    "external_id",
                ].includes(key)
            ) {
                val = typeof val === "string" ? val.trim() || null : val;
            }
            updates[key] = val;
        }
        const metadataBase = (existingRow?.metadata as Record<string, unknown> | null) ?? {};
        const metadataUpdates: Record<string, unknown> = {};
        if (body.notes !== undefined) {
            metadataUpdates.notes = body.notes === "" ? null : body.notes;
        }

        // Quote intake: store quote_inputs in opportunity.metadata and compute quote_total / price_breakdown via pricing engine.
        if (body.quote_inputs !== undefined) {
            const qiRaw = body.quote_inputs;
            if (qiRaw == null || typeof qiRaw !== "object" || Array.isArray(qiRaw)) {
                return NextResponse.json({ error: "quote_inputs must be an object" }, { status: 400 });
            }

            const quote_inputs = qiRaw as Record<string, unknown>;
            metadataUpdates.quote_inputs = quote_inputs;

            // Only compute when we have enough information (vertical + sqft + frequency + cleaning_type).
            // Uses Book V2 pricing RPC (public.get_quote_pricing) for cleaning vertical.
            const verticalId = existingRow?.vertical_id ?? null;
            if (!verticalId) {
                return NextResponse.json({ error: "Opportunity vertical_id is required to compute quote" }, { status: 400 });
            }

            const sqftRaw = quote_inputs.square_footage;
            const frequencyRaw = quote_inputs.frequency;
            const cleaningTypeRaw = quote_inputs.cleaning_type;
            const addonsRaw = quote_inputs.add_ons;

            const cleaning_type = typeof cleaningTypeRaw === "string" ? cleaningTypeRaw.trim().toLowerCase() : "";
            const hasInputsToCompute = sqftRaw != null && (typeof sqftRaw === "string" || typeof sqftRaw === "number");
            if (hasInputsToCompute) {
                const { data: vertRow } = await supabase
                    .from("verticals")
                    .select("slug")
                    .eq("id", verticalId)
                    .maybeSingle();
                const verticalSlug = String((vertRow as { slug?: string } | null)?.slug ?? "").trim().toLowerCase();

                if (verticalSlug === "cleaning") {
                    const { loadSqftTiersForVertical, normalizeSqftKeyInput, loadPricingFrequenciesForVertical } =
                        await import("@/lib/book-v2/loadCleaningPricingCatalog");
                    const { resolveRpcFrequencyKey } = await import("@/lib/book-v2/resolveCleaningFrequencyRpc");

                    const sqftTierRows = await loadSqftTiersForVertical(supabase as never, verticalId);
                    const sqftTierKey = normalizeSqftKeyInput(sqftRaw as string | number, sqftTierRows);

                    const freqRows = await loadPricingFrequenciesForVertical(supabase as never, verticalId);
                    const rpcFrequencyKey = resolveRpcFrequencyKey(
                        typeof frequencyRaw === "string" ? frequencyRaw : frequencyRaw == null ? null : String(frequencyRaw),
                        freqRows
                    );

                    const addonKeys: string[] = Array.isArray(addonsRaw)
                        ? (addonsRaw as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean)
                        : [];

                    const service_key =
                        cleaning_type === "move_out" || cleaning_type === "moveout" || cleaning_type === "move_out_heavy"
                            ? "move_out_heavy"
                            : "standard_cleaning";

                    const { data: rpcData, error: rpcError } = await supabase.rpc("get_quote_pricing", {
                        p_vertical_slug: "cleaning",
                        p_service_key: service_key,
                        p_sqft_key: sqftTierKey,
                        p_frequency_key: rpcFrequencyKey,
                        p_addon_keys: addonKeys,
                    });
                    if (rpcError) {
                        return NextResponse.json({ error: `Quote pricing failed: ${rpcError.message}` }, { status: 400 });
                    }
                    const row = Array.isArray(rpcData) ? (rpcData[0] as Record<string, unknown> | undefined) : (rpcData as Record<string, unknown> | null);
                    if (!row) {
                        return NextResponse.json({ error: "Quote pricing returned no data" }, { status: 400 });
                    }
                    const totalFirstVisitCents = row.total_first_visit_cents as number | null | undefined;
                    const firstCleanCents = row.first_clean_cents as number | null | undefined;
                    const addonsTotalCents = row.addons_total_cents as number | null | undefined;
                    const derivedTotalCents =
                        typeof totalFirstVisitCents === "number"
                            ? totalFirstVisitCents
                            : (typeof firstCleanCents === "number" ? firstCleanCents : 0) + (typeof addonsTotalCents === "number" ? addonsTotalCents : 0);
                    updates.quote_total = Number((derivedTotalCents / 100).toFixed(2));
                    const breakdown = row.price_breakdown;
                    updates.price_breakdown = breakdown == null ? null : String(breakdown);

                    // Persist normalized values back onto quote_inputs for consistency (AI/template-friendly).
                    metadataUpdates.quote_inputs = {
                        ...quote_inputs,
                        square_footage_tier_key: sqftTierKey,
                        cleaning_frequency_key: rpcFrequencyKey || null,
                    };
                }
            }
        }

        if (Object.keys(metadataUpdates).length > 0) {
            updates.metadata = { ...metadataBase, ...metadataUpdates };
        }

        const explicitStatusKey = body.status_key !== undefined;
        if (explicitStatusKey) {
            const sk = updates.status_key as string | null;
            const chk = await assertAllowedStatusKey(supabase, orgId, "opportunities", sk);
            if (!chk.ok) {
                return NextResponse.json({ error: chk.message }, { status: 400 });
            }
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
        }

        const { data, error } = await supabase
            .from("opportunities")
            .update(updates)
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        await upsertFieldValuesFromBody(supabase, orgId, "opportunity", id, body, ALLOWED_KEYS);

        if (explicitStatusKey && orgId) {
            const newStatusKey = (data as { status_key?: string | null }).status_key ?? null;
            const metadata: Record<string, unknown> = {};
            if (existingRow.customer_id != null) metadata.customer_id = existingRow.customer_id;
            if (existingRow.primary_contact_id != null) metadata.primary_contact_id = existingRow.primary_contact_id;
            await emitStatusChangedEvent({
                supabase,
                orgId,
                entityType: "opportunities",
                entityId: id,
                oldStatusKey,
                newStatusKey,
                metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
            });
        }
        logAdminAudit({
            entity: "opportunities",
            id,
            changed_fields: Object.keys(updates)
                .filter((k) => k !== "metadata")
                .concat(updates.metadata ? ["notes"] : []),
            actor_user_id: auth.user.id,
            role: auth.role,
        });
        return NextResponse.json(data);
    } catch (e: unknown) {
        console.error("[ADMIN_PATCH_OPPORTUNITY]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
