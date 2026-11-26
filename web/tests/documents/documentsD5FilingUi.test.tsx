/** @vitest-environment jsdom */

/**
 * D5 — Processing → Work → Documents: the queue lanes, the filing workspace (suggestion as a proposal, record chosen
 * from a household, review), File through the case approval, a refused filing shown with Retry and never as done, and
 * the filed result opening the record's Focus Panel on its documents.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { focusMock } = vi.hoisted(() => ({ focusMock: vi.fn(async () => true) }));
vi.mock("@/lib/runtime/focus/useOperatorRecordFocus", () => ({ useOperatorRecordFocus: () => focusMock }));

import ProcessingDocumentsWork from "@/app/adminV2/pos/ProcessingDocumentsWork";
import type { DocumentFilingQueueRow, DocumentFilingWorkspace } from "@/lib/pos/documentFiling/documentFilingService";
import { EMPTY_PROPOSAL } from "@/lib/pos/documentFiling/documentFilingModel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CASE = "ca5e0000-0000-4000-8000-000000000001";
const DOC = "d5000000-0000-4000-8000-000000000001";
const H = "c0000000-0000-4000-8000-0000000000d1";
const C1 = "cb000000-0000-4000-8000-0000000000d1";

const row = (over: Partial<DocumentFilingQueueRow> = {}): DocumentFilingQueueRow => ({
    case_id: CASE, document_id: DOC, title: "Scan from front desk", received_at: "2026-10-20T10:00:00Z", case_status: "received", intent: "store_document",
    lane: "unclassified", required_action: "Choose the document type", proposed_type: null, suggested_type: { key: "enrollment_document", label: "Enrollment document", confidence: 0.62 },
    proposed_subject: null, uncertainty: { classification: "suggested", subject: "unresolved" }, last_error: null, filed_document_id: null, ...over,
});
const POLICY = {
    type_id: "t", version_id: "v", key: "enrollment_document", label: "Enrollment document", category_id: "c", category_label: "Enrollment",
    subject_types: ["child", "household", "opportunity"], allowed_formats: ["pdf"], default_sensitivity: "standard", review_required: false, replacement_policy: "new_document",
} as DocumentFilingWorkspace["catalog"][number];
const IMM = { ...POLICY, key: "immunization_record", label: "Immunization record", category_label: "Health & medical", subject_types: ["child"], default_sensitivity: "medical", review_required: true, replacement_policy: "new_version" } as DocumentFilingWorkspace["catalog"][number];

function ws(over: Partial<DocumentFilingWorkspace> = {}): DocumentFilingWorkspace {
    return {
        case: { id: CASE, status: "received", intent: "store_document", received_at: "2026-10-20T10:00:00Z", filed: false, operational_result: null },
        document_id: DOC,
        proposal: { ...EMPTY_PROPOSAL, contexts: [] },
        lane: "unclassified",
        required_action: "Choose the document type",
        catalog: [POLICY, IMM],
        suggested_type: { key: "enrollment_document", label: "Enrollment document", confidence: 0.62, method: "deterministic classifier (a proposal, not a filing)" },
        household: null,
        preview: {
            document: { id: DOC, title: "Scan from front desk", mime_type: "application/pdf", format: "pdf", byte_size: 4096, received_at: "2026-10-20T10:00:00Z", status: "uploaded", doc_type: null, sensitivity: "standard", filed: false },
            policy: null, resulting_sensitivity: "standard", existing_of_type: [], problems: [{ code: "TYPE_REQUIRED", message: "Choose the document type." }], can_file: false,
        },
        blocked: null,
        ...over,
    };
}
const HOUSEHOLD = {
    id: H, label: "Okafor household",
    members: [
        { subject_type: "household", subject_id: H, label: "Okafor household", role: "household", is_primary_contact: false, active: true },
        { subject_type: "child", subject_id: C1, label: "Obi Okafor", role: "child", is_primary_contact: false, active: true },
    ],
} as DocumentFilingWorkspace["household"];

let container: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; method: string; body: string | null }>;
let queueRows: DocumentFilingQueueRow[];
let workspaces: DocumentFilingWorkspace[];
let approveResponse: { status: number; body: unknown };

const respond = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
const flush = async () => {
    for (let i = 0; i < 6; i++) await act(async () => await Promise.resolve());
};
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const click = async (el: Element | null) => {
    await act(async () => (el as HTMLElement).click());
    await flush();
};

beforeEach(() => {
    calls = [];
    queueRows = [row(), row({ case_id: "ca5e0000-0000-4000-8000-000000000002", title: "Filed scan", lane: "filed", required_action: "No action" })];
    workspaces = [ws()];
    approveResponse = { status: 200, body: { ok: true, data: { status: "completed" } } };
    focusMock.mockClear();
    vi.stubGlobal(
        "fetch",
        vi.fn((url: string, init?: RequestInit) => {
            const method = init?.method ?? "GET";
            calls.push({ url, method, body: (init?.body as string) ?? null });
            if (url === "/api/admin/processing/documents/queue") return respond({ ok: true, rows: queueRows });
            if (url.includes("/document-filing") && method === "GET") return respond({ ok: true, workspace: workspaces.length > 1 ? workspaces.shift() : workspaces[0] });
            if (url.includes("/document-filing") && method === "PUT") return respond({ ok: true, proposal: JSON.parse(String(init?.body)).proposal });
            if (url.includes("/approve")) return respond(approveResponse.body, approveResponse.status);
            return respond({ ok: false }, 404);
        }),
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

async function mount() {
    await act(async () => root.render(<ProcessingDocumentsWork />));
    await flush();
}

describe("Processing → Work → Documents", () => {
    it("shows the queue with lane counts and filters by lane; each row names its type, record, lane and action", async () => {
        await mount();
        expect(q("documents-lane-all")?.textContent).toContain("2");
        expect(q("documents-lane-unclassified")?.textContent).toContain("1");
        expect(q(`documents-queue-row-${CASE}`)?.textContent).toContain("Suggested: Enrollment document");
        expect(q(`documents-queue-row-${CASE}`)?.textContent).toContain("No record chosen");
        expect(q(`documents-queue-lane-${CASE}`)?.textContent).toBe("Unclassified");
        await click(q("documents-lane-filed"));
        expect(q(`documents-queue-row-${CASE}`)).toBeNull();
        expect(container.textContent).toContain("Filed scan");
    });

    it("the classifier's suggestion is only a proposal: using it saves the type as 'suggested'", async () => {
        await mount();
        await click(q(`documents-queue-row-${CASE}`));
        expect(q("documents-suggestion")?.textContent).toContain("deterministic classifier");
        expect((q("documents-type-select") as HTMLSelectElement).value).toBe("");
        expect((q("documents-file") as HTMLButtonElement).disabled).toBe(true);
        expect(q("documents-record-unresolved")?.textContent).toContain("does not match a document to a person by name or email");
        const use = [...container.querySelectorAll("button")].find((b) => b.textContent === "Use")!;
        await click(use);
        const put = calls.find((c) => c.method === "PUT")!;
        expect(JSON.parse(put.body!).proposal).toMatchObject({ doc_type: "enrollment_document", doc_type_source: "suggested" });
    });

    it("choosing the record files under it; File runs the approval and shows the filed result that opens the record", async () => {
        workspaces = [
            ws({ household: HOUSEHOLD, proposal: { ...EMPTY_PROPOSAL, contexts: [], doc_type: "enrollment_document", household_id: H }, preview: { ...ws().preview!, policy: POLICY, problems: [{ code: "SUBJECT_REQUIRED", message: "Choose the record the document belongs to." }] } }),
            ws({
                household: HOUSEHOLD,
                proposal: { ...EMPTY_PROPOSAL, contexts: [], doc_type: "enrollment_document", household_id: H, primary: { subject_type: "child", subject_id: C1, label: "Obi Okafor" } },
                preview: { ...ws().preview!, policy: POLICY, problems: [], can_file: true },
            }),
            ws({
                case: { id: CASE, status: "completed", intent: "store_document", received_at: "", filed: true, operational_result: { kind: "document_filed", filed_document_id: DOC, mode: "new_document", primary: { subject_type: "child", subject_id: C1, label: "Obi Okafor" } } },
            }),
        ];
        await mount();
        await click(q(`documents-queue-row-${CASE}`));
        expect(q("documents-type-policy")?.textContent).toContain("Enrollment");
        await click(q(`documents-primary-child-${C1}`));
        expect(JSON.parse(calls.filter((c) => c.method === "PUT").pop()!.body!).proposal.primary).toMatchObject({ subject_type: "child", subject_id: C1 });
        expect(q("documents-ready")?.textContent).toContain("under Obi Okafor");
        await click(q("documents-file"));
        expect(calls.some((c) => c.method === "POST" && c.url === `/api/admin/processing/cases/${CASE}/approve`)).toBe(true);
        expect(q("documents-filed-result")?.textContent).toContain("Obi Okafor");
        await click(q("documents-open-record"));
        expect(focusMock).toHaveBeenCalledWith(expect.objectContaining({ entity_type: "customer_members", entity_id: C1, intent: "durable_record", card_focus: { card_key: "documents", item_id: DOC } }));
    });

    it("a refused filing is shown as not done, with Retry; review-required types ask for the review", async () => {
        const errored = ws({
            household: HOUSEHOLD,
            proposal: { ...EMPTY_PROPOSAL, contexts: [], doc_type: "immunization_record", household_id: H, primary: { subject_type: "child", subject_id: C1, label: "Obi Okafor" }, last_error: { code: "REVIEW_REQUIRED", message: "Immunization record needs a review before filing.", at: "" } },
            preview: { ...ws().preview!, policy: IMM, resulting_sensitivity: "medical", problems: [{ code: "REVIEW_REQUIRED", message: "Immunization record needs a review before filing." }], can_file: false },
        });
        workspaces = [errored];
        await mount();
        await click(q(`documents-queue-row-${CASE}`));
        expect(q("documents-filing-error")?.textContent).toContain("Filing did not happen");
        expect(q("documents-review")).not.toBeNull();
        expect(q("documents-file")?.textContent).toBe("Retry filing");
        expect((q("documents-file") as HTMLButtonElement).disabled).toBe(true);
        const sens = q("documents-sensitivity") as HTMLSelectElement;
        expect([...sens.options].map((o) => o.value)).toEqual(["medical", "custody_safeguarding", "restricted"]); // never lower
        expect(container.textContent).not.toContain("Filed under Obi");
    });

    it("a quarantined document is shown as held, with no filing controls enabled", async () => {
        workspaces = [ws({ blocked: { code: "DOCUMENT_QUARANTINED", message: "This document is held by screening." }, preview: null })];
        await mount();
        await click(q(`documents-queue-row-${CASE}`));
        expect(q("documents-blocked")?.textContent).toContain("held by screening");
        expect((q("documents-type-select") as HTMLSelectElement).disabled).toBe(true);
        expect((q("documents-file") as HTMLButtonElement).disabled).toBe(true);
    });

    it("is a Work section of the Digital Mailroom, not a separate application", () => {
        const shell = readFileSync(join(process.cwd(), "app/adminV2/pos/DigitalMailroomShell.tsx"), "utf8");
        expect(shell).toMatch(/key: "documents" as const, label: "Documents"/);
        const modal = readFileSync(join(process.cwd(), "app/adminV2/processing/ProcessingModal.tsx"), "utf8");
        expect(modal).toMatch(/workView === "documents" \?/);
    });
});
