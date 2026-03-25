import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { createActionLink, buildShortActionLinkUrl } from "@/lib/actionLinks";
import { getPublicAppOrigin } from "@/lib/publicAppUrl";
import { DEFAULT_VENDOR_ASSIGNMENT_POLICY } from "@/lib/admin/vendorAssignmentPolicy";
import { getByPath, renderTemplate } from "@/lib/workflowTemplate";

/** Standard event payload shape; all entity keys optional. Do not crash if missing. */
export type WorkflowEventPayload = {
    event_type?: string;
    occurred_at?: string;
    org_id?: string | null;
    customer?: Record<string, unknown> | null;
    contact?: Record<string, unknown> | null;
    opportunity?: Record<string, unknown> | null;
    job?: Record<string, unknown> | null;
    schedule?: Record<string, unknown> | null;
    vendor?: Record<string, unknown> | null;
    [key: string]: unknown;
};

const CANONICAL_ENTITY_TYPES = ["customer", "contact", "job", "schedule", "opportunity", "vendor"] as const;

/** First 5 digits of a ZIP from arbitrary UI/JSON values. */
function zip5FromUnknown(v: unknown): string | null {
    if (v == null) return null;
    const digitsOnly = String(v).replace(/\D/g, "");
    const five = digitsOnly.slice(0, 5);
    return five.length >= 5 ? five : null;
}

/**
 * `metadata` on opportunity/job is usually jsonb object; occasionally a JSON string.
 */
function readMetadataRecord(entity: Record<string, unknown> | undefined): Record<string, unknown> | null {
    const m = entity?.metadata;
    if (m == null) return null;
    if (typeof m === "string") {
        try {
            const p = JSON.parse(m) as unknown;
            return p != null && typeof p === "object" ? (p as Record<string, unknown>) : null;
        } catch {
            return null;
        }
    }
    if (typeof m === "object") return m as Record<string, unknown>;
    return null;
}

/** Book-v2 stores service ZIP under metadata.quote_input.zip (not opportunity.postal_code). */
function zipFromQuoteInputMetadata(entity: Record<string, unknown> | undefined): string | null {
    const meta = readMetadataRecord(entity);
    if (!meta) return null;
    const qi = meta.quote_input;
    if (!qi || typeof qi !== "object") return null;
    const q = qi as Record<string, unknown>;
    return zip5FromUnknown(q.zip ?? q.postal_code ?? q.postal ?? q.zip_code);
}

/**
 * Resolve job zip from payload for vendor matching (service area / job_qualified_vendors).
 * Tries schedule, job, opportunity, book-v2 quote_input on metadata, customer.
 * Returns 5-digit zip or null.
 */
function getJobZip(payload: Record<string, unknown>): string | null {
    const schedule = payload.schedule as Record<string, unknown> | undefined;
    const job = payload.job as Record<string, unknown> | undefined;
    const opportunity = payload.opportunity as Record<string, unknown> | undefined;
    const customer = payload.customer as Record<string, unknown> | undefined;

    const candidates: unknown[] = [
        schedule?.postal_code,
        schedule?.location != null && typeof schedule.location === "object"
            ? (schedule.location as Record<string, unknown>).postal_code
            : null,
        job?.postal_code,
        opportunity?.postal_code,
        zipFromQuoteInputMetadata(opportunity),
        zipFromQuoteInputMetadata(job),
        getByPath(payload, "opportunity.metadata.quote_input.zip"),
        getByPath(payload, "opportunity.metadata.quote_input.postal_code"),
        getByPath(payload, "job.metadata.quote_input.zip"),
        getByPath(payload, "job.metadata.quote_input.postal_code"),
        getByPath(payload, "customer.metadata.quote_input.zip"),
        customer?.postal_code,
    ];

    for (const c of candidates) {
        const z = zip5FromUnknown(c);
        if (z) return z;
    }
    return null;
}

/** Map entity type (e.g. "schedule", "job") to real table name for update_entity and other actions. */
const ENTITY_TABLES: Record<string, string> = {
    job: "jobs",
    jobs: "jobs",
    opportunity: "opportunities",
    opportunities: "opportunities",
    contact: "contacts",
    contacts: "contacts",
    customer: "customers",
    customers: "customers",
    schedule: "schedules",
    schedules: "schedules",
    vendor: "vendors",
    vendors: "vendors",
    assignment: "assignments",
    assignments: "assignments",
};

type ConditionRow = {
    target_entity?: string | null;
    field_path?: string | null;
    field?: string | null;
    operator?: string | null;
    value?: unknown;
    value_jsonb?: unknown;
    enabled?: boolean | null;
};

/** Normalize legacy field_path: for vendor entity, strip "vendor." prefix so path is relative to payload.vendor. */
function normalizeFieldPathForEntity(entityType: string, path: string): string {
    const p = path.trim();
    if (!p) return p;
    if ((entityType === "vendor" || entityType === "vendors") && p.startsWith("vendor.")) {
        return p.slice("vendor.".length).trim() || p;
    }
    return p;
}

function getConditionActual(payload: Record<string, unknown>, defaultEntityType: string | null, c: ConditionRow): unknown {
    const entityType = (c.target_entity ?? defaultEntityType ?? "job").trim() || "job";
    const entity = payload[entityType];
    const rawPath = (c.field_path ?? c.field ?? "").trim();
    const path = normalizeFieldPathForEntity(entityType, rawPath);
    if (path && entity != null && typeof entity === "object") {
        return getByPath(entity, path);
    }
    if (c.field && typeof c.field === "string" && c.field.trim()) {
        return getByPath(payload, c.field.trim());
    }
    return undefined;
}

function normalizeConditionValue(v: unknown): string | number | boolean | null | unknown[] {
    if (v === undefined || v === null) return null;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
    if (Array.isArray(v)) return v;
    if (typeof v === "object" && v !== null && "value" in (v as object)) return normalizeConditionValue((v as { value: unknown }).value);
    return String(v);
}

function evaluateCondition(
    payload: Record<string, unknown>,
    defaultEntityType: string | null,
    c: ConditionRow
): boolean {
    if (c.enabled === false) return true;
    const actual = getConditionActual(payload, defaultEntityType, c);
    const rawVal = c.value_jsonb !== undefined && c.value_jsonb !== null ? c.value_jsonb : c.value;
    const val = normalizeConditionValue(rawVal);
    const operator = (c.operator ?? "eq").trim().toLowerCase();

    switch (operator) {
        case "is_null":
            return actual == null || actual === "";
        case "not_null":
            return actual != null && actual !== "";
        case "eq":
        case "equals":
            if (actual == null) return val === null || val === "" || val === "null";
            if (typeof val === "string" && (val === "" || val === "null")) return actual == null;
            return String(actual) === String(val) || (typeof actual === "number" && typeof val === "number" && actual === val);
        case "neq":
        case "not_equals":
            if (actual == null) return val !== null && val !== "" && val !== "null";
            return String(actual) !== String(val);
        case "contains": {
            if (Array.isArray(actual)) {
                const v = val != null ? String(val) : "";
                return actual.some((x) => String(x) === v);
            }
            return String(actual ?? "").includes(String(val ?? ""));
        }
        case "gt": {
            const n = Number(actual);
            const v = typeof val === "number" ? val : parseFloat(String(val));
            return !Number.isNaN(n) && !Number.isNaN(v) && n > v;
        }
        case "lt": {
            const n = Number(actual);
            const v = typeof val === "number" ? val : parseFloat(String(val));
            return !Number.isNaN(n) && !Number.isNaN(v) && n < v;
        }
        case "gte": {
            const n = Number(actual);
            const v = typeof val === "number" ? val : parseFloat(String(val));
            return !Number.isNaN(n) && !Number.isNaN(v) && n >= v;
        }
        case "lte": {
            const n = Number(actual);
            const v = typeof val === "number" ? val : parseFloat(String(val));
            return !Number.isNaN(n) && !Number.isNaN(v) && n <= v;
        }
        case "in": {
            const arr = Array.isArray(val) ? val : (typeof val === "string" ? [val] : []);
            const actualStr = actual != null ? String(actual) : "";
            return arr.some((x) => String(x) === actualStr);
        }
        case "not_in": {
            const arr = Array.isArray(val) ? val : (typeof val === "string" ? [val] : []);
            const actualStr = actual != null ? String(actual) : "";
            return !arr.some((x) => String(x) === actualStr);
        }
        case "exists":
            return actual != null && actual !== "";
        case "overlaps": {
            const actualArr = Array.isArray(actual) ? actual : [];
            const valArr = Array.isArray(val) ? val : (val != null ? [val] : []);
            return actualArr.some((a) => valArr.some((v) => String(a) === String(v)));
        }
        default:
            return String(actual) === String(val);
    }
}

