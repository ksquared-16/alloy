/**
 * The reachability defect this closes, stated once:
 *
 *   `processing_case_sources` always allowed several sources. `attachRelatedSource` was always the
 *   canonical writer. Packet analysis always read every source. "Analyse as one packet" was in the
 *   UI. And **nothing an operator could press ever wrote a related row** — so every case in every
 *   database had exactly one source, and the packet button sat next to state no one could create.
 *
 * A capability with no caller is not a capability. These controls assert the caller exists and stays
 * wired, because the failure mode here is silent: everything compiles, the button renders, and the
 * feature is simply unreachable.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProcessingDocumentUploadForm } from "@/lib/pos/processingDocumentUpload";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
/** Comments describe the gap; only code closes it. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the canonical writer has a production caller", () => {
    it("is called by the safe wrapper, which is called by the upload route", () => {
        const wrapper = code("lib/pos/processingCase/maybeOpenProcessingCaseFromNonFormSourceSafe.ts");
        expect(wrapper, "the safe wrapper must call the canonical writer").toMatch(/attachRelatedSource\(/);

        const route = code("app/api/admin/documents/upload/route.ts");
        expect(route, "a production route must call the safe wrapper").toMatch(/attachRelatedSourceToCaseSafe\(/);
        expect(route, "the route must read the operator's target case").toMatch(/attach_to_case_id/);
    });

    it("is reachable from an operator control, not only from the API", () => {
        const ui = code("app/adminV2/pos/PosTemplateSetupColumn.tsx");
        expect(ui, "the case screen needs an Add source control").toMatch(/processing-add-source/);
        expect(ui, "the control must upload against this case").toMatch(/attachToCaseId/);
    });

    it("reuses the ordinary upload path rather than a second upload system", () => {
        // A parallel packet-upload endpoint is the thing this fix must not become.
        const helper = code("lib/pos/processingDocumentUpload.ts");
        expect(helper).toMatch(/\/api\/admin\/documents\/upload/);
        const routes = code("app/api/admin/documents/upload/route.ts");
        expect(routes).toMatch(/attach_to_case_id/);
    });
});

describe("the upload form says which case it targets", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "handbook.pdf", { type: "application/pdf" });

    it("asks to ATTACH when a case is named, and does not also ask to open one", () => {
        const form = buildProcessingDocumentUploadForm({
            file,
            intent: "generate_form",
            displayName: "Handbook",
            attachToCaseId: "case-1",
        });
        expect(form.get("attach_to_case_id")).toBe("case-1");
        // Both at once would be ambiguous: attach to that case, or open a new one?
        expect(form.get("open_processing_case"), "must not request a new case while attaching").toBeNull();
    });

    it("opens a case when none is named — the ordinary import is unchanged", () => {
        const form = buildProcessingDocumentUploadForm({ file, intent: "generate_form", displayName: "Handbook" });
        expect(form.get("open_processing_case")).toBe("true");
        expect(form.get("attach_to_case_id")).toBeNull();
    });

    it("carries the file itself, so the document path still owns bytes, hash and provenance", () => {
        const form = buildProcessingDocumentUploadForm({
            file,
            intent: "generate_form",
            displayName: "Handbook",
            attachToCaseId: "case-1",
        });
        expect(form.get("file")).toBeInstanceOf(File);
    });
});

describe("the attach path refuses what it must refuse", () => {
    const wrapper = code("lib/pos/processingCase/maybeOpenProcessingCaseFromNonFormSourceSafe.ts");

    it("scopes the case lookup to the caller's org — same boundary as the case", () => {
        expect(wrapper).toMatch(/from\("processing_cases"\)[\s\S]{0,200}eq\("org_id"/);
    });

    it("is idempotent, and never makes a second primary", () => {
        expect(wrapper).toMatch(/already_attached/);
        expect(wrapper).toMatch(/is_primary/);
        // The role belongs to the canonical writer, and the wrapper delegates rather than
        // re-deciding it — which is why the wrapper cannot accidentally write a primary.
        expect(wrapper).toMatch(/attachRelatedSource\(/);
        expect(code("lib/pos/processingCase/openProcessingCaseFromSource.ts")).toMatch(/role: "related"/);
    });

    it("only accepts the source kinds Processing already supports", () => {
        expect(wrapper).toMatch(/isNonFormProcessingSourceKind\(/);
        expect(wrapper).toMatch(/unsupported_kind/);
    });

    it("never opens or forks a case on the attach path", () => {
        const attachBlock = wrapper.slice(wrapper.indexOf("attachRelatedSourceToCaseSafe"));
        expect(attachBlock).not.toMatch(/insertCase|openProcessingCaseFromSource/);
    });
});
