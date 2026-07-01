/**
 * Schedule “snapshot” — single composed view of operational schedule data for admin UI.
 * Lives under record_layouts / overview_rows: layout stays config-driven; values come from here.
 */

function trimStr(v: unknown): string {
    if (v == null) return "";
    return String(v).trim();
}

/** Structured presentation payload attached to hydrated schedule records (`_schedule_snapshot`). */
export type ScheduleSnapshot = {
    customer: {
        name: string;
        email: string | null;
        phone: string | null;
        /** When true, email column should show "—" because it duplicates the customer name line. */
        emailSuppressedAsDuplicate: boolean;
    };
    vendor: { name: string | null };
    location: { address: string | null };
    service: { label: string | null; price: number | null };
    timing: { start_at: string | null; end_at: string | null; timezone: string | null };
};

/** Explicit inputs for {@link computeScheduleSnapshot} (mirrors hydrated GET shape). */
export type ScheduleSnapshotInput = {
    schedule: {
        start_at?: unknown;
        end_at?: unknown;
        timezone?: unknown;
        service_type?: unknown;
        price_cents?: unknown;
    };
    job: {
        service_key?: unknown;
        job_type?: unknown;
        gross_price_cents?: unknown;
        display_total_cents?: unknown;
        estimated_total_cents?: unknown;
    } | null;
    customer: { name?: unknown } | null;
    location: {
        preferredLabel?: unknown;
        address1?: unknown;
        city?: unknown;
        state?: unknown;
        postal_code?: unknown;
    } | null;
    vendor: { name?: unknown } | null;
    contact: {
        first_name?: unknown;
        last_name?: unknown;
        email?: unknown;
        phone?: unknown;
    } | null;
    /** Combined person name from hydration (persons row), when present. */
    primaryPersonName: string | null;
    /** Contact display name when distinct from person row (contacts hydration). */
    primaryContactDisplayName: string | null;
};

function resolveCustomerNameLine(input: ScheduleSnapshotInput): string {
    const fromCust = trimStr(input.customer?.name);
    if (fromCust) return fromCust;

    const pn = trimStr(input.primaryPersonName);
    if (pn) return pn;

    const pc = trimStr(input.primaryContactDisplayName);
    if (pc) return pc;

    const ct = input.contact;
    if (ct) {
        const nm = [trimStr(ct.first_name), trimStr(ct.last_name)].filter(Boolean).join(" ").trim();
        if (nm) return nm;
        const em = trimStr(ct.email);
        if (em) return em;
    }
    return "";
}

function resolveLocationAddress(input: ScheduleSnapshotInput): string | null {
    const top = trimStr(input.location?.preferredLabel);
    if (top) return top;
    const loc = input.location;
    if (!loc) return null;
    const line = [loc.address1, loc.city, loc.state, loc.postal_code].map(trimStr).filter(Boolean).join(", ");
    return line || null;
}

function resolveServiceLabel(schedule: ScheduleSnapshotInput["schedule"], job: ScheduleSnapshotInput["job"]): string | null {
    const direct = trimStr(schedule.service_type);
    if (direct) return direct.replace(/_/g, " ");
    const j = job;
    if (!j) return null;
    const sk = trimStr(j.service_key ?? j.job_type);
    if (sk) return sk.replace(/_/g, " ");
    return null;
}

function resolvePriceCents(schedule: ScheduleSnapshotInput["schedule"], job: ScheduleSnapshotInput["job"]): number | null {
    const raw = schedule.price_cents;
    if (raw != null && raw !== "") {
        const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
        if (Number.isFinite(n)) return n;
    }
    if (!job) return null;
    const jn =
        (typeof job.display_total_cents === "number" ? job.display_total_cents : null) ??
        (typeof job.gross_price_cents === "number" ? job.gross_price_cents : null) ??
        (typeof job.estimated_total_cents === "number" ? job.estimated_total_cents : null);
    if (jn != null && Number.isFinite(Number(jn))) return Number(jn);
    return null;
}

/**
 * Canonical composition from known schedule-related rows. Prefer this over ad-hoc fallbacks in UI.
 */
export function computeScheduleSnapshot(input: ScheduleSnapshotInput): ScheduleSnapshot {
    const nameLine = resolveCustomerNameLine(input);
    const emailRaw = trimStr(input.contact?.email) || null;
    const phoneRaw = trimStr(input.contact?.phone) || null;
    const emailSuppressedAsDuplicate =
        Boolean(emailRaw && nameLine && emailRaw.toLowerCase() === nameLine.toLowerCase());

    const sched = input.schedule;
    const job = input.job;

    return {
        customer: {
            name: nameLine,
            email: emailRaw,
            phone: phoneRaw,
            emailSuppressedAsDuplicate,
        },
        vendor: { name: trimStr(input.vendor?.name) || null },
        location: { address: resolveLocationAddress(input) },
        service: {
            label: resolveServiceLabel(sched, job),
            price: resolvePriceCents(sched, job),
        },
        timing: {
            start_at: sched.start_at != null && String(sched.start_at).trim() !== "" ? String(sched.start_at) : null,
            end_at: sched.end_at != null && String(sched.end_at).trim() !== "" ? String(sched.end_at) : null,
            timezone: sched.timezone != null && String(sched.timezone).trim() !== "" ? String(sched.timezone) : null,
        },
    };
}

