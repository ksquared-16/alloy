/**
 * Activity Signals V1 — derived from workflow_events + org config (metadata.activity_signal_rules).
 * No persisted derived state; no hardcoded thresholds.
 */

import { humanizeSnakeCaseToken } from "@/lib/admin/activityTimelineFormat";
import { resolveCommunicationMessageEventTitle } from "@/lib/admin/activityMessageEventLabels";
import { buildOpportunityActivityStatusKeyLabels } from "@/lib/admin/opportunityActivityStatusKeyLabels";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ActivitySignalSeverity = "low" | "medium" | "high";

export type ActivitySignalRule = {
    key: string;
    entity_type: string;
    status_keys?: string[];
    threshold_minutes: number;
    severity: ActivitySignalSeverity;
    label: string;
};

export type WorkflowEventLike = {
    occurred_at: string;
    event_type: string | null;
    entity_id?: string | null;
    payload?: Record<string, unknown> | null;
};

export type ActivitySignalEntity = {
    id: string;
    status_key?: string | null;
};

export type ActivityStaleSignalVm = {
    key: string;
    label: string;
    severity: ActivitySignalSeverity;
    threshold_minutes: number;
};

export type ActivitySignalResult = {
    last_activity_at: string | null;
    last_activity_type: string | null;
    last_activity_summary: string | null;
    stale_signal: ActivityStaleSignalVm | null;
};

function normalizeRulesEntityType(raw: string): string {
    const s = raw.trim().toLowerCase();
    if (s === "opportunity") return "opportunities";
    return s;
}

/**
 * Read rules from work unit metadata, else department metadata.
 */
export function resolveActivitySignalRules(
    workUnitMetadata: unknown,
    departmentMetadata: unknown
): ActivitySignalRule[] | null {
    const fromWu = parseActivitySignalRulesFromMetadata(workUnitMetadata);
    if (fromWu?.length) return fromWu;
    return parseActivitySignalRulesFromMetadata(departmentMetadata);
}

export function parseActivitySignalRulesFromMetadata(metadata: unknown): ActivitySignalRule[] | null {
    if (!metadata || typeof metadata !== "object") return null;
    const root = metadata as Record<string, unknown>;
    const raw = root.activity_signal_rules;
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const out: ActivitySignalRule[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue;
        const o = entry as Record<string, unknown>;
        const key = typeof o.key === "string" ? o.key.trim() : "";
        const entity_type = typeof o.entity_type === "string" ? o.entity_type.trim() : "";
        const label = typeof o.label === "string" ? o.label.trim() : "";
        const thresholdRaw = o.threshold_minutes;
        const threshold_minutes =
            typeof thresholdRaw === "number" && Number.isFinite(thresholdRaw) ? thresholdRaw : NaN;
        const severity = o.severity;
        if (!key || !entity_type || !label) continue;
        if (!["low", "medium", "high"].includes(String(severity))) continue;
        if (!(threshold_minutes >= 0)) continue;

        let status_keys: string[] | undefined;
        if (Array.isArray(o.status_keys)) {
            const sk = o.status_keys
                .filter((x): x is string => typeof x === "string")
                .map((x) => x.trim())
                .filter(Boolean);
            if (sk.length) status_keys = sk;
        }
        out.push({
            key,
            entity_type,
            status_keys,
            threshold_minutes,
            severity: severity as ActivitySignalSeverity,
            label,
        });
    }
    return out.length ? out : null;
}

