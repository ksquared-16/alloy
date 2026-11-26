// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProcessingSaveToFormsFolder from "@/app/adminV2/pos/ProcessingSaveToFormsFolder";
import { __resetProcessingFolderStoreForTests } from "@/lib/pos/processingFolderStore";

/**
 * Choosing — or creating — the Forms folder without leaving Save to Forms, against the organisation's
 * folders on the server (not one browser's localStorage).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let serverFolders: unknown[] | null;
const patches: unknown[][] = [];
const selected: string[] = [];

const ORG_FOLDER = { id: "toddler_program", label: "Toddler Program", scopes: ["form", "work", "category"], order: 200, isSystem: false };

function mount(value = "") {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<ProcessingSaveToFormsFolder value={value} onChange={(id) => selected.push(id)} />));
}

const flush = async () => {
    for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
};

beforeEach(() => {
    __resetProcessingFolderStoreForTests();
    window.localStorage.clear();
    serverFolders = [ORG_FOLDER];
    patches.length = 0;
    selected.length = 0;
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
            if (String(url).endsWith("/api/admin/processing/folders") && (!init || !init.method || init.method === "GET")) {
                return new Response(JSON.stringify({ data: { folders: serverFolders } }), { status: 200 });
            }
            if (String(url).endsWith("/api/admin/processing/folders") && init?.method === "PATCH") {
                const folders = (JSON.parse(String(init.body)) as { folders: unknown[] }).folders;
                patches.push(folders);
                serverFolders = folders;
                return new Response(JSON.stringify({ data: { folders } }), { status: 200 });
            }
            return new Response("{}", { status: 404 });
        }),
    );
});

afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
});

function openOptions(): string[] {
    act(() => (document.querySelector('[data-testid="processing-save-to-forms-folder-select"] button') as HTMLElement).click());
    return [...document.querySelectorAll<HTMLElement>("[role=option]")].map((o) => o.textContent?.trim() ?? "");
}

describe("Save to Forms folder", () => {
    it("offers the organisation's folders from the server", async () => {
        mount();
        await flush();
        expect(openOptions()).toContain("Toddler Program");
    });

    it("creates a folder in context: saved to the organisation first, then selected", async () => {
        mount();
        await flush();
        act(() => (document.querySelector('[data-testid="processing-save-to-forms-create-folder"]') as HTMLElement).click());
        const input = document.querySelector<HTMLInputElement>('[data-testid="processing-save-to-forms-new-folder-name"]')!;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        act(() => {
            setter.call(input, "2026–2027 Enrollment");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        act(() => (document.querySelector('[data-testid="processing-save-to-forms-new-folder-create"]') as HTMLElement).click());
        await flush();
        expect(selected.at(-1)).toBe("2026_2027_enrollment");
        const last = patches.at(-1) as Array<{ id: string; label: string }>;
        expect(last.some((f) => f.id === "2026_2027_enrollment" && f.label === "2026–2027 Enrollment")).toBe(true);
        // The organisation's existing folder survives the write.
        expect(last.some((f) => f.id === "toddler_program")).toBe(true);
        // No technical id is shown to the operator.
        expect(document.body.textContent).not.toMatch(/2026_2027_enrollment|org-|[0-9a-f]{8}-[0-9a-f]{4}/);
    });

    it("refuses an empty folder name without writing anything", async () => {
        mount();
        await flush();
        act(() => (document.querySelector('[data-testid="processing-save-to-forms-create-folder"]') as HTMLElement).click());
        act(() => (document.querySelector('[data-testid="processing-save-to-forms-new-folder-create"]') as HTMLElement).click());
        await flush();
        expect(patches).toHaveLength(0);
        expect(selected).toHaveLength(0);
        expect(document.body.textContent).toContain("Enter a folder name.");
    });
});