function resolveId(value: unknown, eventPayload: Record<string, unknown>): string | null {
    if (value == null) return null;
    const s = typeof value === "string" ? renderTemplate(value, eventPayload) : String(value);
    return s.trim() || null;
}

/** Resolve a dot-path (e.g. "job.id") from event payload to a string value (e.g. UUID). Returns null if path missing or empty. */
function resolvePath(eventPayload: Record<string, unknown>, path: string | null | undefined): string | null {
    if (path == null || typeof path !== "string" || !path.trim()) return null;
    const v = getByPath(eventPayload, path.trim());
    return v != null && v !== "" ? String(v) : null;
}

/** Log-safe phone tail (Twilio SID is logged by the outbox worker, not here). */
function maskPhoneForLog(phone: string | null | undefined): string {
    if (phone == null || String(phone).trim() === "") return "(empty)";
    const d = String(phone).replace(/\D/g, "");
    if (d.length < 4) return "(redacted)";
    return `…${d.slice(-4)}`;
}

function isProbableUuid(s: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

/** E.164-ish for SMS: preserve leading +, default US +1 for 10-digit national. */
function normalizePhoneForSms(raw: string): string {
    const t = String(raw).trim();
    if (!t) return t;
    if (t.startsWith("+")) return t;
    const digits = t.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    if (digits.length >= 10) return `+${digits}`;
    return t;
}

function digitCount(s: string): number {
    return String(s).replace(/\D/g, "").length;
}

/**
 * Backend (Render) consumes queued rows in public.messages — not messages_outbox.
 * POST with INTERNAL_CRON_TOKEN to process the queue after workflows enqueue SMS.
 */
async function triggerInternalMessagesProcess(logs: string[]): Promise<void> {
    const url = (process.env.INTERNAL_MESSAGES_PROCESS_URL ?? "").trim();
    const token = (process.env.INTERNAL_CRON_TOKEN ?? "").trim();
    if (!url || !token) {
        logs.push(
            "send_message: INTERNAL_MESSAGES_PROCESS_URL or INTERNAL_CRON_TOKEN unset — SMS rows stay queued until backend POST /internal/messages/process runs (see backend/README_MESSAGES_SENDER.md)"
        );
        console.warn("[WORKFLOW_RUN] send_message: messages_process_env_missing");
        return;
    }
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-cron-token": token,
            },
            body: JSON.stringify({ limit: 25 }),
        });
        const text = await res.text().catch(() => "");
        logs.push(`send_message: messages_process_trigger status=${res.status} body=${text.slice(0, 240)}`);
        console.log("[WORKFLOW_RUN] send_message: messages_process_trigger", { status: res.status });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logs.push(`send_message: messages_process_trigger_error ${msg}`);
        console.error("[WORKFLOW_RUN] send_message: messages_process_trigger_error", e);
    }
}

/** Single resolved recipient for send_message (contact_id and/or to_phone/to_email). */
type ResolvedRecipient = {
    contact_id?: string | null;
    to_phone?: string | null;
    to_email?: string | null;
    /** Delivery is the existing public.messages row (Python sender); skip messages_outbox for this recipient. */
    useExistingQueuedMessageId?: string | null;
};

/** Recipient spec from send_message payload.recipients[]. */
type RecipientSpec = {
    type?: string;
    source?: string;
    path?: string;
    /** How to interpret payload path value: contact UUID vs phone vs email (default auto). */
    value_kind?: string | null;
    vendor_id_path?: string;
    role_in?: string[];
    max?: number;
    /** vendors_query: filter by status key (e.g. "active") */
    status_key?: string | null;
    /** vendors_query: vertical slug when match_job_vertical is false */
    vertical_slug?: string | null;
    /** vendors_query: use payload.job.vertical_id (default true) */
    match_job_vertical?: boolean;
    /** vendors_query: filter by job zip via service_area_zip_codes (default true) */
    match_job_zip?: boolean;
};

type VendorRowForOfferSms = {
    id: string;
    primary_contact_id?: string | null;
    primary_person_id?: string | null;
    phone?: string | null;
    service_area_zip_codes?: string[] | null;
};

/**
 * Active eligible vendors may have SMS via primary_contact_id, vendors.phone, or primary_person.phone (no contact row).
 */
async function appendEligibleVendorRecipients(
    supabase: SupabaseClient,
    list: VendorRowForOfferSms[],
    max: number,
    seen: Set<string>,
    out: ResolvedRecipient[],
    logPrefix: string,
    logs: string[]
): Promise<number> {
    const slice = list.slice(0, max);
    const personIds = [...new Set(slice.map((v) => v.primary_person_id).filter(Boolean))] as string[];
    const phoneByPersonId = new Map<string, string | null>();
    if (personIds.length > 0) {
        const { data: persons } = await supabase.from("persons").select("id, phone").in("id", personIds);
        for (const p of persons ?? []) {
            const row = p as { id: string; phone?: string | null };
            phoneByPersonId.set(row.id, row.phone ?? null);
        }
    }
    let n = 0;
    for (const v of slice) {
        if (v.primary_contact_id) {
            const key = `c:${v.primary_contact_id}`;
            if (!seen.has(key)) {
                seen.add(key);
                out.push({ contact_id: v.primary_contact_id });
                n++;
            }
            continue;
        }
        const direct = v.phone != null ? String(v.phone).trim() : "";
        const fromPerson =
            v.primary_person_id != null ? phoneByPersonId.get(v.primary_person_id) : undefined;
        const raw = direct || (fromPerson != null ? String(fromPerson).trim() : "");
        if (!raw) {
            logs.push(`${logPrefix}: vendor ${String(v.id).slice(0, 8)}… has no contact, vendor.phone, or person phone; skipping`);
            continue;
        }
        const norm = normalizePhoneForSms(raw);
        if (!norm) continue;
        const pkey = `p:${norm}`;
        if (seen.has(pkey)) continue;
        seen.add(pkey);
        out.push({ to_phone: norm });
        n++;
    }
    return n;
}

async function recipientsFromQueuedWorkflowMessages(
    supabase: SupabaseClient,
    workflowRunId: string,
    channel: string,
    logs: string[],
    preferredMessageId?: string | null
): Promise<ResolvedRecipient[]> {
    const ch = channel.toLowerCase();
    let q = supabase
        .from("messages")
        .select("id, to_value, contact_id, body")
        .eq("workflow_run_id", workflowRunId)
        .eq("direction", "outbound")
        .eq("status", "queued")
        .eq("channel", ch)
        .order("created_at", { ascending: false });
    if (preferredMessageId && String(preferredMessageId).trim()) {
        q = q.eq("id", String(preferredMessageId).trim());
    }
    const { data, error } = await q.limit(preferredMessageId ? 1 : 10);
    if (error) {
        logs.push(`send_message: fetch queued messages failed: ${error.message}`);
        return [];
    }
    const rows = (data ?? []) as { id: string; to_value: string | null; contact_id: string | null }[];
    const out: ResolvedRecipient[] = [];
    for (const row of rows) {
        const tv = row.to_value != null ? String(row.to_value).trim() : "";
        if (!tv) continue;
        if (ch === "sms") {
            out.push({
                contact_id: row.contact_id ?? null,
                to_phone: normalizePhoneForSms(tv),
                useExistingQueuedMessageId: row.id,
            });
            logs.push(
                `send_message: recipient from queued messages row id=${row.id} to_value=${maskPhoneForLog(tv)} (delivery via public.messages queue, not messages_outbox)`
            );
            break;
        }
        if (ch === "email") {
            out.push({
                contact_id: row.contact_id ?? null,
                to_email: tv,
                useExistingQueuedMessageId: row.id,
            });
            logs.push(`send_message: recipient from queued messages row id=${row.id} (email redacted)`);
            break;
        }
    }
    if (out.length === 0) {
        logs.push(
            "send_message: no matching queued outbound messages row for this workflow_run_id (after create_message?)"
        );
    }
    return out;
}

