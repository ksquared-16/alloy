import type { FormPayload } from "@/lib/forms/validateSubmission";

/** Rows for operator-facing “records connected” summary (truthful linked / not linked). */
export type EntityConnectionRow = {
    key: string;
    label: string;
    hint: string;
    recordId: string | null;
};

export function payloadHasCapturedSignatures(payload: FormPayload | null | undefined): boolean {
    if (!payload?.signatures || typeof payload.signatures !== "object") return false;
    return Object.keys(payload.signatures).length > 0;
}

/** Operator-facing status headline + notes (timestamps formatted in UI). */
export function describeSubmissionLifecycle(params: {
    status: string;
    payloadHasSignatures: boolean;
}): { headline: string; notes: string[] } {
    const raw = (params.status ?? "").toLowerCase().trim();

    if (raw === "draft") {
        return {
            headline: "Draft",
            notes: ["Still in progress — the recipient has not finished or submitted yet."],
        };
    }

    if (raw === "submitted") {
        const notes: string[] = [];
        if (params.payloadHasSignatures) {
            notes.push("At least one signature was captured on this submission.");
        }
        return { headline: "Submitted", notes };
    }

    return {
        headline: params.status ? params.status : "Unknown status",
        notes: [`Recorded status code: ${params.status}`],
    };
}

export function buildEntityConnectionRows(sub: {
    person_id: string | null;
    customer_id: string | null;
    customer_member_id: string | null;
    opportunity_id: string | null;
    created_via_public_link_id: string | null;
}): EntityConnectionRow[] {
    return [
        {
            key: "person",
            label: "Person",
            hint: "Individual profile (often the guardian or contact).",
            recordId: sub.person_id,
        },
        {
            key: "customer",
            label: "Customer",
            hint: "Household / bill-to account in CRM.",
            recordId: sub.customer_id,
        },
        {
            key: "customer_member",
            label: "Customer member (child)",
            hint: "Child or dependent profile under the customer.",
            recordId: sub.customer_member_id,
        },
        {
            key: "opportunity",
            label: "Opportunity",
            hint: "Enrollment or pipeline record when linked.",
            recordId: sub.opportunity_id,
        },
        {
            key: "public_link",
            label: "Public link",
            hint: "Which shareable link started this submission (if any).",
            recordId: sub.created_via_public_link_id,
        },
    ];
}

export const WORKFLOW_SIGNALS_OPERATOR_COPY =
    "When this submission moves through its lifecycle, Alloy emits workflow signals (for example when it is submitted, when signatures are saved, or when a linked document is generated). Automations you configure can listen for those signals — live event history from this screen is not shown yet.";

export type DocumentOutcomeOperator = {
    headline: string;
    bullets: string[];
};

export function describeDocumentOutcome(params: {
    linkedDocumentsCount: number;
    submissionStatus: string;
    canMutate: boolean;
}): DocumentOutcomeOperator {
    const submitted = params.submissionStatus.toLowerCase() === "submitted";
    if (params.linkedDocumentsCount > 0) {
        return {
            headline: "Document stored",
            bullets: [
                `${params.linkedDocumentsCount} linked document${params.linkedDocumentsCount === 1 ? "" : "s"} on file for this submission.`,
                "Open a document below to review it in the documents drawer.",
            ],
        };
    }
    if (!submitted) {
        return {
            headline: "No document yet",
            bullets: [
                "Documents are created after submit using Generate document (stub PDF today).",
                "Wait until the form is submitted before generating.",
            ],
        };
    }
    if (params.canMutate) {
        return {
            headline: "No document generated yet",
            bullets: [
                "Use Generate document below to create or reuse a PDF from this submission’s published mapping.",
                "That stores a documents row and links it here when your environment supports it.",
            ],
        };
    }
    return {
        headline: "No document generated yet",
        bullets: [
            "An admin can generate the PDF from this submission when your form has a document mapping.",
            "Ask an administrator if you need a document on file.",
        ],
    };
}

export function recommendedNextAction(params: {
    status: string;
    linkedDocumentsCount: number;
    canMutate: boolean;
    hasAnyCrmEntityLink: boolean;
}): string[] {
    const raw = params.status.toLowerCase();
    const lines: string[] = [];

    if (raw === "draft") {
        lines.push("Wait for the recipient to finish and submit — drafts do not drive downstream documents until submitted.");
        return lines;
    }

    if (raw !== "submitted") {
        lines.push("Confirm submission status with your team before processing.");
        return lines;
    }

    if (params.linkedDocumentsCount === 0) {
        lines.push("Review the answers, then generate a document when your process requires a PDF on file.");
        if (!params.canMutate) {
            lines.push("You need an admin to run Generate document if this submission still has no linked document.");
        }
    } else {
        lines.push("Open the linked document(s) or continue your internal workflow.");
    }

    if (params.hasAnyCrmEntityLink) {
        lines.push("Use Open beside Person / Customer / Member / Opportunity when you need to update CRM records.");
    }

    return lines;
}
