/** @vitest-environment jsdom */

/**
 * D6 — the operator surfaces of document requirements:
 *   - Processing → Work → Documents: received documents stay the default; "Missing documents" lists the derived rows,
 *     filters by state, opens the record's Documents card and waives with a reason;
 *   - the Focus Panel readiness card: totals and per-member rows from the server, accept/reject/waive/revoke;
 *   - Studio → Documents → Requirements: list and create through the server;
 *   - Work Items: the Documents projection (derived id, source filter, completion owned by Documents, no due metric).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { focusMock } = vi.hoisted(() => ({ focusMock: vi.fn(async () => true) }));
vi.mock("@/lib/runtime/focus/useOperatorRecordFocus", () => ({ useOperatorRecordFocus: () => focusMock }));

import ProcessingDocumentsWork from "@/app/adminV2/pos/ProcessingDocumentsWork";
import ProcessingDocumentsStudio from "@/app/adminV2/pos/ProcessingDocumentsStudio";
import DocumentReadinessPanel from "@/components/admin/documents/DocumentReadinessPanel";
import type { RequirementWorkRow, SubjectReadiness } from "@/lib/documents/requirements/documentRequirementService";
import { resetDocumentRequirementWorkForTests } from "@/lib/documents/requirements/documentRequirementWorkClient";
import { isDocumentRequirementProjectedWorkItem, mapDocumentRequirementToWorkItemRow } from "@/lib/workItems/mapDocumentRequirementToWorkItemRow";
import { hasAuthoritativeDueCommitment, taskMatchesSource, WORK_ITEM_SOURCE_DEFS } from "@/lib/workItems/workItemQueueScope";
import { buildWorkItemDetailModel, resolveWorkItemSourceKind } from "@/lib/workItems/workItemDetailModel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const C1 = "cb000000-0000-4000-8000-000000000001";
const H = "c0000000-0000-4000-8000-0000000000d6";
const R1 = "a6000000-0000-4000-8000-000000000001";
const R2 = "a6000000-0000-4000-8000-000000000002";
const DOC = "d6000000-0000-4000-8000-000000000001";

const workRow = (over: Partial<RequirementWorkRow> = {}): RequirementWorkRow => ({
    id: `document_requirement:${R1}:child:${C1}`, requirement_id: R1, requirement_key: "immunizations", requirement_label: "Immunization record on file",
    document_type_key: "immunization_record", document_type_label: "Immunization record", subject_type: "child", subject_id: C1, subject_label: "Mia Rivera",
    household_id: H, state: "missing", blocked_reason: null, due_on: "2026-10-20", overdue: true, waivable: true, pending_document_ids: [], undated_document_ids: [], expired_document_ids: [], valid_until: null, renewal: null, ...over,
});

let container: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; method: string; body: string | null }>;
let work: RequirementWorkRow[];
let readiness: { household: { id: string; label: string } | null; subjects: SubjectReadiness[]; totals: Record<string, number>; today: string };

const respond = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
const flush = async () => {
    for (let i = 0; i < 8; i++) await act(async () => await Promise.resolve());
};
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const click = async (el: Element | null) => {
    expect(el).not.toBeNull();
    await act(async () => (el as HTMLElement).click());
    await flush();
};
const type = async (el: Element | null, value: string) => {
    const input = el as HTMLInputElement | HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!;
    await act(async () => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
};

function evaluation(state: "missing" | "pending_review" | "satisfied" | "waived" | "blocked", over: Record<string, unknown> = {}) {
    return {
        requirement_id: R1, requirement_key: "immunizations", version_id: "v1", label: "Immunization record on file", document_type_key: "immunization_record",
        subject_type: "child", subject_id: C1, policy: "required", blocking: state !== "satisfied" && state !== "waived", state, blocked_reason: null,
        evidence: { accepted: state === "satisfied" ? [DOC] : [], pending: state === "pending_review" ? [DOC] : [], rejected: [] },
        waiver_id: state === "waived" ? "e0000000-0000-4000-8000-000000000001" : null, waivable: true, due_on: "2026-10-20", ...over,
    };
}

beforeEach(() => {
    calls = [];
    work = [workRow(), workRow({ id: `document_requirement:${R2}:child:${C1}`, requirement_id: R2, requirement_key: "custody", requirement_label: "Custody order", state: "pending_review", waivable: false, overdue: false, due_on: "2026-11-30", pending_document_ids: [DOC] })];
    readiness = {
        household: { id: H, label: "Rivera household" },
        subjects: [{ subject: { subject_type: "child", subject_id: C1, label: "Mia Rivera", role: "child" }, requirements: [evaluation("missing") as never, evaluation("pending_review", { requirement_id: R2, requirement_key: "custody", label: "Custody order", waivable: false }) as never], counts: {} as never }],
        totals: { required: 2, on_file: 1, missing: 1, pending_review: 1, waived: 0, blocked: 0, satisfied: 0 },
        today: "2026-10-27",
    };
    focusMock.mockClear();
    resetDocumentRequirementWorkForTests();
    vi.stubGlobal(
        "fetch",
        vi.fn((url: string, init?: RequestInit) => {
            const method = init?.method ?? "GET";
            calls.push({ url, method, body: (init?.body as string) ?? null });
            if (url === "/api/admin/processing/documents/queue") return respond({ ok: true, rows: [] });
            if (url === "/api/admin/documents/requirements/work") return respond({ ok: true, rows: work, truncated: false, today: "2026-10-27" });
            if (url.startsWith("/api/admin/documents/requirements/readiness")) return respond({ ok: true, readiness });
            if (url === "/api/admin/documents/requirements/waivers" && method === "POST") {
                work = work.filter((w) => w.requirement_id !== R1);
                return respond({ ok: true, waiver_id: "e0000000-0000-4000-8000-000000000001" });
            }
            if (url.endsWith("/review") && method === "POST") return respond({ ok: true });
            if (url === "/api/admin/documents/configuration/categories") return respond({ ok: true, categories: [] });
            if (url === "/api/admin/documents/configuration/types")
                return respond({ ok: true, enforcement: {}, types: [{ id: "t1", key: "immunization_record", status: "active", seeded: true, published_version_id: "tv1", published: { label: "Immunization record", subject_types: ["child"] }, open_draft: null }] });
            if (url === "/api/admin/documents/configuration/requirements" && method === "GET") return respond({ ok: true, requirements: [] });
            if (url === "/api/admin/documents/configuration/requirements" && method === "POST") return respond({ ok: true, requirement_id: R1, version_id: "v1" });
            if (url.startsWith("/api/admin/documents/configuration/requirements/")) return respond({ ok: true, requirement: { id: R1, key: "immunizations", status: "active", published_version_id: null }, versions: [] });
            return respond({ ok: false, error: `unexpected ${url}` }, 404);
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

describe("Processing → Work → Documents: missing documents", () => {
    it("keeps received documents as the default view (D5 unchanged)", async () => {
        await act(async () => root.render(<ProcessingDocumentsWork />));
        await flush();
        expect(q("processing-documents-work")).not.toBeNull();
        expect(q("processing-document-requirement-work")).toBeNull();
        expect(calls.some((c) => c.url === "/api/admin/documents/requirements/work")).toBe(false);
    });

    it("lists derived rows with state, due and action; filters by state", async () => {
        await act(async () => root.render(<ProcessingDocumentsWork />));
        await flush();
        await click(q("documents-work-mode-missing"));
        expect(q(`requirement-work-row-immunizations-${C1}`)?.textContent).toContain("Overdue");
        expect(q(`requirement-work-state-immunizations-${C1}`)?.textContent).toBe("Missing");
        expect(q(`requirement-work-state-custody-${C1}`)?.textContent).toBe("Pending review");
        expect(q("requirement-work-filter-missing")?.textContent).toContain("1");
        await click(q("requirement-work-filter-pending_review"));
        expect(q(`requirement-work-row-immunizations-${C1}`)).toBeNull();
        expect(q(`requirement-work-row-custody-${C1}`)).not.toBeNull();
    });

    it("opens the record's Documents card, and waives with a reason (the row is gone on re-read)", async () => {
        await act(async () => root.render(<ProcessingDocumentsWork />));
        await flush();
        await click(q("documents-work-mode-missing"));
        await click(q(`requirement-work-row-immunizations-${C1}`));
        await click(q("requirement-work-open-record"));
        expect(focusMock).toHaveBeenCalledWith(expect.objectContaining({ entity_type: "customer_members", entity_id: C1, card_focus: expect.objectContaining({ card_key: expect.any(String) }) }));
        expect((q("requirement-work-waive") as HTMLButtonElement).disabled).toBe(true);
        await type(q("requirement-work-waive-reason"), "Medical exemption on file");
        await click(q("requirement-work-waive"));
        const post = calls.find((c) => c.url === "/api/admin/documents/requirements/waivers" && c.method === "POST");
        expect(JSON.parse(post!.body!)).toEqual({ requirement_id: R1, subject_type: "child", subject_id: C1, reason: "Medical exemption on file" });
        expect(q(`requirement-work-row-immunizations-${C1}`)).toBeNull();
    });

    it("a non-waivable requirement offers no waiver", async () => {
        await act(async () => root.render(<ProcessingDocumentsWork />));
        await flush();
        await click(q("documents-work-mode-missing"));
        await click(q(`requirement-work-row-custody-${C1}`));
        expect(q("requirement-work-waive")).toBeNull();
    });
});

describe("Focus Panel readiness", () => {
    const render = async (canMutate = true) => {
        await act(async () =>
            root.render(<DocumentReadinessPanel anchor={{ subject_type: "household", subject_id: H }} focus={null} canMutate={canMutate} refreshNonce={0} onChanged={() => undefined} />),
        );
        await flush();
    };

    it("shows required, on file, missing, pending review and waived from the server", async () => {
        await render();
        expect(q("document-readiness-required")?.textContent).toBe("2 required");
        expect(q("document-readiness-on-file")?.textContent).toBe("1 on file");
        expect(q("document-readiness-missing")?.textContent).toBe("1 missing");
        expect(q("document-readiness-pending")?.textContent).toBe("1 pending review");
        expect(q(`document-readiness-state-immunizations-${C1}`)?.textContent).toBe("Missing");
        expect(q(`document-readiness-state-custody-${C1}`)?.textContent).toBe("Pending review");
        expect(calls[0].url).toBe(`/api/admin/documents/requirements/readiness?subject_type=household&subject_id=${H}`);
    });

    it("accepts a pending document through the review route; waives with a reason", async () => {
        await render();
        await click(q("document-readiness-accept-custody"));
        const review = calls.find((c) => c.url === `/api/admin/documents/${DOC}/review`);
        expect(JSON.parse(review!.body!)).toEqual({ decision: "accepted" });
        await click(q("document-readiness-waive-immunizations"));
        await type(q("document-readiness-reason"), "Exempt by director");
        await click(q("document-readiness-confirm"));
        const waiver = calls.find((c) => c.url === "/api/admin/documents/requirements/waivers");
        expect(JSON.parse(waiver!.body!)).toMatchObject({ requirement_id: R1, subject_type: "child", subject_id: C1, reason: "Exempt by director" });
        // Readiness is re-read after each action, never patched locally.
        expect(calls.filter((c) => c.url.startsWith("/api/admin/documents/requirements/readiness")).length).toBeGreaterThanOrEqual(3);
    });

    it("offers no actions without write access, and no waiver on a non-waivable requirement", async () => {
        await render(false);
        expect(q("document-readiness-accept-custody")).toBeNull();
        expect(q("document-readiness-waive-immunizations")).toBeNull();
        await act(async () => root.unmount());
        root = createRoot(container);
        await render(true);
        expect(q("document-readiness-waive-custody")).toBeNull();
    });
});

describe("Studio → Documents → Requirements", () => {
    it("is the third section, lists requirements and creates a draft through the server", async () => {
        await act(async () => root.render(<ProcessingDocumentsStudio />));
        await flush();
        await click(q("documents-studio-section-requirements"));
        expect(q("documents-studio-requirements-empty")).not.toBeNull();
        await click(q("documents-studio-new-requirement"));
        await type(q("documents-studio-requirement-label"), "Immunization record on file");
        const select = q("documents-studio-requirement-type") as HTMLSelectElement;
        await act(async () => {
            select.value = "immunization_record";
            select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await click(q("documents-studio-requirement-save"));
        const post = calls.find((c) => c.url === "/api/admin/documents/configuration/requirements" && c.method === "POST");
        expect(JSON.parse(post!.body!)).toMatchObject({ label: "Immunization record on file", document_type_key: "immunization_record", subject_type: "child", policy: "required" });
    });
});

describe("Work Items: the Documents projection", () => {
    it("maps a derived row to a read-only work item; completion belongs to Documents", () => {
        const t = mapDocumentRequirementToWorkItemRow(workRow());
        expect(t).toMatchObject({ id: `document_requirement:${R1}:child:${C1}`, source: "documents", entity_type: "customer_members", entity_id: C1, assigned_to_user_id: null, status: "open" });
        expect(t.title).toBe("Collect: Immunization record on file — Mia Rivera");
        expect(isDocumentRequirementProjectedWorkItem(t)).toBe(true);
        expect(taskMatchesSource(t, "documents")).toBe(true);
        expect(taskMatchesSource(t, "processing")).toBe(false);
        expect(hasAuthoritativeDueCommitment(t)).toBe(false);
        expect(resolveWorkItemSourceKind(t)).toBe("documents");
        expect(buildWorkItemDetailModel(t)).toMatchObject({ kind: "documents", completionAuthority: "documents", subjectLabel: "Mia Rivera" });
        expect(WORK_ITEM_SOURCE_DEFS.find((d) => d.key === "documents")).toMatchObject({ available: true });
    });

    it("Work Items reads the same derived rows, never writes operational tasks for them, and routes completion to Documents", () => {
        const panel = readFileSync(join(__dirname, "../../app/adminV2/components/MyTasksPanel.tsx"), "utf8");
        expect(panel).toContain("mapDocumentRequirementWorkToWorkItemRows(snap?.rows ?? [], snap?.documents ?? [])");
        const complete = panel.slice(panel.indexOf("const onCompleteTask = useCallback("), panel.indexOf("const onSelectOutcome"));
        expect(complete.indexOf("isDocumentRequirementProjectedWorkItem(task)")).toBeGreaterThan(0);
        expect(complete.indexOf("isDocumentRequirementProjectedWorkItem(task)")).toBeLessThan(complete.indexOf("patchOperationalTaskStatus") === -1 ? complete.indexOf("onPatchStatus(task.id") : complete.indexOf("patchOperationalTaskStatus"));
        const work = readFileSync(join(__dirname, "../../app/adminV2/pos/ProcessingDocumentRequirementWork.tsx"), "utf8");
        expect(work).toContain("loadDocumentRequirementWork");
    });
});

// R1 (hosted qar_4246ac22ece0, browser W4f): the Focus Panel read "renewal awaiting review" beside a REJECTED renewal.
// Every surface states the renewal's own review state from the server's evaluation / work row, never a guess.
describe("R1 — the renewal's review state on the Focus Panel and in Processing", () => {
    const satisfiedBy = (over: Record<string, unknown>) =>
        evaluation("satisfied", { valid_until: "2026-11-09", expiring_soon: true, renewal_pending: false, renewal_rejected: false, ...over }) as never;
    const renderReadiness = async () => {
        await act(async () =>
            root.render(<DocumentReadinessPanel anchor={{ subject_type: "household", subject_id: H }} focus={null} canMutate refreshNonce={0} onChanged={() => undefined} />),
        );
        await flush();
    };
    const validUntil = () => q(`document-readiness-valid-until-immunizations-${C1}`)?.textContent ?? "";

    it("a pending renewal reads 'renewal awaiting review'", async () => {
        readiness.subjects[0].requirements = [satisfiedBy({ renewal_pending: true })];
        await renderReadiness();
        expect(validUntil()).toContain("renewal awaiting review");
        expect(validUntil()).not.toContain("rejected");
    });
    it("a rejected renewal reads 'renewal rejected — collect a new version', never 'awaiting review'", async () => {
        readiness.subjects[0].requirements = [satisfiedBy({ renewal_rejected: true })];
        await renderReadiness();
        expect(validUntil()).toContain("renewal rejected — collect a new version");
        expect(validUntil()).not.toContain("awaiting review");
    });
    it("an accepted renewal shows neither", async () => {
        readiness.subjects[0].requirements = [satisfiedBy({ expiring_soon: false, valid_until: "2027-10-19" })];
        await renderReadiness();
        expect(validUntil()).toBe("Valid through 2027-10-19");
    });
    it("Processing: an expiring requirement whose renewal awaits review is review work; a rejected one is renewal work", async () => {
        work = [workRow({ state: "expiring_soon", overdue: false, due_on: "2026-11-09", valid_until: "2026-11-09", renewal: "pending" })];
        await act(async () => root.render(<ProcessingDocumentsWork />));
        await flush();
        await click(q("documents-work-mode-missing"));
        await click(q(`requirement-work-row-immunizations-${C1}`));
        expect(q("requirement-work-open-record")?.textContent).toBe("Review on the record");
        expect(q("requirement-work-valid-until")?.textContent).toContain("the renewal on file awaits review");
        expect(mapDocumentRequirementToWorkItemRow(work[0]).title).toMatch(/^Review: /);

        const rejected = workRow({ state: "expiring_soon", overdue: false, due_on: "2026-11-09", valid_until: "2026-11-09", renewal: "rejected" });
        expect(mapDocumentRequirementToWorkItemRow(rejected).title).toMatch(/^Renew: /);
    });
    it("Processing: a rejected renewal's row says so and offers renewal", async () => {
        work = [workRow({ state: "expiring_soon", overdue: false, due_on: "2026-11-09", valid_until: "2026-11-09", renewal: "rejected" })];
        await act(async () => root.render(<ProcessingDocumentsWork />));
        await flush();
        await click(q("documents-work-mode-missing"));
        await click(q(`requirement-work-row-immunizations-${C1}`));
        expect(q("requirement-work-open-record")?.textContent).toBe("Renew on the record");
        expect(q("requirement-work-valid-until")?.textContent).toContain("the renewal on file was rejected");
    });
});
