/**
 * Org-wide inbox thread aggregation (Messaging V2 Sprint A).
 * Pure helpers are exported for unit tests; list functions use Supabase admin client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
    InboxEntityChip,
    InboxFolder,
    InboxMessagePreview,
    InboxScheduledSendListItem,
    InboxThreadListItem,
    InboxThreadsListResponse,
} from "@/lib/communications/inboxThreadTypes";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const PREVIEW_FETCH_CAP = 200;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type RawThreadRow = {
    id: string;
    org_id: string;
    channel: string;
    recipient_key: string | null;
    primary_entity_type: string;
    primary_entity_id: string;
    created_at: string | null;
    updated_at: string | null;
    last_message_at: string | null;
    archived_at: string | null;
    metadata?: Record<string, unknown> | null;
};

export function parseInboxFolder(raw: string | null | undefined): InboxFolder | null {
    const s = (raw ?? "").trim().toLowerCase();
    if (
        s === "inbox" ||
        s === "unread" ||
        s === "sent" ||
        s === "scheduled" ||
        s === "archived"
    ) {
        return s;
    }
    return null;
}

export function parseInboxLimit(raw: string | number | null | undefined, defaultLimit = DEFAULT_LIMIT): number {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n) || n <= 0) return defaultLimit;
    return Math.min(Math.max(Math.floor(n), 1), MAX_LIMIT);
}

export function previewFromMessageRow(m: Record<string, unknown>): InboxMessagePreview {
    return {
        direction: String(m.direction ?? ""),
        channel: String(m.channel ?? ""),
        status: m.status != null ? String(m.status) : null,
        body: m.body != null ? String(m.body) : null,
        created_at: m.created_at != null ? String(m.created_at) : null,
    };
}

export function threadSortTimestamp(row: Pick<RawThreadRow, "last_message_at" | "updated_at" | "created_at">): string | null {
    return row.last_message_at ?? row.updated_at ?? row.created_at ?? null;
}

/** Apply folder filters that depend on preview + unread (after enrichment). */
export function filterThreadsForFolder(
    folder: InboxFolder,
    threads: InboxThreadListItem[]
): InboxThreadListItem[] {
    if (folder === "inbox" || folder === "archived") {
        return threads;
    }
    if (folder === "unread") {
        return threads.filter((t) => t.has_unread);
    }
    if (folder === "sent") {
        return threads.filter((t) => t.last_message_preview?.direction === "outbound");
    }
    return threads;
}

export function computeThreadHasUnread(
    inboundMessageIds: string[],
    readMessageIds: Set<string>
): boolean {
    return inboundMessageIds.some((id) => !readMessageIds.has(id));
}

function formatPhoneDisplay(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) {
        const d = digits.slice(1);
        return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    }
    if (digits.length === 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return raw.trim() || "—";
}

function contactFromRecipientKey(recipientKey: string | null | undefined, channel: string): string | null {
    const key = (recipientKey ?? "").trim();
    if (!key || key === "_empty" || key === "_in_app") return null;
    if (channel === "sms") return formatPhoneDisplay(key);
    if (key.includes("@")) return key;
    return key;
}

function entityTypeLabel(entityType: string): string {
    const t = entityType.trim().toLowerCase();
    if (t === "opportunities") return "Opportunity";
    if (t === "persons") return "Person";
    if (t === "jobs") return "Job";
    if (t === "customers") return "Family";
    return t.replace(/_/g, " ").replace(/s$/, "") || "Record";
}

async function attachLastPreviews(
    supabase: SupabaseClient,
    orgId: string,
    threads: RawThreadRow[]
): Promise<Map<string, InboxMessagePreview>> {
    const out = new Map<string, InboxMessagePreview>();
    if (threads.length === 0) return out;

    const ids = threads.map((t) => t.id).filter(Boolean);
    const cap = Math.min(PREVIEW_FETCH_CAP, ids.length * 12);
    if (cap === 0) return out;

    const { data: raw, error } = await supabase
        .from("communication_messages")
        .select("id, thread_id, direction, channel, status, body, created_at")
        .eq("org_id", orgId)
        .in("thread_id", ids)
        .order("created_at", { ascending: false })
        .limit(cap);

    if (error || !Array.isArray(raw)) return out;

    for (const row of raw) {
        const tid = row.thread_id != null ? String(row.thread_id) : "";
        if (!tid || out.has(tid)) continue;
        out.set(tid, previewFromMessageRow(row as Record<string, unknown>));
    }
    return out;
}

