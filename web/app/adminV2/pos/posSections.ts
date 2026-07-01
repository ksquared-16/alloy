/**
 * Processing workspace — section registry.
 *
 * Processing is the product area for information entering Alloy. It has two modes:
 *   • Work   — runtime processing (the Incoming queue)
 *   • Studio — design-time setup (Documents, Forms, Packets, the assets that power Work)
 *
 * These are the in-modal sub-surfaces (rendered inside the existing
 * AdminV2WorkspaceBosModalShell — the same shell/geometry/right-rail as Inbox & My
 * Tasks). The `group` field IS the mode; the shell shows a [Work][Studio] control.
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
    /** The Processing mode this section belongs to (drives the [Work][Studio] control). */
    group: "work" | "studio";
}

/**
 * First-class operator nav, grouped by mode. Work lands directly on Incoming (no
 * separate dashboard/home). `home` (former Work landing), `review` (a duplicate of
 * Incoming) and `linkage` (a placeholder) are intentionally NOT listed — their
 * components remain in the tree but are not reachable from navigation.
 *
 * Scope B (future): the Work group is the seam for a grouped/hierarchical Incoming
 * (e.g. Enrollment · Subsidy · Licensing · Imports, and deeper trees). Add those as
 * Work sections / sub-nav when the grouped queue is real — do not hardcode a fake tree.
 */
export const POS_SECTIONS: PosSectionDef[] = [
    // Work mode — runtime processing
    { key: "processing", label: "Incoming", group: "work" },
    // Studio mode — setup / design-time assets
    { key: "documents", label: "Documents", group: "studio" },
    { key: "forms", label: "Forms", group: "studio" },
    { key: "packets", label: "Packets", group: "studio" },
    { key: "settings", label: "Settings", group: "studio" },
];

/** Operator-facing label for an intake-case lifecycle status. */
export const POS_STATUS_LABELS: Record<string, string> = {
    received: "Just arrived",
    processing: "Working",
    needs_review: "Needs you",
    needs_resolution: "Needs a decision",
    ready: "Ready to approve",
    completed: "Saved to records",
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
