/**
 * Communications V2 — announcement API skeleton logic (Phase 1 / B4).
 *
 * Pure validation for the draft-only announcement CRUD skeleton. Deliberately
 * NARROW: no audience resolution, no scheduling, no fan-out, no send, no provider —
 * those land in B5–B7. Status transitions other than archive are NOT handled here.
 *
 * NO Supabase, NO HTTP, NO provider code, NO UI.
 */

import {
    isAnnouncementChannel,
    isAnnouncementTargetType,
    type AnnouncementChannel,
    type AnnouncementTargetType,
} from "@/lib/communications/v2/announcementSchema";
import { validateAudienceSpec } from "@/lib/communications/v2/audienceSpec";

export type ValidationError = { ok: false; error: string };
export type Validated<T> = { ok: true; value: T };
export type ValidationResult<T> = Validated<T> | ValidationError;

const BODY_FORMATS = ["text", "html"] as const;
type BodyFormat = (typeof BODY_FORMATS)[number];

function err(error: string): ValidationError {
    return { ok: false, error };
}

function asTrimmedString(v: unknown): string {
    return typeof v === "string" ? v.trim() : "";
}

/** Validate a channels array against the channel vocabulary; de-duped, order-preserving. */
export function validateAnnouncementChannels(raw: unknown): ValidationResult<AnnouncementChannel[]> {
    if (raw === undefined || raw === null) return { ok: true, value: [] };
    if (!Array.isArray(raw)) return err("channels must be an array");
    const out: AnnouncementChannel[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
        const c = asTrimmedString(item);
        if (!isAnnouncementChannel(c)) return err(`invalid channel '${c}'`);
        if (!seen.has(c)) {
            seen.add(c);
            out.push(c);
        }
    }
    return { ok: true, value: out };
}

function validateBodyFormat(raw: unknown): ValidationResult<BodyFormat> {
    if (raw === undefined || raw === null) return { ok: true, value: "text" };
    const v = asTrimmedString(raw);
    if (!(BODY_FORMATS as readonly string[]).includes(v)) return err(`invalid body_format '${v}'`);
    return { ok: true, value: v as BodyFormat };
}

export type CreateAnnouncementInput = {
    title: string;
    channels: AnnouncementChannel[];
    subject: string | null;
    body: string;
    body_format: BodyFormat;
};

/**
 * Validate the POST create body. Always creates a DRAFT (status is not accepted
 * here — scheduling/sending are separate, later batches).
 */
export function validateCreateAnnouncementInput(body: unknown): ValidationResult<CreateAnnouncementInput> {
    if (!body || typeof body !== "object") return err("Request body must be an object");
    const b = body as Record<string, unknown>;

    const title = asTrimmedString(b.title);
    if (!title) return err("title is required");

    const channelsRes = validateAnnouncementChannels(b.channels);
    if (!channelsRes.ok) return channelsRes;

    const fmtRes = validateBodyFormat(b.body_format);
    if (!fmtRes.ok) return fmtRes;

    const subject = asTrimmedString(b.subject);
    const bodyText = typeof b.body === "string" ? b.body : "";

    return {
        ok: true,
        value: {
            title,
            channels: channelsRes.value,
            subject: subject.length > 0 ? subject : null,
            body: bodyText,
            body_format: fmtRes.value,
        },
    };
}

export type AnnouncementMetaPatch = {
    title?: string;
    channels?: AnnouncementChannel[];
    subject?: string | null;
    body?: string;
    body_format?: BodyFormat;
    template_id?: string | null;
};

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Validate the PATCH body — metadata only. Status transitions (schedule/send) are
 * intentionally NOT accepted in the skeleton; archive has its own route.
 */