async function attachUnreadFlags(
    supabase: SupabaseClient,
    orgId: string,
    userId: string,
    threadIds: string[]
): Promise<Map<string, boolean>> {
    const unreadByThread = new Map<string, boolean>();
    for (const id of threadIds) unreadByThread.set(id, false);
    if (threadIds.length === 0) return unreadByThread;

    const { data: inbound, error: iErr } = await supabase
        .from("communication_messages")
        .select("id, thread_id")
        .eq("org_id", orgId)
        .eq("direction", "inbound")
        .in("thread_id", threadIds);

    if (iErr || !Array.isArray(inbound) || inbound.length === 0) return unreadByThread;

    const inboundIds = inbound.map((r) => String((r as { id: string }).id)).filter(Boolean);
    const { data: reads, error: rErr } = await supabase
        .from("communication_message_reads")
        .select("message_id")
        .eq("user_id", userId)
        .in("message_id", inboundIds);

    if (rErr) return unreadByThread;

    const readSet = new Set((reads ?? []).map((x) => String((x as { message_id: string }).message_id)));

    const inboundByThread = new Map<string, string[]>();
    for (const row of inbound) {
        const tid = String((row as { thread_id: string }).thread_id ?? "");
        const mid = String((row as { id: string }).id ?? "");
        if (!tid || !mid) continue;
        const list = inboundByThread.get(tid) ?? [];
        list.push(mid);
        inboundByThread.set(tid, list);
    }

    for (const [tid, ids] of inboundByThread) {
        unreadByThread.set(tid, computeThreadHasUnread(ids, readSet));
    }
    return unreadByThread;
}

async function loadEntityLabels(
    supabase: SupabaseClient,
    orgId: string,
    threads: RawThreadRow[]
): Promise<{
    entityLabels: Map<string, string>;
    familyByOpportunity: Map<string, string>;
    personNames: Map<string, string>;
}> {
    const entityLabels = new Map<string, string>();
    const familyByOpportunity = new Map<string, string>();
    const personNames = new Map<string, string>();

    const oppIds = new Set<string>();
    const personIds = new Set<string>();
    const jobIds = new Set<string>();
    const customerIds = new Set<string>();
    const opportunityCustomerIds = new Map<string, string>();

    for (const t of threads) {
        const type = t.primary_entity_type.trim().toLowerCase();
        const id = t.primary_entity_id;
        if (!UUID_RE.test(id)) continue;
        if (type === "opportunities") oppIds.add(id);
        else if (type === "persons") personIds.add(id);
        else if (type === "jobs") jobIds.add(id);
        else if (type === "customers") customerIds.add(id);
    }

    const entityQueries: Array<PromiseLike<void>> = [];

    if (oppIds.size > 0) {
        entityQueries.push(
            supabase
                .from("opportunities")
                .select("id, name, customer_id")
                .eq("org_id", orgId)
                .in("id", [...oppIds])
                .then(({ data }) => {
                    for (const row of data ?? []) {
                        const id = String((row as { id: string }).id);
                        const name = (row as { name?: string | null }).name;
                        entityLabels.set(`opportunities:${id}`, (name ?? "").trim() || "Opportunity");
                        const cid = (row as { customer_id?: string | null }).customer_id;
                        if (cid && UUID_RE.test(String(cid))) {
                            const cidStr = String(cid);
                            customerIds.add(cidStr);
                            opportunityCustomerIds.set(id, cidStr);
                        }
                    }
                })
        );
    }

    if (jobIds.size > 0) {
        entityQueries.push(
            supabase
                .from("jobs")
                .select("id, title")
                .eq("org_id", orgId)
                .in("id", [...jobIds])
                .then(({ data }) => {
                    for (const row of data ?? []) {
                        const id = String((row as { id: string }).id);
                        const title = (row as { title?: string | null }).title;
                        entityLabels.set(`jobs:${id}`, (title ?? "").trim() || "Job");
                    }
                })
        );
    }

    if (personIds.size > 0) {
        entityQueries.push(
            supabase
                .from("persons")
                .select("id, full_name, first_name, last_name, email, phone")
                .eq("org_id", orgId)
                .in("id", [...personIds])
                .then(({ data }) => {
                    for (const row of data ?? []) {
                        const id = String((row as { id: string }).id);
                        const full = (row as { full_name?: string | null }).full_name;
                        const first = (row as { first_name?: string | null }).first_name;
                        const last = (row as { last_name?: string | null }).last_name;
                        const email = (row as { email?: string | null }).email;
                        const phone = (row as { phone?: string | null }).phone;
                        const composed =
                            (full ?? "").trim() ||
                            [first, last].filter(Boolean).join(" ").trim() ||
                            (email ?? "").trim() ||
                            (phone ?? "").trim() ||
                            "Person";
                        personNames.set(id, composed);
                        entityLabels.set(`persons:${id}`, composed);
                    }
                })
        );
    }

    if (entityQueries.length > 0) {
        await Promise.all(entityQueries);
    }

    const customerIdsToLoad = [...customerIds].filter((id) => !entityLabels.has(`customers:${id}`));
    if (customerIdsToLoad.length > 0) {
        const { data } = await supabase
            .from("customers")
            .select("id, name")
            .eq("org_id", orgId)
            .in("id", customerIdsToLoad);
        for (const row of data ?? []) {
            const id = String((row as { id: string }).id);
            const name = (row as { name?: string | null }).name;
            const label = (name ?? "").trim() || "Family";
            entityLabels.set(`customers:${id}`, label);
            for (const [oppId, custId] of opportunityCustomerIds) {
                if (custId === id) familyByOpportunity.set(oppId, label);
            }
        }
    }

    return { entityLabels, familyByOpportunity, personNames };
}

