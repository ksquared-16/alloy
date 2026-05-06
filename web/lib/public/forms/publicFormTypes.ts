export type FormPublicLinkMetadata = {
    /** Final submit runs person-first CRM intake when true. */
    lead_capture?: boolean;
    intake?: boolean;
    /** Explicit mode string (either flag works). */
    mode?: "standard" | "lead_capture" | "intake";
    default_vertical_id?: string;
    default_opportunity_status_key?: string;
};

export function linkRequiresLeadCapture(metadata: Record<string, unknown> | null | undefined): boolean {
    if (!metadata || typeof metadata !== "object") return false;
    const m = metadata as FormPublicLinkMetadata;
    if (m.lead_capture === true || m.intake === true) return true;
    if (m.mode === "lead_capture" || m.mode === "intake") return true;
    return false;
}
