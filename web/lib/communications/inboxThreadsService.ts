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
import { resolveOpportunityStatusDisplay } from "@/lib/admin/drawer/opportunityStatusDisplayResolve";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { availableComposerChannels, type BindingSummary } from "@/lib/communications/composerChannels";
import { sanitizeInboxEntityLabel } from "@/lib/communications/inboxThreadDisplayLabels";
import {
    buildInboxContextLine,
    buildInboxPreviewLead,
    inboxIdentityWithChannelFallback,
    resolveInboxPrimaryName,
    resolveInboxReplyTarget,
} from "@/lib/communications/inboxThreadIdentity";
import {
    joinInboxRelatedNames,
    normalizeInboxRecipientEmail,
    normalizeInboxRecipientPhoneDigits,
    personDisplayNameFromRow,
    resolveMessageContactPersonId,
} from "@/lib/communications/inboxThreadPersonContext";
import {
    deriveInboxThreadRoutingState,
    maskInboxEndpointForDisplay,
    routingAmbiguityNotice,
    unidentifiedSenderDisplayName,
} from "@/lib/communications/inboxThreadRoutingState";
import { withoutSupersededDuplicates } from "@/lib/communications/supersededDuplicateMessages";

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
    attention_state?: string | null;
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
        .select("id, thread_id, direction, channel, status, body, created_at, metadata")
        .eq("org_id", orgId)
        .in("thread_id", ids)
        .order("created_at", { ascending: false })
        .limit(cap);

    if (error || !Array.isArray(raw)) return out;

    // A duplicate provider delivery recorded before inbound uniqueness existed is
    // still an inbound row. As the newest row on a thread it would become the
    // preview, showing the parent saying the same thing twice.
    for (const row of withoutSupersededDuplicates(raw as Record<string, unknown>[])) {
        const tid = row.thread_id != null ? String(row.thread_id) : "";
        if (!tid || out.has(tid)) continue;
        out.set(tid, previewFromMessageRow(row));
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

    const { data: inboundRaw, error: iErr } = await supabase
        .from("communication_messages")
        .select("id, thread_id, metadata")
        .eq("org_id", orgId)
        .eq("direction", "inbound")
        .in("thread_id", threadIds);

    if (iErr || !Array.isArray(inboundRaw) || inboundRaw.length === 0) return unreadByThread;

    // Same exclusion the org-wide unread count applies: a duplicate copy of a
    // message already present must not mark a thread unread on its own.
    const inbound = withoutSupersededDuplicates(inboundRaw as Record<string, unknown>[]);
    if (inbound.length === 0) return unreadByThread;

    const inboundIds = inbound.map((r) => String((r as { id: string }).id)).filter(Boolean);

    // CHUNKED, and this is not a micro-optimisation.
    //
    // PostgREST serialises `.in()` into the request URI. One UUID costs ~37
    // characters, so a few hundred inbound messages produced an ~11 KB URI and the
    // gateway refused it. The error path here returns the all-false map — meaning
    // every conversation was reported READ. The failure is silent and in the
    // dangerous direction: an operator simply stops seeing that families are
    // waiting, and nothing anywhere says why.
    //
    // Found when the certification tenant crossed 299 inbound messages. It is a
    // volume threshold, so any organization reaches it eventually.
    const READ_LOOKUP_CHUNK = 100;
    const readSet = new Set<string>();
    for (let i = 0; i < inboundIds.length; i += READ_LOOKUP_CHUNK) {
        const chunk = inboundIds.slice(i, i + READ_LOOKUP_CHUNK);
        const { data: reads, error: rErr } = await supabase
            .from("communication_message_reads")
            .select("message_id")
            .eq("user_id", userId)
            .in("message_id", chunk);

        // Fail CLOSED to "unknown" rather than to "read": returning the all-false
        // map would assert every conversation has been read, which is exactly the
        // lie this defect told.
        if (rErr) return unreadByThread;
        for (const x of reads ?? []) readSet.add(String((x as { message_id: string }).message_id));
    }

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

async function loadEntityContext(
    supabase: SupabaseClient,
    orgId: string,
    threads: RawThreadRow[]
): Promise<{
    entityLabels: Map<string, string>;
    familyByOpportunity: Map<string, string>;
    personNames: Map<string, string>;
    locationByOpportunity: Map<string, string>;
    locationByJob: Map<string, string>;
    primaryPersonByOpportunity: Map<string, string>;
    primaryPersonByJob: Map<string, string>;
    statusByOpportunity: Map<string, string>;
    personEmailAvailable: Map<string, boolean>;
    personSmsAvailable: Map<string, boolean>;
    personIdByEmail: Map<string, string>;
    personIdByPhone: Map<string, string>;
    relatedPersonIdsByOpportunity: Map<string, Set<string>>;
    relatedPersonIdsByJob: Map<string, Set<string>>;
    relatedChildrenByOpportunity: Map<string, string[]>;
}> {
    const entityLabels = new Map<string, string>();
    const familyByOpportunity = new Map<string, string>();
    const personNames = new Map<string, string>();
    const locationByOpportunity = new Map<string, string>();
    const locationByJob = new Map<string, string>();
    const primaryPersonByOpportunity = new Map<string, string>();
    const primaryPersonByJob = new Map<string, string>();
    const statusByOpportunity = new Map<string, string>();
    const personEmailAvailable = new Map<string, boolean>();
    const personSmsAvailable = new Map<string, boolean>();
    const personIdByEmail = new Map<string, string>();
    const personIdByPhone = new Map<string, string>();
    const opportunityStatusMeta = new Map<
        string,
        { statusKey: string | null; pipelineStageId: string | null }
    >();
    const pipelineStageIds = new Set<string>();

    const oppIds = new Set<string>();
    const personIds = new Set<string>();
    const jobIds = new Set<string>();
    const customerIds = new Set<string>();
    const locationIds = new Set<string>();
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
                .select("id, name, customer_id, location_id, primary_person_id, status_key, status, pipeline_stage_id")
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
                        const lid = (row as { location_id?: string | null }).location_id;
                        if (lid && UUID_RE.test(String(lid))) {
                            locationIds.add(String(lid));
                            locationByOpportunity.set(id, String(lid));
                        }
                        const pp = (row as { primary_person_id?: string | null }).primary_person_id;
                        if (pp && UUID_RE.test(String(pp))) {
                            const ppStr = String(pp);
                            primaryPersonByOpportunity.set(id, ppStr);
                            personIds.add(ppStr);
                        }
                        const statusKey = (row as { status_key?: string | null }).status_key;
                        const pipelineStageId = (row as { pipeline_stage_id?: string | null }).pipeline_stage_id;
                        opportunityStatusMeta.set(id, {
                            statusKey: statusKey != null ? String(statusKey) : null,
                            pipelineStageId:
                                pipelineStageId && UUID_RE.test(String(pipelineStageId))
                                    ? String(pipelineStageId)
                                    : null,
                        });
                        if (pipelineStageId && UUID_RE.test(String(pipelineStageId))) {
                            pipelineStageIds.add(String(pipelineStageId));
                        }
                    }
                })
        );
    }

    if (jobIds.size > 0) {
        entityQueries.push(
            supabase
                .from("jobs")
                .select("id, title, location_id, primary_person_id")
                .eq("org_id", orgId)
                .in("id", [...jobIds])
                .then(({ data }) => {
                    for (const row of data ?? []) {
                        const id = String((row as { id: string }).id);
                        const title = (row as { title?: string | null }).title;
                        entityLabels.set(`jobs:${id}`, (title ?? "").trim() || "Job");
                        const lid = (row as { location_id?: string | null }).location_id;
                        if (lid && UUID_RE.test(String(lid))) {
                            locationIds.add(String(lid));
                            locationByJob.set(id, String(lid));
                        }
                        const pp = (row as { primary_person_id?: string | null }).primary_person_id;
                        if (pp && UUID_RE.test(String(pp))) {
                            const ppStr = String(pp);
                            primaryPersonByJob.set(id, ppStr);
                            personIds.add(ppStr);
                        }
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
                        personEmailAvailable.set(id, !!(email ?? "").trim().includes("@"));
                        personSmsAvailable.set(id, (phone ?? "").replace(/\D/g, "").length >= 10);
                        const normalizedEmail = normalizeInboxRecipientEmail(email);
                        if (normalizedEmail) personIdByEmail.set(normalizedEmail, id);
                        const normalizedPhone = normalizeInboxRecipientPhoneDigits(phone ?? email);
                        if (normalizedPhone) personIdByPhone.set(normalizedPhone, id);
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

    const locationLabels = new Map<string, string>();
    if (locationIds.size > 0) {
        const { data } = await supabase
            .from("locations")
            .select("id, label, name")
            .eq("org_id", orgId)
            .in("id", [...locationIds]);
        for (const row of data ?? []) {
            const id = String((row as { id: string }).id);
            const label = (row as { label?: string | null; name?: string | null }).label;
            const name = (row as { name?: string | null }).name;
            locationLabels.set(id, (label ?? name ?? "").trim() || "Location");
        }
    }

    for (const [oppId, locId] of locationByOpportunity) {
        const label = locationLabels.get(locId);
        if (label) locationByOpportunity.set(oppId, label);
        else locationByOpportunity.delete(oppId);
    }
    for (const [jobId, locId] of locationByJob) {
        const label = locationLabels.get(locId);
        if (label) locationByJob.set(jobId, label);
        else locationByJob.delete(jobId);
    }

    const pipelineStageNames = new Map<string, string>();
    if (pipelineStageIds.size > 0) {
        const { data: stages } = await supabase
            .from("pipeline_stages")
            .select("id, name")
            .eq("org_id", orgId)
            .in("id", [...pipelineStageIds]);
        for (const row of stages ?? []) {
            const id = String((row as { id: string }).id);
            const name = (row as { name?: string | null }).name;
            pipelineStageNames.set(id, (name ?? "").trim() || "Stage");
        }
    }

    const opportunityStatusDefs =
        opportunityStatusMeta.size > 0
            ? await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true })
            : [];

    for (const [oppId, meta] of opportunityStatusMeta) {
        const label = resolveOpportunityStatusDisplay({
            statusKey: meta.statusKey,
            statusDefs: opportunityStatusDefs,
            pipelineStageId: meta.pipelineStageId,
            pipelineStageName: meta.pipelineStageId ? pipelineStageNames.get(meta.pipelineStageId) ?? null : null,
        });
        if (label?.trim()) statusByOpportunity.set(oppId, label.trim());
    }

    const relatedPersonIdsByOpportunity = new Map<string, Set<string>>();
    const relatedPersonIdsByJob = new Map<string, Set<string>>();
    const relatedChildrenByOpportunity = new Map<string, string[]>();

    if (oppIds.size > 0) {
        const { data: oppPersonRows } = await supabase
            .from("opportunity_persons")
            .select("opportunity_id, person_id")
            .eq("org_id", orgId)
            .in("opportunity_id", [...oppIds]);
        for (const row of oppPersonRows ?? []) {
            const oppId = String((row as { opportunity_id?: string }).opportunity_id ?? "");
            const pid = String((row as { person_id?: string }).person_id ?? "");
            if (!oppId || !pid) continue;
            const set = relatedPersonIdsByOpportunity.get(oppId) ?? new Set<string>();
            set.add(pid);
            relatedPersonIdsByOpportunity.set(oppId, set);
            personIds.add(pid);
        }

        const { data: ocmRows } = await supabase
            .from("opportunity_customer_members")
            .select(
                "opportunity_id, customer_members(display_name, first_name, last_name, relationship, persons(first_name, last_name, full_name))"
            )
            .eq("org_id", orgId)
            .in("opportunity_id", [...oppIds]);
        for (const row of ocmRows ?? []) {
            const oppId = String((row as { opportunity_id?: string }).opportunity_id ?? "");
            if (!oppId) continue;
            const member = (row as {
                customer_members?: {
                    display_name?: string | null;
                    first_name?: string | null;
                    last_name?: string | null;
                    relationship?: string | null;
                    persons?: { first_name?: string | null; last_name?: string | null; full_name?: string | null } | null;
                } | null;
            }).customer_members;
            if (!member) continue;
            const name = personDisplayNameFromRow({
                full_name: member.display_name ?? member.persons?.full_name,
                first_name: member.first_name ?? member.persons?.first_name,
                last_name: member.last_name ?? member.persons?.last_name,
            });
            const rel = String(member.relationship ?? "").trim().toLowerCase();
            if (rel === "child") {
                const list = relatedChildrenByOpportunity.get(oppId) ?? [];
                if (!list.includes(name)) list.push(name);
                relatedChildrenByOpportunity.set(oppId, list);
            }
        }
    }

    const customerIdsForContacts = [...customerIds];
    for (const cid of opportunityCustomerIds.values()) customerIdsForContacts.push(cid);
    const uniqueCustomerIds = [...new Set(customerIdsForContacts.filter((id) => UUID_RE.test(id)))];

    if (uniqueCustomerIds.length > 0) {
        const { data: cpRows } = await supabase
            .from("customer_persons")
            .select("customer_id, person_id, role_type")
            .eq("org_id", orgId)
            .in("customer_id", uniqueCustomerIds);
        for (const row of cpRows ?? []) {
            const customerId = String((row as { customer_id?: string }).customer_id ?? "");
            const pid = String((row as { person_id?: string }).person_id ?? "");
            if (!customerId || !pid) continue;
            personIds.add(pid);
            for (const [oppId, custId] of opportunityCustomerIds) {
                if (custId !== customerId) continue;
                const set = relatedPersonIdsByOpportunity.get(oppId) ?? new Set<string>();
                set.add(pid);
                relatedPersonIdsByOpportunity.set(oppId, set);
            }
        }
    }

    if (jobIds.size > 0) {
        const { data: jobRows } = await supabase
            .from("jobs")
            .select("id, customer_id, opportunity_id, primary_person_id")
            .eq("org_id", orgId)
            .in("id", [...jobIds]);
        for (const row of jobRows ?? []) {
            const jobId = String((row as { id: string }).id);
            const set = relatedPersonIdsByJob.get(jobId) ?? new Set<string>();
            const pp = primaryPersonByJob.get(jobId);
            if (pp) set.add(pp);
            const oppId = (row as { opportunity_id?: string | null }).opportunity_id;
            if (oppId && UUID_RE.test(String(oppId))) {
                const oppRelated = relatedPersonIdsByOpportunity.get(String(oppId));
                if (oppRelated) oppRelated.forEach((pid) => set.add(pid));
            }
            relatedPersonIdsByJob.set(jobId, set);
        }
    }

    for (const oppId of oppIds) {
        const related = relatedPersonIdsByOpportunity.get(oppId) ?? new Set<string>();
        const primary = primaryPersonByOpportunity.get(oppId);
        if (primary) related.add(primary);
        relatedPersonIdsByOpportunity.set(oppId, related);
    }

    const missingPersonIds = [...personIds].filter((id) => !personNames.has(id));
    if (missingPersonIds.length > 0) {
        const { data: extraPersons } = await supabase
            .from("persons")
            .select("id, full_name, first_name, last_name, email, phone")
            .eq("org_id", orgId)
            .in("id", missingPersonIds);
        for (const row of extraPersons ?? []) {
            const id = String((row as { id: string }).id);
            const email = (row as { email?: string | null }).email;
            const phone = (row as { phone?: string | null }).phone;
            const composed = personDisplayNameFromRow(row as {
                full_name?: string | null;
                first_name?: string | null;
                last_name?: string | null;
                email?: string | null;
                phone?: string | null;
            });
            personNames.set(id, composed);
            entityLabels.set(`persons:${id}`, composed);
            personEmailAvailable.set(id, !!(email ?? "").trim().includes("@"));
            personSmsAvailable.set(id, (phone ?? "").replace(/\D/g, "").length >= 10);
            const normalizedEmail = normalizeInboxRecipientEmail(email);
            if (normalizedEmail) personIdByEmail.set(normalizedEmail, id);
            const normalizedPhone = normalizeInboxRecipientPhoneDigits(phone ?? email);
            if (normalizedPhone) personIdByPhone.set(normalizedPhone, id);
        }
    }

    return {
        entityLabels,
        familyByOpportunity,
        personNames,
        locationByOpportunity,
        locationByJob,
        primaryPersonByOpportunity,
        primaryPersonByJob,
        statusByOpportunity,
        personEmailAvailable,
        personSmsAvailable,
        personIdByEmail,
        personIdByPhone,
        relatedPersonIdsByOpportunity,
        relatedPersonIdsByJob,
        relatedChildrenByOpportunity,
    };
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
    const sanitized = sanitizeInboxEntityLabel(label);
    return {
        entity_type: thread.primary_entity_type,
        entity_id: thread.primary_entity_id,
        label: sanitized ?? entityTypeLabel(thread.primary_entity_type),
    };
}

function resolveLocationDisplay(
    thread: RawThreadRow,
    locationByOpportunity: Map<string, string>,
    locationByJob: Map<string, string>
): string | null {
    const type = thread.primary_entity_type.trim().toLowerCase();
    const id = thread.primary_entity_id;
    if (type === "opportunities") return locationByOpportunity.get(id) ?? null;
    if (type === "jobs") return locationByJob.get(id) ?? null;
    return null;
}

function resolveStatusDisplay(
    thread: RawThreadRow,
    statusByOpportunity: Map<string, string>
): string | null {
    if (thread.primary_entity_type === "opportunities") {
        return statusByOpportunity.get(thread.primary_entity_id) ?? null;
    }
    return null;
}

function resolveReplyChannelAvailability(
    thread: RawThreadRow,
    replyPersonId: string | null,
    channelContactDisplay: string | null,
    personEmailAvailable: Map<string, boolean>,
    personSmsAvailable: Map<string, boolean>
): { replyEmailAvailable: boolean; replySmsAvailable: boolean } {
    if (replyPersonId && UUID_RE.test(replyPersonId)) {
        return {
            replyEmailAvailable: personEmailAvailable.get(replyPersonId) ?? false,
            replySmsAvailable: personSmsAvailable.get(replyPersonId) ?? false,
        };
    }
    const contact = channelContactDisplay?.trim() ?? "";
    return {
        replyEmailAvailable: contact.includes("@"),
        replySmsAvailable: contact.length > 0 && !contact.includes("@"),
    };
}

function resolveReplyPersonId(
    thread: RawThreadRow,
    primaryPersonByOpportunity: Map<string, string>,
    primaryPersonByJob: Map<string, string>,
    relatedPersonIdsByOpportunity: Map<string, Set<string>>,
    relatedPersonIdsByJob: Map<string, Set<string>>,
    personIdByEmail: Map<string, string>,
    personIdByPhone: Map<string, string>
): string | null {
    return resolveMessageContactPersonId({
        primaryEntityType: thread.primary_entity_type,
        primaryEntityId: thread.primary_entity_id,
        recipientKey: thread.recipient_key,
        primaryPersonByOpportunity,
        primaryPersonByJob,
        relatedPersonIdsByOpportunity,
        relatedPersonIdsByJob,
        personIdByEmail,
        personIdByPhone,
    });
}

function resolveRelatedContactsDisplay(
    thread: RawThreadRow,
    messageContactPersonId: string | null,
    relatedPersonIdsByOpportunity: Map<string, Set<string>>,
    relatedPersonIdsByJob: Map<string, Set<string>>,
    personNames: Map<string, string>
): string | null {
    const type = thread.primary_entity_type.trim().toLowerCase();
    const id = thread.primary_entity_id;
    let related: Set<string> | undefined;
    if (type === "opportunities") related = relatedPersonIdsByOpportunity.get(id);
    if (type === "jobs") related = relatedPersonIdsByJob.get(id);
    if (!related?.size) return null;
    const names: string[] = [];
    for (const pid of related) {
        if (messageContactPersonId && pid === messageContactPersonId) continue;
        const name = personNames.get(pid);
        if (name) names.push(name);
    }
    return joinInboxRelatedNames(names);
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
            "id, org_id, channel, recipient_key, primary_entity_type, primary_entity_id, created_at, updated_at, last_message_at, archived_at, attention_state, metadata"
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
    const [previews, unreadFlags, entityContext] = await Promise.all([
        attachLastPreviews(params.supabase, params.orgId, rawThreads),
        attachUnreadFlags(params.supabase, params.orgId, params.userId, threadIds),
        loadEntityContext(params.supabase, params.orgId, rawThreads),
    ]);
    const {
        entityLabels,
        familyByOpportunity,
        personNames,
        locationByOpportunity,
        locationByJob,
        primaryPersonByOpportunity,
        primaryPersonByJob,
        statusByOpportunity,
        personEmailAvailable,
        personSmsAvailable,
        personIdByEmail,
        personIdByPhone,
        relatedPersonIdsByOpportunity,
        relatedPersonIdsByJob,
        relatedChildrenByOpportunity,
    } = entityContext;

    const { data: bindingRows } = await params.supabase
        .from("communication_provider_bindings")
        .select("id, channel, scope, location_id, display_label, provider, status, is_primary, secret_ref, inbound_to_e164, config")
        .eq("org_id", params.orgId)
        .order("updated_at", { ascending: false });
    const orgSmsOutboundEnabled = availableComposerChannels((bindingRows ?? []) as BindingSummary[]).includes("sms");

    let items: InboxThreadListItem[] = rawThreads.map((t) => {
        const sortAt = threadSortTimestamp(t);
        const entityChip = buildEntityChip(t, entityLabels);
        const channelContactDisplay = contactFromRecipientKey(t.recipient_key, t.channel);
        const entityLabel = entityChip?.label ?? null;
        let familyDisplay: string | null = null;
        if (t.primary_entity_type === "opportunities") {
            familyDisplay = familyByOpportunity.get(t.primary_entity_id) ?? null;
        } else if (t.primary_entity_type === "customers" && entityChip) {
            familyDisplay = entityChip.label;
        }

        const locationDisplay = resolveLocationDisplay(t, locationByOpportunity, locationByJob);
        const statusDisplay = resolveStatusDisplay(t, statusByOpportunity);
        const routing = deriveInboxThreadRoutingState({
            primaryEntityType: t.primary_entity_type,
            attentionState: t.attention_state ?? null,
            metadata: t.metadata ?? null,
        });
        const unidentified = routing.senderIdentityState === "unidentified";
        // Person resolution scans phone/email across every person loaded for this
        // page of threads. On a thread the inbound seam already declared
        // unattributable that would mint an identity out of another row's data —
        // and a different one depending on what else paginated in. The seam's
        // decision stands.
        const messageContactPersonId = unidentified
            ? null
            : resolveReplyPersonId(
                  t,
                  primaryPersonByOpportunity,
                  primaryPersonByJob,
                  relatedPersonIdsByOpportunity,
                  relatedPersonIdsByJob,
                  personIdByEmail,
                  personIdByPhone
              );
        const maskedEndpoint = maskInboxEndpointForDisplay(t.recipient_key, t.channel);
        const identityInput = inboxIdentityWithChannelFallback({
            primaryEntityType: t.primary_entity_type,
            primaryEntityId: t.primary_entity_id,
            channel: t.channel,
            recipientKey: t.recipient_key,
            entityLabel,
            familyDisplay,
            locationDisplay,
            statusDisplay,
            personNames,
            primaryPersonByOpportunity,
            primaryPersonByJob,
            channelContact: channelContactDisplay,
            messageContactPersonId,
        });
        // An unattributed conversation is named for what is actually known about
        // it. The generic resolver would fall back to the formatted phone number
        // and render it in the name slot, which reads as an identity Alloy does
        // not have.
        const contactDisplay = unidentified
            ? unidentifiedSenderDisplayName(maskedEndpoint)
            : resolveInboxPrimaryName(identityInput);
        const routingNotice = routingAmbiguityNotice(routing);
        const contextDisplay =
            buildInboxContextLine({
                locationDisplay,
                statusDisplay,
            }) ?? routingNotice;
        const relatedChildrenDisplay =
            t.primary_entity_type === "opportunities"
                ? joinInboxRelatedNames(relatedChildrenByOpportunity.get(t.primary_entity_id) ?? [])
                : null;
        const relatedContactsDisplay = resolveRelatedContactsDisplay(
            t,
            messageContactPersonId,
            relatedPersonIdsByOpportunity,
            relatedPersonIdsByJob,
            personNames
        );
        const preview = previews.get(t.id) ?? null;
        const replyPersonId = messageContactPersonId;
        const personHasSms = replyPersonId ? personSmsAvailable.get(replyPersonId) ?? false : false;
        const { replyEmailAvailable: personEmailReachable } = resolveReplyChannelAvailability(
            t,
            replyPersonId,
            channelContactDisplay,
            personEmailAvailable,
            personSmsAvailable
        );
        const threadChannel = t.channel.trim().toLowerCase();
        // Channel availability normally answers "does this person have a number
        // on file". With no person, the answer is the conversation itself: the one
        // channel that can be answered is the one the message arrived on.
        const replyEmailAvailable = unidentified ? threadChannel === "email" : personEmailReachable;
        const replySmsAvailable = unidentified
            ? threadChannel === "sms" && orgSmsOutboundEnabled
            : orgSmsOutboundEnabled && personHasSms;
        const draftItem: InboxThreadListItem = {
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
            location_display: locationDisplay,
            status_display: statusDisplay,
            related_children_display: relatedChildrenDisplay,
            related_contacts_display: relatedContactsDisplay,
            context_display: contextDisplay,
            channel_contact_display: channelContactDisplay,
            preview_lead: buildInboxPreviewLead(t.channel, preview),
            reply_person_id: replyPersonId,
            reply_email_available: replyEmailAvailable,
            reply_sms_available: replySmsAvailable,
            can_reply: false,
            sender_identity_state: routing.senderIdentityState,
            routing_state: routing.routingState,
            routing_candidate_count: routing.routingCandidateCount,
            routing_notice: routingNotice,
            reply_authority: "none",
            reply_display_label: null,
            entity_chip: entityChip,
            last_message_preview: preview,
            has_unread: unreadFlags.get(t.id) ?? false,
        };
        const replyTarget = resolveInboxReplyTarget(draftItem);
        draftItem.can_reply = replyTarget.canReply;
        draftItem.reply_authority = replyTarget.authority;
        draftItem.reply_display_label = replyTarget.displayLabel;
        return draftItem;
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