function buildEntityChip(
    thread: RawThreadRow,
    entityLabels: Map<string, string>
): InboxEntityChip | null {
    const key = `${thread.primary_entity_type}:${thread.primary_entity_id}`;
    const label = entityLabels.get(key);
    if (!label) {
        return {
            entity_type: thread.primary_entity_type,
            entity_id: thread.primary_entity_id,
            label: entityTypeLabel(thread.primary_entity_type),
        };
    }
    return {
        entity_type: thread.primary_entity_type,
        entity_id: thread.primary_entity_id,
        label,
    };
}

function resolveContactDisplay(
    thread: RawThreadRow,
    personNames: Map<string, string>
): string | null {
    if (thread.primary_entity_type === "persons") {
        return personNames.get(thread.primary_entity_id) ?? contactFromRecipientKey(thread.recipient_key, thread.channel);
    }
    return contactFromRecipientKey(thread.recipient_key, thread.channel);
}

export async function listInboxThreads(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    folder: InboxFolder;
    limit?: number;
    compact?: boolean;
}): Promise<{ ok: true; data: InboxThreadsListResponse } | { ok: false; error: string }> {
    const limit = parseInboxLimit(params.limit);
    const compact = params.compact === true;

    if (params.folder === "scheduled") {
        const scheduled = await listInboxScheduledSends({
            supabase: params.supabase,
            orgId: params.orgId,
            limit,
        });
        if (!scheduled.ok) return scheduled;
        return {
            ok: true,
            data: {
                folder: params.folder,
                threads: [],
                scheduled_sends: scheduled.rows,
                limit,
            },
        };
    }

    let query = params.supabase
        .from("communication_threads")
        .select(
            "id, org_id, channel, recipient_key, primary_entity_type, primary_entity_id, created_at, updated_at, last_message_at, archived_at, metadata"
        )
        .eq("org_id", params.orgId);

    if (params.folder === "archived") {
        query = query.not("archived_at", "is", null);
    } else {
        query = query.is("archived_at", null);
    }

    const fetchCap =
        params.folder === "unread" || params.folder === "sent"
            ? Math.min(limit * (compact ? 2 : 4), compact ? MAX_LIMIT : MAX_LIMIT * 2)
            : limit;

    const { data: rows, error } = await query
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false })
        .limit(fetchCap);

    if (error) return { ok: false, error: error.message };

    const rawThreads = (rows ?? []) as RawThreadRow[];
    const threadIds = rawThreads.map((t) => t.id);
    const [previews, unreadFlags, { entityLabels, familyByOpportunity, personNames }] = await Promise.all([
        attachLastPreviews(params.supabase, params.orgId, rawThreads),
        attachUnreadFlags(params.supabase, params.orgId, params.userId, threadIds),
        loadEntityLabels(params.supabase, params.orgId, rawThreads),
    ]);

    let items: InboxThreadListItem[] = rawThreads.map((t) => {
        const sortAt = threadSortTimestamp(t);
        const entityChip = buildEntityChip(t, entityLabels);
        const contactDisplay = resolveContactDisplay(t, personNames);
        let familyDisplay: string | null = null;
        if (t.primary_entity_type === "opportunities") {
            familyDisplay = familyByOpportunity.get(t.primary_entity_id) ?? null;
        } else if (t.primary_entity_type === "customers" && entityChip) {
            familyDisplay = entityChip.label;
        }

        return {
            id: t.id,
            org_id: t.org_id,
            channel: t.channel,
            recipient_key: t.recipient_key,
            primary_entity_type: t.primary_entity_type,
            primary_entity_id: t.primary_entity_id,
            created_at: t.created_at,
            updated_at: t.updated_at,
            last_message_at: t.last_message_at,
            archived_at: t.archived_at,
            is_archived: t.archived_at != null,
            sort_at: sortAt,
            contact_display: contactDisplay,
            family_display: familyDisplay,
            entity_chip: entityChip,
            last_message_preview: previews.get(t.id) ?? null,
            has_unread: unreadFlags.get(t.id) ?? false,
        };
    });

    items.sort((a, b) => {
        const tb = Date.parse(String(b.sort_at ?? 0));
        const ta = Date.parse(String(a.sort_at ?? 0));
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });

    items = filterThreadsForFolder(params.folder, items).slice(0, limit);

    return {
        ok: true,
        data: {
            folder: params.folder,
            threads: items,
            scheduled_sends: [],
            limit,
        },
    };
}

