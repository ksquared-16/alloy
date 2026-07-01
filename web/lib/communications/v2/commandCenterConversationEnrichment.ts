/**
 * Command Center — lightweight thread → family label + customer_id enrichment.
 * Mirrors inbox identity resolution at a smaller scope (queue list only).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { personDisplayNameFromRow } from "@/lib/communications/inboxThreadPersonContext";
import {
    resolveCustomerStageLabelFromOpportunities,
    resolveOpportunityStatusLabelsBatch,
    type OpportunityStatusSourceRow,
} from "@/lib/admin/drawer/resolveOpportunityStatusLabelsBatch";
import type { ConversationSummary } from "@/lib/communications/v2/commandCenterViewModel";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const PREVIEW_MAX = 96;

type ThreadRow = {
    id: string;
    channel: string | null;
    attention_state: string | null;
    assignment_state: string | null;
    assigned_user_id: string | null;
    location_id: string | null;
    sla_state: string | null;
    last_message_at: string | null;
    metadata: Record<string, unknown> | null;
    primary_entity_type: string | null;
    primary_entity_id: string | null;
    recipient_key: string | null;
};

type LastMessagePreview = {
    body: string | null;
    direction: string | null;
    created_at: string | null;
};

function normalizeEntityType(type: string | null | undefined): string {
    return (type ?? "").trim().toLowerCase();
}

function isOpportunityEntity(type: string): boolean {
    return type === "opportunities" || type === "opportunity";
}

function isCustomerEntity(type: string): boolean {
    return type === "customers" || type === "customer";
}

function isPersonEntity(type: string): boolean {
    return type === "persons" || type === "person";
}

function truncatePreview(body: string | null | undefined): string | null {
    const text = (body ?? "").replace(/\s+/g, " ").trim();
    if (!text) return null;
    if (text.length <= PREVIEW_MAX) return text;
    return `${text.slice(0, PREVIEW_MAX - 1)}…`;
}

async function loadLastMessagePreviews(
    supabase: SupabaseClient,
    orgId: string,
    threadIds: string[]
): Promise<Map<string, LastMessagePreview>> {
    const out = new Map<string, LastMessagePreview>();
    if (threadIds.length === 0) return out;

    const { data } = await supabase
        .from("communication_messages")
        .select("thread_id, body, direction, created_at")
        .eq("org_id", orgId)
        .in("thread_id", threadIds)
        .order("created_at", { ascending: false })
        .limit(Math.min(threadIds.length * 3, 600));

    for (const row of data ?? []) {
        const tid = String((row as { thread_id: string }).thread_id);
        if (out.has(tid)) continue;
        out.set(tid, {
            body: (row as { body?: string | null }).body ?? null,
            direction: (row as { direction?: string | null }).direction ?? null,
            created_at: (row as { created_at?: string | null }).created_at ?? null,
        });
    }
    return out;
}

export async function enrichCommandCenterConversations(
    supabase: SupabaseClient,
    orgId: string,
    rows: ThreadRow[],
    unreadByThread: Record<string, number>
): Promise<ConversationSummary[]> {
    const threadIds = rows.map((r) => r.id);
    const oppIds = new Set<string>();
    const customerIds = new Set<string>();
    const personIds = new Set<string>();

    for (const row of rows) {
        const type = normalizeEntityType(row.primary_entity_type);
        const id = (row.primary_entity_id ?? "").trim();
        if (!UUID_RE.test(id)) continue;
        if (isOpportunityEntity(type)) oppIds.add(id);
        else if (isCustomerEntity(type)) customerIds.add(id);
        else if (isPersonEntity(type)) personIds.add(id);
    }

    const oppCustomerByOppId = new Map<string, string>();
    const customerNameById = new Map<string, string>();
    const oppNameById = new Map<string, string>();
    const oppIdByCustomerId = new Map<string, string>();
    const opportunityRows: OpportunityStatusSourceRow[] = [];
    const personNameById = new Map<string, string>();
    const personCustomerByPersonId = new Map<string, string>();
    const primaryContactByCustomerId = new Map<string, string>();
    const primaryContactPersonByCustomerId = new Map<string, string>();
    const childLinksByCustomerId = new Map<string, Array<{ id: string; name: string }>>();

    const queries: Array<PromiseLike<void>> = [];

    const previewsPromise = loadLastMessagePreviews(supabase, orgId, threadIds);

    if (oppIds.size > 0) {
        queries.push(
            supabase
                .from("opportunities")
                .select("id, name, customer_id, status_key, status, pipeline_stage_id")
                .eq("org_id", orgId)
                .in("id", [...oppIds])
                .then(({ data }) => {
                    for (const row of data ?? []) {
                        const id = String((row as { id: string }).id);
                        const name = ((row as { name?: string | null }).name ?? "").trim();
                        if (name) oppNameById.set(id, name);
                        opportunityRows.push(row as OpportunityStatusSourceRow);
                        const cid = (row as { customer_id?: string | null }).customer_id;
                        if (cid && UUID_RE.test(String(cid))) {
                            const cidStr = String(cid);
                            oppCustomerByOppId.set(id, cidStr);
                            customerIds.add(cidStr);
                            oppIdByCustomerId.set(cidStr, id);
                        }
                    }
                })
        );
    }

    if (personIds.size > 0) {
        queries.push(
            supabase
                .from("persons")
                .select("id, first_name, last_name, preferred_name")
                .eq("org_id", orgId)
                .in("id", [...personIds])
                .then(({ data }) => {
                    for (const row of data ?? []) {
                        const id = String((row as { id: string }).id);
                        const name = personDisplayNameFromRow(
                            row as { first_name?: string | null; last_name?: string | null; preferred_name?: string | null }
                        );
                        if (name) personNameById.set(id, name);
                    }
                }),
            supabase
                .from("customer_persons")
                .select("person_id, customer_id")
                .eq("org_id", orgId)
                .in("person_id", [...personIds])
                .then(({ data }) => {
                    for (const row of data ?? []) {
                        const pid = String((row as { person_id: string }).person_id);
                        const cid = String((row as { customer_id: string }).customer_id);
                        if (UUID_RE.test(cid) && !personCustomerByPersonId.has(pid)) {
                            personCustomerByPersonId.set(pid, cid);
                            customerIds.add(cid);
                        }
                    }
                })
        );
    }

    const [previews] = await Promise.all([previewsPromise, ...queries]);

    if (customerIds.size > 0) {
        const missingCustomerOppIds = [...customerIds].filter((cid) => !oppIdByCustomerId.has(cid));
        if (missingCustomerOppIds.length > 0) {
            const { data: customerOpps } = await supabase
                .from("opportunities")
                .select("id, customer_id, status_key, status, pipeline_stage_id")
                .eq("org_id", orgId)
                .in("customer_id", missingCustomerOppIds)
                .order("updated_at", { ascending: false })
                .limit(Math.min(missingCustomerOppIds.length * 2, 100));
            for (const row of customerOpps ?? []) {
                const id = String((row as { id: string }).id);
                const cid = String((row as { customer_id: string }).customer_id);
                oppCustomerByOppId.set(id, cid);
                if (!oppIdByCustomerId.has(cid)) oppIdByCustomerId.set(cid, id);
                if (!opportunityRows.some((r) => r.id === id)) {
                    opportunityRows.push(row as OpportunityStatusSourceRow);
                }
            }
        }
    }

    const statusByOpportunity = await resolveOpportunityStatusLabelsBatch(supabase, orgId, opportunityRows);

    let customerRows: Array<{ id: string; name?: string | null; primary_contact_id?: string | null }> = [];

    if (customerIds.size > 0) {
        const ids = [...customerIds];
        const [{ data: customers }, { data: members }] = await Promise.all([
            supabase.from("customers").select("id, name, primary_contact_id").eq("org_id", orgId).in("id", ids),
            supabase
                .from("customer_members")
                .select("id, customer_id, display_name, first_name, last_name, relationship")
                .eq("org_id", orgId)
                .in("customer_id", ids)
                .eq("relationship", "child")
                .eq("is_active", true)
                .limit(400),
        ]);
        customerRows = (customers ?? []) as typeof customerRows;

        for (const row of customerRows) {
            const id = String((row as { id: string }).id);
            const name = ((row as { name?: string | null }).name ?? "").trim();
            customerNameById.set(id, name || "Family");
            const pc = (row as { primary_contact_id?: string | null }).primary_contact_id;
            if (pc && UUID_RE.test(String(pc))) {
                personIds.add(String(pc));
                primaryContactPersonByCustomerId.set(id, String(pc));
            }
        }

        for (const row of members ?? []) {
            const cid = String((row as { customer_id: string }).customer_id);
            const memberId = String((row as { id?: string }).id ?? "").trim();
            const display =
                ((row as { display_name?: string | null }).display_name ?? "").trim() ||
                [((row as { first_name?: string | null }).first_name ?? "").trim(), ((row as { last_name?: string | null }).last_name ?? "").trim()]
                    .filter(Boolean)
                    .join(" ");
            if (!display) continue;
            const list = childLinksByCustomerId.get(cid) ?? [];
            if (memberId && UUID_RE.test(memberId)) {
                if (!list.some((c) => c.id === memberId)) list.push({ id: memberId, name: display });
            }
            childLinksByCustomerId.set(cid, list);
        }
    }

    if (personIds.size > 0) {
        const missing = [...personIds].filter((id) => !personNameById.has(id));
        if (missing.length > 0) {
            const { data } = await supabase
                .from("persons")
                .select("id, first_name, last_name, preferred_name")
                .eq("org_id", orgId)
                .in("id", missing);
            for (const row of data ?? []) {
                const id = String((row as { id: string }).id);
                const name = personDisplayNameFromRow(
                    row as { first_name?: string | null; last_name?: string | null; preferred_name?: string | null }
                );
                if (name) personNameById.set(id, name);
            }
        }

        for (const row of customerRows) {
            const cid = String(row.id);
            const pc = row.primary_contact_id;
            if (pc && UUID_RE.test(String(pc))) {
                const name = personNameById.get(String(pc));
                if (name) primaryContactByCustomerId.set(cid, name);
            }
        }
    }

    return rows.map((r) => {
        const meta = r.metadata ?? {};
        const metaLabel = typeof meta.family_label === "string" ? meta.family_label.trim() : "";
        const type = normalizeEntityType(r.primary_entity_type);
        const entityId = (r.primary_entity_id ?? "").trim();
        const recipientKey = (r.recipient_key ?? "").trim() || null;

        let customerId: string | null = null;
        let familyLabel: string | null = metaLabel || null;
        let stageLabel: string | null = null;
        let primaryContactName: string | null = null;
        let opportunityId: string | null = null;
        let primaryContactPersonId: string | null = null;

        if (isCustomerEntity(type) && UUID_RE.test(entityId)) {
            customerId = entityId;
            familyLabel = familyLabel ?? customerNameById.get(entityId) ?? null;
            primaryContactName = primaryContactByCustomerId.get(entityId) ?? null;
            primaryContactPersonId = primaryContactPersonByCustomerId.get(entityId) ?? null;
            opportunityId = oppIdByCustomerId.get(entityId) ?? null;
            stageLabel = resolveCustomerStageLabelFromOpportunities(
                entityId,
                opportunityRows,
                statusByOpportunity,
                opportunityId
            );
        } else if (isOpportunityEntity(type) && UUID_RE.test(entityId)) {
            customerId = oppCustomerByOppId.get(entityId) ?? null;
            opportunityId = entityId;
            familyLabel =
                familyLabel ??
                (customerId ? customerNameById.get(customerId) : null) ??
                oppNameById.get(entityId) ??
                null;
            stageLabel = statusByOpportunity.get(entityId) ?? null;
            if (customerId) {
                primaryContactName = primaryContactByCustomerId.get(customerId) ?? null;
                primaryContactPersonId = primaryContactPersonByCustomerId.get(customerId) ?? null;
            }
        } else if (isPersonEntity(type) && UUID_RE.test(entityId)) {
            customerId = personCustomerByPersonId.get(entityId) ?? null;
            primaryContactName = personNameById.get(entityId) ?? null;
            primaryContactPersonId = entityId;
            familyLabel =
                familyLabel ??
                (customerId ? customerNameById.get(customerId) : null) ??
                primaryContactName ??
                null;
            if (customerId) {
                if (!primaryContactName) primaryContactName = primaryContactByCustomerId.get(customerId) ?? null;
                if (!primaryContactPersonId) primaryContactPersonId = primaryContactPersonByCustomerId.get(customerId) ?? null;
                opportunityId = oppIdByCustomerId.get(customerId) ?? null;
                stageLabel = resolveCustomerStageLabelFromOpportunities(
                    customerId,
                    opportunityRows,
                    statusByOpportunity,
                    opportunityId
                );
            }
        } else if (customerId) {
            opportunityId = oppIdByCustomerId.get(customerId) ?? null;
            stageLabel = resolveCustomerStageLabelFromOpportunities(
                customerId,
                opportunityRows,
                statusByOpportunity,
                opportunityId
            );
        }

        const preview = previews.get(r.id);
        const childLinks = customerId ? childLinksByCustomerId.get(customerId) ?? null : null;
        const childNames = childLinks?.map((c) => c.name) ?? null;
        const lastActivityAt = preview?.created_at ?? r.last_message_at;

        return {
            id: r.id,
            channel: r.channel,
            attention_state: r.attention_state,
            assignment_state: r.assignment_state,
            assigned_user_id: r.assigned_user_id,
            location_id: r.location_id,
            sla_state: r.sla_state,
            last_message_at: r.last_message_at,
            last_activity_at: lastActivityAt,
            unread: unreadByThread[r.id] ?? 0,
            family_label: familyLabel,
            recipient_key: recipientKey,
            last_message_preview: truncatePreview(preview?.body),
            last_message_direction: preview?.direction ?? null,
            primary_contact_name: primaryContactName,
            primary_contact_person_id: primaryContactPersonId,
            child_names: childNames?.length ? childNames : null,
            child_links: childLinks?.length ? childLinks : null,
            stage_label: stageLabel,
            opportunity_id: opportunityId,
            primary_entity_type: r.primary_entity_type,
            primary_entity_id: r.primary_entity_id,
            customer_id: customerId,
        };
    });
}
