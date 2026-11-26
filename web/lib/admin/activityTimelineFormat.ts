/**
 * Generic Activity Log / workflow_event display formatting (frontend-only).
 * Entity-specific label maps are passed via options — no workflow_events changes.
 */

import { formatActivityTimestamp } from "@/lib/presentation/presentationDateFormat";
import { resolveCommunicationMessageEventTitle } from "@/lib/admin/activityMessageEventLabels";
import { UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";

export type ActivityTimelineEventInput = {
    event_type: string | null;
    payload: Record<string, unknown>;
};

export type ActivityTimelineFormatOptions = {
    /** Maps event_type (any casing) → primary title */
    eventTypeLabels?: Record<string, string>;
    /** Maps status_key-style tokens → display label (used in summaries + transitions) */
    statusKeyLabels?: Record<string, string>;
    /** Payload old_status_key / new_status_key detail for these event types */
    statusTransitionEventTypes?: string[];
    /** Payload action_key detail for these event types */
    actionEventTypes?: string[];
    /** Actor: inbound message types where “Contact” is preferred when actor is contact */
    messageChannelInboundTypes?: string[];
    defaultEmptyEventTitle?: string;
};

export type ActivityTimelineFormatted = {
    title: string;
    detail: string | null;
    actorLabel: string;
};

const DEFAULT_INBOUND_MESSAGE_TYPES = ["message_received"];

const NOTE_LINE_MAX = 120;

function lookupMapLabel(map: Record<string, string> | undefined, key: string): string | undefined {
    if (!map || !key) return undefined;
    return map[key] ?? map[key.toLowerCase()];
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

/** Title-case snake_case words; optional per-key labels override (e.g. CRM status keys). */
export function humanizeSnakeCaseToken(raw: string, statusKeyLabels?: Record<string, string>): string {
    const s = raw.trim();
    if (!s) return "";
    const lower = s.toLowerCase();
    const fromMap = lookupMapLabel(statusKeyLabels, lower);
    if (fromMap) return fromMap;
    if (!/^[a-z][a-z0-9_]*$/i.test(s)) return s;
    return s
        .split("_")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
}

export function formatActivitySummaryHumanizingKeys(summary: string, statusKeyLabels?: Record<string, string>): string {
    const s = summary.trim();
    if (!s) return s;
    const arrowSplit = s.split(/\s*(?:→|->)\s*/);
    if (arrowSplit.length >= 2) {
        return arrowSplit
            .map((part) => {
                const p = part.trim();
                if (!p) return p;
                if (/^[a-z][a-z0-9_]*$/i.test(p)) return humanizeSnakeCaseToken(p, statusKeyLabels);
                return p;
            })
            .filter(Boolean)
            .join(" → ");
    }
    const tokens = s.split(/\s+/);
    return tokens
        .map((tok) => {
            const clean = tok.replace(/^[,;.]+|[,;.]+$/g, "");
            if (/^[a-z][a-z0-9_]*$/i.test(clean)) return humanizeSnakeCaseToken(clean, statusKeyLabels);
            return tok;
        })
        .join(" ");
}

function readActorObject(payload: Record<string, unknown>): Record<string, unknown> | null {
    const a = payload.actor;
    if (a && typeof a === "object" && !Array.isArray(a)) return a as Record<string, unknown>;
    return null;
}

function toTypeSet(list: string[] | undefined): Set<string> {
    if (!list?.length) return new Set();
    return new Set(list.map((x) => x.trim().toLowerCase()).filter(Boolean));
}

function inboundMessageTypeSet(options?: ActivityTimelineFormatOptions): Set<string> {
    if (options?.messageChannelInboundTypes?.length) {
        return toTypeSet(options.messageChannelInboundTypes);
    }
    return new Set(DEFAULT_INBOUND_MESSAGE_TYPES.map((x) => x.toLowerCase()));
}

/**
 * Actor / source line for workflow_events (no DB joins).
 */
export function getActivityTimelineActorLabel(
    payload: Record<string, unknown>,
    eventType: string | null,
    options?: ActivityTimelineFormatOptions
): string {
    const inbound = inboundMessageTypeSet(options);
    const et = (eventType ?? "").trim();
    const etLower = et.toLowerCase();
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

    if (inbound.has(etLower) && actorType === "contact") return "Contact";
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

function resolveEventTitle(
    eventType: string | null,
    payload: Record<string, unknown>,
    options: ActivityTimelineFormatOptions
): string {
    const channelTitle = resolveCommunicationMessageEventTitle(eventType, payload);
    if (channelTitle) return channelTitle;

    const t = (eventType ?? "").trim();
    if (!t) return options.defaultEmptyEventTitle ?? "Event";
    const mapped = lookupMapLabel(options.eventTypeLabels, t);
    if (mapped) return mapped;
    return humanizeSnakeCaseToken(t.replace(/\.+/g, "_"), options.statusKeyLabels);
}

function resolveEventDetail(event: ActivityTimelineEventInput, options: ActivityTimelineFormatOptions): string | null {
    const t = (event.event_type ?? "").trim();
    const tLower = t.toLowerCase();
    const payload = event.payload;
    const statusKeys = options.statusKeyLabels;

    const summaryRaw = payload.summary;
    if (typeof summaryRaw === "string" && summaryRaw.trim()) {
        return formatActivitySummaryHumanizingKeys(summaryRaw.trim(), statusKeys);
    }

    // A policy refusal without its reason answers the wrong question: the
    // operator can already see that nothing arrived. Both boundaries put the
    // operator-safe explanation at the top level of the payload — the enqueue
    // eligibility gate (canonicalOutboundEnqueue) and dispatch revalidation
    // (communication_message_sender.py, which spreads DispatchDecision.to_audit)
    // — so one rule serves both.
    if (tLower === "message_blocked" || tLower === "message_deferred") {
        const explanation = strOrEmpty(payload.operator_message);
        if (explanation) return explanation;
        const code = strOrEmpty(payload.reason);
        return code ? humanizeSnakeCaseToken(code, statusKeys) : null;
    }

    const transitionTypes = toTypeSet(options.statusTransitionEventTypes);
    if (transitionTypes.size > 0 && transitionTypes.has(tLower)) {
        const o = strOrEmpty(payload.old_status_key) || strOrEmpty(payload.previous_status_key);
        const n = strOrEmpty(payload.new_status_key) || strOrEmpty(payload.next_status_key);
        const oL = o ? humanizeSnakeCaseToken(o, statusKeys) : "—";
        const nL = n ? humanizeSnakeCaseToken(n, statusKeys) : "—";
        return `${oL} → ${nL}`;
    }

    const actionTypes = toTypeSet(options.actionEventTypes);
    if (actionTypes.size > 0 && actionTypes.has(tLower)) {
        const k = strOrEmpty(payload.action_key);
        return k ? humanizeSnakeCaseToken(k.replace(/\./g, "_"), statusKeys) : null;
    }

    return null;
}

/**
 * Single entry: title, optional detail, actor label. Defensive on missing payload.
 */
export function formatActivityTimelineEvent(
    event: ActivityTimelineEventInput,
    options: ActivityTimelineFormatOptions = {}
): ActivityTimelineFormatted {
    const payload =
        event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
            ? event.payload
            : {};
    const title = resolveEventTitle(event.event_type, payload, options);
    const detail = resolveEventDetail({ ...event, payload }, options);
    const actorLabel = getActivityTimelineActorLabel(payload, event.event_type, options);
    return {
        title,
        detail,
        actorLabel,
    };
}

// --- Queue / CRM note line primitives (storage-agnostic) ---

/** Activity doctrine — `Today • 9:12 AM`, `Jun 15, 2026 • 2:15 PM` in resolved timezone. */
export function formatQueueNoteDateTime(ms: number, timeZoneIana: string = UTC_FALLBACK_IANA): string {
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return "";
    return formatActivityTimestamp(d, { timeZone: timeZoneIana, nowMs: Date.now() });
}

/** `[2026-04-29T21:15:05Z] Note text` → timestamp ms + remainder */
export function parseBracketedTimestamp(line: string): { rest: string; ms: number } | null {
    const trimmed = line.trim();
    const m = trimmed.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
    if (!m) return null;
    const ts = m[1].trim();
    const ms = Date.parse(ts);
    if (!Number.isFinite(ms)) return null;
    return { rest: m[2].trim().replace(/\s+/g, " "), ms };
}

export function parseLineLeadingDate(line: string): { rest: string; ms: number } | null {
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

export function extractDatedNoteLineTimestampMs(line: string): number | null {
    const b = parseBracketedTimestamp(line);
    if (b) return b.ms;
    const p = parseLineLeadingDate(line);
    return p ? p.ms : null;
}

/** Pick the line with the greatest embedded timestamp, or last line if none dated */
export function chooseLatestDatedNoteLine(lines: string[]): string {
    type Scored = { line: string; ms: number | null };
    const scored: Scored[] = lines.map((line) => ({
        line,
        ms: extractDatedNoteLineTimestampMs(line),
    }));
    const dated = scored.filter((s): s is Scored & { ms: number } => s.ms != null);
    if (dated.length) {
        dated.sort((a, b) => b.ms - a.ms);
        return dated[0].line;
    }
    return lines[lines.length - 1]!;
}

export function truncateNoteLine(text: string, maxLen: number = NOTE_LINE_MAX): string {
    const t = text.trim();
    if (t.length <= maxLen) return t;
    return `${t.slice(0, maxLen)}…`;
}

export type ActivityQueueNotesPreviewParts = {
    /** Local datetime per `formatQueueNoteDateTime`, or null when line has no parseable date */
    timestamp: string | null;
    /** Note body only (truncated); empty when preview is date-only */
    body: string;
};

function joinNotePreviewParts(parts: ActivityQueueNotesPreviewParts, dateFirst: boolean): string | null {
    const ts = parts.timestamp?.trim() || null;
    const body = parts.body.trim();
    if (!ts && !body) return null;
    if (!ts) return body || null;
    if (!body) return ts;
    return dateFirst ? `${ts} · ${body}` : `${body} · ${ts}`;
}

/** When dated: default `{note} · {local datetime}`; with `dateFirst`, `{datetime} · {note}` (queue row scan). */
export function formatDatedNoteLinePreview(line: string, opts?: { dateFirst?: boolean; displayTimeZone?: string }): string | null {
    const parts = formatDatedNoteLinePreviewParts(line, opts);
    if (!parts) return null;
    return joinNotePreviewParts(parts, Boolean(opts?.dateFirst));
}

export function formatDatedNoteLinePreviewParts(
    line: string,
    opts?: { displayTimeZone?: string }
): ActivityQueueNotesPreviewParts | null {
    const trimmed = line.trim().replace(/\s+/g, " ");
    if (!trimmed) return null;
    const tz = opts?.displayTimeZone ?? UTC_FALLBACK_IANA;

    const bracket = parseBracketedTimestamp(trimmed);
    if (bracket) {
        const dateStr = formatQueueNoteDateTime(bracket.ms, tz) || null;
        const body = bracket.rest ? truncateNoteLine(bracket.rest) : "";
        if (!dateStr) return body ? { timestamp: null, body } : null;
        return { timestamp: dateStr, body };
    }

    const parsed = parseLineLeadingDate(trimmed);
    if (parsed) {
        const dateStr = formatQueueNoteDateTime(parsed.ms, tz) || null;
        const body = parsed.rest ? truncateNoteLine(parsed.rest) : "";
        if (!dateStr) return body ? { timestamp: null, body } : null;
        return { timestamp: dateStr, body };
    }

    return { timestamp: null, body: truncateNoteLine(trimmed) };
}

/** Single source line for queue note preview: latest dated line when multi-line, else trimmed blob. */
function pickQueueNotesBlobPreviewLine(raw: string | null | undefined): string | null {
    const blob = (raw ?? "").trim();
    if (!blob) return null;
    const lines = blob.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return blob.replace(/\s+/g, " ");
    if (lines.length === 1) return lines[0]!;
    return chooseLatestDatedNoteLine(lines);
}

/**
 * Multi-line blob: choose latest dated line, then one preview line.
 */
export function formatActivityQueueNotesBlobPreview(
    raw: string | null | undefined,
    opts?: { dateFirst?: boolean; displayTimeZone?: string }
): string | null {
    const pick = pickQueueNotesBlobPreviewLine(raw);
    if (!pick) return null;
    return formatDatedNoteLinePreview(pick, opts);
}

export function formatActivityQueueNotesBlobPreviewParts(
    raw: string | null | undefined,
    opts?: { displayTimeZone?: string }
): ActivityQueueNotesPreviewParts | null {
    const pick = pickQueueNotesBlobPreviewLine(raw);
    if (!pick) return null;
    return formatDatedNoteLinePreviewParts(pick, opts);
}