export function summarizeWorkflowEventForSignal(
    ev: WorkflowEventLike,
    statusKeyLabels?: Record<string, string>
): string {
    const t = (ev.event_type ?? "").trim();
    const p = (ev.payload && typeof ev.payload === "object" ? ev.payload : {}) as Record<string, unknown>;
    // Route ALL communication lifecycle events through the shared channel-aware labeller, so a newly
    // emitted one (delivered / failed) can never fall through to the raw key.
    const communicationTitle = resolveCommunicationMessageEventTitle(t, p);
    if (communicationTitle) return communicationTitle;
    if (t === "opportunity_status_changed" || t === "entity_status_changed" || t === "child_lifecycle_status_changed") {
        const oRaw =
            p.old_status_key != null
                ? String(p.old_status_key)
                : p.previous_status_key != null
                  ? String(p.previous_status_key)
                  : "—";
        const nRaw =
            p.new_status_key != null
                ? String(p.new_status_key)
                : p.next_status_key != null
                  ? String(p.next_status_key)
                  : "—";
        const o = oRaw === "—" ? oRaw : humanizeSnakeCaseToken(oRaw, statusKeyLabels);
        const n = nRaw === "—" ? nRaw : humanizeSnakeCaseToken(nRaw, statusKeyLabels);
        return t === "child_lifecycle_status_changed" ? `Child lifecycle: ${o} → ${n}` : `Status: ${o} → ${n}`;
    }
    if (t === "note_added") return "Note added";
    if (t === "action_executed") {
        const k = p.action_key != null ? String(p.action_key).trim() : "";
        return k ? humanizeSnakeCaseToken(k) : "Action taken";
    }
    if (t === "stage_work_outcome_recorded") {
        const outcomeLabel =
            (p.outcome_label != null && String(p.outcome_label).trim())
            || (p.outcome_key != null ? humanizeSnakeCaseToken(String(p.outcome_key).trim()) : "");
        return outcomeLabel ? `Outcome recorded: ${outcomeLabel}` : "Work outcome recorded";
    }
    if (
        t === "opportunity_enrollment_packet_created"
        || t === "opportunity_enrollment_packet_opened"
        || t === "opportunity_enrollment_packet_step_completed"
        || t === "opportunity_enrollment_packet_completed"
        || t === "opportunity_enrollment_packet_sent"
        || t === "opportunity_enrollment_packet_submitted_for_review"
        || t === "opportunity_enrollment_packet_review_decision"
        || t === "opportunity_waitlist_manual_adjustment_created"
        || t === "opportunity_waitlist_manual_adjustment_updated"
        || t === "opportunity_waitlist_manual_adjustment_released"
    ) {
        const s = p.summary != null && String(p.summary).trim() ? String(p.summary).trim() : "";
        if (s) return s;
    }
    // Never surface a raw event key to an operator — humanize whatever is left.
    return t ? humanizeSnakeCaseToken(t) : "Activity";
}

export function formatActivityRelativeShort(iso: string | null, nowMs: number): string | null {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    const diffMs = Math.max(0, nowMs - t);
    const s = Math.floor(diffMs / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    if (m > 0) return `${m}m ago`;
    return "just now";
}

/**
 * Derive last-activity fields and optional stale_signal from pre-fetched events + config rules.
 * Rules: first match in config order wins. No rules or no last_activity_at → no stale_signal.
 */
/** Operator-facing last-activity summary — resolves configured status labels, never raw keys. */
export function formatActivitySignalSummary(
    summary: string | null | undefined,
    statusKeyLabels?: Record<string, string>
): string | null {
    const s = (summary ?? "").trim();
    if (!s) return null;
    const statusLine = s.match(/^Status:\s*(.+?)\s*→\s*(.+)$/i);
    if (statusLine) {
        const o = humanizeSnakeCaseToken(statusLine[1]!.trim(), statusKeyLabels);
        const n = humanizeSnakeCaseToken(statusLine[2]!.trim(), statusKeyLabels);
        return `Status: ${o} → ${n}`;
    }
    const childLine = s.match(/^Child lifecycle:\s*(.+?)\s*→\s*(.+)$/i);
    if (childLine) {
        const o = humanizeSnakeCaseToken(childLine[1]!.trim(), statusKeyLabels);
        const n = humanizeSnakeCaseToken(childLine[2]!.trim(), statusKeyLabels);
        return `Child lifecycle: ${o} → ${n}`;
    }
    // Stored summaries sometimes keep the raw event_type — humanize bare snake_case tokens.
    if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(s)) {
        return humanizeSnakeCaseToken(s, statusKeyLabels);
    }
    return s;
}

/** Drawer header detail — display labels only, no category prefix (e.g. "Status:"). */
export function formatActivitySignalHeaderDetail(
    summary: string | null | undefined,
    statusKeyLabels?: Record<string, string>
): string | null {
    const formatted = formatActivitySignalSummary(summary, statusKeyLabels);
    if (!formatted) return null;
    const stripped = formatted.replace(/^(Status|Child lifecycle):\s*/i, "").trim();
    return stripped || null;
}

export function getActivitySignalForEntity(input: {
    events: WorkflowEventLike[];
    entity: ActivitySignalEntity;
    rules: ActivitySignalRule[] | null;
    nowMs?: number;
    statusKeyLabels?: Record<string, string>;
}): ActivitySignalResult {
    const nowMs = input.nowMs ?? Date.now();
    const sorted = [...input.events].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
    const latest = sorted[0] ?? null;
    const last_activity_at = latest?.occurred_at ?? null;
    const last_activity_type = latest?.event_type ?? null;
    const last_activity_summary = latest ? summarizeWorkflowEventForSignal(latest, input.statusKeyLabels) : null;

    const rules = input.rules;
    if (!rules?.length || !last_activity_at) {
        return { last_activity_at, last_activity_type, last_activity_summary, stale_signal: null };
    }

    const eventMs = Date.parse(last_activity_at);
    if (!Number.isFinite(eventMs)) {
        return { last_activity_at, last_activity_type, last_activity_summary, stale_signal: null };
    }
    const ageMinutes = (nowMs - eventMs) / 60_000;
    const sk = input.entity.status_key != null ? String(input.entity.status_key).trim() : "";

    for (const rule of rules) {
        if (normalizeRulesEntityType(rule.entity_type) !== "opportunities") continue;
        const allowStatuses = rule.status_keys;
        if (allowStatuses?.length) {
            if (!allowStatuses.includes(sk)) continue;
        }
        if (ageMinutes > rule.threshold_minutes) {
            return {
                last_activity_at,
                last_activity_type,
                last_activity_summary,
                stale_signal: {
                    key: rule.key,
                    label: rule.label,
                    severity: rule.severity,
                    threshold_minutes: rule.threshold_minutes,
                },
            };
        }
    }

    return { last_activity_at, last_activity_type, last_activity_summary, stale_signal: null };
}