async function resolveRecipients(
    supabase: SupabaseClient,
    payload: Record<string, unknown>,
    recipients: RecipientSpec[],
    logs: string[],
    sendChannel: string
): Promise<ResolvedRecipient[]> {
    const out: ResolvedRecipient[] = [];
    const seen = new Set<string>();
    const ch = sendChannel.toLowerCase();

    for (const r of recipients ?? []) {
        const source = (r.source ?? "payload").toLowerCase();
        const type = (r.type ?? "").toLowerCase();

        if (source === "payload" && r.path) {
            const raw = getByPath(payload, r.path.trim());
            if (raw == null || raw === "") {
                logs.push(`send_message: payload path ${r.path} resolved to empty`);
                continue;
            }
            const s = String(raw).trim();
            const kind = (r.value_kind ?? "auto").toLowerCase();
            let resolved: ResolvedRecipient | null = null;
            if (kind === "contact_id" || (kind === "auto" && isProbableUuid(s))) {
                resolved = { contact_id: s };
                logs.push(`send_message: path ${r.path} → contact_id ${s.slice(0, 8)}…`);
            } else if (kind === "phone" || (kind === "auto" && ch === "sms" && digitCount(s) >= 10)) {
                resolved = { to_phone: normalizePhoneForSms(s) };
                logs.push(`send_message: path ${r.path} → to_phone ${maskPhoneForLog(resolved.to_phone ?? "")}`);
            } else if (kind === "email" || (kind === "auto" && s.includes("@"))) {
                resolved = { to_email: s };
                logs.push(`send_message: path ${r.path} → to_email (set)`);
            } else {
                logs.push(
                    `send_message: path ${r.path} could not map value (use value_kind: contact_id|phone|email or fix path/channel); channel=${ch}`
                );
            }
            if (resolved) {
                const key = resolved.contact_id
                    ? `c:${resolved.contact_id}`
                    : `p:${resolved.to_phone ?? ""}:e:${resolved.to_email ?? ""}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    out.push(resolved);
                }
            }
            continue;
        }

        if (source === "query" && (type === "contacts_by_vendor" || type === "vendor_contacts") && r.vendor_id_path) {
            const vendorId = getByPath(payload, r.vendor_id_path.trim());
            if (vendorId == null) {
                logs.push(`send_message: vendor_id_path ${r.vendor_id_path} empty`);
                continue;
            }
            const vid = String(vendorId);
            let list: { id: string; phone?: string | null; email?: string | null }[];
            const roleIn = r.role_in ?? ["primary"];
            if (roleIn.length > 0) {
                const { data } = await supabase
                    .from("contacts")
                    .select("id, phone, email")
                    .eq("vendor_id", vid)
                    .in("vendor_contact_role", roleIn);
                list = (data ?? []) as { id: string; phone?: string | null; email?: string | null }[];
            } else {
                const { data } = await supabase
                    .from("contacts")
                    .select("id, phone, email")
                    .eq("vendor_id", vid);
                list = (data ?? []) as { id: string; phone?: string | null; email?: string | null }[];
            }
            for (const c of list) {
                const key = `c:${c.id}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    out.push({ contact_id: c.id, to_phone: c.phone ?? undefined, to_email: c.email ?? undefined });
                }
            }
            continue;
        }

        if (source === "query" && type === "vendors_query") {
            const orgId = payload.org_id != null ? String(payload.org_id) : null;
            if (!orgId) {
                logs.push("send_message: vendors_query requires org_id in payload");
                continue;
            }
            const matchJobVertical = r.match_job_vertical !== false;
            const matchJobZip = r.match_job_zip !== false;
            const max = Math.max(1, Math.min(500, typeof r.max === "number" ? r.max : 25));

            let verticalId: string | null = null;
            if (matchJobVertical) {
                const job = payload.job as Record<string, unknown> | undefined;
                if (!job || typeof job !== "object") {
                    logs.push("send_message: vendors_query match_job_vertical requires job in payload");
                    continue;
                }
                verticalId = (job.vertical_id ?? (job as { verticalId?: string }).verticalId ?? (job as { _job_vertical?: { id?: string } })._job_vertical?.id) != null
                    ? String(job.vertical_id ?? (job as { verticalId?: string }).verticalId ?? (job as { _job_vertical?: { id?: string } })._job_vertical?.id)
                    : null;
                if (!verticalId) {
                    logs.push("send_message: vendors_query match_job_vertical requires job.vertical_id; skipping");
                    continue;
                }
            } else if (r.vertical_slug) {
                const { data: vert } = await supabase
                    .from("verticals")
                    .select("id")
                    .eq("slug", String(r.vertical_slug).trim())
                    .maybeSingle();
                verticalId = (vert as { id?: string } | null)?.id ?? null;
                if (!verticalId) {
                    logs.push(`send_message: vendors_query vertical_slug "${r.vertical_slug}" not found; skipping`);
                    continue;
                }
            } else {
                logs.push("send_message: vendors_query requires match_job_vertical or vertical_slug; skipping");
                continue;
            }

            const vendorStatusKey =
                r.status_key != null && String(r.status_key).trim() !== ""
                    ? String(r.status_key).trim()
                    : DEFAULT_VENDOR_ASSIGNMENT_POLICY.vendorStatusKey;
            const { data: statusRow } = await supabase
                .from("vendor_statuses")
                .select("id")
                .eq("key", vendorStatusKey)
                .maybeSingle();
            const statusId = (statusRow as { id?: string } | null)?.id ?? null;
            if (!statusId) {
                logs.push(`vendors_query: vendor status "${vendorStatusKey}" not found in vendor_statuses; skipping`);
                continue;
            }

            const { data: vvRows } = await supabase
                .from("vendor_verticals")
                .select("vendor_id")
                .eq("vertical_id", verticalId);
            const vendorIdsInVertical = ((vvRows ?? []) as { vendor_id: string }[]).map((row) => row.vendor_id);
            const vendorIdSet = new Set(vendorIdsInVertical);
            if (vendorIdSet.size === 0) {
                logs.push("vendors_query: no vendors in vertical");
                continue;
            }

            let vendorsQuery = supabase
                .from("vendors")
                .select("id, primary_contact_id, primary_person_id, phone, service_area_zip_codes")
                .eq("org_id", orgId)
                .in("id", Array.from(vendorIdSet))
                .limit(500);
            vendorsQuery = vendorsQuery.eq("vendor_status_id", statusId);
            const { data: vendorRows } = await vendorsQuery;
            let list = (vendorRows ?? []) as VendorRowForOfferSms[];

            const jobZip = matchJobZip ? getJobZip(payload) : null;
            if (matchJobZip && jobZip) {
                list = list.filter((v) => {
                    const zips = v.service_area_zip_codes;
                    if (!zips || !Array.isArray(zips)) return false;
                    return zips.some((z) => String(z).replace(/\D/g, "").slice(0, 5) === jobZip);
                });
            } else if (matchJobZip && !jobZip) {
                logs.push("vendors_query: match_job_zip true but no job zip in payload; using vertical-only");
            }

            const nVq = await appendEligibleVendorRecipients(supabase, list, max, seen, out, "vendors_query", logs);
            logs.push(`vendors_query: resolved count=${nVq}`);
            continue;
        }

        if (source === "resolver" && type === "job_qualified_vendors") {
            const job = payload.job as Record<string, unknown> | undefined;
            const jobId = job && typeof job === "object" && job.id != null ? String(job.id) : null;
            const max = typeof r.max === "number" ? r.max : 25;
            const orgId = payload.org_id != null ? String(payload.org_id) : null;
            if (!job || typeof job !== "object") {
                logs.push("send_message: job_qualified_vendors resolver requires job in payload");
                continue;
            }
            if (!orgId) {
                logs.push("send_message: job_qualified_vendors resolver requires org_id in payload");
                continue;
            }
            const jobVerticalId = (job.vertical_id ?? (job as { verticalId?: string; _job_vertical?: { id?: string } }).verticalId ?? (job as { _job_vertical?: { id?: string } })._job_vertical?.id) != null
                ? String(job.vertical_id ?? (job as { verticalId?: string; _job_vertical?: { id?: string } }).verticalId ?? (job as { _job_vertical?: { id?: string } })._job_vertical?.id)
                : null;
            if (!jobVerticalId) {
                console.warn("[WORKFLOW] job_qualified_vendors: missing job vertical", { jobId, orgId });
                logs.push("send_message: job_qualified_vendors requires job vertical; skipping (fail closed)");
                continue;
            }
            const jobZip = getJobZip(payload);
            if (!jobZip) {
                console.warn("[WORKFLOW] job_qualified_vendors: missing job zip; using vertical-only", { jobId, orgId, jobVerticalId });
                logs.push("send_message: job_qualified_vendors no jobZip; using vertical-only match");
            }
            const { data: vvRows } = await supabase
                .from("vendor_verticals")
                .select("vendor_id")
                .eq("vertical_id", jobVerticalId);
            const vendorIdsInVertical = (vvRows ?? []) as { vendor_id: string }[];
            const vendorIdSet = new Set(vendorIdsInVertical.map((row) => row.vendor_id));
            if (vendorIdSet.size === 0) {
                logs.push("job_qualified_vendors: no vendors in vertical");
                console.log("[WORKFLOW] job_qualified_vendors resolved", { jobId, orgId, jobZip: jobZip ?? null, jobVerticalId, count: 0 });
                continue;
            }
            const vendorStatusKey =
                r.status_key != null && String(r.status_key).trim() !== ""
                    ? String(r.status_key).trim()
                    : DEFAULT_VENDOR_ASSIGNMENT_POLICY.vendorStatusKey;
            const { data: statusRow } = await supabase.from("vendor_statuses").select("id").eq("key", vendorStatusKey).maybeSingle();
            const activeStatusId = (statusRow as { id?: string } | null)?.id ?? null;
            if (!activeStatusId) {
                logs.push(`job_qualified_vendors: vendor status "${vendorStatusKey}" not found; skipping`);
                continue;
            }
            let vendorsQuery = supabase
                .from("vendors")
                .select("id, primary_contact_id, primary_person_id, phone, service_area_zip_codes")
                .eq("org_id", orgId)
                .in("id", Array.from(vendorIdSet))
                .eq("vendor_status_id", activeStatusId)
                .limit(500);
            const { data: activeVendors } = await vendorsQuery;
            const rawVendorCount = (activeVendors ?? []).length;
            if (vendorIdSet.size > 0 && rawVendorCount === 0) {
                logs.push(
                    `job_qualified_vendors: ${vendorIdSet.size} vendor(s) in vendor_verticals for vertical but 0 rows after org_id + active status filter (check payload.org_id vs vendors.org_id and vendor_status for "${vendorStatusKey}")`
                );
            }
            let list = (activeVendors ?? []) as VendorRowForOfferSms[];
            if (jobZip) {
                const beforeZip = list.length;
                list = list.filter((v) => {
                    const zips = v.service_area_zip_codes;
                    if (!zips || !Array.isArray(zips)) return false;
                    return zips.some((z) => String(z).replace(/\D/g, "").slice(0, 5) === jobZip);
                });
                if (beforeZip > 0 && list.length === 0) {
                    logs.push(
                        `job_qualified_vendors: jobZip=${jobZip} excluded all ${beforeZip} active vendor(s) (service_area_zip_codes has no match)`
                    );
                }
            }
            const nJq = await appendEligibleVendorRecipients(supabase, list, max, seen, out, "job_qualified_vendors", logs);
            if (list.length > 0 && nJq === 0) {
                logs.push(
                    `job_qualified_vendors: ${list.length} vendor row(s) matched but 0 SMS recipients (need vendors.phone, persons.phone via primary_person_id, or primary_contact_id → contact.phone)`
                );
            }
            console.log("[WORKFLOW] job_qualified_vendors resolved", { jobId, orgId, jobZip: jobZip ?? null, jobVerticalId, count: nJq });
            logs.push(`job_qualified_vendors: resolved count=${nJq}`);
            continue;
        }

        logs.push(`send_message: unknown recipient type/source ${type}/${source}`);
    }

    return out;
}

