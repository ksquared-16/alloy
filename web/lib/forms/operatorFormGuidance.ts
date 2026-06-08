/**
 * Optional operator-facing copy on `form_definitions.metadata.operator_context`.
 * Set via API PATCH on the form definition — no migration required.
 *
 * @example
 * ```json
 * {
 *   "operator_context": {
 *     "purpose": "Collect medication consent before the first day.",
 *     "who_completes": "A parent or guardian with enrollment access.",
 *     "after_submission": "Enrollment reviews the submission and files the PDF in the child folder.",
 *     "connected_notes": "Optional extra bullets for Connected systems."
 *   }
 * }
 * ```
 */
export type FormOperatorContextMeta = {
    purpose?: string;
    who_completes?: string;
    after_submission?: string;
    /** Appended as extra plain lines under Connected systems */
    connected_notes?: string;
};

function readTrimmedString(obj: Record<string, unknown>, key: string): string | undefined {
    const v = obj[key];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function parseOperatorContext(metadata: Record<string, unknown> | null | undefined): FormOperatorContextMeta | null {
    if (!metadata || typeof metadata !== "object") return null;
    const raw = metadata.operator_context;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const purpose = readTrimmedString(o, "purpose");
    const who_completes = readTrimmedString(o, "who_completes");
    const after_submission = readTrimmedString(o, "after_submission");
    const connected_notes = readTrimmedString(o, "connected_notes");
    if (!purpose && !who_completes && !after_submission && !connected_notes) return null;
    return { purpose, who_completes, after_submission, connected_notes };
}

/** True when published mapping indicates document generation is configured (any engine string). */
export function formVersionHasDocumentMapping(pdfMappingJson: unknown): boolean {
    if (!pdfMappingJson || typeof pdfMappingJson !== "object" || Array.isArray(pdfMappingJson)) return false;
    const engine = (pdfMappingJson as { engine?: unknown }).engine;
    return typeof engine === "string" && engine.trim().length > 0;
}

/** Events emitted into `workflow_events` for automations (product behavior; not a live query). */
export const FORM_WORKFLOW_EVENTS_SUMMARY =
    "Alloy emits workflow signals when forms move through their lifecycle — for example when a form is submitted, when signatures are captured (if used), when a linked document is generated, and when a multi-step packet completes (`form_packet_completed`). Your automations can react to those events.";

export function resolvePurposeParagraph(
    context: FormOperatorContextMeta | null,
    description: string | null,
    formName: string
): string {
    if (context?.purpose) return context.purpose;
    if (description?.trim()) return description.trim();
    return `"${formName}" collects the fields configured for your organization. Share a public link so the right person can complete it; responses appear under Submissions.`;
}

export function resolveWhoCompletesParagraph(context: FormOperatorContextMeta | null, kind: string): string {
    if (context?.who_completes) return context.who_completes;
    const kindHint =
        kind === "state"
            ? "This form is labeled as a regulatory-style definition for your organization."
            : "This form is configured for your center or program.";
    return `${kindHint} The recipient completes it in a normal browser — typically a parent, guardian, or staff member — using a link you send. They do not need an Alloy admin login.`;
}

export function resolveAfterSubmissionParagraph(context: FormOperatorContextMeta | null): string {
    if (context?.after_submission) return context.after_submission;
    return "Submitted responses are stored as submissions with status and timestamps. Open a submission to review answers, related CRM IDs when captured, linked documents, and any follow-up actions your team defines.";
}

export type ConnectedSystemsBullet = { id: string; text: string };

export function buildConnectedSystemsBullets(params: {
    leadCaptureConfigured: boolean;
    documentGenerationConfigured: boolean;
    operatorNotes?: string | null;
}): ConnectedSystemsBullet[] {
    const out: ConnectedSystemsBullet[] = [];
    if (params.leadCaptureConfigured) {
        out.push({
            id: "intake",
            text: "Person / customer intake: at least one public link uses lead capture or intake mode, so CRM records may be created or linked when someone submits.",
        });
    }
    if (params.documentGenerationConfigured) {
        out.push({
            id: "docs",
            text: "Documents: a published version includes a document mapping. After submission, staff can generate or open linked PDFs from the submission detail when your environment supports it.",
        });
    }
    out.push({ id: "workflow", text: FORM_WORKFLOW_EVENTS_SUMMARY });
    if (params.operatorNotes?.trim()) {
        out.push({ id: "custom", text: params.operatorNotes.trim() });
    }
    return out;
}
