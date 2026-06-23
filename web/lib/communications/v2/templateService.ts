/**
 * Communications V2 — template API service logic (Phase 1 / B2).
 *
 * Pure, I/O-free helpers shared by the admin template routes: input validation
 * against the B1 vocabularies, the subject-only-for-email rule (API-layer
 * validation, not a DB trigger — per decision), token-path extraction (B0),
 * version-bump decisions, and preview assembly. Routes own all Supabase I/O and
 * org_id scoping; this module owns the rules so they are unit-testable.
 *
 * NO Supabase, NO HTTP, NO provider code, NO announcements, NO UI.
 */

import {
    isTemplateChannel,
    isTemplateStatus,
    normalizeTemplateCategory,
    templateChannelSupportsSubject,
    type TemplateCategory,
    type TemplateChannel,
    type TemplateStatus,
} from "@/lib/communications/v2/templateSchema";
import {
    parseCommunicationTokenPaths,
    segmentCommunicationTemplate,
    type CommunicationTokenResolution,
} from "@/lib/communications/v2/templateTokens";

export type ValidationError = { ok: false; error: string };
export type Validated<T> = { ok: true; value: T };
export type ValidationResult<T> = Validated<T> | ValidationError;

function err(error: string): ValidationError {
    return { ok: false, error };
}

function asTrimmedString(v: unknown): string {
    return typeof v === "string" ? v.trim() : "";
}

/**
 * Subject-only-for-email rule (API-layer validation).
 * - email: subject optional; trimmed; empty -> null.
 * - sms / in_app: a non-empty subject is rejected; null/empty normalizes to null.
 */
export function validateSubjectForChannel(
    channel: TemplateChannel,
    subjectRaw: unknown
): ValidationResult<string | null> {
    const subject = asTrimmedString(subjectRaw);
    if (templateChannelSupportsSubject(channel)) {
        return { ok: true, value: subject.length > 0 ? subject : null };
    }
    if (subject.length > 0) {
        return err(`subject is only allowed for the 'email' channel (got '${channel}')`);
    }
    return { ok: true, value: null };
}

export type CreateTemplateInput = {
    name: string;
    description: string | null;
    category: TemplateCategory;
    channel: TemplateChannel;
    status: TemplateStatus;
    subject: string | null;
    body: string;
};

/** Validate the POST create body. status defaults to 'draft'. */
export function validateCreateTemplateInput(body: unknown): ValidationResult<CreateTemplateInput> {
    if (!body || typeof body !== "object") return err("Request body must be an object");
    const b = body as Record<string, unknown>;

    const name = asTrimmedString(b.name);
    if (!name) return err("name is required");

    const category = normalizeTemplateCategory(b.category);
    if (!category) return err("category is required");

    const channel = asTrimmedString(b.channel);
    if (!isTemplateChannel(channel)) return err(`invalid channel '${channel}'`);

    const statusRaw = b.status === undefined || b.status === null ? "draft" : asTrimmedString(b.status);
    if (!isTemplateStatus(statusRaw)) return err(`invalid status '${statusRaw}'`);

    const subjectRes = validateSubjectForChannel(channel, b.subject);
    if (!subjectRes.ok) return subjectRes;

    const description = asTrimmedString(b.description);
    const bodyText = typeof b.body === "string" ? b.body : "";

    return {
        ok: true,
        value: {
            name,
            description: description.length > 0 ? description : null,
            category,
            channel,
            status: statusRaw,
            subject: subjectRes.value,
            body: bodyText,
        },
    };
}

export type TemplateMetaPatch = {
    name?: string;
    description?: string | null;
    category?: TemplateCategory;
    channel?: TemplateChannel;
    status?: TemplateStatus;
};

export type ContentPatch = {
    /** subject present in the request (already validated against effective channel). */
    subject?: string | null;
    body?: string;
};

export type PatchTemplateInput = {
    meta: TemplateMetaPatch;
    content: ContentPatch;
    /** Whether the request carried any content (subject/body) field at all. */
    hasContentFields: boolean;
};

/**
 * Validate the PATCH body against the template's CURRENT channel (callers pass
 * it, since channel may also be changing in the same request). The effective
 * channel for subject validation is the incoming channel if provided, else the
 * current one.
 */
export function validatePatchTemplateInput(
    body: unknown,
    currentChannel: TemplateChannel
): ValidationResult<PatchTemplateInput> {
    if (!body || typeof body !== "object") return err("Request body must be an object");
    const b = body as Record<string, unknown>;

    const meta: TemplateMetaPatch = {};

    if (b.name !== undefined) {
        const name = asTrimmedString(b.name);
        if (!name) return err("name cannot be empty");
        meta.name = name;
    }
    if (b.description !== undefined) {
        const d = asTrimmedString(b.description);
        meta.description = d.length > 0 ? d : null;
    }
    if (b.category !== undefined) {
        const c = normalizeTemplateCategory(b.category);
        if (!c) return err("category cannot be empty");
        meta.category = c;
    }
    if (b.channel !== undefined) {
        const ch = asTrimmedString(b.channel);
        if (!isTemplateChannel(ch)) return err(`invalid channel '${ch}'`);
        meta.channel = ch;
    }
    if (b.status !== undefined) {
        const s = asTrimmedString(b.status);
        if (!isTemplateStatus(s)) return err(`invalid status '${s}'`);
        meta.status = s;
    }

    const effectiveChannel: TemplateChannel = meta.channel ?? currentChannel;

    const content: ContentPatch = {};
    let hasContentFields = false;
    if (b.subject !== undefined) {
        const subjectRes = validateSubjectForChannel(effectiveChannel, b.subject);
        if (!subjectRes.ok) return subjectRes;
        content.subject = subjectRes.value;
        hasContentFields = true;
    }
    if (b.body !== undefined) {
        if (typeof b.body !== "string") return err("body must be a string");
        content.body = b.body;
        hasContentFields = true;
    }

    return { ok: true, value: { meta, content, hasContentFields } };
}