/**
 * Build snapshot inputs from GET `/api/admin/entity/schedules/:id` payload (including `_customer`, `_job`, etc.).
 */
export function computeScheduleSnapshotFromHydratedRecord(record: Record<string, unknown>): ScheduleSnapshot {
    const job = (record._job as ScheduleSnapshotInput["job"]) ?? null;
    const customer = (record._customer as ScheduleSnapshotInput["customer"]) ?? null;
    const locRow = record._location as Record<string, unknown> | null | undefined;
    const location: ScheduleSnapshotInput["location"] = locRow
        ? {
              preferredLabel: record._location_label ?? record._location_name,
              address1: locRow.address1,
              city: locRow.city,
              state: locRow.state,
              postal_code: locRow.postal_code,
          }
        : {
              preferredLabel: record._location_label ?? record._location_name,
              address1: null,
              city: null,
              state: null,
              postal_code: null,
          };

    const vStub = record._vendor as { name?: unknown } | null;
    const jvStub = record._job_assigned_vendor as { name?: unknown } | null;
    const vendorName =
        trimStr(record._assigned_vendor_name) ||
        trimStr(vStub?.name) ||
        trimStr(jvStub?.name) ||
        null;

    return computeScheduleSnapshot({
        schedule: {
            start_at: record.start_at,
            end_at: record.end_at,
            timezone: record.timezone,
            service_type: record.service_type,
            price_cents: record.price_cents,
        },
        job,
        customer,
        location,
        vendor: vendorName ? { name: vendorName } : null,
        contact: (record._contact as ScheduleSnapshotInput["contact"]) ?? null,
        primaryPersonName: trimStr(record._primary_person_name) || null,
        primaryContactDisplayName:
            trimStr(record._primary_contact_name ?? record._contact_name) || null,
    });
}

/** Omit email cell in overview rows when there is nothing useful to show (empty or duplicate of account line). */
export function shouldShowScheduleContactEmailRow(record: Record<string, unknown>): boolean {
    const s = getScheduleSnapshot(record);
    if (s.customer.emailSuppressedAsDuplicate) return false;
    const em = trimStr(s.customer.email);
    return em.length > 0;
}

/** Prefer server-attached `_schedule_snapshot`; otherwise compute (offline / older payloads). */
export function getScheduleSnapshot(record: Record<string, unknown>): ScheduleSnapshot {
    const existing = record._schedule_snapshot as ScheduleSnapshot | undefined;
    if (existing && typeof existing === "object" && existing.customer && existing.service) {
        return existing;
    }
    return computeScheduleSnapshotFromHydratedRecord(record);
}

/**
 * Single mapping from layout field keys → display value for read mode.
 * Returns `undefined` when this key is not driven by the snapshot (caller uses other fallbacks).
 */
export function scheduleOverviewValueFromSnapshot(snap: ScheduleSnapshot, fieldKey: string): unknown {
    const k = fieldKey.trim();
    switch (k) {
        case "_customer_name":
            return snap.customer.name || undefined;
        case "_contact_email":
            return snap.customer.emailSuppressedAsDuplicate ? "—" : snap.customer.email ?? undefined;
        case "_contact_phone":
            return snap.customer.phone ?? undefined;
        case "service_type":
            return snap.service.label ?? undefined;
        case "price_cents":
            return snap.service.price === null ? undefined : snap.service.price;
        case "_location_label":
            return snap.location.address ?? undefined;
        case "start_at":
            return snap.timing.start_at ?? undefined;
        case "end_at":
            return snap.timing.end_at ?? undefined;
        default:
            return undefined;
    }
}

/**
 * Apply canonical display fields after hydration + field_values (overwrites loose values).
 */
export function computeScheduleHydratedDisplay(out: Record<string, unknown>): void {
    const snap = computeScheduleSnapshotFromHydratedRecord(out);
    out._schedule_snapshot = snap;
    if (snap.customer.name) {
        out._customer_name = snap.customer.name;
    }
    out._contact_email_duplicate_of_customer = snap.customer.emailSuppressedAsDuplicate;
}

// --- Back-compat re-exports (delegate to snapshot; avoid duplicate fallback chains) ---

export function resolveScheduleCustomerDisplayName(record: Record<string, unknown>): string {
    return getScheduleSnapshot(record).customer.name;
}

export function getContactEmailRaw(record: Record<string, unknown>): string {
    return getScheduleSnapshot(record).customer.email ?? "";
}

export function shouldHideContactEmailDuplicate(record: Record<string, unknown>, customerDisplay: string): boolean {
    const em = getContactEmailRaw(record);
    if (!em || !customerDisplay.trim()) return false;
    return em.toLowerCase() === customerDisplay.trim().toLowerCase();
}

export function resolveScheduleServiceDisplay(record: Record<string, unknown>): string {
    return getScheduleSnapshot(record).service.label ?? "";
}

export function resolveSchedulePriceCents(record: Record<string, unknown>): number | null {
    return getScheduleSnapshot(record).service.price;
}
