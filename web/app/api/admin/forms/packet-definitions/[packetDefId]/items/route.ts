import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

type StepBody = {
    form_definition_id: string;
    pinned_form_definition_version_id?: string | null;
    step_label?: string;
};

/** PUT /api/admin/forms/packet-definitions/[packetDefId]/items — replace ordered steps (linear only). */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ packetDefId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { packetDefId: raw } = await params;
    const packetDefId = parseUuidParam(raw, "packetDefId");
    if (packetDefId instanceof NextResponse) return packetDefId;

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const rawSteps = body.items ?? body.steps;
    if (!Array.isArray(rawSteps)) return jsonError("items must be an array", 400);
    if (rawSteps.length === 0) return jsonError("At least one step is required", 400);

    const steps: StepBody[] = [];
    for (const row of rawSteps) {
        if (!row || typeof row !== "object" || Array.isArray(row)) {
            return jsonError("Each item must be an object", 400);
        }
        const r = row as Record<string, unknown>;
        if (typeof r.form_definition_id !== "string") {
            return jsonError("Each step requires form_definition_id", 400);
        }
        const form_definition_id = parseUuidParam(r.form_definition_id, "form_definition_id");
        if (form_definition_id instanceof NextResponse) return form_definition_id;
        let pinned: string | null | undefined = undefined;
        if ("pinned_form_definition_version_id" in r) {
            const v = r.pinned_form_definition_version_id;
            if (v === null || v === undefined || v === "") pinned = null;
            else if (typeof v === "string") {
                const p = parseUuidParam(v, "pinned_form_definition_version_id");
                if (p instanceof NextResponse) return p;
                pinned = p;
            } else {
                return jsonError("pinned_form_definition_version_id invalid", 400);
            }
        }
        const step_label = typeof r.step_label === "string" ? r.step_label.trim() : "";
        steps.push({
            form_definition_id,
            pinned_form_definition_version_id: pinned,
            ...(step_label ? { step_label } : {}),
        });
    }

    const supabase = createAdminClient();

    const { count: sessCount, error: cErr } = await supabase
        .from("form_packet_sessions")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.orgId)
        .eq("packet_definition_id", packetDefId);
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
    if ((sessCount ?? 0) > 0) {
        return jsonError(
            "This packet already has sessions — step list is locked. Create a new packet definition to change steps.",
            409
        );
    }

    const { data: pkt, error: pErr } = await supabase
        .from("form_packet_definitions")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("id", packetDefId)
        .maybeSingle();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    if (!pkt) return jsonError("Not found", 404);

    const { error: delErr } = await supabase
        .from("form_packet_items")
        .delete()
        .eq("org_id", ctx.orgId)
        .eq("packet_definition_id", packetDefId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

    const insertRows = [];
    for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const { data: formRow, error: fErr } = await supabase
            .from("form_definitions")
            .select("id")
            .eq("org_id", ctx.orgId)
            .eq("id", s.form_definition_id)
            .maybeSingle();
        if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
        if (!formRow) return jsonError(`form_definition_id not in org at step ${i}`, 400);

        let pinnedId: string | null = null;
        if (s.pinned_form_definition_version_id) {
            const { data: ver, error: vErr } = await supabase
                .from("form_definition_versions")
                .select("id, form_definition_id, status")
                .eq("org_id", ctx.orgId)
                .eq("id", s.pinned_form_definition_version_id)
                .maybeSingle();
            if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
            if (!ver || (ver as { form_definition_id: string }).form_definition_id !== s.form_definition_id) {
                return jsonError(`Invalid pinned version at step ${i}`, 400);
            }
            if ((ver as { status: string }).status !== "published") {
                return jsonError(`Pinned version must be published at step ${i}`, 400);
            }
            pinnedId = s.pinned_form_definition_version_id;
        } else {
            const { data: pubVer, error: pvErr } = await supabase
                .from("form_definition_versions")
                .select("id")
                .eq("org_id", ctx.orgId)
                .eq("form_definition_id", s.form_definition_id)
                .eq("status", "published")
                .order("version_number", { ascending: false })
                .limit(1)
                .maybeSingle();
            if (pvErr) return NextResponse.json({ error: pvErr.message }, { status: 500 });
            if (!pubVer?.id) {
                return jsonError(`Form at step ${i} has no published version — publish the form or pin a version`, 400);
            }
            /** Unpinned steps follow latest published at resolve time (packet links stay valid across republishes). */
            pinnedId = null;
        }

        const meta: Record<string, unknown> = {};
        if (s.step_label) meta.step_label = s.step_label;

        insertRows.push({
            org_id: ctx.orgId,
            packet_definition_id: packetDefId,
            sequence_index: i,
            form_definition_id: s.form_definition_id,
            pinned_form_definition_version_id: pinnedId,
            metadata: meta,
        });
    }

    const { data: inserted, error: insErr } = await supabase.from("form_packet_items").insert(insertRows).select("*");
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

    return jsonData(inserted ?? []);
}
