import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { createActionLink, buildShortActionLinkUrl } from "@/lib/actionLinks";
import { getPublicAppOrigin } from "@/lib/publicAppUrl";
import { DEFAULT_VENDOR_ASSIGNMENT_POLICY } from "@/lib/admin/vendorAssignmentPolicy";
import { getByPath, renderActionLinkMetadata, renderTemplate } from "@/lib/workflowTemplate";

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
    /** Service location joined from schedule.location_id / job.location_id (e.g. postal_code for templates & zip matching). */
    location?: Record<string, unknown> | null;
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

    const rootLoc = payload.location as Record<string, unknown> | undefined;
    const candidates: unknown[] = [
        rootLoc?.postal_code,
        schedule?.postal_code,
        schedule?.location != null && typeof schedule.location === "object"
            ? (schedule.location as Record<string, unknown>).postal_code
            : null,
        job?.postal_code,
        job?.location != null && typeof job.location === "object"
            ? (job.location as Record<string, unknown>).postal_code
            : null,
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

/** Merge person phone/email onto `contact` so legacy templates using {{contact.phone}} use canonical person when present. */
function bridgeContactFromPersonForTemplates(payload: Record<string, unknown>): Record<string, unknown> {
    const person = payload.person;
    if (person == null || typeof person !== "object") return payload;
    const p = person as Record<string, unknown>;
    const contact = payload.contact;
    const c = contact != null && typeof contact === "object" ? (contact as Record<string, unknown>) : {};
    const mergedContact = {
        ...c,
        phone: p.phone ?? c.phone ?? null,
        email: p.email ?? c.email ?? null,
        first_name: p.first_name ?? c.first_name,
        last_name: p.last_name ?? c.last_name,
    };
    return { ...payload, contact: mergedContact };
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
 * When workflow_run_id is passed, the backend limits processing to rows for that run (FIFO within the run).
 */
async function triggerInternalMessagesProcess(
    logs: string[],
    opts?: { workflow_run_id?: string | null }
): Promise<void> {
    const url = (process.env.INTERNAL_MESSAGES_PROCESS_URL ?? "").trim();
    const token = (process.env.INTERNAL_CRON_TOKEN ?? "").trim();
    if (!url || !token) {
        logs.push(
            "send_message: INTERNAL_MESSAGES_PROCESS_URL or INTERNAL_CRON_TOKEN unset — SMS rows stay queued until backend POST /internal/messages/process runs (see backend/README_MESSAGES_SENDER.md)"
        );
        console.warn("[WORKFLOW_RUN] send_message: messages_process_env_missing");
        return;
    }
    const wr = opts?.workflow_run_id != null && String(opts.workflow_run_id).trim() ? String(opts.workflow_run_id).trim() : null;
    const reqBody: Record<string, unknown> = { limit: 25 };
    if (wr) reqBody.workflow_run_id = wr;
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-cron-token": token,
            },
            body: JSON.stringify(reqBody),
        });
        const text = await res.text().catch(() => "");
        logs.push(`send_message: messages_process_trigger status=${res.status} body=${text.slice(0, 480)}`);
        type ProcessJson = { processed?: number; message_ids?: string[]; sent?: number; failed?: number };
        let parsed: ProcessJson | null = null;
        try {
            parsed = JSON.parse(text) as ProcessJson;
        } catch {
            parsed = null;
        }
        console.log("[WORKFLOW_RUN] send_message: messages_process_trigger", {
            status: res.status,
            workflow_run_id_filter: wr,
            request_body: reqBody,
            response_message_ids: parsed?.message_ids ?? null,
            processed: parsed?.processed ?? null,
            sent: parsed?.sent ?? null,
            failed: parsed?.failed ?? null,
        });
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
    /** Vendors from job_qualified_vendors / vendors_query — used for per-vendor vendor_accept_job links in SMS. */
    vendor_id?: string | null;
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

/** Payload paths that target the job/customer contact — must not mix with job_qualified_vendors SMS. */
function isPayloadContactRecipientSpec(spec: RecipientSpec): boolean {
    if ((spec.source ?? "payload").toLowerCase() !== "payload") return false;
    const path = (spec.path ?? "").trim().toLowerCase();
    if (!path) return false;
    return path === "contact" || path.startsWith("contact.");
}

