/**
 * POS Packet Visibility (Sprint 1B) — pure read-model assembler.
 *
 * Joins existing forms-packet data (definitions + items + source forms + public links +
 * sessions) into a per-packet summary for the POS Packets panel. No new tables; reads
 * only. Pure and deterministic so it is unit-testable without a database; the route
 * (`app/api/admin/pos/packets/route.ts`) performs the DB reads and calls this.
 *
 * Scope: visibility only — packet name, source template, created date, share-link status,
 * and packet status. No submission review, PDF generation, or duplicate detection.
 */

export interface PosPacketDefinitionRow {
    id: string;
    key: string;
    name: string;
    is_active: boolean;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

export interface PosPacketItemRow {
    packet_definition_id: string;
    sequence_index: number;
    form_definition_id: string;
    metadata?: Record<string, unknown> | null;
}

export interface PosFormNameRow {
    id: string;
    name: string | null;
}

export interface PosPacketLinkRow {
    id: string;
    token_prefix: string | null;
    is_active: boolean;
    expires_at: string | null;
    created_at: string;
    last_used_at: string | null;
    metadata: Record<string, unknown> | null;
}

export interface PosPacketSessionRow {
    id: string;
    packet_definition_id: string;
    status: string;
    operator_review_status: string | null;
    created_at: string;
    completed_at: string | null;
    started_via_public_link_id?: string | null;
}

/** One child-recipient share (link) — the row shown in the Packets panel. */
export interface PosPacketShareRow {
    link_id: string;
    token_prefix: string | null;
    child_id: string | null;
    recipient_id: string | null;
    child_label: string | null;
    recipient_label: string | null;
    recipient_email: string | null;
    recipient_phone: string | null;
    is_active: boolean;
    expired: boolean;
    /** Parent has opened the link at least once (link.last_used_at present). */
    opened: boolean;
    /** A packet session for this link has completed. */
    submitted: boolean;
    created_at: string;
    /** Family Packet instance this link belongs to (null = legacy independent link). */
    packet_instance_id: string | null;
    /** All children selected for this family packet instance. */
    selected_child_ids: string[];
    selected_child_labels: string[];
}

/** A family packet instance: one card grouping its recipient access rows. */
export interface PosFamilyInstance {
    packet_instance_id: string | null;
    child_ids: string[];
    child_labels: string[];
    /** One row per recipient (or the single legacy link). */
    recipients: PosPacketShareRow[];
    recipient_count: number;
    /** Signature/submission progress (placeholder: submitted recipients / total recipients). */
    signatures: { signed: number; total: number };
}

export interface PosPacketLinkSummary {
    id: string;
    token_prefix: string | null;
    is_active: boolean;
    expires_at: string | null;
    created_at: string;
    last_used_at: string | null;
}

export interface PosPacketSessionSummary {
    id: string;
    status: string;
    operator_review_status: string | null;
    created_at: string;
    completed_at: string | null;
}

/** Concise lifecycle label for the panel (derived, not stored). */
export type PosPacketStatus =
    | "archived" // definition deactivated
    | "ready" // created, no share link yet
    | "shared" // has an active link, no parent activity yet
    | "in_progress" // a parent session is underway
    | "submitted" // a session completed, awaiting operator review
    | "approved"
    | "rejected"
    | "needs_changes"
    | "cancelled";

export interface PosPacketSummary {
    packet_definition_id: string;
    name: string;
    key: string;
    created_at: string;
    is_active: boolean;
    source_form: { id: string; name: string | null } | null;
    step_count: number;
    share_links: { count: number; active_count: number; latest: PosPacketLinkSummary | null };
    sessions: { count: number; latest: PosPacketSessionSummary | null };
    /** Per-link share rows (one per link). */
    shares: PosPacketShareRow[];
    /** Family packet instances (grouped recipient access). One card per instance in the UI. */
    instances: PosFamilyInstance[];
    status: PosPacketStatus;
}

const POS_PACKET_CREATED_VIA = ["pos_packet_from_template", "pos_packet_compose"];

/** True when a packet definition was created by a POS packet flow (template or composer). */
export function isPosCreatedPacket(metadata: Record<string, unknown> | null | undefined): boolean {
    const via = metadata?.created_via;
    return typeof via === "string" && POS_PACKET_CREATED_VIA.includes(via);
}

function latestByCreatedAt<T extends { created_at: string }>(rows: T[]): T | null {
    if (rows.length === 0) return null;
    return rows.reduce((best, r) => (r.created_at > best.created_at ? r : best));
}

function metaString(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
    const v = metadata?.[key];
    return typeof v === "string" && v.trim() ? v : null;
}

function deriveStatus(
    isActive: boolean,
    latestSession: PosPacketSessionSummary | null,
    activeLinkCount: number
): PosPacketStatus {
    if (!isActive) return "archived";
    if (latestSession) {
        const review = latestSession.operator_review_status;
        if (review === "approved") return "approved";
        if (review === "rejected") return "rejected";
        if (review === "needs_correction") return "needs_changes";
        if (latestSession.status === "completed") return "submitted";
        if (latestSession.status === "cancelled") return "cancelled";
        return "in_progress";
    }
    return activeLinkCount > 0 ? "shared" : "ready";
}

export interface PosPacketReadModelInput {
    definitions: PosPacketDefinitionRow[];
    items: PosPacketItemRow[];
    forms: PosFormNameRow[];
    links: PosPacketLinkRow[];
    sessions: PosPacketSessionRow[];
    /** Optional id→label maps for share rows (child = customer_member, recipient = person). */
    childLabels?: Record<string, string>;
    recipientLabels?: Record<string, string>;
    /** Optional recipient contact details for share rows. */
    recipientContacts?: Record<string, { email: string | null; phone: string | null }>;
    /** Override "now" for expiry checks (testing). Defaults to Date.now(). */
    now?: number;
}

function shareChildId(meta: Record<string, unknown> | null): string | null {
    return metaString(meta, "composer_child_id") ?? metaString(meta, "selected_customer_member_id");
}
function shareRecipientId(meta: Record<string, unknown> | null): string | null {
    return metaString(meta, "composer_recipient_id") ?? metaString(meta, "recipient_person_id");
}
function sharePacketInstanceId(meta: Record<string, unknown> | null): string | null {
    return metaString(meta, "packet_instance_id");
}
function shareSelectedChildIds(meta: Record<string, unknown> | null): string[] {
    const v = meta?.selected_customer_member_ids;
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.length > 0);
    const single = shareChildId(meta);
    return single ? [single] : [];
}

