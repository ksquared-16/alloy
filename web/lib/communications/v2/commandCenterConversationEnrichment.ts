/**
 * Command Center — lightweight thread → family label + customer_id enrichment.
 * Mirrors inbox identity resolution at a smaller scope (queue list only).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { personDisplayNameFromRow } from "@/lib/communications/inboxThreadPersonContext";
import type { ConversationSummary } from "@/lib/communications/v2/commandCenterViewModel";

const UUID_RE = /^[0-9a-f-]{36}$/i;

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

export async function enrichCommandCenterConversations(
    supabase: SupabaseClient,
    orgId: string,
    rows: ThreadRow[],
    unreadByThread: Record<string, number>
): Promise<ConversationSummary[]> {
    const oppIds = new Set<string>();
    const customerIds = new Set<string>();
    const personIds = new Set<string>();

    for (const row of rows) {
        const type = (row.primary_entity_type ?? "").trim().toLowerCase();
        const id = (row.primary_entity_id ?? "").trim();
        if (!UUID_RE.test(id)) continue;
        if (type === "opportunities") oppIds.add(id);
        else if (type === "customers") customerIds.add(id);
        else if (type === "persons") personIds.add(id);
    }

    const oppCustomerByOppId = new Map<string, string>();
    const customerNameById = new Map<string, string>();
    const oppNameById = new Map<string, string>();
    const personNameById = new Map<string, string>();
    const personCustomerByPersonId = new Map<string, string>();

    const queries: Array<PromiseLike<void>> = [];

    if (oppIds.size > 0) {
        queries.push(
            supabase
                .from("opportunities")
                .select("id, name, customer_id")
                .eq("org_id", orgId)
                .in("id", [...oppIds])
                .then(({ data }) => {
                    for (const row of data ?? []) {
                        const id = String((row as { id: string }).id);
                        const name = ((row as { name?: string | null }).name ?? "").trim();
                        if (name) oppNameById.set(id, name);
                        const cid = (row as { customer_id?: string | null }).customer_id;
                        if (cid && UUID_RE.test(String(cid))) {
                            const cidStr = String(cid);
                            oppCustomerByOppId.set(id, cidStr);
                            customerIds.add(cidStr);
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

    if (queries.length > 0) await Promise.all(queries);

    if (customerIds.size > 0) {
        const { data } = await supabase
            .from("customers")
            .select("id, name")
            .eq("org_id", orgId)
            .in("id", [...customerIds]);
        for (const row of data ?? []) {
            const id = String((row as { id: string }).id);
            const name = ((row as { name?: string | null }).name ?? "").trim();
            customerNameById.set(id, name || "Family");
        }
    }

    return rows.map((r) => {
        const meta = r.metadata ?? {};
        const metaLabel = typeof meta.family_label === "string" ? meta.family_label.trim() : "";
        const type = (r.primary_entity_type ?? "").trim().toLowerCase();
        const entityId = (r.primary_entity_id ?? "").trim();

        let customerId: string | null = null;
        let familyLabel: string | null = metaLabel || null;

        if (type === "customers" && UUID_RE.test(entityId)) {
            customerId = entityId;
            familyLabel = familyLabel ?? customerNameById.get(entityId) ?? null;
        } else if (type === "opportunities" && UUID_RE.test(entityId)) {
            customerId = oppCustomerByOppId.get(entityId) ?? null;
            familyLabel =
                familyLabel ??
                (customerId ? customerNameById.get(customerId) : null) ??
                oppNameById.get(entityId) ??
                null;
        } else if (type === "persons" && UUID_RE.test(entityId)) {
            customerId = personCustomerByPersonId.get(entityId) ?? null;
            familyLabel =
                familyLabel ??
                (customerId ? customerNameById.get(customerId) : null) ??
                personNameById.get(entityId) ??
                null;
        }

        if (!familyLabel && r.recipient_key) {
            familyLabel = r.recipient_key.trim() || null;
        }

        return {
            id: r.id,
            channel: r.channel,
            attention_state: r.attention_state,
            assignment_state: r.assignment_state,
            assigned_user_id: r.assigned_user_id,
            location_id: r.location_id,
            sla_state: r.sla_state,
            last_message_at: r.last_message_at,
            unread: unreadByThread[r.id] ?? 0,
            family_label: familyLabel,
            customer_id: customerId,
        };
    });
}