type VendorRowForOfferSms = {
    id: string;
    primary_contact_id?: string | null;
    primary_person_id?: string | null;
    phone?: string | null;
    service_area_zip_codes?: string[] | null;
};

/**
 * Resolve SMS/email recipients for vendor offer flows (job_qualified_vendors, vendors_query).
 * Phone order: vendors.phone → persons.phone (primary_person_id) → contacts.phone only when
 * contact.vendor_id matches the vendor. Never use primary_contact_id if it is not vendor-scoped.
 * Does not read payload.contact (callers must not merge payload contact specs for the same SMS; see send_message).
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
    const contactIds = [...new Set(slice.map((v) => v.primary_contact_id).filter(Boolean))] as string[];
    const contactById = new Map<string, { id: string; phone?: string | null; email?: string | null; vendor_id?: string | null }>();
    if (contactIds.length > 0) {
        const { data: contacts } = await supabase.from("contacts").select("id, phone, email, vendor_id").in("id", contactIds);
        for (const c of contacts ?? []) {
            const row = c as { id: string; phone?: string | null; email?: string | null; vendor_id?: string | null };
            contactById.set(row.id, row);
        }
    }

    let n = 0;
    for (const v of slice) {
        const vendorId = v.id;
        const shortVid = `${String(vendorId).slice(0, 8)}…`;

        const tryPushPhone = (raw: string, phoneSource: "vendor" | "person" | "vendor_contact", contactId?: string | null): boolean => {
            const norm = normalizePhoneForSms(raw);
            if (!norm) return false;
            const pkey = `p:${norm}`;
            if (seen.has(pkey)) return false;
            seen.add(pkey);
            if (contactId) {
                const ckey = `c:${contactId}`;
                if (!seen.has(ckey)) seen.add(ckey);
                out.push({ contact_id: contactId, to_phone: norm, vendor_id: vendorId });
            } else {
                out.push({ to_phone: norm, vendor_id: vendorId });
            }
            n++;
            logs.push(
                `${logPrefix}: vendor_id=${vendorId} phone_source=${phoneSource} to_phone=${maskPhoneForLog(norm)}` +
                    (contactId ? ` contact_id=${String(contactId).slice(0, 8)}…` : "")
            );
            console.log("[WORKFLOW] vendor_offer_recipient", {
                log_prefix: logPrefix,
                vendor_id: vendorId,
                phone_source: phoneSource,
                to_phone_tail: maskPhoneForLog(norm),
                contact_id: contactId ?? null,
            });
            return true;
        };

        // 1) vendors.phone (highest priority — never skip for a mis-linked primary_contact_id)
        const direct = v.phone != null ? String(v.phone).trim() : "";
        if (direct) {
            if (tryPushPhone(direct, "vendor")) continue;
            logs.push(`${logPrefix}: vendor_id=${vendorId} vendors.phone present but not a valid SMS number; trying person then vendor contact`);
        }

        // 2) persons.phone via primary_person_id
        const fromPerson =
            v.primary_person_id != null ? phoneByPersonId.get(v.primary_person_id) : undefined;
        const personRaw = fromPerson != null ? String(fromPerson).trim() : "";
        if (personRaw) {
            if (tryPushPhone(personRaw, "person")) continue;
            logs.push(`${logPrefix}: vendor_id=${vendorId} person phone present but not a valid SMS number; trying vendor contact`);
        }

        // 3) primary contact only if row is scoped to this vendor (never payload / customer contact)
        const pc = v.primary_contact_id;
        if (pc) {
            const row = contactById.get(pc);
            if (!row) {
                logs.push(
                    `${logPrefix}: vendor_id=${vendorId} primary_contact_id=${String(pc).slice(0, 8)}… not found in contacts; skipping`
                );
            } else if (row.vendor_id !== vendorId) {
                logs.push(
                    `${logPrefix}: vendor_id=${vendorId} primary_contact_id=${String(pc).slice(0, 8)}… ignored — contact.vendor_id=${row.vendor_id ?? "null"} (must equal vendor; no fallback to customer/payload contact)`
                );
            } else {
                const ph = row.phone != null ? String(row.phone).trim() : "";
                if (ph && tryPushPhone(ph, "vendor_contact", pc)) {
                    continue;
                }
                const em = row.email != null ? String(row.email).trim() : "";
                if (em) {
                    const ckey = `c:${pc}`;
                    if (!seen.has(ckey)) {
                        seen.add(ckey);
                        out.push({ contact_id: pc, to_email: em, vendor_id: vendorId });
                        n++;
                        logs.push(
                            `${logPrefix}: vendor_id=${vendorId} phone_source=vendor_contact_email contact_id=${String(pc).slice(0, 8)}… email_only=${!ph}`
                        );
                        console.log("[WORKFLOW] vendor_offer_recipient", {
                            log_prefix: logPrefix,
                            vendor_id: vendorId,
                            phone_source: "vendor_contact_email",
                            contact_id: pc,
                            email_only: !ph,
                        });
                    }
                    continue;
                }
            }
        }

        logs.push(
            `${logPrefix}: vendor_id=${vendorId} (${shortVid}) skipped — no usable vendor.phone, person.phone, or vendor-scoped contact phone/email`
        );
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
                    `job_qualified_vendors: ${list.length} vendor row(s) matched but 0 SMS recipients (need vendors.phone, persons.phone via primary_person_id, or primary_contact where contact.vendor_id = vendor.id — no payload.contact fallback)`
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

/**
 * One vendor_accept_job link per qualified vendor SMS: metadata.vendor_id set; template re-rendered with vendor_accept_url + vendor.id.
 */
