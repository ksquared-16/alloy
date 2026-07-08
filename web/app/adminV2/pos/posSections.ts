/**
 * Digital Mailroom product structure.
 *
 * Overview — launch point.
 * Work     — operational work organized by folders.
 * Studio   — reusable assets and builders.
 */

export type PosSection =
    | "overview"
    | "processing"
    | "review"
    | "linkage"
    | "forms"
    | "packets"
    | "settings";

export interface PosSectionDef {
    key: PosSection;
    label: string;
    group: "work" | "studio";
}

export const POS_SECTIONS: PosSectionDef[] = [
    { key: "overview", label: "Overview", group: "work" },
    { key: "processing", label: "Work", group: "work" },
    { key: "forms", label: "Studio", group: "studio" },
];

/** Operator-facing label for queue row status. */
export const POS_STATUS_LABELS: Record<string, string> = {
    received: "Just arrived",
    processing: "Working",
    needs_review: "Needs review",
    needs_resolution: "Needs a decision",
    ready: "Ready to generate",
    completed: "Finished",
    archived: "Archived",
};

/** Human label for a source kind. */
export const POS_SOURCE_KIND_LABELS: Record<string, string> = {
    form_submission: "Form",
    form_packet_session: "Packet",
    document: "Document",
    upload: "Upload",
    email_attachment: "Email attachment",
    import: "Import",
    recreated_document: "Recreated document",
};