async function ensureContactPhoneEmail(supabase: SupabaseClient, r: ResolvedRecipient): Promise<ResolvedRecipient> {
    if (r.contact_id && (!r.to_phone && !r.to_email)) {
        const { data: c } = await supabase.from("contacts").select("phone, email").eq("id", r.contact_id).single();
        if (c) {
            return { ...r, to_phone: (c as { phone?: string }).phone ?? null, to_email: (c as { email?: string }).email ?? null };
        }
        return r;
    }
    return r;
}

export interface WorkflowRunResult {
    ok: boolean;
    status: "completed" | "skipped" | "failed";
    workflow_run_id: string;
    error?: string;
    skip_reason?: string;
    logs?: string[];
}

/**
 * Enrich payload.vendor with vendor_status (id, key, label), vendor_vertical_ids, vendor_vertical_keys (slugs), vendor_vertical_names
 * so conditions like vendor_status.key and vendor_vertical_keys can be evaluated without extra DB in the condition loop.
 * Schema: vendor_statuses has id, key, label (no name); verticals has slug, name.
 */
async function enrichVendorPayload(supabase: SupabaseClient, payload: WorkflowEventPayload): Promise<void> {
    const vendor = payload.vendor;
    if (!vendor || typeof vendor !== "object") return;
    const vendorId = (vendor as { id?: string }).id;
    if (!vendorId) return;

    const statusId = (vendor as { vendor_status_id?: string | null }).vendor_status_id;
    if (statusId) {
        const { data: vs, error: _vsErr } = await supabase
            .from("vendor_statuses")
            .select("id, key, label")
            .eq("id", statusId)
            .maybeSingle();
        const row = vs as { id: string; key: string; label: string } | null;
        (vendor as Record<string, unknown>).vendor_status = row ? { id: row.id, key: row.key, label: row.label } : null;
    } else {
        (vendor as Record<string, unknown>).vendor_status = null;
    }

    const { data: vvRows } = await supabase
        .from("vendor_verticals")
        .select("vertical_id")
        .eq("vendor_id", vendorId);
    const verticalIds = ((vvRows ?? []) as { vertical_id: string }[]).map((r) => r.vertical_id);
    (vendor as Record<string, unknown>).vendor_vertical_ids = verticalIds;

    if (verticalIds.length > 0) {
        const { data: vertRows } = await supabase
            .from("verticals")
            .select("id, slug, name")
            .in("id", verticalIds);
        const keys: string[] = [];
        const names: string[] = [];
        for (const v of vertRows ?? []) {
            const r = v as { id: string; slug?: string | null; name?: string | null };
            keys.push(r.slug ?? r.id);
            names.push(r.name ?? r.id);
        }
        (vendor as Record<string, unknown>).vendor_vertical_keys = keys;
        (vendor as Record<string, unknown>).vendor_vertical_names = names;
    } else {
        (vendor as Record<string, unknown>).vendor_vertical_keys = [];
        (vendor as Record<string, unknown>).vendor_vertical_names = [];
    }
}

export type ExecuteWorkflowRunOptions = {
    event_id?: string | null;
    org_id?: string | null;
};

/** Canonical entity type for matching (plural form used in workflow_events). */
const ENTITY_TYPE_ALIASES: Record<string, string> = {
    job: "jobs",
    jobs: "jobs",
    schedule: "schedules",
    schedules: "schedules",
    opportunity: "opportunities",
    opportunities: "opportunities",
    contact: "contacts",
    contacts: "contacts",
    customer: "customers",
    vendor: "vendors",
    vendors: "vendors",
    customer_member: "customer_members",
    customer_members: "customer_members",
};

function normalizeEntityType(raw: string | null | undefined): string | null {
    if (raw == null || String(raw).trim() === "") return null;
    const key = String(raw).trim().toLowerCase();
    return ENTITY_TYPE_ALIASES[key] ?? key;
}

/**
 * Pre-run validation: entity_type, event_type, and for entity_status_changed required payload.
 * Returns a skip reason code (for logging/traceability) or null if validation passes.
 */
function validateWorkflowEventMatch(
    workflow: { entity_type?: string | null; event_type?: string | null },
    payload: Record<string, unknown>,
    isEventDriven: boolean
): string | null {
    const wfEntityType = normalizeEntityType(workflow.entity_type ?? null);
    const wfEventType = workflow.event_type != null ? String(workflow.event_type).trim() : null;
    const payloadEntityType = normalizeEntityType((payload.entity_type as string) ?? null);
    const payloadEventType = payload.event_type != null ? String(payload.event_type).trim() : null;

    if (isEventDriven) {
        if (!wfEntityType || wfEntityType === "") {
            return "invalid_trigger_config";
        }
        if (!payloadEntityType) {
            return "entity_type_mismatch";
        }
        if (wfEntityType !== payloadEntityType) {
            return "entity_type_mismatch";
        }
        if (wfEventType) {
            if (!payloadEventType || wfEventType !== payloadEventType) {
                return "event_type_mismatch";
            }
        }
        if (payloadEventType === "entity_status_changed") {
            const nested = payload.payload as Record<string, unknown> | null | undefined;
            const newStatusKey =
                (payload.new_status_key != null ? String(payload.new_status_key) : null) ||
                (nested?.new_status_key != null ? String(nested.new_status_key) : null);
            if (newStatusKey === "" || newStatusKey == null) {
                return "missing_status_key";
            }
        }
    } else {
        if (wfEntityType && payloadEntityType && wfEntityType !== payloadEntityType) {
            return "entity_type_mismatch";
        }
    }
    return null;
}

