/**
 * Frontend-only labels for Activity Log / opportunity queue chrome.
 * Does not alter workflow_events payloads or event_type values.
 */

import { formatDateTimeLocal } from "@/lib/adminFormatters";

const SNAKE_MANUAL: Record<string, string> = {
    new_inquiry: "New Inquiry",
    contact_attempted: "Contact Attempted",
    tour_scheduled: "Tour Scheduled",
};

export function humanizeSnakeCaseToken(raw: string): string {
    const s = raw.trim();
    if (!s) return "";
    const lower = s.toLowerCase();
    if (SNAKE_MANUAL[lower]) return SNAKE_MANUAL[lower];
    if (!/^[a-z][a-z0-9_]*$/i.test(s)) return s;
    return s
        .split("_")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
}

function strOrEmpty(v: unknown): string {
    return v != null && String(v).trim() !== "" ? String(v).trim() : "";
}

function firstNonEmpty(...vals: unknown[]): string {
    for (const v of vals) {
        const s = strOrEmpty(v);
        if (s) return s;
    }
    return "";
}

/** Primary timeline title (never raw event_type / status keys). */
export function getWorkflowActivityEventTitle(eventType: string | null): string {
    const t = (eventType ?? "").trim();
    if (t === "opportunity_status_changed" || t === "entity_status_changed") return "Status changed";
    if (t === "message_received") return "SMS received";
    if (t === "message_sent") return "SMS sent";
    if (t === "note_added") return "Note added";
    if (t === "action_executed") return "Action completed";
    if (!t) return "Event";
    return humanizeSnakeCaseToken(t.replace(/\.+/g, "_"));
}

/** Detail line under title: prefers payload.summary with humanized keys; else status transition or action key. */
export function getWorkflowActivityEventDetail(eventType: string | null, payload: Record<string, unknown>): string | null {
    const t = (eventType ?? "").trim();
    const summaryRaw = payload.summary;
    if (typeof summaryRaw === "string" && summaryRaw.trim()) {
        return formatActivitySummaryHumanizingKeys(summaryRaw.trim());
    }
    if (t === "opportunity_status_changed" || t === "entity_status_changed") {
        const o = strOrEmpty(payload.old_status_key);
        const n = strOrEmpty(payload.new_status_key);
        const oL = o ? humanizeSnakeCaseToken(o) : "—";
        const nL = n ? humanizeSnakeCaseToken(n) : "—";
        return `${oL} → ${nL}`;
    }
    if (t === "action_executed") {
        const k = strOrEmpty(payload.action_key);
        return k ? humanizeSnakeCaseToken(k.replace(/\./g, "_")) : null;
    }
    return null;
}

/** Humanize snake_case segments and arrow-separated transitions inside a free-text summary. */
export function formatActivitySummaryHumanizingKeys(summary: string): string {
    const s = summary.trim();
    if (!s) return s;
    const arrowSplit = s.split(/\s*(?:→|->)\s*/);
    if (arrowSplit.length >= 2) {
        return arrowSplit
            .map((part) => {
                const p = part.trim();
                if (!p) return p;
                if (/^[a-z][a-z0-9_]*$/i.test(p)) return humanizeSnakeCaseToken(p);
                return p;
            })
            .filter(Boolean)
            .join(" → ");
    }
    const tokens = s.split(/\s+/);
    return tokens
        .map((tok) => {
            const clean = tok.replace(/^[,;.]+|[,;.]+$/g, "");
            if (/^[a-z][a-z0-9_]*$/i.test(clean)) return humanizeSnakeCaseToken(clean);
            return tok;
        })
        .join(" ");
}

function readActorObject(payload: Record<string, unknown>): Record<string, unknown> | null {
    const a = payload.actor;
    if (a && typeof a === "object" && !Array.isArray(a)) return a as Record<string, unknown>;
    return null;
}

/** Actor / source label for timeline (no DB joins). */
export function getWorkflowActivityActorLabel(payload: Record<string, unknown>, eventType: string | null): string {
    const et = (eventType ?? "").trim();
    const actorObj = readActorObject(payload);
    const actorString =
        typeof payload.actor === "string" && payload.actor.trim() ? payload.actor.trim().toLowerCase() : "";
    const actorType =
        strOrEmpty(actorObj?.type).toLowerCase() ||
        actorString ||
        strOrEmpty(payload.actor_type).toLowerCase();

    const name = firstNonEmpty(
        payload.actor_name,
        payload.actor_display_name,
        payload.user_name,
        payload.staff_name,
        actorObj?.name,
        actorObj?.full_name,
        actorObj?.display_name
    );
    const email = firstNonEmpty(payload.actor_email, payload.user_email, actorObj?.email);

    if (name) return name;
    if (email) return email;

    if (et === "message_received" && actorType === "contact") return "Contact";
    if (actorType === "contact") return "Contact";
    if (actorType === "system") return "System";
    if (actorType === "automation" || actorType === "workflow" || actorType === "runner") return "Automation";

    const source = strOrEmpty(payload.source).toLowerCase();
    const trigger = strOrEmpty(payload.trigger).toLowerCase();
    if (source === "automation" || source === "workflow" || trigger === "automation" || trigger === "workflow") {
        return "Automation";
    }

    if (payload.actor_user_id != null && String(payload.actor_user_id).trim()) return "Staff";

    if (actorString === "system") return "System";
    if (actorString === "automation") return "Automation";

    return "—";
}

