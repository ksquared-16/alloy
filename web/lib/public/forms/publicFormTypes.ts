import type { FormIntakeValueFieldPaths } from "@/lib/forms/intake/buildFormIntakeMetaFromPayload";

export type FormPublicLinkMetadata = {
    /** Final submit runs person-first CRM intake when true. */
    lead_capture?: boolean;
    intake?: boolean;
    /** Explicit mode string (either flag works). */
    mode?: "standard" | "lead_capture" | "intake";
    /** Required for intake — UUID of a row in `verticals`. */
    default_vertical_id?: string;
    default_opportunity_status_key?: string;
    /**
     * Maps `payload.values` field ids into guardian/child intake hints.
     * Defaults match common demo shapes (`guardian_email`, `child_first_name`, …).
     */
    intake_field_paths?: FormIntakeValueFieldPaths;
    /** Default false — production-safe. Demo links should set true for end-to-end smoke. */
    auto_create_person?: boolean;
    auto_create_customer?: boolean;
    auto_create_customer_member?: boolean;
    auto_create_opportunity?: boolean;
};

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function linkRequiresLeadCapture(metadata: Record<string, unknown> | null | undefined): boolean {
    if (!metadata || typeof metadata !== "object") return false;
    const mode = (metadata as { form_context_mode?: unknown }).form_context_mode;
    if (mode === "existing_record") {
        return false;
    }
    if (mode === "packet") {
        const st =
            typeof (metadata as { source_entity_type?: unknown }).source_entity_type === "string"
                ? (metadata as { source_entity_type: string }).source_entity_type.trim()
                : "";
        const sidRaw =
            typeof (metadata as { source_entity_id?: unknown }).source_entity_id === "string"
                ? (metadata as { source_entity_id: string }).source_entity_id.trim()
                : "";
        if (st && sidRaw && UUID_RE.test(sidRaw)) return false;
    }
    const m = metadata as FormPublicLinkMetadata;
    if (m.lead_capture === true || m.intake === true) return true;
    if (m.mode === "lead_capture" || m.mode === "intake") return true;
    return false;
}
