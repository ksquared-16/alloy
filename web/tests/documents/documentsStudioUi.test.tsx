/** @vitest-environment jsdom */

/**
 * D3 — Studio → Documents renders the configuration, never presents a declared rule as active enforcement, and changes
 * only through the server routes. Also pins that the Documents tab is wired into the Digital Mailroom Studio.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProcessingDocumentsStudio from "@/app/adminV2/pos/ProcessingDocumentsStudio";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CAT = { id: "c1", key: "health", label: "Health & medical", description: null, parent_id: null, sort_order: 10, status: "active", seeded: true, updated_at: "" };
const PUBLISHED = {
    id: "v1", version_number: 1, status: "published", label: "Immunization record", description: null, category_id: "c1", subject_types: ["child"],
    allowed_formats: ["pdf"], default_sensitivity: "medical", review_required: true, replacement_policy: "new_version",
    validity_policy: { kind: "periodic_reconfirmation", value: 12, unit: "months", warning_days: [30, 7] }, validation_errors: [], created_at: "", published_at: "",
};
const DRAFT = { ...PUBLISHED, id: "v2", version_number: 2, status: "draft", label: "Immunization record (revised)" };
const TYPE = { id: "t1", key: "immunization_record", status: "active", seeded: true, published_version_id: "v1", published: PUBLISHED, open_draft: DRAFT };

let container: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; method: string; body: unknown }>;

function respond(body: unknown, status = 200) {
    return Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
}

beforeEach(() => {
    calls = [];
    vi.stubGlobal(
        "fetch",
        vi.fn((url: string, init?: RequestInit) => {
            const method = init?.method ?? "GET";
            calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
            if (url.endsWith("/categories") && method === "GET") return respond({ ok: true, categories: [CAT] });
            if (url.endsWith("/types") && method === "GET") return respond({ ok: true, types: [TYPE], enforcement: {} });
            if (url.endsWith("/types/t1") && method === "GET") return respond({ ok: true, type: TYPE, versions: [DRAFT, PUBLISHED], enforcement: {} });
            if (url.endsWith("/types/t1/validate")) return respond({ ok: true, valid: false, problems: [{ field: "default_sensitivity", code: "medical_type_floor" }] });
            if (url.endsWith("/types/t1") && method === "PATCH") return respond({ error: "Forbidden" }, 403);
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
    for (let i = 0; i < 5; i += 1) await act(async () => await Promise.resolve());
};
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

describe("Studio → Documents", () => {
    it("lists types with their published version, open draft and sensitivity", async () => {
        await act(async () => root.render(<ProcessingDocumentsStudio />));
        await flush();
        const card = q("documents-studio-type-immunization_record");
        expect(card?.textContent).toContain("Immunization record");
        expect(card?.textContent).toContain("Published v1");
        expect(card?.textContent).toContain("Draft v2");
        expect(card?.textContent).toContain("Medical");
    });

    it("labels each policy with its enforcement (validity is evaluated since D7), and publish waits for validation", async () => {
        await act(async () => root.render(<ProcessingDocumentsStudio />));
        await flush();
        await act(async () => q("documents-studio-type-immunization_record")!.click());
        await flush();
        const editor = q("documents-studio-type-editor")!;
        expect(editor.textContent).toContain("Enforced for new documents");
        expect(editor.textContent).toContain("Enforced — an expired document no longer satisfies a requirement");
        expect(editor.textContent).toContain("Enforced when a document is filed or uploaded");
        expect(editor.textContent).toContain("Enforced when a document is filed or replaced");
        expect(editor.textContent).not.toContain("enforced from D5");
        expect((q("documents-studio-publish") as HTMLButtonElement).disabled).toBe(true);
        // The sensitivity a revision may choose never goes below the published medical class.
        const options = [...(q("documents-studio-sensitivity") as HTMLSelectElement).options].map((o) => o.value);
        expect(options.sort()).toEqual(["medical", "restricted"]);
    });

    it("validates through the server and shows its problems; a refused write shows the server's answer", async () => {
        await act(async () => root.render(<ProcessingDocumentsStudio />));
        await flush();
        await act(async () => q("documents-studio-type-immunization_record")!.click());
        await flush();
        await act(async () => q("documents-studio-validate")!.click());
        await flush();
        expect(calls.some((c) => c.url.endsWith("/types/t1/validate") && c.method === "POST" && (c.body as { version_id: string }).version_id === "v2")).toBe(true);
        expect(q("documents-studio-problems")?.textContent).toContain("medical type");
        await act(async () => q("documents-studio-archive")!.click());
        await flush();
        expect(q("documents-studio-message")?.textContent).toContain("Forbidden");
    });

    it("discards the open revision through the server; a type whose only version is the draft offers Delete instead", async () => {
        await act(async () => root.render(<ProcessingDocumentsStudio />));
        await flush();
        await act(async () => q("documents-studio-type-immunization_record")!.click());
        await flush();
        await act(async () => q("documents-studio-discard")!.click());
        await flush();
        expect(calls.some((c) => c.url.endsWith("/types/t1/draft") && c.method === "DELETE")).toBe(true);
        expect(q("documents-studio-message")?.textContent).toContain("Draft discarded.");

        act(() => root.unmount());
        root = createRoot(container);
        const only = { ...TYPE, published_version_id: null, published: null };
        vi.stubGlobal(
            "fetch",
            vi.fn((url: string) => {
                if (url.endsWith("/categories")) return respond({ ok: true, categories: [CAT] });
                if (url.endsWith("/types")) return respond({ ok: true, types: [only], enforcement: {} });
                return respond({ ok: true, type: only, versions: [{ ...DRAFT, version_number: 1 }], enforcement: {} });
            }),
        );
        await act(async () => root.render(<ProcessingDocumentsStudio />));
        await flush();
        await act(async () => q("documents-studio-type-immunization_record")!.click());
        await flush();
        expect(q("documents-studio-discard")).toBeNull();
        expect(q("documents-studio-delete")).not.toBeNull();
    });

    it("every request goes to the configuration routes", async () => {
        await act(async () => root.render(<ProcessingDocumentsStudio />));
        await flush();
        expect(calls.length).toBeGreaterThan(0);
        expect(calls.every((c) => c.url.startsWith("/api/admin/documents/configuration/"))).toBe(true);
    });
});

describe("the Documents tab is wired into the Studio", () => {
    const WEB = resolve(__dirname, "../..");
    const read = (p: string) => readFileSync(join(WEB, p), "utf8");
    it("appears in every Studio tab enumeration and renders the Documents Studio", () => {
        expect(read("app/adminV2/pos/ProcessingStudioShell.tsx")).toMatch(/"documents"/);
        expect(read("app/adminV2/pos/DigitalMailroomShell.tsx")).toMatch(/key: "documents", label: "Documents"/);
        expect(read("app/adminV2/processing/processingResume.ts")).toMatch(/"documents"/);
        expect(read("lib/adminV2/workspaceModalEvents.ts")).toMatch(/"documents"/);
        expect(read("app/adminV2/pos/ProcessingFormsStudio.tsx")).toMatch(/studioTab === "documents" \? \(\s*<ProcessingDocumentsStudio \/>/);
    });
});