const NOTE_LINE_MAX = 120;

/** MM/DD/YYYY h:mm AM/PM in the viewer's local timezone (browser default). */
export function formatQueueNoteDateTime(ms: number): string {
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return "";
    const s = formatDateTimeLocal(d);
    return s === "-" ? "" : s;
}

/** `[2026-04-29T21:15:05Z] Note text` → timestamp + remainder */
function tryParseBracketedTimestamp(line: string): { rest: string; ms: number } | null {
    const trimmed = line.trim();
    const m = trimmed.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
    if (!m) return null;
    const ts = m[1].trim();
    const ms = Date.parse(ts);
    if (!Number.isFinite(ms)) return null;
    return { rest: m[2].trim().replace(/\s+/g, " "), ms };
}

function tryParseLineLeadingDate(line: string): { rest: string; ms: number } | null {
    const trimmed = line.trim();
    const iso = trimmed.match(
        /^(\d{4}-\d{2}-\d{2})(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/
    );
    if (iso) {
        const ms = Date.parse(iso[0]);
        if (Number.isFinite(ms)) {
            const rest = trimmed.slice(iso[0].length).replace(/^\s*[—\-:|\t]+\s*/, "").trim().replace(/\s+/g, " ");
            return { rest, ms };
        }
    }
    const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
    if (us) {
        const month = Number(us[1]);
        const day = Number(us[2]);
        let y = Number(us[3]);
        if (y < 100) y += 2000;
        const ms = Date.UTC(y, month - 1, day, 0, 0, 0, 0);
        if (Number.isFinite(ms)) {
            const rest = trimmed.slice(us[0].length).replace(/^\s*[—\-:|\t]+\s*/, "").trim().replace(/\s+/g, " ");
            return { rest, ms };
        }
    }
    return null;
}

function extractNoteLineTimestampMs(line: string): number | null {
    const b = tryParseBracketedTimestamp(line);
    if (b) return b.ms;
    const p = tryParseLineLeadingDate(line);
    return p ? p.ms : null;
}

function pickLatestNoteLine(lines: string[]): string {
    type Scored = { line: string; ms: number | null };
    const scored: Scored[] = lines.map((line) => ({
        line,
        ms: extractNoteLineTimestampMs(line),
    }));
    const dated = scored.filter((s): s is Scored & { ms: number } => s.ms != null);
    if (dated.length) {
        dated.sort((a, b) => b.ms - a.ms);
        return dated[0].line;
    }
    return lines[lines.length - 1]!;
}

/** Display: `{note_text} · {MM/DD/YYYY h:mm A}` (label "Notes" is prefixed in UI). */
function formatSingleNoteLineForDisplay(line: string): string | null {
    const trimmed = line.trim().replace(/\s+/g, " ");
    if (!trimmed) return null;

    const bracket = tryParseBracketedTimestamp(trimmed);
    if (bracket) {
        const dateStr = formatQueueNoteDateTime(bracket.ms);
        const body = bracket.rest;
        if (!body) return dateStr || null;
        const bodyShort = body.length > NOTE_LINE_MAX ? `${body.slice(0, NOTE_LINE_MAX)}…` : body;
        return dateStr ? `${bodyShort} · ${dateStr}` : bodyShort;
    }

    const parsed = tryParseLineLeadingDate(trimmed);
    if (parsed) {
        const dateStr = formatQueueNoteDateTime(parsed.ms);
        const body = parsed.rest;
        if (body) {
            const bodyShort = body.length > NOTE_LINE_MAX ? `${body.slice(0, NOTE_LINE_MAX)}…` : body;
            return dateStr ? `${bodyShort} · ${dateStr}` : bodyShort;
        }
        return dateStr || null;
    }

    return trimmed.length > NOTE_LINE_MAX ? `${trimmed.slice(0, NOTE_LINE_MAX)}…` : trimmed;
}

/**
 * Queue row: one concise line, latest note when multiple lines / dated entries exist.
 */
export function formatOpportunityQueueNotesPreview(raw: string | null | undefined): string | null {
    const blob = (raw ?? "").trim();
    if (!blob) return null;
    const lines = blob.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const pick = lines.length === 0 ? blob.replace(/\s+/g, " ") : lines.length === 1 ? lines[0]! : pickLatestNoteLine(lines);
    return formatSingleNoteLineForDisplay(pick);
}
