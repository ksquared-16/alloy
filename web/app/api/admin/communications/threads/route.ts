import { NextRequest, NextResponse } from "next/server";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { fetchRelatedPersonIdsForCommunicationsDrawer } from "@/lib/communications/threadRelatedPersonIds";

/** Match /api/admin/activity entity_type normalization. */
function normalizeEntityTypeParam(raw: string): string | null {
    const s = raw.trim().toLowerCase();
    if (!s) return null;
    if (s === "opportunity") return "opportunities";
    if (s === "customer") return "customers";
    if (s === "job") return "jobs";
    if (s === "schedule") return "schedules";
    if (s === "contact") return "contacts";
    if (s === "person") return "persons";
    return s;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Card 26 — bounded related person ids for PostgREST .in(...) */
const MAX_RELATED_PERSON_IDS = 60;

/** Card 26/28 — max raw messages fetched to derive per-thread preview (deterministic dedupe client-side). */
const PREVIEW_FETCH_CAP = 200;

export type CommunicationThreadPayload = {
    id: string;
    org_id: string;
    channel: string;
    recipient_key: string | null;
    primary_entity_type: string;
    primary_entity_id: string;
    created_at: string | null;
    updated_at: string | null;
    metadata?: Record<string, unknown> | null;
    anchor_kind?: "record" | "related_person";
    last_message_preview?: {
        direction: string;
        channel: string;
        status: string | null;
        body: string | null;
        created_at: string | null;
    } | null;
};

function previewFromMessageRow(m: Record<string, unknown>) {
    return {
        direction: String(m.direction ?? ""),
        channel: String(m.channel ?? ""),
        status: m.status != null ? String(m.status) : null,
        body: m.body != null ? String(m.body) : null,
        created_at: m.created_at != null ? String(m.created_at) : null,
    };
}

async function attachLastPreviews(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    threads: CommunicationThreadPayload[]
): Promise<void> {
    if (threads.length === 0) return;
    const ids = threads.map((t) => t.id).filter(Boolean);
    const cap = Math.min(PREVIEW_FETCH_CAP, ids.length * 12);
    if (cap === 0) return;

    const { data: raw, error } = await supabase
        .from("communication_messages")
        .select("id, thread_id, direction, channel, status, body, created_at")
        .eq("org_id", orgId)
        .in("thread_id", ids)
        .order("created_at", { ascending: false })
        .limit(cap);

    if (error || !Array.isArray(raw)) return;

    const firstByThread = new Map<string, (typeof raw)[0]>();
    for (const row of raw) {
        const tid = row.thread_id != null ? String(row.thread_id) : "";
        if (!tid || firstByThread.has(tid)) continue;
        firstByThread.set(tid, row);
    }

    const asObj = threads as Array<CommunicationThreadPayload & { last_message_preview?: unknown }>;
    for (let i = 0; i < asObj.length; i++) {
        const row = firstByThread.get(asObj[i].id);
        if (row) asObj[i].last_message_preview = previewFromMessageRow(row as Record<string, unknown>);
        else asObj[i].last_message_preview = null;
    }
}

/** GET /api/admin/communications/threads — entity threads + person-anchored threads for related persons (Card 26). */
export async function GET(request: NextRequest) {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    const { searchParams } = new URL(request.url);
    const entityTypeRaw = (searchParams.get("entity_type") ?? "").trim();
    const entityId = (searchParams.get("entity_id") ?? "").trim();
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 40, 1), 100);

    const entityType = normalizeEntityTypeParam(entityTypeRaw);
    if (!entityType || !entityId || !UUID_RE.test(entityId)) {
        return NextResponse.json({ error: "entity_type and valid entity_id (uuid) are required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const orgId = ctx.orgId;

    const tableForAssert =
        entityType === "opportunities"
            ? "opportunities"
            : entityType === "jobs"
              ? "jobs"
              : entityType === "customers"
                ? "customers"
                : entityType === "persons"
                  ? "persons"
                  : null;

    if (tableForAssert) {
        const okOrg = await assertRowOrg(supabase, tableForAssert, entityId, orgId);
        if (!okOrg.ok) {
            return NextResponse.json({ error: "Entity not found" }, { status: 404 });
        }
    }

    const selectCols =
        "id, org_id, channel, recipient_key, primary_entity_type, primary_entity_id, created_at, updated_at, metadata";

    const { data: directRows, error: dErr } = await supabase
        .from("communication_threads")
        .select(selectCols)
        .eq("org_id", orgId)
        .eq("primary_entity_type", entityType)
        .eq("primary_entity_id", entityId)
        .order("updated_at", { ascending: false })
        .limit(limit);

    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

    let personRows: typeof directRows = [];
    const relatedKinds = entityType === "opportunities" || entityType === "jobs" || entityType === "customers";
    if (relatedKinds) {
        const relatedIdsRaw = await fetchRelatedPersonIdsForCommunicationsDrawer(supabase, orgId, entityType, entityId);
        const relatedIds = relatedIdsRaw.filter((id) => UUID_RE.test(id)).slice(0, MAX_RELATED_PERSON_IDS);
        if (relatedIds.length > 0) {
            const { data: pr, error: pErr } = await supabase
                .from("communication_threads")
                .select(selectCols)
                .eq("org_id", orgId)
                .eq("primary_entity_type", "persons")
                .in("primary_entity_id", relatedIds)
                .order("updated_at", { ascending: false })
                .limit(limit);

            if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
            personRows = pr ?? [];
        }
    }

    const byId = new Map<string, CommunicationThreadPayload>();

    const pushNormalized = (
        rows: typeof directRows,
        anchor: "record" | "related_person"
    ): void => {
        for (const r of rows ?? []) {
            const rec = r as Record<string, unknown>;
            const id = rec.id != null ? String(rec.id) : "";
            if (!id || byId.has(id)) continue;
            byId.set(id, {
                id,
                org_id: String(rec.org_id ?? ""),
                channel: String(rec.channel ?? ""),
                recipient_key: rec.recipient_key != null ? String(rec.recipient_key) : null,
                primary_entity_type: String(rec.primary_entity_type ?? ""),
                primary_entity_id: String(rec.primary_entity_id ?? ""),
                created_at: rec.created_at != null ? String(rec.created_at) : null,
                updated_at: rec.updated_at != null ? String(rec.updated_at) : null,
                metadata: typeof rec.metadata === "object" && rec.metadata !== null ? (rec.metadata as Record<string, unknown>) : null,
                anchor_kind: anchor,
            });
        }
    };

    pushNormalized(directRows ?? [], "record");
    pushNormalized(personRows ?? [], "related_person");

    const merged = [...byId.values()].sort((a, b) => {
        const tb = Date.parse(String(b.updated_at ?? b.created_at ?? 0));
        const ta = Date.parse(String(a.updated_at ?? a.created_at ?? 0));
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });

    const limited = merged.slice(0, limit);
    await attachLastPreviews(supabase, orgId, limited);

    return NextResponse.json({ threads: limited });
}