async function createVendorOfferAcceptLinkAndBody(args: {
    supabase: SupabaseClient;
    template: string;
    payload: Record<string, unknown>;
    linkOrgId: string | null;
    vendorId: string;
    jobId: string;
    expiresInMinutes: number;
    defaultBody: string;
    defaultHash: string;
    logs: string[];
}): Promise<{ body: string; hash: string }> {
    const linkResult = await createActionLink(args.supabase, {
        org_id: args.linkOrgId,
        action_type: "vendor_accept_job",
        entity_type: "job",
        entity_id: args.jobId,
        expires_in_minutes: args.expiresInMinutes,
        metadata: { vendor_id: args.vendorId, source: "vendor_offer_sms" },
    });
    if (!linkResult?.token || !linkResult.short_code) {
        args.logs.push(
            `send_message: vendor_offer createActionLink failed for vendor_id=${String(args.vendorId).slice(0, 8)}…; using template without new link`
        );
        return { body: args.defaultBody, hash: args.defaultHash };
    }
    const shortUrl = buildShortActionLinkUrl(linkResult.short_code);
    const origin = getPublicAppOrigin();
    const actionLinkUrl =
        shortUrl || (origin ? `${origin}/action/${linkResult.token}` : `/action/${linkResult.token}`);
    const prevVendor =
        args.payload.vendor != null && typeof args.payload.vendor === "object"
            ? (args.payload.vendor as Record<string, unknown>)
            : {};
    const pv: Record<string, unknown> = {
        ...args.payload,
        vendor_accept_url: actionLinkUrl,
        vendor: { ...prevVendor, id: args.vendorId },
    };
    const body = renderTemplate(args.template, pv);
    const hash = createHash("sha1").update(body ?? "").digest("hex").slice(0, 16);
    args.logs.push(`send_message: vendor_offer action_link vendor_id=${String(args.vendorId).slice(0, 8)}…`);
    return { body, hash };
}