/** Group share rows into family packet instances (by packet_instance_id; legacy links stand alone). */
export function groupSharesIntoInstances(shares: PosPacketShareRow[]): PosFamilyInstance[] {
    const byKey = new Map<string, PosFamilyInstance>();
    const order: string[] = [];
    for (const s of shares) {
        const key = s.packet_instance_id ?? `link:${s.link_id}`;
        let inst = byKey.get(key);
        if (!inst) {
            inst = {
                packet_instance_id: s.packet_instance_id,
                child_ids: s.selected_child_ids,
                child_labels: s.selected_child_labels,
                recipients: [],
                recipient_count: 0,
                signatures: { signed: 0, total: 0 },
            };
            byKey.set(key, inst);
            order.push(key);
        }
        inst.recipients.push(s);
    }
    for (const inst of byKey.values()) {
        inst.recipient_count = inst.recipients.length;
        inst.signatures = { signed: inst.recipients.filter((r) => r.submitted).length, total: inst.recipients.length };
    }
    return order.map((k) => byKey.get(k)!);
}

/**
 * Assemble per-packet summaries. Definitions are returned newest-first. The source form
 * is taken from `metadata.source_form_definition_id`, falling back to the first step's
 * form. Links are matched by `metadata.packet_definition_id`.
 */
