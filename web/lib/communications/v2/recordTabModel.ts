/**
 * Communications V2 — record-drawer Communications tab model (PKG-13). PURE, no I/O, no React.
 *
 * Relationship communication context for Lead/Person/Child drawers: scoped timeline, last contact,
 * unread, consent display. Deliberately excludes inbox/assignment/deliverability/bulk concerns —
 * those belong to the Command Center (enforced by the record-tab scope contract test).
 */

export type RecordTimelineEntry = {
    id: string;
    kind: "email" | "sms" | "call" | "note" | "announcement" | string;
    direction: "inbound" | "outbound" | "internal" | string;
    created_at: string | null;
    preview: string | null;
};

export type RecordCommunicationsModel = {
    timeline: RecordTimelineEntry[]; // chronological ascending
    lastContactAt: string | null;
    unread: number;
    consentDisplay: string;
};

function preview(body?: string | null): string | null {
    if (typeof body !== "string") return null;
    const t = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

export function buildRecordCommunicationsModel(input: {
    messages: { id: string; channel?: string | null; direction?: string | null; created_at?: string | null; body?: string | null }[];
    notes?: { id: string; created_at?: string | null; body?: string | null }[];
    unread?: number;
    consentStatus?: string | null;
}): RecordCommunicationsModel {
    const fromMessages: RecordTimelineEntry[] = (input.messages ?? []).map((m) => ({
        id: m.id,
        kind: typeof m.channel === "string" ? m.channel : "email",
        direction: typeof m.direction === "string" ? m.direction : "outbound",
        created_at: m.created_at ?? null,
        preview: preview(m.body),
    }));
    const fromNotes: RecordTimelineEntry[] = (input.notes ?? []).map((n) => ({
        id: n.id,
        kind: "note",
        direction: "internal",
        created_at: n.created_at ?? null,
        preview: preview(n.body),
    }));
    const timeline = [...fromMessages, ...fromNotes].sort((a, b) =>
        String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))
    );
    const lastContactAt = timeline.reduce<string | null>(
        (best, e) => (e.created_at && (best === null || e.created_at > best) ? e.created_at : best),
        null
    );
    return {
        timeline,
        lastContactAt,
        unread: typeof input.unread === "number" ? input.unread : 0,
        consentDisplay: input.consentStatus ?? "unknown",
    };
}
