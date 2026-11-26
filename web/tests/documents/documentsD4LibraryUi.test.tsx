/** @vitest-environment jsdom */

/**
 * D4 — the Focus Panel document library: grouping by subject, server-side narrowing, warm record switching, upload
 * through the canonical route, deferred version history, and history that never shows a refused attempt as done.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DocumentLibraryPanel from "@/components/admin/documents/DocumentLibraryPanel";
import { documentLibraryFocusFromRecord } from "@/components/admin/documents/FocusPanelDocumentLibrary";
import { __resetDocumentLibraryCacheForTests } from "@/lib/documents/library/documentLibraryClient";
import type { DocumentLibrary, LibraryDocument } from "@/lib/documents/library/documentLibraryModel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const H = "c0000000-0000-4000-8000-000000000001";
const C1 = "cb000000-0000-4000-8000-000000000001";
const C2 = "cb000000-0000-4000-8000-000000000002";
const OPP = "0e000000-0000-4000-8000-000000000001";

function d(id: string, title: string, owner: LibraryDocument["owner"], over: Partial<LibraryDocument> = {}): LibraryDocument {
    return {
        id, title, original_filename: `${id}.pdf`, mime_type: "application/pdf", byte_size: 2048,
        type: { key: "enrollment_document", label: "Enrollment document", registered: true, category_id: "cat", category_label: "Enrollment" },
        sensitivity: "standard", status: "uploaded", received_at: "2026-10-20T00:00:00Z", owner, owned_elsewhere: !owner,
        associations: owner ? [{ ...owner, association: "owner", is_primary: true, derived_from: "document_subjects" }] : [],
        forms_artifact: false, current_version: { id: `v-${id}`, version_number: 1, created_at: null, source: "document_insert", review_status: null, effective_on: null, expires_on: null }, version_count: 1,
        ...over,
    };
}
const SUBJECTS: DocumentLibrary["subjects"] = [
    { subject_type: "household", subject_id: H, label: "Rivera household", role: "household", is_primary_contact: false, active: true },
    { subject_type: "child", subject_id: C1, label: "Mia Rivera", role: "child", is_primary_contact: false, active: true },
    { subject_type: "child", subject_id: C2, label: "Leo Rivera", role: "child", is_primary_contact: false, active: true },
    { subject_type: "opportunity", subject_id: OPP, label: "Fall enrollment", role: "case", is_primary_contact: false, active: true },
];
const library = (documents: LibraryDocument[], focus: DocumentLibrary["focus"] = null): DocumentLibrary => ({
    anchor: { subject_type: "opportunity", subject_id: OPP }, household: { id: H, label: "Rivera household" }, subjects: SUBJECTS, focus, documents, categories: [], truncated: false,
});
const ALL = [
    d("doc-h", "Household contract", { subject_type: "household", subject_id: H }),
    d("doc-c1", "Mia birth certificate", { subject_type: "child", subject_id: C1 }, { review_status: undefined } as never),
    d("doc-c2", "Leo immunizations", { subject_type: "child", subject_id: C2 }, { sensitivity: "medical", current_version: { id: "v2", version_number: 2, created_at: null, source: "replacement", review_status: "accepted", effective_on: null, expires_on: "2027-09-01" }, version_count: 2 }),
];

let container: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; method: string; body: unknown }>;
let failNext = false;

const respond = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);

beforeEach(() => {
    __resetDocumentLibraryCacheForTests();
    calls = [];
    failNext = false;
    vi.stubGlobal(
        "fetch",
        vi.fn((url: string, init?: RequestInit) => {
            const method = init?.method ?? "GET";
            calls.push({ url, method, body: init?.body ?? null });
            if (url.startsWith("/api/admin/documents/library")) {
                if (failNext) {
                    failNext = false;
                    return respond({ error: "Database unavailable" }, 500);
                }
                const q = new URL(url, "http://x").searchParams;
                if (q.get("focus_id") === C1) return respond({ ok: true, library: library([ALL[1]], { subject_type: "child", subject_id: C1 }) });
                return respond({ ok: true, library: library(ALL) });
            }
            if (url.endsWith("/versions")) return respond({ ok: true, versions: [{ id: "v2", version_number: 2, is_current: true, created_at: "2026-10-22T00:00:00Z", replacement_reason: "Updated record" }, { id: "v1", version_number: 1, created_at: "2026-10-20T00:00:00Z" }] });
            if (url.endsWith("/history"))
                return respond({ ok: true, entries: [
                    { at: "2026-10-23T00:00:00Z", kind: "refused", action: "Replacement attempted — no version was recorded", detail: null, version_number: null },
                    { at: "2026-10-22T00:00:00Z", kind: "committed", action: "Replaced with version 2", detail: "Updated record", version_number: 2 },
                ] });
            if (url.startsWith("/api/admin/documents/configuration/types"))
                return respond({ ok: true, types: [{ id: "t1", key: "immunization_record", status: "active", seeded: true, published_version_id: "p", published: { label: "Immunization record", default_sensitivity: "medical" }, open_draft: null }] });
            if (url === "/api/admin/documents/upload") return respond({ ok: true, document: { id: "new", status: "uploaded" } });
            return respond({ ok: true });
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

const flush = async () => {
    for (let i = 0; i < 6; i += 1) await act(async () => await Promise.resolve());
};
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const libraryCalls = () => calls.filter((c) => c.url.startsWith("/api/admin/documents/library"));

describe("Focus Panel document library", () => {
    it("groups by owner subject in household order and shows only what the record holds", async () => {
        await act(async () => root.render(<DocumentLibraryPanel anchor={{ subject_type: "opportunity", subject_id: OPP }} canMutate={false} />));
        await flush();
        const groups = [...container.querySelectorAll("[data-testid^='document-library-group-']")].map((g) => g.getAttribute("data-testid"));
        expect(groups).toEqual([`document-library-group-household:${H}`, `document-library-group-child:${C1}`, `document-library-group-child:${C2}`]);
        const leo = q("document-library-row-doc-c2")!.textContent ?? "";
        expect(leo).toContain("v2 of 2");
        expect(leo).toContain("Review: accepted");
        expect(leo).toContain("Expires 2027-09-01");
        expect(leo).toContain("Medical");
        // Nothing derived: a document whose version stores no review/validity shows none.
        expect(q("document-library-row-doc-c1")!.textContent).not.toMatch(/Review|Expires|Missing|Expiring/);
        expect(q("document-library-upload-toggle")).toBeNull();
    });

    it("opens narrowed to the selected child, asking the server for that focus; widening asks again", async () => {
        const focus = documentLibraryFocusFromRecord({ "child.customer_member_id": C1 });
        expect(focus).toEqual({ subject_type: "child", subject_id: C1 });
        await act(async () => root.render(<DocumentLibraryPanel anchor={{ subject_type: "opportunity", subject_id: OPP }} initialFocus={focus} canMutate={false} />));
        await flush();
        expect(libraryCalls()[0].url).toContain(`focus_type=child&focus_id=${C1}`);
        expect(container.textContent).toContain("Mia birth certificate");
        expect(container.textContent).not.toContain("Leo immunizations");
        await act(async () => q("document-library-focus-all")!.click());
        await flush();
        expect(libraryCalls().at(-1)!.url).not.toContain("focus_id");
        expect(container.textContent).toContain("Leo immunizations");
    });

    it("switching back to a record renders from its snapshot at once, with no loading state and no second read", async () => {
        const anchor = { subject_type: "opportunity" as const, subject_id: OPP };
        await act(async () => root.render(<DocumentLibraryPanel anchor={anchor} canMutate={false} />));
        await flush();
        act(() => root.unmount());
        root = createRoot(container);
        await act(async () => root.render(<DocumentLibraryPanel anchor={anchor} canMutate={false} />));
        expect(q("document-library-loading")).toBeNull();
        expect(container.textContent).toContain("Household contract");
        await flush();
        expect(libraryCalls()).toHaveLength(1);
    });

    it("uploads to the selected child through the canonical route, then reloads fresh", async () => {
        await act(async () => root.render(<DocumentLibraryPanel anchor={{ subject_type: "opportunity", subject_id: OPP }} initialFocus={{ subject_type: "child", subject_id: C1 }} canMutate />));
        await flush();
        await act(async () => q("document-library-upload-toggle")!.click());
        await flush();
        const input = q("document-library-upload")!.querySelector("input[type=file]") as HTMLInputElement;
        Object.defineProperty(input, "files", { value: [new File(["%PDF-1.4"], "card.pdf", { type: "application/pdf" })] });
        const before = libraryCalls().length;
        await act(async () => q("document-library-upload-submit")!.click());
        await flush();
        const post = calls.find((c) => c.url === "/api/admin/documents/upload")!;
        const form = post.body as FormData;
        expect(form.get("entity_type")).toBe("customer_member");
        expect(form.get("entity_id")).toBe(C1);
        expect(libraryCalls().length).toBeGreaterThan(before);
        expect(q("document-library-message")?.textContent).toBe("Uploaded.");
        // The type vocabulary was loaded only once the form opened.
        expect(calls.findIndex((c) => c.url.startsWith("/api/admin/documents/configuration/types"))).toBeGreaterThan(0);
    });

    it("loads versions and history only when a document is expanded, and labels a refused attempt as not applied", async () => {
        await act(async () => root.render(<DocumentLibraryPanel anchor={{ subject_type: "opportunity", subject_id: OPP }} canMutate={false} />));
        await flush();
        expect(calls.some((c) => c.url.endsWith("/history") || c.url.endsWith("/versions"))).toBe(false);
        await act(async () => (q("document-library-row-doc-c2")!.querySelector("button[aria-expanded]") as HTMLElement).click());
        await flush();
        const history = q("document-library-history-doc-c2")!;
        const refused = history.querySelector("[data-history-kind='refused']")!;
        expect(refused.textContent).toContain("Not applied");
        expect(history.querySelector("[data-history-kind='committed']")!.textContent).toContain("Done");
        expect(q("document-library-detail-doc-c2")!.textContent).toContain("Open v1");
    });

    it("shows the server's error with a retry that reads fresh", async () => {
        failNext = true;
        await act(async () => root.render(<DocumentLibraryPanel anchor={{ subject_type: "opportunity", subject_id: OPP }} canMutate={false} />));
        await flush();
        expect(container.textContent).toContain("Could not load documents: Database unavailable");
        await act(async () => ([...container.querySelectorAll("button")].find((b) => b.textContent === "Retry") as HTMLElement).click());
        await flush();
        expect(container.textContent).toContain("Household contract");
    });
});

describe("the library is the Focus Panel's Documents surface", () => {
    const WEB = resolve(__dirname, "../..");
    const read = (p: string) => readFileSync(join(WEB, p), "utf8");
    it("Activity → Documents and the Documents card drill both render it; the Activity prewarm warms it instead of the legacy list", () => {
        expect(read("components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace.tsx")).toContain("<FocusPanelDocumentLibrary opportunityId={drawerId} record={record} />");
        expect(read("components/admin/focusPanel/FocusPanelCardRenderer.tsx")).toContain("<FocusPanelDocumentLibrary opportunityId={drawerId} record={record} />");
        const prewarm = read("lib/adminV2/runtime/focusPanel/focusPanelActivityPrewarm.ts");
        expect(prewarm).toContain("scheduleOpportunityDrawerTabPrefetch(id, { documents: false })");
        expect(prewarm).toContain('prefetchDocumentLibrary({ subject_type: "opportunity", subject_id: id })');
    });
});
