/**
 * Form launch / display context (V1.3 metadata).
 * Stored on `form_public_links.metadata` and stamped onto draft `payload.meta` at public submission create.
 */

export const FORM_CONTEXT_MODES = ["lead_capture", "existing_record", "document_update", "packet"] as const;
export type FormContextMode = (typeof FORM_CONTEXT_MODES)[number];

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isFormContextMode(s: string): s is FormContextMode {
    return (FORM_CONTEXT_MODES as readonly string[]).includes(s);
}

/** Subset of link metadata copied server-side into submission payload.meta (display + future prefill). */
export type FormLaunchContextFields = {
    form_context_mode?: FormContextMode;
    packet_definition_id?: string;
    source_entity_type?: string;
    source_entity_id?: string;
    prefill_enabled?: boolean;
    allow_auto_create?: boolean;
};

/**
 * Pick trusted launch-context fields from public link metadata for stamping onto new drafts.
 */
export function stampFormContextFromLinkMetadata(
    metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
    const m = metadata ?? {};
    const out: Record<string, unknown> = {};
    const mode = typeof m.form_context_mode === "string" ? m.form_context_mode.trim() : "";
    if (mode && isFormContextMode(mode)) {
        out.form_context_mode = mode;
    }
    const st = typeof m.source_entity_type === "string" ? m.source_entity_type.trim() : "";
    if (st) {
        out.source_entity_type = st;
    }
    const sid = typeof m.source_entity_id === "string" ? m.source_entity_id.trim() : "";
    if (sid && UUID_RE.test(sid)) {
        out.source_entity_id = sid;
    }
    if (typeof m.prefill_enabled === "boolean") {
        out.prefill_enabled = m.prefill_enabled;
    }
    if (typeof m.allow_auto_create === "boolean") {
        out.allow_auto_create = m.allow_auto_create;
    }
    const pid = typeof m.packet_definition_id === "string" ? m.packet_definition_id.trim() : "";
    if (pid && UUID_RE.test(pid)) {
        out.packet_definition_id = pid;
    }
    return out;
}

/** Read launch context from submission `payload.meta` for operator UI. */
export function parseFormLaunchContextFromPayloadMeta(meta: unknown): FormLaunchContextFields {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
        return {};
    }
    const m = meta as Record<string, unknown>;
    const out: FormLaunchContextFields = {};
    const mode = typeof m.form_context_mode === "string" ? m.form_context_mode.trim() : "";
    if (mode && isFormContextMode(mode)) {
        out.form_context_mode = mode;
    }
    const st = typeof m.source_entity_type === "string" ? m.source_entity_type.trim() : "";
    if (st) {
        out.source_entity_type = st;
    }
    const sid = typeof m.source_entity_id === "string" ? m.source_entity_id.trim() : "";
    if (sid && UUID_RE.test(sid)) {
        out.source_entity_id = sid;
    }
    if (typeof m.prefill_enabled === "boolean") {
        out.prefill_enabled = m.prefill_enabled;
    }
    if (typeof m.allow_auto_create === "boolean") {
        out.allow_auto_create = m.allow_auto_create;
    }
    const pidp = typeof m.packet_definition_id === "string" ? m.packet_definition_id.trim() : "";
    if (pidp && UUID_RE.test(pidp)) {
        out.packet_definition_id = pidp;
    }
    return out;
}

/** Operator debug panel fields mirrored from link metadata (same keys as stamp). */
export function extractFormContextForOperatorDebug(metadata: Record<string, unknown> | null | undefined): {
    form_context_mode: string | null;
    source_entity_type: string | null;
    source_entity_id: string | null;
    prefill_enabled: boolean | null;
    allow_auto_create: boolean | null;
} {
    const stamped = stampFormContextFromLinkMetadata(metadata ?? {});
    return {
        form_context_mode: typeof stamped.form_context_mode === "string" ? stamped.form_context_mode : null,
        source_entity_type: typeof stamped.source_entity_type === "string" ? stamped.source_entity_type : null,
        source_entity_id: typeof stamped.source_entity_id === "string" ? stamped.source_entity_id : null,
        prefill_enabled: typeof stamped.prefill_enabled === "boolean" ? stamped.prefill_enabled : null,
        allow_auto_create: typeof stamped.allow_auto_create === "boolean" ? stamped.allow_auto_create : null,
    };
}