/** Union of {{dot.path}} tokens referenced in subject + body, stable de-duped order. */
export function computeTemplateTokenPaths(subject: string | null, body: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of [subject ?? "", body ?? ""]) {
        for (const p of parseCommunicationTokenPaths(part)) {
            if (!seen.has(p)) {
                seen.add(p);
                out.push(p);
            }
        }
    }
    return out;
}

/**
 * Decide whether a PATCH should create a new version. A new version is created
 * iff a content field was supplied AND the resulting subject or body differs
 * from the current version. Metadata-only edits never version.
 */
export function shouldCreateNewVersion(
    current: { subject: string | null; body: string },
    next: ContentPatch,
    hasContentFields: boolean
): boolean {
    if (!hasContentFields) return false;
    const nextSubject = next.subject !== undefined ? next.subject : current.subject;
    const nextBody = next.body !== undefined ? next.body : current.body;
    return nextSubject !== current.subject || nextBody !== current.body;
}

/** Next version number from the current maximum (versions start at 1). */
export function nextVersionNumber(currentMaxVersion: number | null | undefined): number {
    const max = typeof currentMaxVersion === "number" && Number.isFinite(currentMaxVersion) ? currentMaxVersion : 0;
    return max + 1;
}

export type TemplateVersionInsertFields = {
    org_id: string;
    template_id: string;
    version_number: number;
    subject: string | null;
    body: string;
    token_paths: string[];
    created_by: string | null;
};

/**
 * Build a version insert row compatible with PKG-05 (`version` NOT NULL) and B2 (`version_number`).
 * Also mirrors `created_by` into legacy `created_by_user_id` when present.
 */
export function buildTemplateVersionInsertPayload(fields: TemplateVersionInsertFields): Record<string, unknown> {
    const versionNumber = fields.version_number;
    const payload: Record<string, unknown> = {
        org_id: fields.org_id,
        template_id: fields.template_id,
        version_number: versionNumber,
        version: versionNumber,
        subject: fields.subject,
        body: fields.body,
        token_paths: fields.token_paths,
        created_by: fields.created_by,
    };
    if (fields.created_by) {
        payload.created_by_user_id = fields.created_by;
    }
    return payload;
}

/** Friendly duplicate-name message for template create/update. */
export function formatTemplateDuplicateNameError(name: string): string {
    const trimmed = name.trim();
    return `A template named ${trimmed} already exists. Choose a different name.`;
}

/** Detect Postgres unique violations for communication_templates (org_id, name). */
export function isTemplateNameUniqueConstraintError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
        normalized.includes("communication_templates_org_name_uq") ||
        (normalized.includes("duplicate key") && normalized.includes("communication_templates"))
    );
}

/** Effective subject/body after applying a content patch over the current version. */
export function mergeContent(
    current: { subject: string | null; body: string },
    next: ContentPatch
): { subject: string | null; body: string } {
    return {
        subject: next.subject !== undefined ? next.subject : current.subject,
        body: next.body !== undefined ? next.body : current.body,
    };
}

export type TemplatePreview = {
    subject: CommunicationTokenResolution | null;
    body: CommunicationTokenResolution;
};

/**
 * Render a version's subject/body against a sample context for preview.
 * Pure: uses the B0 token engine only. No send, queue, or provider behavior.
 * `subject` resolution is null when the version has no subject (sms/in_app).
 */
export function buildTemplatePreview(
    version: { subject: string | null; body: string },
    context: Record<string, unknown>
): TemplatePreview {
    return {
        subject:
            version.subject != null && version.subject !== ""
                ? segmentCommunicationTemplate(version.subject, context)
                : null,
        body: segmentCommunicationTemplate(version.body ?? "", context),
    };
}

/** Parse + validate the optional list filters (category/channel/status). */
export function parseTemplateListFilters(raw: {
    category?: string | null;
    channel?: string | null;
    status?: string | null;
}): ValidationResult<{ category?: TemplateCategory; channel?: TemplateChannel; status?: TemplateStatus }> {
    const filters: { category?: TemplateCategory; channel?: TemplateChannel; status?: TemplateStatus } = {};
    const category = normalizeTemplateCategory(raw.category);
    if (category) filters.category = category;
    const channel = asTrimmedString(raw.channel);
    if (channel) {
        if (!isTemplateChannel(channel)) return err(`invalid channel filter '${channel}'`);
        filters.channel = channel;
    }
    const status = asTrimmedString(raw.status);
    if (status) {
        if (!isTemplateStatus(status)) return err(`invalid status filter '${status}'`);
        filters.status = status;
    }
    return { ok: true, value: filters };
}
