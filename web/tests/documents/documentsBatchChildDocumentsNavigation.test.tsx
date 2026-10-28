/** @vitest-environment jsdom */
/**
 * D7 batch B1 — "Open the record's documents" on a child reaches that child's documents.
 *
 * The D6 hosted walk: requirement work → "Open the record's documents" on a child row → the durable child record,
 * whose composition is `[children]`, so `card=documents` raised a card that was never composed and no documents were
 * shown. The real DurableRecordSurface is rendered here (grid and library stubbed) to prove the landing, end to end
 * from the operator's click: the click's focus request → the durable address → the surface mounts the library
 * anchored on, and narrowed to, the child.
 */
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const libraryCalls: Array<{ anchor: unknown; initialFocus: unknown; canMutate: boolean }> = [];
vi.mock("@/components/admin/documents/DocumentLibraryPanel", () => ({
    default: (p: { anchor: unknown; initialFocus: unknown; canMutate: boolean }) => {
        libraryCalls.push(p);
        return <div data-testid="library" />;
    },
}));
vi.mock("@/components/admin/focusPanel/OpportunityFocusPanelModeGrid", () => ({ default: () => <div data-testid="grid" /> }));
vi.mock("@/components/presentation/durableRecord/DurableRecordContextStrip", () => ({ default: () => null }));
vi.mock("@/components/presentation/durableRecord/DurableRecordContextualCard", () => ({ default: () => null }));
vi.mock("@/contexts/AdminAuthContext", () => ({ useAdminAuth: () => ({ canMutate: true }) }));
vi.mock("@/lib/adminV2/runtime/focusPanel/durableSubject/durableRecordModelWire", async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    decodeDurableRecordModel: (m: unknown) => m,
}));
vi.mock("@/lib/workspace/workspaceAdminFetchDedupe", () => ({
    dedupeAdminFetchWithTtl: (url: string, init: RequestInit) => fetch(url, init),
}));

import DurableRecordSurface from "@/components/presentation/durableRecord/DurableRecordSurface";
import { durableRecordDocumentsFocus } from "@/components/presentation/durableRecord/DurableRecordDocuments";
import { durableRecordHref } from "@/lib/runtime/focus/durableRecordRoute";
import { OPERATOR_FOCUS_CARDS } from "@/lib/runtime/focus/operatorFocusCards";

const CHILD = "c1000000-0000-4000-8000-000000000001";
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
    libraryCalls.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
        ok: true,
        model: { subject: { type: "child", id: CHILD, label: "Child One" }, mode: "summary" },
        contexts: [],
        relatedWork: [],
        childSubject: null,
    }), { status: 200, headers: { "content-type": "application/json" } })));
});
afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

async function mount(cardKey: string | null, subjectType: "child" | "household" | "person" = "child") {
    await act(async () => {
        root.render(<DurableRecordSurface subjectType={subjectType} subjectId={CHILD} cardKey={cardKey} />);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe("B1 — the child's Documents from the operator's 'Open the record's documents'", () => {
    it("the click's focus request addresses the durable child record with card=documents", () => {
        const href = durableRecordHref("child", CHILD, OPERATOR_FOCUS_CARDS.documents);
        expect(href).toContain(`/child/${CHILD}`);
        expect(href).toContain("card=documents");
    });

    it("card=documents mounts the library anchored on the child and narrowed to it", async () => {
        await mount(OPERATOR_FOCUS_CARDS.documents);
        const section = container.querySelector(`[data-durable-record-documents="child:${CHILD}"]`);
        expect(section).not.toBeNull();
        expect(section?.querySelector('[data-testid="library"]')).not.toBeNull();
        expect(libraryCalls.at(-1)).toEqual({
            anchor: { subject_type: "child", subject_id: CHILD },
            initialFocus: { subject_type: "child", subject_id: CHILD },
            canMutate: true,
        });
        // The record composition still renders beside it — the grain's layout is untouched.
        expect(container.querySelector('[data-testid="grid"]')).not.toBeNull();
    });

    it("no card, or another card, mounts no Documents section", async () => {
        await mount(null);
        expect(container.querySelector("[data-durable-record-documents]")).toBeNull();
        await mount("children");
        expect(container.querySelector("[data-durable-record-documents]")).toBeNull();
        expect(libraryCalls).toHaveLength(0);
    });

    it("a household opens unnarrowed; a person narrowed to the person", () => {
        expect(durableRecordDocumentsFocus("household", "h1").initialFocus).toBeNull();
        expect(durableRecordDocumentsFocus("person", "p1").initialFocus).toEqual({ subject_type: "person", subject_id: "p1" });
    });
});