/** Twilio pipeline reads public.messages (queued); messages_outbox is audit/UI only. */
function buildPublicMessagesInsertForSendMessageSms(
    eventPayload: Record<string, unknown>,
    params: {
        workflowId: string;
        runId: string;
        actionOrder: number;
        bodyText: string;
        toPhone: string;
        contactId: string | null;
        usedJobQualifiedVendorsResolver: boolean;
        vendorOfferVendorId?: string | null;
    }
): Record<string, unknown> {
    const jobId = resolvePath(eventPayload, "job.id");
    const customerId = resolvePath(eventPayload, "customer.id");
    const opportunityId = resolvePath(eventPayload, "opportunity.id");
    return {
        customer_id: customerId,
        contact_id: params.contactId,
        opportunity_id: opportunityId,
        job_id: jobId,
        channel: "sms",
        direction: "outbound",
        from_value: null,
        to_value: params.toPhone,
        body: params.bodyText,
        status: "queued",
        sent_at: null,
        provider: null,
        provider_message_id: null,
        metadata: {
            workflow_id: params.workflowId,
            workflow_run_id: params.runId,
            action_type: "send_message",
            action_order: params.actionOrder,
            used_job_qualified_vendors_resolver: params.usedJobQualifiedVendorsResolver,
            ...(params.vendorOfferVendorId ? { vendor_offer_vendor_id: params.vendorOfferVendorId } : {}),
        },
        related_entity_type: null,
        related_entity_id: null,
        workflow_run_id: params.runId,
        error: null,
    };
}

export interface WorkflowRunResult {
    ok: boolean;
    status: "completed" | "skipped" | "failed";
    workflow_run_id: string;
    error?: string;
    skip_reason?: string;
    logs?: string[];
}

/** Ensure entity.metadata is a plain object when stored as jsonb string (rare). */
function normalizeStoredMetadata(ent: Record<string, unknown> | null | undefined): void {
    if (!ent) return;
    const m = readMetadataRecord(ent);
    if (m) ent.metadata = m;
}

/**
 * Load full job/schedule/opportunity/location rows into the workflow payload so send_message templates and
 * resolvers (e.g. job zip) see DB truth: location.postal_code, opportunity.metadata.service_frequency, etc.
 * Safe to call for any event; no-ops when ids are missing.
 */