export async function listInboxScheduledSends(params: {
    supabase: SupabaseClient;
    orgId: string;
    limit?: number;
}): Promise<{ ok: true; rows: InboxScheduledSendListItem[] } | { ok: false; error: string }> {
    const limit = parseInboxLimit(params.limit);

    const { data, error } = await params.supabase
        .from("communication_scheduled_sends")
        .select(
            "id, channel, status, scheduled_for, body_snapshot, subject_snapshot, recipient_person_id, entity_type, entity_id"
        )
        .eq("org_id", params.orgId)
        .in("status", ["pending", "claimed"])
        .order("scheduled_for", { ascending: true })
        .limit(limit);

    if (error) return { ok: false, error: error.message };

    const rows = data ?? [];
    const personIds = [
        ...new Set(
            rows
                .map((r) => String((r as { recipient_person_id?: string }).recipient_person_id ?? ""))
                .filter((id) => UUID_RE.test(id))
        ),
    ];
    const oppIds = [
        ...new Set(
            rows
                .map((r) => String((r as { entity_id?: string }).entity_id ?? ""))
                .filter((id) => UUID_RE.test(id))
        ),
    ];

    const personNames = new Map<string, string>();
    if (personIds.length > 0) {
        const { data: persons } = await params.supabase
            .from("persons")
            .select("id, full_name, first_name, last_name, email")
            .eq("org_id", params.orgId)
            .in("id", personIds);
        for (const p of persons ?? []) {
            const id = String((p as { id: string }).id);
            const name =
                (p as { full_name?: string }).full_name?.trim() ||
                [(p as { first_name?: string }).first_name, (p as { last_name?: string }).last_name]
                    .filter(Boolean)
                    .join(" ")
                    .trim() ||
                (p as { email?: string }).email?.trim() ||
                "Recipient";
            personNames.set(id, name);
        }
    }

    const oppLabels = new Map<string, string>();
    if (oppIds.length > 0) {
        const { data: opps } = await params.supabase
            .from("opportunities")
            .select("id, name")
            .eq("org_id", params.orgId)
            .in("id", oppIds);
        for (const o of opps ?? []) {
            oppLabels.set(String((o as { id: string }).id), ((o as { name?: string }).name ?? "").trim() || "Opportunity");
        }
    }

    const mapped: InboxScheduledSendListItem[] = rows.map((r) => {
        const rec = r as Record<string, unknown>;
        const entityId = String(rec.entity_id ?? "");
        const entityType = String(rec.entity_type ?? "opportunities");
        const body = String(rec.body_snapshot ?? "");
        return {
            id: String(rec.id),
            channel: String(rec.channel ?? ""),
            status: String(rec.status ?? ""),
            scheduled_for: String(rec.scheduled_for ?? ""),
            body_preview: body.length > 120 ? `${body.slice(0, 117)}…` : body,
            subject_snapshot: rec.subject_snapshot != null ? String(rec.subject_snapshot) : null,
            recipient_person_id: String(rec.recipient_person_id ?? ""),
            contact_display: personNames.get(String(rec.recipient_person_id ?? "")) ?? null,
            entity_chip: UUID_RE.test(entityId)
                ? {
                      entity_type: entityType,
                      entity_id: entityId,
                      label: oppLabels.get(entityId) ?? "Opportunity",
                  }
                : null,
        };
    });

    return { ok: true, rows: mapped };
}

export async function setInboxThreadArchived(params: {
    supabase: SupabaseClient;
    orgId: string;
    threadId: string;
    archived: boolean;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    if (!UUID_RE.test(params.threadId)) {
        return { ok: false, status: 400, error: "Invalid thread id" };
    }

    const { data: row, error: qErr } = await params.supabase
        .from("communication_threads")
        .select("id, org_id")
        .eq("id", params.threadId)
        .eq("org_id", params.orgId)
        .maybeSingle();

    if (qErr) return { ok: false, status: 500, error: qErr.message };
    if (!row) return { ok: false, status: 404, error: "Thread not found" };

    const patch = params.archived
        ? { archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        : { archived_at: null, updated_at: new Date().toISOString() };

    const { error: uErr } = await params.supabase
        .from("communication_threads")
        .update(patch)
        .eq("id", params.threadId)
        .eq("org_id", params.orgId);

    if (uErr) return { ok: false, status: 500, error: uErr.message };
    return { ok: true };
}
