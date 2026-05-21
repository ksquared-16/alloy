import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";

export type OppSearchDisambiguationRow = {
    id: string;
    name?: string | null;
    title?: string | null;
    status_key?: string | null;
    metadata?: unknown;
    created_at?: string | null;
    opportunity_number?: number | string | null;
    customer_id?: string | null;
    primary_person_id?: string | null;
    primary_contact_id?: string | null;
};

export function childDisplayNameFromOppMetadata(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== "object") return null;
    const meta = metadata as Record<string, unknown>;
    const demo = typeof meta.demo_child_name === "string" ? meta.demo_child_name.trim() : "";
    if (demo) return demo;
    const kids = meta.inquiry_children;
    if (!Array.isArray(kids) || !kids.length) return null;
    for (const raw of kids) {
        if (!raw || typeof raw !== "object") continue;
        const row = raw as Record<string, unknown>;
        const joined = [row.first_name, row.last_name]
            .filter((x) => typeof x === "string" && String(x).trim())
            .join(" ")
            .trim();
        const name =
            (typeof row.display_name === "string" ? row.display_name.trim() : "") ||
            (typeof row.child_name === "string" ? row.child_name.trim() : "") ||
            (typeof row.name === "string" ? row.name.trim() : "") ||
            joined ||
            "";
        if (name) return name;
    }
    return null;
}

export function tourDateHintFromOppMetadata(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== "object") return null;
    const meta = metadata as Record<string, unknown>;
    const iso =
        (typeof meta.demo_tour_starts_at === "string" ? meta.demo_tour_starts_at.trim() : "") ||
        (typeof meta.tour_starts_at === "string" ? meta.tour_starts_at.trim() : "");
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatCreatedHint(createdAt: string | null | undefined): string | null {
    if (!createdAt?.trim()) return null;
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function disambiguationFromOppRow(o: OppSearchDisambiguationRow): NonNullable<TaskAssistEntitySearchCandidate["disambiguation"]> {
    const rawNum = o.opportunity_number;
    const n = rawNum != null && rawNum !== "" ? Number(rawNum) : null;
    return {
        customer_id: o.customer_id ?? null,
        primary_person_id: o.primary_person_id ?? null,
        primary_contact_id: o.primary_contact_id ?? null,
        opportunity_number: n != null && Number.isFinite(n) ? n : null,
        status_key: o.status_key?.trim() || null,
        child_display_name: childDisplayNameFromOppMetadata(o.metadata),
        tour_date_hint: tourDateHintFromOppMetadata(o.metadata),
        created_at_hint: formatCreatedHint(o.created_at),
        matched_members: [],
        matched_contacts: [],
    };
}

export function mergeMatchedNameLists(a?: string[] | null, b?: string[] | null): string[] {
    return [...new Set([...(a ?? []), ...(b ?? [])].map((s) => s.trim()).filter(Boolean))];
}

function disambiguationSuffix(d: NonNullable<TaskAssistEntitySearchCandidate["disambiguation"]>): string | null {
    const parts: string[] = [];
    if (d.child_display_name) parts.push(d.child_display_name);
    else if (d.matched_members?.length) parts.push(d.matched_members.join(", "));
    if (d.status_key) parts.push(d.status_key.replace(/_/g, " "));
    if (d.tour_date_hint) parts.push(`Tour ${d.tour_date_hint}`);
    if (d.opportunity_number != null && Number.isFinite(Number(d.opportunity_number))) {
        parts.push(`#${d.opportunity_number}`);
    } else if (d.created_at_hint) parts.push(d.created_at_hint);
    return parts.length ? parts.join(" · ") : null;
}

/** When multiple candidates share the same base label, append child/status/number hints. */
export function applyLabelDisambiguationForDuplicates(
    candidates: TaskAssistEntitySearchCandidate[]
): TaskAssistEntitySearchCandidate[] {
    const byLabel = new Map<string, TaskAssistEntitySearchCandidate[]>();
    for (const c of candidates) {
        const key = c.label.trim().toLowerCase();
        const list = byLabel.get(key) ?? [];
        list.push(c);
        byLabel.set(key, list);
    }

    return candidates.map((c) => {
        const group = byLabel.get(c.label.trim().toLowerCase()) ?? [c];
        if (group.length <= 1) return c;
        const suffix = disambiguationSuffix(c.disambiguation ?? {});
        if (!suffix) return c;
        if (c.label.includes(suffix)) return c;
        return { ...c, label: `${c.label} (${suffix})` };
    });
}

export type CandidateOperatorPresentation = {
    primaryLabel: string;
    secondaryLine: string | null;
    relatedPeopleLine: string | null;
    matchReasonLine: string | null;
};

function formatMatchReasonLine(c: TaskAssistEntitySearchCandidate): string | null {
    if (c.matched_fields.includes("ambient_context")) {
        return "Matched active drawer context";
    }
    if (c.matched_fields.some((f) => f === "fuzzy_match")) {
        return "Close name match";
    }
    const byField: Record<string, string> = {
        "opportunity_name": "Matched name",
        "customer_family": "Matched household",
        "customer_members.name": "Matched household member",
        "primary_person_id": "Matched contact",
        "primary_contact_id": "Matched contact",
        "uuid_match": "Matched record id",
    };
    for (const f of c.matched_fields) {
        if (byField[f]) return byField[f];
    }
    if (c.source === "customer_family") return "Matched household";
    if (c.source === "customer_member") return "Matched household member";
    if (c.source === "primary_person" || c.source === "primary_contact") return "Matched contact";
    return c.matched_fields.length ? "Matched search" : null;
}

function formatStatusLabel(statusKey: string | null | undefined): string | null {
    const s = statusKey?.trim();
    if (!s) return null;
    return s
        .replace(/_/g, " ")
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Operator-facing candidate card lines (no raw ids). */
export function formatCandidateOperatorPresentation(
    c: TaskAssistEntitySearchCandidate
): CandidateOperatorPresentation {
    const d = c.disambiguation;
    const primaryLabel = c.label.trim() || "Record";
    const status = formatStatusLabel(d?.status_key);
    const location = d?.location_name?.trim() || null;
    const secondaryParts = ["Opportunity"];
    if (status) secondaryParts.push(status);
    if (location) secondaryParts.push(location);
    const secondaryLine = secondaryParts.length > 1 ? secondaryParts.join(" · ") : "Opportunity";

    const people: string[] = [];
    if (d?.matched_members?.length) {
        people.push(...d.matched_members.map((n) => n.trim()).filter(Boolean));
    }
    if (d?.matched_contacts?.length) {
        for (const n of d.matched_contacts) {
            const t = n.trim();
            if (t && !people.includes(t)) people.push(t);
        }
    }
    if (d?.child_display_name?.trim()) {
        const child = d.child_display_name.trim();
        if (!people.includes(child)) people.unshift(child);
    }
    const relatedPeopleLine = people.length ? people.join(" · ") : null;

    const matchReasonLine = formatMatchReasonLine(c);
    return { primaryLabel, secondaryLine, relatedPeopleLine, matchReasonLine };
}

export function formatCandidateDebugLine(c: TaskAssistEntitySearchCandidate): string {
    const d = c.disambiguation;
    const parts = [
        `id:${c.entity_id}`,
        `src:${c.source}`,
        d?.customer_id ? `cust:${d.customer_id}` : null,
        d?.primary_person_id ? `person:${d.primary_person_id}` : null,
        d?.primary_contact_id ? `contact:${d.primary_contact_id}` : null,
        c.matched_fields.length ? `fields:${c.matched_fields.join("|")}` : null,
    ].filter(Boolean);
    return parts.join(" · ");
}
