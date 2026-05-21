import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { dbListSubmissionLinkedDocumentsForSubmissionIds } from "@/lib/admin/forms/formsAdminDb";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertExistingOpportunityMutableInAdminScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** GET — packet sessions for this opportunity (crm_snapshot / launch truth; org-scoped). */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id: opportunityId } = await context.params;
    if (!UUID_RE.test(opportunityId.trim())) {
        return NextResponse.json({ error: "Invalid opportunity id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "opportunities", opportunityId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const accessDim = scopeDimensionsFromAccess(access);
    if (!(await assertExistingOpportunityMutableInAdminScope(supabase, ctx.orgId, accessDim, opportunityId))) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: bySnap, error: sErr } = await supabase
        .from("form_packet_sessions")
        .select(
            `
        id,
        status,
        created_at,
        updated_at,
        completed_at,
        current_sequence_index,
        packet_definition_id,
        started_via_public_link_id,
        launch_context,
        crm_snapshot,
        operator_review_status,
        operator_review_warnings,
        operator_review_notes,
        operator_reviewed_at,
        operator_reviewed_by_user_id,
        form_packet_definitions ( name, key )
      `
        )
        .eq("org_id", ctx.orgId)
        .filter("crm_snapshot->>opportunity_id", "eq", opportunityId)
        .order("created_at", { ascending: false })
        .limit(40);

    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

    let sessions = bySnap ?? [];
    let fallbackLinkIds: string[] = [];
    if (sessions.length === 0) {
        const { data: links, error: lErr } = await supabase
            .from("form_public_links")
            .select("id")
            .eq("org_id", ctx.orgId)
            .filter("metadata->>form_context_mode", "eq", "packet")
            .filter("metadata->>source_entity_type", "eq", "opportunity")
            .filter("metadata->>source_entity_id", "eq", opportunityId)
            .limit(80);
        if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });
        fallbackLinkIds = (links ?? []).map((r: { id: string }) => r.id).filter(Boolean);
        if (fallbackLinkIds.length > 0) {
            const { data: byLink, error: s2Err } = await supabase
                .from("form_packet_sessions")
                .select(
                    `
            id,
            status,
            created_at,
            updated_at,
            completed_at,
            current_sequence_index,
            packet_definition_id,
            started_via_public_link_id,
            launch_context,
            crm_snapshot,
            operator_review_status,
            operator_review_warnings,
            operator_review_notes,
            operator_reviewed_at,
            operator_reviewed_by_user_id,
            form_packet_definitions ( name, key )
          `
                )
                .eq("org_id", ctx.orgId)
                .in("started_via_public_link_id", fallbackLinkIds)
                .order("created_at", { ascending: false })
                .limit(40);
            if (s2Err) return NextResponse.json({ error: s2Err.message }, { status: 500 });
            sessions = byLink ?? [];
        }
    }

    const sessionIds = sessions.map((s: { id: string }) => s.id);
    const { data: rawItems, error: iErr } =
        sessionIds.length === 0
            ? { data: [], error: null }
            : await supabase
                  .from("form_packet_session_items")
                  .select("id, packet_session_id, sequence_index, status, submitted_at, form_submission_id, packet_item_id")
                  .eq("org_id", ctx.orgId)
                  .in("packet_session_id", sessionIds)
                  .order("sequence_index", { ascending: true });

    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

    const items = rawItems ?? [];
    const packetItemIds = [...new Set(items.map((r: { packet_item_id: string }) => r.packet_item_id))];
    const defItemMap: Record<string, { form_definition_id: string }> = {};
    if (packetItemIds.length > 0) {
        const { data: di } = await supabase
            .from("form_packet_items")
            .select("id, form_definition_id")
            .in("id", packetItemIds)
            .eq("org_id", ctx.orgId);
        for (const row of di ?? []) {
            const r = row as { id: string; form_definition_id: string };
            defItemMap[r.id] = { form_definition_id: r.form_definition_id };
        }
    }

    const formIds = [...new Set(Object.values(defItemMap).map((d) => d.form_definition_id))];
    const formMeta: Record<string, { name: string; key: string }> = {};
    if (formIds.length > 0) {
        const { data: forms } = await supabase
            .from("form_definitions")
            .select("id, name, key")
            .in("id", formIds)
            .eq("org_id", ctx.orgId);
        for (const row of forms ?? []) {
            const r = row as { id: string; name: string; key: string };
            formMeta[r.id] = { name: r.name, key: r.key };
        }
    }

    const submissionIds = [...new Set(items.map((i: { form_submission_id: string | null }) => i.form_submission_id).filter(Boolean))] as string[];
    const submissionFormDef: Record<string, string> = {};
    if (submissionIds.length > 0) {
        const { data: subs } = await supabase
            .from("form_submissions")
            .select("id, form_definition_id, status")
            .eq("org_id", ctx.orgId)
            .in("id", submissionIds);
        for (const row of subs ?? []) {
            const r = row as { id: string; form_definition_id: string };
            submissionFormDef[r.id] = r.form_definition_id;
        }
    }

    const documentsBySubmission: Record<string, { id: string; name: string | null; document_type: string | null }[]> = {};
    if (submissionIds.length > 0) {
        const batch = await dbListSubmissionLinkedDocumentsForSubmissionIds(supabase, ctx.orgId, submissionIds);
        if (batch.error) return NextResponse.json({ error: batch.error.message }, { status: 500 });
        const map = batch.data ?? {};
        for (const sid of submissionIds) {
            const list = map[sid] ?? [];
            documentsBySubmission[sid] = list.map((d) => ({
                id: d.document.id,
                name: d.document.name ?? d.document.original_filename,
                document_type: d.document.document_type,
            }));
        }
    }

    const itemsBySession = new Map<string, typeof items>();
    for (const it of items) {
        const sid = (it as { packet_session_id: string }).packet_session_id;
        const arr = itemsBySession.get(sid) ?? [];
        arr.push(it as never);
        itemsBySession.set(sid, arr);
    }

    const out = sessions.map((sess: Record<string, unknown>) => {
        const sid = sess.id as string;
        const def = sess.form_packet_definitions as { name?: string; key?: string } | { name?: string; key?: string }[] | null;
        const defName = Array.isArray(def) ? def[0]?.name : def?.name;
        const sItems = itemsBySession.get(sid) ?? [];
        const submittedStepCount = sItems.filter((r: { status: string }) => r.status === "submitted").length;
        const enrichedItems = sItems.map((it: Record<string, unknown>) => {
            const pid = it.packet_item_id as string;
            const fdid = defItemMap[pid]?.form_definition_id ?? null;
            const fm = fdid ? formMeta[fdid] : undefined;
            const subId = it.form_submission_id as string | null;
            const formDefId = subId ? submissionFormDef[subId] : fdid;
            const adminPath =
                formDefId && subId ? `/admin/forms/${formDefId}/submissions/${subId}` : null;
            return {
                sequence_index: it.sequence_index as number,
                status: it.status as string,
                submitted_at: (it.submitted_at as string | null) ?? null,
                form_submission_id: subId,
                form_name: fm?.name ?? null,
                form_key: fm?.key ?? null,
                form_definition_id: formDefId,
                admin_submission_path: adminPath,
                documents: subId ? (documentsBySubmission[subId] ?? []) : [],
            };
        });

        const snap =
            sess.crm_snapshot && typeof sess.crm_snapshot === "object" && !Array.isArray(sess.crm_snapshot)
                ? (sess.crm_snapshot as Record<string, unknown>)
                : {};
        const lc =
            sess.launch_context && typeof sess.launch_context === "object" && !Array.isArray(sess.launch_context)
                ? (sess.launch_context as Record<string, unknown>)
                : {};

        const warnRaw = (sess as { operator_review_warnings?: unknown }).operator_review_warnings;
        const operator_review_warnings = Array.isArray(warnRaw)
            ? (warnRaw as { kind?: string; message?: string; field_key?: string }[])
            : [];

        return {
            id: sid,
            status: sess.status as string,
            created_at: sess.created_at as string,
            updated_at: (sess.updated_at as string | null) ?? null,
            completed_at: (sess.completed_at as string | null) ?? null,
            current_sequence_index: sess.current_sequence_index as number,
            packet_definition_id: sess.packet_definition_id as string,
            packet_name: typeof defName === "string" && defName.trim() ? defName.trim() : null,
            started_via_public_link_id: (sess.started_via_public_link_id as string | null) ?? null,
            operator_review_status: (sess as { operator_review_status?: string | null }).operator_review_status ?? null,
            warning_count: operator_review_warnings.length,
            operator_review_warnings,
            operator_review_notes: (sess as { operator_review_notes?: string | null }).operator_review_notes ?? null,
            operator_reviewed_at: (sess as { operator_reviewed_at?: string | null }).operator_reviewed_at ?? null,
            operator_reviewed_by_user_id:
                (sess as { operator_reviewed_by_user_id?: string | null }).operator_reviewed_by_user_id ?? null,
            crm_snapshot: {
                opportunity_id: typeof snap.opportunity_id === "string" ? snap.opportunity_id : null,
                customer_id: typeof snap.customer_id === "string" ? snap.customer_id : null,
                person_id: typeof snap.person_id === "string" ? snap.person_id : null,
                customer_member_id: typeof snap.customer_member_id === "string" ? snap.customer_member_id : null,
            },
            launch_context: lc,
            step_count: enrichedItems.length,
            submitted_step_count: submittedStepCount,
            items: enrichedItems,
            admin_packet_review_path: `/adminV2/forms/packets/${sid}`,
        };
    });

    let minted_links_pending_open: {
        public_link_id: string;
        packet_definition_id: string | null;
        label: string | null;
        packet_name: string | null;
    }[] = [];

    if (sessions.length === 0 && fallbackLinkIds.length > 0) {
        const { data: linkRows, error: lrErr } = await supabase
            .from("form_public_links")
            .select("id, metadata")
            .eq("org_id", ctx.orgId)
            .in("id", fallbackLinkIds);
        if (lrErr) return NextResponse.json({ error: lrErr.message }, { status: 500 });
        const pdefIds = new Set<string>();
        const pending: typeof minted_links_pending_open = [];
        for (const lr of linkRows ?? []) {
            const row = lr as { id: string; metadata?: unknown };
            const meta =
                row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                    ? (row.metadata as Record<string, unknown>)
                    : {};
            const pid = typeof meta.packet_definition_id === "string" ? meta.packet_definition_id.trim() : "";
            const pdef = UUID_RE.test(pid) ? pid : null;
            if (pdef) pdefIds.add(pdef);
            const label =
                typeof meta.label === "string" && meta.label.trim()
                    ? meta.label.trim()
                    : typeof meta.name === "string" && meta.name.trim()
                      ? meta.name.trim()
                      : null;
            pending.push({
                public_link_id: row.id,
                packet_definition_id: pdef,
                label,
                packet_name: null,
            });
        }
        if (pdefIds.size > 0) {
            const { data: pdefs } = await supabase
                .from("form_packet_definitions")
                .select("id, name")
                .eq("org_id", ctx.orgId)
                .in("id", [...pdefIds]);
            const nameById: Record<string, string> = {};
            for (const p of pdefs ?? []) {
                const pr = p as { id: string; name: string };
                if (typeof pr.name === "string" && pr.name.trim()) nameById[pr.id] = pr.name.trim();
            }
            for (const p of pending) {
                if (p.packet_definition_id && nameById[p.packet_definition_id]) {
                    p.packet_name = nameById[p.packet_definition_id] ?? null;
                }
            }
        }
        minted_links_pending_open = pending;
    }

    const pendingReviewCount = out.filter(
        (s: { status: string; operator_review_status?: string | null }) =>
            s.status === "completed" &&
            (s.operator_review_status == null ||
                s.operator_review_status === "needs_review" ||
                s.operator_review_status === "needs_correction")
    ).length;

    return NextResponse.json({ sessions: out, pending_review_count: pendingReviewCount, minted_links_pending_open });
}