export function validatePatchAnnouncementInput(body: unknown): ValidationResult<AnnouncementMetaPatch> {
    if (!body || typeof body !== "object") return err("Request body must be an object");
    const b = body as Record<string, unknown>;
    const patch: AnnouncementMetaPatch = {};

    if (b.title !== undefined) {
        const t = asTrimmedString(b.title);
        if (!t) return err("title cannot be empty");
        patch.title = t;
    }
    if (b.channels !== undefined) {
        const res = validateAnnouncementChannels(b.channels);
        if (!res.ok) return res;
        patch.channels = res.value;
    }
    if (b.subject !== undefined) {
        const s = asTrimmedString(b.subject);
        patch.subject = s.length > 0 ? s : null;
    }
    if (b.body !== undefined) {
        if (typeof b.body !== "string") return err("body must be a string");
        patch.body = b.body;
    }
    if (b.body_format !== undefined) {
        const res = validateBodyFormat(b.body_format);
        if (!res.ok) return res;
        patch.body_format = res.value;
    }
    if (b.template_id !== undefined) {
        if (b.template_id === null) {
            patch.template_id = null;
        } else {
            const id = asTrimmedString(b.template_id);
            if (!UUID_RE.test(id)) return err("template_id must be a uuid or null");
            patch.template_id = id;
        }
    }

    return { ok: true, value: patch };
}

/** Target types that require a target_ref (a specific location/program/room id). */
const SCOPED_TARGET_TYPES: ReadonlySet<AnnouncementTargetType> = new Set<AnnouncementTargetType>([
    "program",
    "room",
    "location",
]);

export type NormalizedTarget = {
    target_type: AnnouncementTargetType;
    target_ref: string | null;
    rule: Record<string, unknown>;
};

/**
 * Validate a target CONFIG list (not recipients). Set-level targets
 * (all_families/active_families/waitlist/custom) carry no ref; scoped targets
 * (location/program/room) require a uuid ref. De-duped by type+ref.
 * Pure config — no audience resolution, no recipient writes, no send.
 */
export function validateAnnouncementTargets(raw: unknown): ValidationResult<NormalizedTarget[]> {
    if (raw === undefined || raw === null) return { ok: true, value: [] };
    if (!Array.isArray(raw)) return err("targets must be an array");

    const out: NormalizedTarget[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
        if (!item || typeof item !== "object") return err("each target must be an object");
        const t = item as Record<string, unknown>;
        const targetType = asTrimmedString(t.target_type);
        if (!isAnnouncementTargetType(targetType)) return err(`invalid target_type '${targetType}'`);

        // B8A: a 'custom' target carries the full Announcement Audience Spec in rule.audience_spec.
        if (targetType === "custom") {
            const ruleObj = t.rule && typeof t.rule === "object" && !Array.isArray(t.rule) ? (t.rule as Record<string, unknown>) : {};
            const specRes = validateAudienceSpec(ruleObj.audience_spec);
            if (!specRes.ok) return err(specRes.error);
            if (t.target_ref !== undefined && t.target_ref !== null && asTrimmedString(t.target_ref) !== "") {
                return err("custom target must not carry a target_ref");
            }
            if (seen.has("custom")) continue;
            seen.add("custom");
            out.push({ target_type: "custom", target_ref: null, rule: { audience_spec: specRes.value } });
            continue;
        }

        let targetRef: string | null = null;
        if (SCOPED_TARGET_TYPES.has(targetType)) {
            const ref = asTrimmedString(t.target_ref);
            if (!UUID_RE.test(ref)) return err(`target_type '${targetType}' requires a uuid target_ref`);
            targetRef = ref;
        } else if (t.target_ref !== undefined && t.target_ref !== null && asTrimmedString(t.target_ref) !== "") {
            return err(`target_type '${targetType}' must not carry a target_ref`);
        }

        const rule = t.rule && typeof t.rule === "object" && !Array.isArray(t.rule) ? (t.rule as Record<string, unknown>) : {};

        const dedupeKey = `${targetType}:${targetRef ?? ""}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push({ target_type: targetType, target_ref: targetRef, rule });
    }
    return { ok: true, value: out };
}