function collapseLatestEventPerEntity(rows: WorkflowEventLike[]): Map<string, WorkflowEventLike> {
    const m = new Map<string, WorkflowEventLike>();
    for (const row of rows) {
        const id = row.entity_id != null ? String(row.entity_id).trim() : "";
        if (!id || m.has(id)) continue;
        m.set(id, row);
    }
    return m;
}

function mergeLatestMaps(a: Map<string, WorkflowEventLike>, b: Map<string, WorkflowEventLike>): void {
    for (const [id, row] of b) {
        const existing = a.get(id);
        if (!existing) {
            a.set(id, row);
            continue;
        }
        if (Date.parse(row.occurred_at) > Date.parse(existing.occurred_at)) {
            a.set(id, row);
        }
    }
}

/**
 * Batch-load latest workflow_event per opportunity id (org-scoped). Chunks to avoid oversized `in` lists.
 */
export async function fetchLatestWorkflowEventByOpportunityId(
    supabase: SupabaseClient,
    orgId: string,
    opportunityIds: string[]
): Promise<Map<string, WorkflowEventLike>> {
    const unique = [...new Set(opportunityIds.map((x) => String(x).trim()).filter(Boolean))];
    const latest = new Map<string, WorkflowEventLike>();
    if (!unique.length) return latest;

    const chunkSize = 80;
    for (let i = 0; i < unique.length; i += chunkSize) {
        const chunk = unique.slice(i, i + chunkSize);
        const limit = Math.min(6000, Math.max(200, chunk.length * 40));
        const { data, error } = await supabase
            .from("workflow_events")
            .select("occurred_at, event_type, entity_id, payload")
            .eq("org_id", orgId)
            .eq("entity_type", "opportunities")
            .in("entity_id", chunk)
            .order("occurred_at", { ascending: false })
            .limit(limit);

        if (error) {
            throw new Error(`fetchLatestWorkflowEventByOpportunityId: ${error.message}`);
        }
        const rows = (data ?? []) as WorkflowEventLike[];
        mergeLatestMaps(latest, collapseLatestEventPerEntity(rows));
    }
    return latest;
}

/**
 * Enrich opportunity queue rows with activity signal fields (returns new array).
 */
export async function enrichOpportunityQueueRowsWithActivitySignals<
    T extends { id: string; status_key?: string | null },
>(params: {
    supabase: SupabaseClient;
    orgId: string;
    rows: T[];
    workUnitMetadata: unknown;
    departmentMetadata: unknown | null;
    nowMs?: number;
    statusKeyLabels?: Record<string, string> | null;
}): Promise<
    Array<
        T & {
            last_activity_at: string | null;
            last_activity_type: string | null;
            last_activity_summary: string | null;
            stale_signal: ActivityStaleSignalVm | null;
        }
    >
> {
    const rules = resolveActivitySignalRules(params.workUnitMetadata, params.departmentMetadata);
    let statusKeyLabels = params.statusKeyLabels ?? null;
    if (!statusKeyLabels) {
        try {
            statusKeyLabels = await buildOpportunityActivityStatusKeyLabels(params.supabase, params.orgId);
        } catch {
            statusKeyLabels = null;
        }
    }
    const ids = params.rows.map((r) => r.id);
    let latestById = new Map<string, WorkflowEventLike>();
    try {
        latestById = await fetchLatestWorkflowEventByOpportunityId(params.supabase, params.orgId, ids);
    } catch {
        latestById = new Map();
    }

    const nowMs = params.nowMs ?? Date.now();

    return params.rows.map((row) => {
        const ev = latestById.get(row.id);
        const events: WorkflowEventLike[] = ev ? [ev] : [];
        const sig = getActivitySignalForEntity({
            events,
            entity: { id: row.id, status_key: row.status_key },
            rules,
            nowMs,
            statusKeyLabels: statusKeyLabels ?? undefined,
        });
        return {
            ...row,
            last_activity_at: sig.last_activity_at,
            last_activity_type: sig.last_activity_type,
            last_activity_summary: sig.last_activity_summary,
            stale_signal: sig.stale_signal,
        };
    });
}
