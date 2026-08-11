/**
 * Validating what an operator types into the Communications setup surface, and
 * turning database constraint failures back into sentences an operator can act on.
 *
 * Two things live here because both are pure and both are shared by create and
 * edit — and because the collision case in particular must not be reinvented per
 * route. `communication_bindings_inbound_address_uq` is GLOBAL across tenants, so
 * the losing side of a collision is frequently a different organization. The
 * message must therefore say the address is taken and nothing else: no
 * organization name, no binding id, no hint about who holds it. A raw Postgres
 * error would leak the constraint name and the conflicting value straight into
 * the browser.
 */

import { normalizeEmailAddress } from "./email/inboundEmailRouting";

export type FieldError = { field: string; message: string };

export type Validated<T> = { ok: true; value: T } | { ok: false; error: FieldError };

/** The collision sentence. One address, one tenant, and nothing said about which. */
export const RECEIVING_ADDRESS_TAKEN_MESSAGE =
    "This receiving address is already connected to another Communications channel.";

export const RECEIVING_NUMBER_TAKEN_MESSAGE =
    "This receiving number is already connected to another Communications channel.";

/**
 * A receiving address, normalized exactly the way inbound routing normalizes it.
 *
 * Reusing `normalizeEmailAddress` is load-bearing rather than tidy: the unique
 * index is on `lower(inbound_address)` and ownership resolution compares
 * normalized forms, so storing anything the router would normalize differently
 * creates an address that is unique in the database and unroutable at runtime.
 */
export function validateInboundAddress(raw: unknown): Validated<string | null> {
    if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
        return { ok: true, value: null };
    }
    if (typeof raw !== "string") {
        return { ok: false, error: { field: "inbound_address", message: "Receiving address must be text." } };
    }
    if (raw.length > 320) {
        return { ok: false, error: { field: "inbound_address", message: "Receiving address is too long." } };
    }
    const normalized = normalizeEmailAddress(raw);
    if (!normalized) {
        return {
            ok: false,
            error: { field: "inbound_address", message: "Enter a full email address, for example hello@yourdomain.org." },
        };
    }
    const [local, ...rest] = normalized.split("@");
    if (!local || rest.length !== 1 || !rest[0] || !rest[0].includes(".")) {
        return {
            ok: false,
            error: { field: "inbound_address", message: "Enter a full email address, for example hello@yourdomain.org." },
        };
    }
    return { ok: true, value: normalized };
}

/**
 * The sending identity. Accepts a bare address only — no display name.
 *
 * `From: Name <a@b.org>` is legal RFC 5322 and the send path would pass it
 * through, but the same value is read when minting `<alloy.{id}@{domain}>`, and a
 * display-name form there produces a malformed Message-ID that inbound
 * correlation cannot match. Refusing the form is better than threading a second
 * parser through a certified runtime.
 */
export function validateFromEmail(raw: unknown): Validated<string | null> {
    if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
        return { ok: true, value: null };
    }
    if (typeof raw !== "string") {
        return { ok: false, error: { field: "from_email", message: "From address must be text." } };
    }
    const trimmed = raw.trim();
    if (trimmed.length > 120) {
        return { ok: false, error: { field: "from_email", message: "From address is too long." } };
    }
    if (/[<>]/.test(trimmed)) {
        return {
            ok: false,
            error: {
                field: "from_email",
                message: "Enter the address only, without a display name — for example hello@yourdomain.org.",
            },
        };
    }
    const normalized = normalizeEmailAddress(trimmed);
    if (!normalized || !normalized.split("@")[1]?.includes(".")) {
        return {
            ok: false,
            error: { field: "from_email", message: "Enter a full email address, for example hello@yourdomain.org." },
        };
    }
    return { ok: true, value: normalized };
}

/** E.164, the form the SMS runtime routes on. */
export function validateInboundE164(raw: unknown): Validated<string | null> {
    if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
        return { ok: true, value: null };
    }
    if (typeof raw !== "string") {
        return { ok: false, error: { field: "inbound_to_e164", message: "Receiving number must be text." } };
    }
    const trimmed = raw.trim().replace(/[\s()-]/g, "");
    if (!/^\+[1-9]\d{6,14}$/.test(trimmed)) {
        return {
            ok: false,
            error: {
                field: "inbound_to_e164",
                message: "Enter the number in international format, for example +15551234567.",
            },
        };
    }
    return { ok: true, value: trimmed };
}

export function validateDisplayLabel(raw: unknown): Validated<string | null> {
    if (raw === null || raw === undefined) return { ok: true, value: null };
    if (typeof raw !== "string") {
        return { ok: false, error: { field: "display_label", message: "Label must be text." } };
    }
    const trimmed = raw.trim();
    return { ok: true, value: trimmed ? trimmed.slice(0, 200) : null };
}

export const BINDING_STATUS_VALUES = ["active", "disabled", "pending_verification"] as const;
export type BindingStatus = (typeof BINDING_STATUS_VALUES)[number];

export function validateStatus(raw: unknown): Validated<BindingStatus> {
    const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!(BINDING_STATUS_VALUES as readonly string[]).includes(s)) {
        return {
            ok: false,
            error: { field: "status", message: "Status must be active, disabled, or pending_verification." },
        };
    }
    return { ok: true, value: s as BindingStatus };
}

/** Shape of the Postgres error surfaced through PostgREST. */
export type DatabaseErrorLike = { code?: string | null; message?: string | null; details?: string | null };

export type ConstraintTranslation = { status: number; message: string } | null;

/**
 * Turn a unique-violation into an operator-safe sentence, or return `null` when
 * the error is not one this surface knows how to explain.
 *
 * Returning `null` matters: a caller must fall through to a generic failure
 * rather than guess. Passing an unrecognised database message to the browser is
 * how constraint names, column values, and other tenants' data escape.
 */
export function translateBindingConstraintError(error: DatabaseErrorLike): ConstraintTranslation {
    const code = String(error.code ?? "").trim();
    const haystack = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();

    if (code !== "23505") return null;

    if (haystack.includes("communication_bindings_inbound_address_uq")) {
        return { status: 409, message: RECEIVING_ADDRESS_TAKEN_MESSAGE };
    }
    if (haystack.includes("communication_bindings_org_inbound_to_uq")) {
        return { status: 409, message: RECEIVING_NUMBER_TAKEN_MESSAGE };
    }
    // A unique violation this surface does not recognise. Still a conflict, but
    // described without echoing the database's words.
    return { status: 409, message: "That value is already in use by another Communications channel." };
}