/**
 * Execute a workflow run: insert run row, evaluate conditions, execute actions.
 * Event payload should include event_type, occurred_at, org_id, and entity keys (customer, contact, job, schedule, opportunity, vendor) when available.
 * Optional options.event_id and options.org_id are set on the workflow_runs row when provided (e.g. from canonical event layer).
 */
export async function executeWorkflowRun(
    supabase: SupabaseClient,
    workflowId: string,
    eventPayload: Record<string, unknown>,
    options?: ExecuteWorkflowRunOptions
): Promise<WorkflowRunResult> {
    const payload: WorkflowEventPayload = {
        event_type: (eventPayload.event_type as string) ?? "",
        occurred_at: (eventPayload.occurred_at as string) ?? new Date().toISOString(),
        org_id: (eventPayload.org_id as string) ?? null,
        customer: (eventPayload.customer as Record<string, unknown>) ?? null,
        contact: (eventPayload.contact as Record<string, unknown>) ?? null,
        opportunity: (eventPayload.opportunity as Record<string, unknown>) ?? null,
        job: (eventPayload.job as Record<string, unknown>) ?? null,
        schedule: (eventPayload.schedule as Record<string, unknown>) ?? null,
        vendor: (eventPayload.vendor as Record<string, unknown>) ?? null,
        ...eventPayload,
    };

    await enrichVendorPayload(supabase, payload);

    const { data: workflow, error: wErr } = await supabase
        .from("workflows")
        .select("*")
        .eq("id", workflowId)
        .single();
    if (wErr || !workflow) {
        throw new Error("Workflow not found");
    }

    const isEventDriven = options?.event_id != null && String(options.event_id).trim() !== "";
    /** Many emitters put entity_type on the workflow_events row but omit it on the nested payload; validation requires it. */
    if (isEventDriven) {
        const pe = normalizeEntityType((payload.entity_type as string) ?? null);
        if (!pe) {
            const wfEt = normalizeEntityType((workflow as { entity_type?: string | null }).entity_type ?? null);
            if (wfEt) {
                (payload as Record<string, unknown>).entity_type = wfEt;
                console.log("[WORKFLOW_RUN] patched_missing_payload_entity_type", {
                    workflow_id: workflowId,
                    event_id: options?.event_id ?? null,
                    entity_type: wfEt,
                });
            }
        }
    }

    const skipReason = validateWorkflowEventMatch(
        workflow as { entity_type?: string | null; event_type?: string | null },
        payload as Record<string, unknown>,
        isEventDriven
    );

    if (skipReason) {
        console.log("[WORKFLOW_RUN] trigger_skip", {
            workflow_id: workflowId,
            event_id: options?.event_id ?? null,
            skip_reason: skipReason,
            payload_event_type: payload.event_type ?? null,
            payload_entity_type: payload.entity_type ?? null,
            workflow_entity_type: (workflow as { entity_type?: string | null }).entity_type ?? null,
            workflow_event_type: (workflow as { event_type?: string | null }).event_type ?? null,
        });
        if (!isEventDriven && skipReason === "entity_type_mismatch") {
            throw new Error("VALIDATION:entity_type_mismatch: Workflow entity type does not match payload entity type.");
        }
        const runId = crypto.randomUUID();
        const completedAt = new Date().toISOString();
        const runPayload = { ...payload, metadata: { ...((payload.metadata as Record<string, unknown>) ?? {}), skip_reason: skipReason } };
        const { error: runInsertErr } = await supabase.from("workflow_runs").insert({
            id: runId,
            workflow_id: workflowId,
            event_id: options?.event_id ?? null,
            org_id: options?.org_id ?? null,
            status: "skipped",
            error: null,
            started_at: completedAt,
            completed_at: completedAt,
            event_payload: runPayload,
        });
        if (runInsertErr) {
            throw new Error(runInsertErr.message);
        }
        if (typeof console !== "undefined" && console.debug) {
            console.debug("[workflowRun] skipped", { workflow_id: workflowId, skip_reason: skipReason, event_id: options?.event_id });
        }
        return {
            ok: true,
            status: "skipped",
            workflow_run_id: runId,
            skip_reason: skipReason,
        };
    }

    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const defaultEntityType = (workflow as { entity_type?: string }).entity_type ?? null;

    const { error: runInsertErr } = await supabase.from("workflow_runs").insert({
        id: runId,
        workflow_id: workflowId,
        event_id: options?.event_id ?? null,
        org_id: options?.org_id ?? null,
        status: "running",
        error: null,
        started_at: startedAt,
        completed_at: null,
        event_payload: payload,
    });
    if (runInsertErr) {
        throw new Error(runInsertErr.message);
    }

    console.log("[WORKFLOW_RUN] run_started", {
        workflow_id: workflowId,
        workflow_run_id: runId,
        event_id: options?.event_id ?? null,
        event_type: payload.event_type ?? null,
        entity_type: payload.entity_type ?? null,
        org_id: payload.org_id ?? null,
    });

    const { data: conditions } = await supabase
        .from("workflow_conditions")
        .select("target_entity, field_path, field, operator, value, value_jsonb, enabled")
        .eq("workflow_id", workflowId);

    const conditionRows = conditions ?? [];
    const conditionEval = conditionRows.map((c: ConditionRow) => {
        try {
            const actual = getConditionActual(payload, defaultEntityType, c);
            const pass = evaluateCondition(payload, defaultEntityType, c);
            return { c, pass, actual };
        } catch (err) {
            return { c, pass: false, actual: undefined as unknown, evalError: err instanceof Error ? err.message : String(err) };
        }
    });
    const allPass = conditionEval.every((r) => r.pass);

    if (!allPass) {
        const failed = conditionEval.filter((r) => !r.pass);
        console.log("[WORKFLOW_RUN] conditions_not_met", {
            workflow_id: workflowId,
            workflow_run_id: runId,
            default_entity_type: defaultEntityType,
            failed: failed.map((r) => ({
                target_entity: r.c.target_entity,
                field_path: r.c.field_path ?? r.c.field,
                operator: r.c.operator,
                expected: r.c.value_jsonb !== undefined && r.c.value_jsonb !== null ? r.c.value_jsonb : r.c.value,
                actual: r.actual,
                eval_error: "evalError" in r ? r.evalError : undefined,
            })),
        });
        const runPayloadWithReason = {
            ...payload,
            metadata: { ...((payload.metadata as Record<string, unknown>) ?? {}), skip_reason: "conditions_not_met" as const },
        };
        await supabase
            .from("workflow_runs")
            .update({
                status: "skipped",
                completed_at: new Date().toISOString(),
                event_payload: runPayloadWithReason,
            })
            .eq("id", runId);
        return { ok: true, status: "skipped", workflow_run_id: runId, skip_reason: "conditions_not_met" };
    }

    const { data: actions } = await supabase
        .from("workflow_actions")
        .select("id, action_order, action_type, target_entity, payload")
        .eq("workflow_id", workflowId)
        .order("action_order", { ascending: true });

    const logs: string[] = [];
    const orgId = payload.org_id ?? null;
    const { data: runRow } = await supabase.from("workflow_runs").select("org_id").eq("id", runId).maybeSingle();
    const run = runRow as { org_id?: string } | null;

    try {
        for (const action of actions ?? []) {
            const pl = (action.payload as Record<string, unknown>) ?? {};
            const actionTargetEntity = (action.target_entity ?? defaultEntityType ?? "job") as string;
            const table = ENTITY_TABLES[actionTargetEntity];

            const actionRunInputs = { payload: pl, target_entity: actionTargetEntity };
            const { data: actionRunInsert } = await supabase
                .from("workflow_action_runs")
                .insert({
                    org_id: orgId ?? undefined,
                    workflow_run_id: runId,
                    workflow_id: workflowId,
                    action_id: (action as { id?: string }).id ?? null,
                    action_order: action.action_order ?? 0,
                    action_type: action.action_type ?? "log",
                    status: "started",
                    started_at: new Date().toISOString(),
                    inputs: actionRunInputs,
                    outputs: {},
                    meta: {},
                })
                .select("id")
                .single();
            const actionRunId = (actionRunInsert as { id?: string } | null)?.id ?? null;

            let actionCompleted = false;
            let actionSkipped = false;
            let skipReason = "";
            let actionOutputs: Record<string, unknown> = {};

            try {
                switch (action.action_type) {
                case "create_message": {
                    const channel = pl.channel != null ? String(pl.channel) : "email";
                    const toValueRaw = pl.to_value != null ? String(pl.to_value) : "";
                    const bodyRaw = pl.body != null ? String(pl.body) : "";
                    let toValue = renderTemplate(toValueRaw, payload);
                    if (!toValue.trim() && (toValueRaw.includes("person.phone") || toValueRaw.includes("person.email"))) {
                        const fallbackPayload = { ...payload, person: (payload.person ?? payload.contact) ?? null };
                        const fallback = renderTemplate(toValueRaw, fallbackPayload);
                        if (fallback != null && String(fallback).trim()) toValue = String(fallback).trim();
                    }
                    const bodyText = renderTemplate(bodyRaw, payload);
                    const contactId = resolveId(pl.contact_id, payload);
                    const customerId = resolveId(pl.customer_id, payload);
                    const opportunityId = resolveId(pl.opportunity_id, payload);
                    const jobId = resolveId(pl.job_id, payload);
                    const { data: insertedMsg, error: msgErr } = await supabase
                        .from("messages")
                        .insert({
                            customer_id: customerId,
                            contact_id: contactId,
                            opportunity_id: opportunityId,
                            job_id: jobId,
                            channel,
                            direction: "outbound",
                            from_value: null,
                            to_value: toValue,
                            body: bodyText,
                            status: "queued",
                            sent_at: null,
                            provider: null,
                            provider_message_id: null,
                            metadata: {
                                workflow_id: workflowId,
                                workflow_run_id: runId,
                                action_type: "create_message",
                                action_order: action.action_order,
                            },
                            related_entity_type: null,
                            related_entity_id: null,
                            workflow_run_id: runId,
                            error: null,
                        })
                        .select("id")
                        .single();
                    if (msgErr) throw new Error(`create_message: ${msgErr.message}`);
                    const newMsgId = (insertedMsg as { id?: string } | null)?.id ?? null;
                    if (newMsgId) {
                        (payload as Record<string, unknown>)._last_workflow_message_id = newMsgId;
                    }
                    console.log("[WORKFLOW_RUN] create_message_queued", {
                        workflow_id: workflowId,
                        workflow_run_id: runId,
                        action_order: action.action_order,
                        channel,
                        message_id: newMsgId,
                        to_value_tail: maskPhoneForLog(toValue),
                        contact_id: contactId,
                        job_id: jobId,
                    });
                    actionOutputs = { queued: true, message_id: newMsgId };
                    actionCompleted = true;
                    break;
                }
                case "send_message": {
                    const channel = (pl.channel ?? "sms") as string;
                    const template = (pl.template ?? pl.body ?? "") as string;
                    const templateKey = (pl.template_key != null ? String(pl.template_key) : "") as string;
                    const recipients = (pl.recipients ?? []) as RecipientSpec[];
                    const bodyText = renderTemplate(template, payload);
                    const bodyHash = createHash("sha1").update(bodyText ?? "").digest("hex").slice(0, 16);
                    const outboxPayload: Record<string, unknown> = { body: bodyText };
                    const triggerProcess = pl.trigger_messages_process !== false;

                    console.log("[WORKFLOW_RUN] send_message_start", {
                        workflow_id: workflowId,
                        workflow_run_id: runId,
                        action_order: action.action_order,
                        channel,
                        recipients_spec_count: recipients.length,
                        recipient_specs: recipients.map((x) => ({
                            source: x.source,
                            type: x.type,
                            path: x.path,
                            value_kind: x.value_kind,
                        })),
                        last_workflow_message_id: (payload as { _last_workflow_message_id?: string })._last_workflow_message_id ?? null,
                    });

                    const recipientSpecs = Array.isArray(recipients) ? recipients : [];
                    const onlyVendorPayloadPaths =
                        recipientSpecs.length > 0 &&
                        recipientSpecs.every((spec) => {
                            const src = (spec.source ?? "payload").toLowerCase();
                            const path = typeof spec.path === "string" ? spec.path.trim().toLowerCase() : "";
                            return src === "payload" && path.startsWith("vendor.");
                        });

                    let resolved = await resolveRecipients(supabase, payload, recipientSpecs, logs, channel);
                    if (
                        resolved.length === 0 &&
                        channel.toLowerCase() === "sms" &&
                        String(payload.event_type ?? "") === "booking_confirmed" &&
                        (recipientSpecs.length === 0 || onlyVendorPayloadPaths)
                    ) {
                        logs.push(
                            "send_message: booking_confirmed vendor SMS — no recipients from payload; resolving job_qualified_vendors (active, vertical/zip rules)"
                        );
                        const jqMax =
                            typeof pl.job_qualified_vendor_max === "number" && pl.job_qualified_vendor_max > 0
                                ? Math.min(500, pl.job_qualified_vendor_max)
                                : 25;
                        resolved = await resolveRecipients(
                            supabase,
                            payload,
                            [{ source: "resolver", type: "job_qualified_vendors", max: jqMax }],
                            logs,
                            channel
                        );
                    }
                    if (resolved.length === 0) {
                        const preferredId = (payload as { _last_workflow_message_id?: string | null })._last_workflow_message_id ?? null;
                        logs.push(
                            "send_message: resolveRecipients returned 0 — trying public.messages rows for this workflow_run (create_message step)"
                        );
                        resolved = await recipientsFromQueuedWorkflowMessages(
                            supabase,
                            runId,
                            channel,
                            logs,
                            preferredId
                        );
                    }

                    const deduped: ResolvedRecipient[] = [];
                    const seenKey = new Set<string>();
                    for (const r of resolved) {
                        const key = r.contact_id ? `c:${r.contact_id}` : `p:${r.to_phone ?? ""}:e:${r.to_email ?? ""}`;
                        if (seenKey.has(key)) continue;
                        seenKey.add(key);
                        deduped.push(r);
                    }

                    console.log("[WORKFLOW_RUN] send_message_resolved", {
                        workflow_run_id: runId,
                        deduped_count: deduped.length,
                        summary: deduped.map((r) => ({
                            has_contact_id: !!r.contact_id,
                            to_phone_tail: maskPhoneForLog(r.to_phone),
                            has_email: !!(r.to_email && String(r.to_email).trim()),
                            use_existing_messages_row: !!r.useExistingQueuedMessageId,
                        })),
                    });

                    let outboxInserted = 0;
                    let usedQueuedMessageRows = 0;
                    const isSms = channel.toLowerCase() === "sms";

                    for (const r of deduped) {
                        if (r.useExistingQueuedMessageId) {
                            usedQueuedMessageRows++;
                            logs.push(
                                `send_message: skipping messages_outbox — using queued row id=${r.useExistingQueuedMessageId} (Twilio via backend process_queued_messages on public.messages)`
                            );
                            console.log("[WORKFLOW_RUN] send_message_skip_outbox_use_messages_row", {
                                message_id: r.useExistingQueuedMessageId,
                                to_phone_tail: maskPhoneForLog(r.to_phone),
                            });
                            continue;
                        }
                        const filled = await ensureContactPhoneEmail(supabase, r);
                        const toPhone = filled.to_phone ?? null;
                        const toEmail = filled.to_email ?? null;
                        const recipient = isSms ? (toPhone ?? "") : (toEmail ?? "");
                        if (!recipient.trim()) {
                            logs.push(
                                `send_message: skip outbox insert — no phone/email after contact lookup (contact_id=${filled.contact_id ?? "none"})`
                            );
                            console.warn("[WORKFLOW_RUN] send_message_empty_recipient_after_lookup", {
                                contact_id: filled.contact_id,
                            });
                            continue;
                        }
                        const dedupeKey = `${workflowId}:${channel}:${recipient}:${templateKey}:${bodyHash}`;
                        const row: Record<string, unknown> = {
                            org_id: orgId,
                            workflow_run_id: runId,
                            workflow_id: workflowId,
                            channel,
                            payload: outboxPayload,
                            status: "queued",
                            template_key: templateKey || null,
                            body: bodyText,
                            dedupe_key: dedupeKey,
                            to_contact_id: filled.contact_id ?? null,
                        };
                        if (isSms) {
                            row.to_phone = toPhone;
                            row.to_email = null;
                        } else {
                            row.to_email = toEmail;
                            row.to_phone = null;
                        }
                        const { error: outErr } = await supabase.from("messages_outbox").insert(row);
                        if (outErr) {
                            if (String(outErr).includes("duplicate")) {
                                logs.push(`send_message: skipped duplicate dedupe_key=${dedupeKey}`);
                                console.log("[WORKFLOW_RUN] send_message_outbox_duplicate", {
                                    workflow_id: workflowId,
                                    workflow_run_id: runId,
                                    dedupe_key: dedupeKey,
                                });
                            } else {
                                throw new Error(`send_message outbox: ${outErr.message}`);
                            }
                        } else {
                            outboxInserted++;
                            console.log("[WORKFLOW_RUN] messages_outbox_queued", {
                                workflow_id: workflowId,
                                workflow_run_id: runId,
                                action_order: action.action_order,
                                channel,
                                to_phone_tail: maskPhoneForLog(toPhone),
                                to_email_set: !!(toEmail && String(toEmail).trim()),
                                contact_id: filled.contact_id ?? null,
                                note: "messages_outbox is separate from public.messages Twilio pipeline; prefer create_message + process for SMS",
                            });
                        }
                    }
                    logs.push(
                        `send_message: resolved_recipients=${deduped.length} outbox_inserted=${outboxInserted} used_queued_messages_rows=${usedQueuedMessageRows}`
                    );

                    if (isSms && triggerProcess) {
                        logs.push("send_message: invoking INTERNAL_MESSAGES_PROCESS_URL to send queued public.messages via Twilio");
                        await triggerInternalMessagesProcess(logs);
                    }

                    actionOutputs = {
                        recipients: deduped.length,
                        outbox_queued: outboxInserted,
                        used_queued_messages: usedQueuedMessageRows,
                        messages_process_triggered: isSms && triggerProcess,
                    };
                    actionCompleted = true;
                    break;
                }
                case "update_entity": {
                    const entityType = (pl.entity_type ?? pl.target_entity ?? actionTargetEntity) as string;
                    const idPath = (pl.id_path != null ? String(pl.id_path) : pl.entity_id != null ? String(pl.entity_id) : "").trim();
                    const patch = pl.patch && typeof pl.patch === "object" ? (pl.patch as Record<string, unknown>) : {};
                    const table = ENTITY_TABLES[entityType] ?? entityType;
                    if (!table) {
                        logs.push(`update_entity: unknown entity_type ${entityType}, skipping`);
                        actionSkipped = true;
                        skipReason = `unknown entity_type ${entityType}`;
                        break;
                    }
                    const orgIdResolved = payload?.org_id ?? run?.org_id;
                    let entityId: string | null =
                        resolvePath(payload, pl.id_path as string | null | undefined) ??
                        resolveId(pl.entity_id, payload) ??
                        (payload?.entity_id != null && payload.entity_id !== "" ? String(payload.entity_id) : null) ??
                        (payload?.event_payload && typeof payload.event_payload === "object" && (payload.event_payload as Record<string, unknown>).entity_id != null && (payload.event_payload as Record<string, unknown>).entity_id !== ""
                            ? String((payload.event_payload as Record<string, unknown>).entity_id)
                            : null);

                    if (!orgIdResolved) {
                        throw new Error("update_entity: missing org_id");
                    }
                    if (!entityId) {
                        throw new Error("update_entity: missing entity_id");
                    }

                    if (process.env.NODE_ENV !== "production") {
                        console.log("[update_entity] debug", { target_entity: entityType, id_path: idPath || null, resolvedEntityId: entityId });
                    }

                    const patchResolved: Record<string, unknown> = {};
                    for (const k of Object.keys(patch)) {
                        const v = patch[k];
                        patchResolved[k] = typeof v === "string" ? renderTemplate(v, payload) : v;
                    }

                    const { data, error: updErr } = await supabase
                        .from(table)
                        .update(patchResolved)
                        .eq("id", entityId)
                        .eq("org_id", orgIdResolved)
                        .select("id")
                        .maybeSingle();

                    if (updErr) {
                        throw updErr;
                    }
                    if (!data) {
                        throw new Error(
                            `update_entity: 0 rows updated (${entityType} id=${entityId}, org_id=${orgIdResolved})`
                        );
                    }
                    actionOutputs = { updated: true };
                    actionCompleted = true;
                    break;
                }
                case "create_assignment": {
                    const jobId =
                        resolvePath(payload, pl.job_id_path as string | null | undefined) ??
                        resolveId(pl.job_id, payload) ??
                        (payload.job && typeof payload.job === "object" && (payload.job as { id?: unknown }).id != null ? String((payload.job as { id: unknown }).id) : null);
                    const scheduleId =
                        resolvePath(payload, pl.schedule_id_path as string | null | undefined) ??
                        resolveId(pl.schedule_id, payload) ??
                        (payload.schedule && typeof payload.schedule === "object" && (payload.schedule as { id?: unknown }).id != null ? String((payload.schedule as { id: unknown }).id) : null);
                    const vendorId =
                        resolvePath(payload, pl.vendor_id_path as string | null | undefined) ??
                        resolveId(pl.vendor_id, payload) ??
                        (payload.job && typeof payload.job === "object" && (payload.job as { assigned_vendor_id?: unknown }).assigned_vendor_id != null ? String((payload.job as { assigned_vendor_id: unknown }).assigned_vendor_id) : null);
                    if (!jobId) {
                        throw new Error("create_assignment: missing job id");
                    }
                    if (process.env.NODE_ENV !== "production") {
                        console.log("[create_assignment] resolved", { jobId, scheduleId, vendorId });
                    }
                    const statusKey = (pl.status_key != null ? String(pl.status_key) : "offered").trim() || "offered";
                    if (!scheduleId || !vendorId) {
                        logs.push(`create_assignment: missing schedule_id or vendor_id; skipping`);
                        actionSkipped = true;
                        skipReason = "missing schedule_id or vendor_id";
                        break;
                    }
                    const { data: statusRow } = await supabase.from("assignment_statuses").select("id").eq("key", statusKey).maybeSingle();
                    const statusId = (statusRow as { id?: string } | null)?.id ?? null;
                    if (!statusId) {
                        logs.push(`create_assignment: assignment_status key "${statusKey}" not found; skipping`);
                        actionSkipped = true;
                        skipReason = `assignment_status key "${statusKey}" not found`;
                        break;
                    }
                    let orgId: string | null = null;
                    const { data: jobRow } = await supabase.from("jobs").select("org_id").eq("id", jobId).maybeSingle();
                    orgId = (jobRow as { org_id?: string | null } | null)?.org_id ?? null;
                    if (!orgId && scheduleId) {
                        const { data: scheduleRow } = await supabase.from("schedules").select("org_id").eq("id", scheduleId).maybeSingle();
                        orgId = (scheduleRow as { org_id?: string | null } | null)?.org_id ?? null;
                    }
                    if (!orgId && payload.org_id != null) orgId = String(payload.org_id);
                    if (!orgId) {
                        throw new Error("create_assignment: could not resolve org_id (job, schedule, or payload)");
                    }
                    const { data: existing } = await supabase.from("assignments").select("id").eq("schedule_id", scheduleId).maybeSingle();
                    const now = new Date().toISOString();
                    if (existing?.id) {
                        const { error: uErr } = await supabase.from("assignments").update({ vendor_id: vendorId, assignment_status_id: statusId, updated_at: now }).eq("id", (existing as { id: string }).id);
                        if (uErr) throw new Error(`create_assignment update: ${uErr.message}`);
                        logs.push(`create_assignment: updated assignment for schedule ${scheduleId}`);
                    } else {
                        const { error: iErr } = await supabase.from("assignments").insert({
                            job_id: jobId,
                            vendor_id: vendorId,
                            schedule_id: scheduleId,
                            org_id: orgId,
                            assignment_status_id: statusId,
                            updated_at: now,
                        });
                        if (iErr) throw new Error(`create_assignment insert: ${iErr.message}`);
                        logs.push(`create_assignment: inserted assignment for schedule ${scheduleId}`);
                    }
                    actionOutputs = { schedule_id: scheduleId };
                    actionCompleted = true;
                    break;
                }
                case "apply_job_vendor_to_upcoming": {
                    const jobId = resolveId(pl.job_id ?? pl.job_id_path, payload) ?? (payload.job && typeof payload.job === "object" && (payload.job as { id?: unknown }).id != null ? String((payload.job as { id: unknown }).id) : null);
                    if (!jobId) {
                        logs.push(`apply_job_vendor_to_upcoming: missing job_id; skipping`);
                        actionSkipped = true;
                        skipReason = "missing job_id";
                        break;
                    }
                    const { data: jobRow } = await supabase.from("jobs").select("id, assigned_vendor_id, org_id").eq("id", jobId).single();
                    const vendorId = (jobRow as { assigned_vendor_id?: string | null } | null)?.assigned_vendor_id ?? null;
                    const jobOrgId = (jobRow as { org_id?: string | null } | null)?.org_id ?? null;
                    if (!vendorId) {
                        logs.push(`apply_job_vendor_to_upcoming: job has no assigned_vendor_id; skipping`);
                        actionSkipped = true;
                        skipReason = "job has no assigned_vendor_id";
                        break;
                    }
                    const now = new Date().toISOString();
                    const { data: offeredStatus } = await supabase.from("assignment_statuses").select("id").eq("key", "offered").maybeSingle();
                    const offeredStatusId = (offeredStatus as { id?: string } | null)?.id ?? null;
                    if (!offeredStatusId) {
                        logs.push(`apply_job_vendor_to_upcoming: assignment status 'offered' not found; skipping`);
                        actionSkipped = true;
                        skipReason = "assignment status 'offered' not found";
                        break;
                    }
                    const { data: upcomingSchedules } = await supabase.from("schedules").select("id, org_id").eq("job_id", jobId).is("canceled_at", null).gte("start_at", now);
                    const scheduleList = (upcomingSchedules ?? []) as { id: string; org_id?: string | null }[];
                    const scheduleIds = scheduleList.map((s) => s.id);
                    if (scheduleIds.length === 0) {
                        logs.push(`apply_job_vendor_to_upcoming: no upcoming schedules; skipping`);
                        actionSkipped = true;
                        skipReason = "no upcoming schedules";
                        break;
                    }
                    const { data: existingAssignments } = await supabase.from("assignments").select("id, schedule_id, assignment_status_id").in("schedule_id", scheduleIds);
                    const assignmentBySchedule = new Map((existingAssignments ?? []).map((a) => [(a as { schedule_id: string }).schedule_id, a as { id: string; assignment_status_id?: string | null }]));
                    const { data: statusRows } = await supabase.from("assignment_statuses").select("id, key").in("id", [...new Set((existingAssignments ?? []).map((a) => (a as { assignment_status_id?: string }).assignment_status_id).filter(Boolean))]);
                    const statusKeyById = new Map((statusRows ?? []).map((s) => [(s as { id: string }).id, (s as { key: string }).key]));
                    const payloadOrgId = payload.org_id != null ? String(payload.org_id) : null;
                    let created = 0;
                    let updated = 0;
                    for (const s of scheduleList) {
                        const sid = s.id;
                        const existing = assignmentBySchedule.get(sid);
                        if (!existing) {
                            const orgId = s.org_id ?? jobOrgId ?? payloadOrgId;
                            if (!orgId) {
                                logs.push(`apply_job_vendor_to_upcoming: could not resolve org_id for schedule ${sid}; skipping insert`);
                                continue;
                            }
                            const { error: iErr } = await supabase.from("assignments").insert({
                                schedule_id: sid,
                                job_id: jobId,
                                vendor_id: vendorId,
                                org_id: orgId,
                                assignment_status_id: offeredStatusId,
                                updated_at: now,
                            });
                            if (!iErr) created++;
                        } else if (existing.assignment_status_id && statusKeyById.get(existing.assignment_status_id) === "offered") {
                            const { error: uErr } = await supabase.from("assignments").update({ vendor_id: vendorId, updated_at: now }).eq("id", existing.id);
                            if (!uErr) updated++;
                        }
                    }
                    logs.push(`apply_job_vendor_to_upcoming: created=${created} updated=${updated}`);
                    actionOutputs = { created, updated };
                    actionCompleted = true;
                    break;
                }
                case "create_action_link": {
                    const outputKey = pl.output_key != null && typeof pl.output_key === "string" ? pl.output_key : "action_link_url";
                    const linkActionType = pl.action_type != null ? String(pl.action_type) : null;
                    const linkEntityType = pl.entity_type != null ? String(pl.entity_type) : null;
                    const entityIdResolved =
                        resolvePath(payload, pl.entity_id_path as string | null | undefined) ??
                        resolveId(pl.entity_id, payload) ??
                        (payload?.entity_id != null && payload.entity_id !== "" ? String(payload.entity_id) : null);
                    const expiresInMinutes = typeof pl.expires_in_minutes === "number" ? pl.expires_in_minutes : 120;
                    const linkOrgId = run?.org_id ?? payload?.org_id ?? null;
                    if (!linkActionType || !linkEntityType) {
                        logs.push("create_action_link: missing action_type or entity_type; skipping");
                        actionSkipped = true;
                        skipReason = "missing action_type or entity_type";
                        break;
                    }
                    if (!entityIdResolved) {
                        logs.push("create_action_link: could not resolve entity_id; skipping");
                        actionSkipped = true;
                        skipReason = "could not resolve entity_id";
                        break;
                    }
                    const result = await createActionLink(supabase, {
                        org_id: linkOrgId,
                        action_type: linkActionType,
                        entity_type: linkEntityType,
                        entity_id: entityIdResolved,
                        expires_in_minutes: expiresInMinutes,
                        metadata: (pl.metadata != null && typeof pl.metadata === "object" ? pl.metadata : null) as Record<string, unknown> | null,
                    });
                    const token = result?.token ?? null;
                    console.log("[WORKFLOW_RUN] create_action_link_result", {
                        workflow_id: workflowId,
                        workflow_run_id: runId,
                        action_order: action.action_order,
                        output_key: outputKey,
                        token_resolved: !!token,
                    });
                    if (token && result?.short_code) {
                        const origin = getPublicAppOrigin();
                        const shortUrl = buildShortActionLinkUrl(result.short_code);
                        const actionLinkUrl = shortUrl || (origin ? `${origin}/action/${token}` : `/action/${token}`);
                        (payload as Record<string, unknown>)[outputKey] = actionLinkUrl;
                        logs.push(`create_action_link: set ${outputKey}`);
                        actionOutputs = { output_key: outputKey };
                        actionCompleted = true;
                    } else {
                        logs.push("create_action_link: createActionLink returned null");
                        actionSkipped = true;
                        skipReason = "createActionLink returned null";
                    }
                    break;
                }
                case "log": {
                    const message = pl.message != null ? String(pl.message) : "";
                    logs.push(renderTemplate(message, payload));
                    actionOutputs = { message: renderTemplate(message, payload) };
                    actionCompleted = true;
                    break;
                }
                default:
                    logs.push(`Unknown action_type: ${action.action_type}`);
                    actionSkipped = true;
                    skipReason = `Unknown action_type: ${action.action_type}`;
                }
            } catch (actionErr: unknown) {
                const errMsg = actionErr instanceof Error ? actionErr.message : String(actionErr);
                if (actionRunId) {
                    await supabase
                        .from("workflow_action_runs")
                        .update({
                            status: "failed",
                            completed_at: new Date().toISOString(),
                            outputs: {},
                            error: errMsg,
                            meta: { stack: actionErr instanceof Error ? actionErr.stack : undefined },
                        })
                        .eq("id", actionRunId);
                }
                throw actionErr;
            }
            if (actionRunId && actionCompleted) {
                await supabase
                    .from("workflow_action_runs")
                    .update({
                        status: "completed",
                        completed_at: new Date().toISOString(),
                        outputs: actionOutputs,
                        error: null,
                    })
                    .eq("id", actionRunId);
            }
            if (actionRunId && actionSkipped) {
                await supabase
                    .from("workflow_action_runs")
                    .update({
                        status: "skipped",
                        completed_at: new Date().toISOString(),
                        outputs: {},
                        meta: { reason: skipReason },
                    })
                    .eq("id", actionRunId);
            }
        }

        const updateRun: { status: string; completed_at: string; error?: string | null; event_payload?: Record<string, unknown> } = {
            status: "completed",
            completed_at: new Date().toISOString(),
            error: null,
        };
        if (logs.length > 0) {
            updateRun.event_payload = { ...payload, metadata: { ...((payload.metadata as Record<string, unknown>) ?? {}), logs } };
        }
        await supabase.from("workflow_runs").update(updateRun).eq("id", runId);

        return {
            ok: true,
            status: "completed",
            workflow_run_id: runId,
            logs: logs.length > 0 ? logs : undefined,
        };
    } catch (actionErr: unknown) {
        const errMsg = actionErr instanceof Error ? actionErr.message : String(actionErr);
        await supabase
            .from("workflow_runs")
            .update({
                status: "failed",
                error: errMsg,
                completed_at: new Date().toISOString(),
            })
            .eq("id", runId);
        return {
            ok: false,
            status: "failed",
            workflow_run_id: runId,
            error: errMsg,
            logs: logs.length > 0 ? logs : undefined,
        };
    }
}
