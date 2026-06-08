/**
 * Quick Message record-scoped recipients — same source as drawer composer
 * (`GET /api/admin/communications/drawer-recipients` → fetchOpportunityDrawerEmailRecipients).
 */

import type { DrawerEmailRecipientRow } from "@/lib/communications/drawerEmailRecipients";

export type QuickMessagePersonHit = {
    person_id: string;
    display_name: string;
    email: string | null;
    phone: string | null;
    has_email: boolean;
    has_phone: boolean;
    relationship_label: string | null;
};

export type QuickMessageLaunchRecipientHint = {
    personId?: string | null;
    displayName?: string | null;
    email?: string | null;
    phone?: string | null;
};

/** Humanize stored role keys (e.g. parent → Parent). */
export function formatQuickMessageRelationshipLabel(hint: string | null | undefined): string | null {
    const s = hint?.trim() ?? "";
    if (!s || s === "—") return null;
    if (/\s/.test(s)) {
        return s
            .split(/\s+/)
            .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
            .join(" ");
    }
    const words = s.split(/[_.-]+/).filter(Boolean);
    if (words.length === 0) return s;
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

export function drawerRecipientToQuickMessageHit(row: DrawerEmailRecipientRow): QuickMessagePersonHit {
    return {
        person_id: row.person_id,
        display_name: row.display_name?.trim() || "Contact",
        email: row.email,
        phone: row.phone,
        has_email: Boolean(row.email?.trim()),
        has_phone: Boolean(row.phone?.trim()),
        relationship_label: formatQuickMessageRelationshipLabel(row.relationship_hint),
    };
}

function hintToDrawerRow(hint: QuickMessageLaunchRecipientHint): DrawerEmailRecipientRow | null {
    const personId = hint.personId?.trim();
    if (!personId) return null;
    const email = hint.email?.trim() || null;
    const phone = hint.phone?.trim() || null;
    return {
        person_id: personId,
        display_name: hint.displayName?.trim() || "Contact",
        email: email && email.includes("@") ? email.toLowerCase() : null,
        phone,
        relationship_hint: "From queue row",
        is_suggested_default: true,
    };
}

/** Merge API recipients with queue-row seed hint when API lagged or row had person id not yet in join tables. */
export function mergeQuickMessageRecipients(
    apiRows: DrawerEmailRecipientRow[],
    hint?: QuickMessageLaunchRecipientHint | null
): DrawerEmailRecipientRow[] {
    const byId = new Map<string, DrawerEmailRecipientRow>();
    for (const r of apiRows) {
        if (r.person_id?.trim()) byId.set(r.person_id.trim(), r);
    }
    const seedRow = hint ? hintToDrawerRow(hint) : null;
    if (seedRow && !byId.has(seedRow.person_id)) {
        byId.set(seedRow.person_id, seedRow);
    }
    const merged = [...byId.values()];
    if (merged.length === 0) return [];

    let defaultPid: string | null = null;
    if (seedRow && byId.has(seedRow.person_id)) {
        defaultPid = seedRow.person_id;
    } else {
        const defaults = merged.filter((r) => r.is_suggested_default);
        defaultPid = defaults.length === 1 ? defaults[0]!.person_id : merged[0]?.person_id ?? null;
    }
    for (const r of merged) {
        r.is_suggested_default = r.person_id === defaultPid;
    }
    merged.sort((a, b) => {
        const d = Number(b.is_suggested_default) - Number(a.is_suggested_default);
        if (d !== 0) return d;
        return a.display_name.localeCompare(b.display_name);
    });
    return merged;
}

export function selectAutoQuickMessageRecipients(rows: DrawerEmailRecipientRow[]): DrawerEmailRecipientRow[] {
    if (rows.length === 0) return [];
    if (rows.length === 1) return [rows[0]!];
    const defaults = rows.filter((r) => r.is_suggested_default);
    if (defaults.length === 1) return [defaults[0]!];
    return [];
}

export function resolveQuickMessageSelection(args: {
    rows: DrawerEmailRecipientRow[];
    preferredPersonId?: string | null;
}): QuickMessagePersonHit[] {
    const preferred = args.preferredPersonId?.trim();
    if (preferred) {
        const match = args.rows.find((r) => r.person_id === preferred);
        if (match) return [drawerRecipientToQuickMessageHit(match)];
    }
    return selectAutoQuickMessageRecipients(args.rows).map(drawerRecipientToQuickMessageHit);
}

export async function fetchQuickMessageOpportunityRecipients(
    opportunityId: string,
    hint?: QuickMessageLaunchRecipientHint | null
): Promise<{ recipients: DrawerEmailRecipientRow[]; error: string | null }> {
    const id = opportunityId.trim();
    if (!id) return { recipients: [], error: "opportunity_id required" };
    try {
        const qs = new URLSearchParams({
            entity_type: "opportunities",
            entity_id: id,
        });
        const r = await fetch(`/api/admin/communications/drawer-recipients?${qs}`, { credentials: "include" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
            return {
                recipients: [],
                error: (j as { error?: string }).error ?? `HTTP ${r.status}`,
            };
        }
        const list = (j as { recipients?: DrawerEmailRecipientRow[] }).recipients;
        const apiRows = Array.isArray(list) ? list : [];
        return { recipients: mergeQuickMessageRecipients(apiRows, hint), error: null };
    } catch (e) {
        return {
            recipients: [],
            error: e instanceof Error ? e.message : "Failed to load recipients",
        };
    }
}