export function buildPosPacketReadModel(input: PosPacketReadModelInput): PosPacketSummary[] {
    const formNameById = new Map(input.forms.map((f) => [f.id, f.name] as const));

    const itemsByPacket = new Map<string, PosPacketItemRow[]>();
    for (const it of input.items) {
        const arr = itemsByPacket.get(it.packet_definition_id) ?? [];
        arr.push(it);
        itemsByPacket.set(it.packet_definition_id, arr);
    }

    const linksByPacket = new Map<string, PosPacketLinkRow[]>();
    for (const ln of input.links) {
        const pid = metaString(ln.metadata, "packet_definition_id");
        if (!pid) continue;
        const arr = linksByPacket.get(pid) ?? [];
        arr.push(ln);
        linksByPacket.set(pid, arr);
    }

    const sessionsByPacket = new Map<string, PosPacketSessionRow[]>();
    for (const s of input.sessions) {
        const arr = sessionsByPacket.get(s.packet_definition_id) ?? [];
        arr.push(s);
        sessionsByPacket.set(s.packet_definition_id, arr);
    }

    const nowMs = input.now ?? Date.now();
    const completedLinkIds = new Set<string>();
    for (const s of input.sessions) {
        if (s.status === "completed" && s.started_via_public_link_id) completedLinkIds.add(s.started_via_public_link_id);
    }

    const summaries = input.definitions.map((def) => {
        const items = (itemsByPacket.get(def.id) ?? []).slice().sort((a, b) => a.sequence_index - b.sequence_index);

        let sourceFormId = metaString(def.metadata, "source_form_definition_id");
        if (!sourceFormId && items.length > 0) sourceFormId = items[0].form_definition_id;
        const source_form = sourceFormId
            ? { id: sourceFormId, name: formNameById.get(sourceFormId) ?? null }
            : null;

        const links = linksByPacket.get(def.id) ?? [];
        const latestLinkRow = latestByCreatedAt(links);
        const latestLink: PosPacketLinkSummary | null = latestLinkRow
            ? {
                  id: latestLinkRow.id,
                  token_prefix: latestLinkRow.token_prefix,
                  is_active: latestLinkRow.is_active,
                  expires_at: latestLinkRow.expires_at,
                  created_at: latestLinkRow.created_at,
                  last_used_at: latestLinkRow.last_used_at,
              }
            : null;
        const activeLinkCount = links.filter((l) => l.is_active).length;

        const sessions = sessionsByPacket.get(def.id) ?? [];
        const latestSessionRow = latestByCreatedAt(sessions);
        const latestSession: PosPacketSessionSummary | null = latestSessionRow
            ? {
                  id: latestSessionRow.id,
                  status: latestSessionRow.status,
                  operator_review_status: latestSessionRow.operator_review_status,
                  created_at: latestSessionRow.created_at,
                  completed_at: latestSessionRow.completed_at,
              }
            : null;

        const shares: PosPacketShareRow[] = links
            .slice()
            .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
            .map((ln) => {
                const childId = shareChildId(ln.metadata);
                const recipientId = shareRecipientId(ln.metadata);
                const selectedChildIds = shareSelectedChildIds(ln.metadata);
                const expired = Boolean(ln.expires_at && new Date(ln.expires_at).getTime() < nowMs);
                return {
                    link_id: ln.id,
                    token_prefix: ln.token_prefix,
                    child_id: childId,
                    recipient_id: recipientId,
                    child_label: childId ? input.childLabels?.[childId] ?? null : null,
                    recipient_label: recipientId ? input.recipientLabels?.[recipientId] ?? null : null,
                    recipient_email: recipientId ? input.recipientContacts?.[recipientId]?.email ?? null : null,
                    recipient_phone: recipientId ? input.recipientContacts?.[recipientId]?.phone ?? null : null,
                    is_active: ln.is_active,
                    expired,
                    opened: Boolean(ln.last_used_at),
                    submitted: completedLinkIds.has(ln.id),
                    created_at: ln.created_at,
                    packet_instance_id: sharePacketInstanceId(ln.metadata),
                    selected_child_ids: selectedChildIds,
                    selected_child_labels: selectedChildIds.map((id) => input.childLabels?.[id] ?? `${id.slice(0, 8)}…`),
                };
            });

        return {
            packet_definition_id: def.id,
            name: def.name,
            key: def.key,
            created_at: def.created_at,
            is_active: def.is_active,
            source_form,
            step_count: items.length,
            share_links: { count: links.length, active_count: activeLinkCount, latest: latestLink },
            sessions: { count: sessions.length, latest: latestSession },
            shares,
            instances: groupSharesIntoInstances(shares),
            status: deriveStatus(def.is_active, latestSession, activeLinkCount),
        } satisfies PosPacketSummary;
    });

    return summaries.sort((a, b) => (a.created_at > b.created_at ? -1 : a.created_at < b.created_at ? 1 : 0));
}
