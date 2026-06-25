/**
 * POS workspace — section registry.
 *
 * POS is the home for information entering Alloy. These are the in-modal
 * sub-surfaces (rendered inside the existing AdminV2WorkspaceBosModalShell —
 * the same shell/geometry/right-rail as Inbox & My Tasks). Forms is one Source,
 * Processing is one workspace; Home ties them together.
 */

export type PosSection =
    | "home"
    | "processing"
    | "review"
    | "linkage"
    | "forms"
    | "packets"
    | "documents"
    | "settings";

export interface PosSectionDef {
    key: PosSection;
    label: string;
    /** Secondary nav items sit under a divider (configuration vs. operational work). */
    group: "work" | "sources" | "config";
}

export const POS_SECTIONS: PosSectionDef[] = [
    { key: "home", label: "Home", group: "work" },
    { key: "processing", label: "Processing", group: "work" },
    { key: "review", label: "Review", group: "work" },
    { key: "linkage", label: "Linkage", group: "work" },
    { key: "forms", label: "Forms", group: "sources" },
    { key: "packets", label: "Packets", group: "sources" },
    { key: "documents", label: "Documents", group: "sources" },
    { key: "settings", label: "Settings", group: "config" },
];

/** Human label for a processing-case lifecycle status. */
export const POS_STATUS_LABELS: Record<string, string> = {
    received: "Received",
    processing: "Processing",
    needs_review: "Needs review",
    needs_resolution: "Needs resolution",
    ready: "Ready",
    completed: "Completed",
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