async function enrichWorkflowEventPayloadEntities(supabase: SupabaseClient, payload: WorkflowEventPayload): Promise<void> {
    const p = payload as Record<string, unknown>;

    let schedule =
        p.schedule != null && typeof p.schedule === "object" ? (p.schedule as Record<string, unknown>) : undefined;
    const scheduleId = schedule?.id != null ? String(schedule.id).trim() : "";
    if (scheduleId) {
        const { data: sFull } = await supabase.from("schedules").select("*").eq("id", scheduleId).maybeSingle();
        if (sFull) {
            schedule = { ...schedule, ...(sFull as Record<string, unknown>) };
            p.schedule = schedule;
        }
    }
    if (schedule) normalizeStoredMetadata(schedule);

    let job = p.job != null && typeof p.job === "object" ? (p.job as Record<string, unknown>) : undefined;
    const jobIdFromSchedule = schedule?.job_id != null ? String(schedule.job_id).trim() : "";
    const jobIdFromJob = job?.id != null ? String(job.id).trim() : "";
    const jobId = jobIdFromJob || jobIdFromSchedule;

    if (jobId) {
        const { data: jFull } = await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle();
        if (jFull) {
            job = { ...(job ?? {}), ...(jFull as Record<string, unknown>) };
            p.job = job;
        }
    }
    if (job) normalizeStoredMetadata(job);

    const jobForOpp = p.job as Record<string, unknown> | undefined;
    const existingOpp =
        p.opportunity != null && typeof p.opportunity === "object"
            ? (p.opportunity as Record<string, unknown>)
            : undefined;
    const oppIdFromPayload = existingOpp?.id != null ? String(existingOpp.id).trim() : "";
    const oppIdFromJob =
        jobForOpp?.opportunity_id != null ? String(jobForOpp.opportunity_id).trim() : "";
    const oppId = oppIdFromPayload || oppIdFromJob;

    if (oppId) {
        const { data: oFull } = await supabase.from("opportunities").select("*").eq("id", oppId).maybeSingle();
        if (oFull) {
            p.opportunity = { ...(existingOpp ?? {}), ...(oFull as Record<string, unknown>) };
        }
    }
    if (p.opportunity != null && typeof p.opportunity === "object") {
        normalizeStoredMetadata(p.opportunity as Record<string, unknown>);
    }

    const sched = p.schedule as Record<string, unknown> | undefined;
    const j = p.job as Record<string, unknown> | undefined;
    const hasJobOrSchedule =
        (sched != null && typeof sched === "object") || (j != null && typeof j === "object");
    if (!hasJobOrSchedule) {
        return;
    }

    const locationId =
        (sched?.location_id != null ? String(sched.location_id).trim() : "") ||
        (j?.location_id != null ? String(j.location_id).trim() : "") ||
        "";

    if (!locationId) {
        return;
    }

    const { data: locRow } = await supabase.from("locations").select("*").eq("id", locationId).maybeSingle();
    if (!locRow) return;

    const loc = { ...(locRow as Record<string, unknown>) };
    normalizeStoredMetadata(loc);
    p.location = loc;

    if (j && typeof j === "object") {
        j.location = loc;
    }
    if (sched && typeof sched === "object") {
        sched.location = loc;
    }
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

    await enrichWorkflowEventPayloadEntities(supabase, payload);
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
                    const triggerProcess = pl.trigger_messages_process !== false;
                    const tplPayload = bridgeContactFromPersonForTemplates(payload as Record<string, unknown>);
                    const toValueRaw = pl.to_value != null ? String(pl.to_value) : "";
                    const bodyRaw = pl.body != null ? String(pl.body) : "";
                    let toValue = renderTemplate(toValueRaw, tplPayload);
                    if (!toValue.trim() && (toValueRaw.includes("person.phone") || toValueRaw.includes("person.email"))) {
                        const fallbackPayload = { ...tplPayload, person: (tplPayload.person ?? tplPayload.contact) ?? null };
                        const fallback = renderTemplate(toValueRaw, fallbackPayload);
                        if (fallback != null && String(fallback).trim()) toValue = String(fallback).trim();
                    }
                    const bodyText = renderTemplate(bodyRaw, tplPayload);
                    const contactId = resolveId(pl.contact_id, payload);
                    const customerId = resolveId(pl.customer_id, payload);
                    const opportunityId = resolveId(pl.opportunity_id, payload);
                    const jobId = resolveId(pl.job_id, payload);
                    const personIdForMeta = resolvePath(tplPayload, "person.id");
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
                                ...(personIdForMeta ? { person_id: personIdForMeta } : {}),
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
                        (payload as Record<string, unknown>)._last_workflow_message_channel = channel;
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
                    if (channel.toLowerCase() === "sms" && triggerProcess) {
                        logs.push(
                            `create_message: invoking INTERNAL_MESSAGES_PROCESS_URL for workflow_run_id=${runId} (SMS queued on public.messages)`
                        );
                        await triggerInternalMessagesProcess(logs, { workflow_run_id: runId });
                    }
                    actionOutputs = { queued: true, message_id: newMsgId, messages_process_triggered: channel.toLowerCase() === "sms" && triggerProcess };
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
                    const bookingConfirmed = String(payload.event_type ?? "") === "booking_confirmed";
                    const hasJobQualifiedSpec = recipientSpecs.some(
                        (spec) =>
                            (spec.source ?? "").toLowerCase() === "resolver" &&
                            (spec.type ?? "").toLowerCase() === "job_qualified_vendors"
                    );
                    const lastQueuedId = (payload as { _last_workflow_message_id?: string | null })._last_workflow_message_id;
                    const lastQueuedChannel = String(
                        (payload as { _last_workflow_message_channel?: string | null })._last_workflow_message_channel ?? ""
                    )
                        .trim()
                        .toLowerCase();
                    if (
                        bookingConfirmed &&
                        channel.toLowerCase() === "sms" &&
                        !hasJobQualifiedSpec &&
                        lastQueuedId != null &&
                        String(lastQueuedId).trim() !== "" &&
                        lastQueuedChannel === "sms"
                    ) {
                        logs.push(
                            "send_message: skipped on booking_confirmed — SMS already queued via create_message this run; vendor SMS must use recipients with source=resolver and type=job_qualified_vendors. Remove redundant send_message from customer workflows."
                        );
                        actionOutputs = {
                            skipped: true,
                            reason: "booking_confirmed_duplicate_sms_suppressed",
                            prior_create_message_id: String(lastQueuedId).trim(),
                        };
                        actionCompleted = true;
                        break;
                    }
                    let usedJobQualifiedVendorsResolver = hasJobQualifiedSpec;
                    let specsToResolve = recipientSpecs;
                    if (channel.toLowerCase() === "sms" && bookingConfirmed && hasJobQualifiedSpec) {
                        const stripped = recipientSpecs.filter((spec) => !isPayloadContactRecipientSpec(spec));
                        if (stripped.length !== recipientSpecs.length) {
                            logs.push(
                                "send_message: booking_confirmed + job_qualified_vendors — removed payload contact.* recipient specs so SMS is not sent to customer contact"
                            );
                        }
                        specsToResolve = stripped.length > 0 ? stripped : recipientSpecs;
                    }

                    let resolved = await resolveRecipients(supabase, payload, specsToResolve, logs, channel);
                    if (
                        resolved.length === 0 &&
                        channel.toLowerCase() === "sms" &&
                        bookingConfirmed &&
                        !hasJobQualifiedSpec
                    ) {
                        logs.push(
                            "send_message: booking_confirmed — no recipients resolved; job_qualified_vendors is NOT auto-injected (add an explicit recipients[] entry with source=resolver and type=job_qualified_vendors only on vendor-offer workflows)"
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

                    const defaultBodyPreview = (bodyText ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
                    console.log("[WORKFLOW_RUN] send_message_resolved", {
                        workflow_id: workflowId,
                        workflow_run_id: runId,
                        action_order: action.action_order,
                        deduped_count: deduped.length,
                        used_job_qualified_vendors_resolver: usedJobQualifiedVendorsResolver,
                        body_preview: defaultBodyPreview,
                        resolved_recipient_phones_masked: deduped.map((r) => maskPhoneForLog(r.to_phone)),
                        summary: deduped.map((r) => ({
                            has_contact_id: !!r.contact_id,
                            to_phone_tail: maskPhoneForLog(r.to_phone),
                            has_email: !!(r.to_email && String(r.to_email).trim()),
                            use_existing_messages_row: !!r.useExistingQueuedMessageId,
                            vendor_id_tail: r.vendor_id ? `${String(r.vendor_id).slice(0, 8)}…` : null,
                        })),
                    });

                    let outboxInserted = 0;
                    let usedQueuedMessageRows = 0;
                    const publicMessageIds: string[] = [];
                    const isSms = channel.toLowerCase() === "sms";
                    const jobIdForVendorOffer = resolvePath(payload as Record<string, unknown>, "job.id");
                    const linkOrgIdForVendorOffer = run?.org_id ?? (payload.org_id != null ? String(payload.org_id) : null);
                    const vendorOfferExpires =
                        typeof pl.vendor_accept_link_expires_in_minutes === "number"
                            ? Math.max(1, Math.min(10_080, pl.vendor_accept_link_expires_in_minutes))
                            : 120;

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

                        let bodyForRecipient = bodyText;
                        let hashForRecipient = bodyHash;
                        const vid = filled.vendor_id != null ? String(filled.vendor_id).trim() : "";
                        if (isSms && toPhone && vid && jobIdForVendorOffer) {
                            const built = await createVendorOfferAcceptLinkAndBody({
                                supabase,
                                template,
                                payload: payload as Record<string, unknown>,
                                linkOrgId: linkOrgIdForVendorOffer,
                                vendorId: vid,
                                jobId: jobIdForVendorOffer,
                                expiresInMinutes: vendorOfferExpires,
                                defaultBody: bodyText,
                                defaultHash: bodyHash,
                                logs,
                            });
                            bodyForRecipient = built.body;
                            hashForRecipient = built.hash;
                        }

                        const bodyPreviewRow = (bodyForRecipient ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
                        if (isSms && toPhone) {
                            const msgRow = buildPublicMessagesInsertForSendMessageSms(payload as Record<string, unknown>, {
                                workflowId,
                                runId,
                                actionOrder: action.action_order ?? 0,
                                bodyText: bodyForRecipient,
                                toPhone,
                                contactId: filled.contact_id ?? null,
                                usedJobQualifiedVendorsResolver,
                                vendorOfferVendorId: vid || null,
                            });
                            const { data: pubIns, error: pubErr } = await supabase.from("messages").insert(msgRow).select("id").single();
                            if (pubErr) {
                                throw new Error(`send_message public.messages: ${pubErr.message}`);
                            }
                            const newPubId = (pubIns as { id?: string } | null)?.id ?? null;
                            if (newPubId) publicMessageIds.push(newPubId);
                            logs.push(
                                `send_message: public.messages queued id=${newPubId ?? "?"} workflow_run_id=${runId} to_value=${maskPhoneForLog(toPhone)} body_preview=${bodyPreviewRow.slice(0, 100)}`
                            );
                            console.log("[WORKFLOW_RUN] send_message_public_messages_queued", {
                                workflow_id: workflowId,
                                workflow_run_id: runId,
                                action_order: action.action_order,
                                message_id: newPubId,
                                to_phone_tail: maskPhoneForLog(toPhone),
                                body_preview: bodyPreviewRow,
                                used_job_qualified_vendors_resolver: usedJobQualifiedVendorsResolver,
                                vendor_offer_vendor_id: vid || null,
                            });
                        }
                        const dedupeKey = `${workflowId}:${channel}:${recipient}:${templateKey}:${hashForRecipient}`;
                        const row: Record<string, unknown> = {
                            org_id: orgId,
                            workflow_run_id: runId,
                            workflow_id: workflowId,
                            channel,
                            payload: { body: bodyForRecipient },
                            status: "queued",
                            template_key: templateKey || null,
                            body: bodyForRecipient,
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
                                note: "messages_outbox is admin audit; Twilio uses public.messages",
                            });
                        }
                    }
                    logs.push(
                        `send_message: resolved_recipients=${deduped.length} public_messages_queued=${publicMessageIds.length} ids=${publicMessageIds.join(",")} outbox_inserted=${outboxInserted} used_queued_messages_rows=${usedQueuedMessageRows}`
                    );
                    console.log("[WORKFLOW_RUN] send_message_queue_summary", {
                        workflow_id: workflowId,
                        workflow_run_id: runId,
                        action_order: action.action_order,
                        public_message_ids: publicMessageIds,
                        outbox_inserted: outboxInserted,
                        used_queued_messages_rows: usedQueuedMessageRows,
                        body_preview: defaultBodyPreview,
                    });

                    if (isSms && triggerProcess) {
                        logs.push(
                            `send_message: invoking INTERNAL_MESSAGES_PROCESS_URL for workflow_run_id=${runId} (processes public.messages for this run only when backend supports filter)`
                        );
                        await triggerInternalMessagesProcess(logs, { workflow_run_id: runId });
                    }

                    actionOutputs = {
                        recipients: deduped.length,
                        public_message_ids: publicMessageIds,
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
                    const tplPayload = payload as Record<string, unknown>;
                    let rawLinkMeta: Record<string, unknown> = {};
                    if (typeof pl.metadata === "string") {
                        try {
                            const parsed = JSON.parse(pl.metadata) as unknown;
                            if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
                                rawLinkMeta = parsed as Record<string, unknown>;
                            }
                        } catch {
                            rawLinkMeta = {};
                        }
                    } else if (pl.metadata != null && typeof pl.metadata === "object" && !Array.isArray(pl.metadata)) {
                        rawLinkMeta = pl.metadata as Record<string, unknown>;
                    }
                    const resolvedLinkMeta = renderActionLinkMetadata(rawLinkMeta, tplPayload);
                    const result = await createActionLink(supabase, {
                        org_id: linkOrgId,
                        action_type: linkActionType,
                        entity_type: linkEntityType,
                        entity_id: entityIdResolved,
                        expires_in_minutes: expiresInMinutes,
                        metadata: resolvedLinkMeta,
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
