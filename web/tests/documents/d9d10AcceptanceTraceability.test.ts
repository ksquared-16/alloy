/**
 * D9 / D10 acceptance preparation — traceability of certification/documents-v1/D9-D10-ACCEPTANCE-PREPARATION.md.
 *
 * The preparation document states which capabilities already exist (to be reused) and which interfaces are absent
 * (remaining work). Both halves are claims about the tree; this test pins them so the document cannot drift:
 *   - every capability it cites exists at the cited file, and the document names it;
 *   - every gap it states is still a gap.
 * When D9, D10 or the accountability work lands, the gap assertions here are EXPECTED to fail: update the document and
 * this test in the same change (that is the point). Read-only; no database.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const DOC = read("certification/documents-v1/D9-D10-ACCEPTANCE-PREPARATION.md");

const EXISTS: Array<{ file: string; pattern: RegExp; named: string }> = [
    { file: "web/lib/documents/filing/documentFiling.ts", pattern: /export async function commitDocumentFiling\(/, named: "commitDocumentFiling" },
    { file: "web/lib/documents/filing/documentFiling.ts", pattern: /ALREADY_FILED/, named: "ALREADY_FILED" },
    { file: "web/lib/documents/filing/documentFiling.ts", pattern: /STORAGE_COPY_FAILED/, named: "STORAGE_COPY_FAILED" },
    { file: "web/lib/platform/external/externalRequest.ts", pattern: /requireExternalPrincipal/, named: "requireExternalPrincipal" },
    { file: "web/lib/platform/external/scopeCatalog.ts", pattern: /export const PUBLIC_SCOPES/, named: "PUBLIC_SCOPES" },
    { file: "web/lib/platform/external/scopeCatalog.ts", pattern: /requireOperationScope/, named: "requireOperationScope" },
    { file: "web/lib/platform/external/rateLimit.ts", pattern: /consume_rate_limit/, named: "consume_rate_limit" },
    { file: "web/lib/communications/email/inboundEmailIngestion.ts", pattern: /ingestResendInboundEmail/, named: "ingestResendInboundEmail" },
    { file: "web/lib/communications/email/inboundEmailRouting.ts", pattern: /resolveInboundEmailOwnership/, named: "resolveInboundEmailOwnership" },
    { file: "web/lib/communications/email/inboundEmailNormalization.ts", pattern: /attachment support is not available yet/, named: "attachment support is not available yet" },
    { file: "web/lib/communications/canonicalOutboundEnqueue.ts", pattern: /export async function enqueueCanonicalOutboundMessage\(/, named: "enqueueCanonicalOutboundMessage" },
    { file: "web/lib/documents/requirements/documentRequirementEvaluator.ts", pattern: /export function evaluateDocumentRequirement\(/, named: "evaluateDocumentRequirement" },
    { file: "web/lib/documents/requirements/documentRequirementEvaluator.ts", pattern: /function dueOn\(/, named: "dueOn()" },
    { file: "web/lib/documents/requirements/documentRequirementService.ts", pattern: /export async function listRequirementWork\(/, named: "listRequirementWork" },
    { file: "web/lib/documents/requirements/documentRequirementService.ts", pattern: /export async function buildSubjectReadiness\(/, named: "buildSubjectReadiness" },
    { file: "web/lib/documents/requirements/documentRequirementService.ts", pattern: /export async function evaluateDocumentTypeRequirementsForChild\(/, named: "evaluateDocumentTypeRequirementsForChild" },
    { file: "web/lib/pos/packet/requirementResponsibility.ts", pattern: /export type ResponsibleParty/, named: "ResponsibleParty" },
    { file: "web/lib/pos/documentFiling/documentFilingModel.ts", pattern: /awaiting_subject/, named: "awaiting_subject" },
    { file: "web/lib/forms/formsDestinationScope.ts", pattern: /export async function formsDestinationInActorScope\(/, named: "formsDestinationInActorScope" },
];

describe("capabilities the document says to reuse exist, and the document names them", () => {
    for (const c of EXISTS) {
        it(`${c.named} — ${c.file}`, () => {
            expect(existsSync(resolve(ROOT, c.file)), c.file).toBe(true);
            expect(read(c.file)).toMatch(c.pattern);
            expect(DOC).toContain(c.named);
        });
    }

    it("the requirement states are exactly the six the document lists", () => {
        const m = /REQUIREMENT_STATES = Object\.freeze\(\[([^\]]*)\]/.exec(read("web/lib/documents/requirements/documentRequirementEvaluator.ts"));
        const states = [...(m?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
        expect(states).toEqual(["missing", "pending_review", "satisfied", "waived", "expired", "blocked"]);
        expect(DOC).toContain("`missing | pending_review | satisfied | waived | expired | blocked`");
    });

    it("the LOCATED D9 text is still where the document quotes it", () => {
        expect(read("docs/api/documents-forms-api.md")).toContain("an external Documents API must call the same filing");
        expect(read("certification/documents-v1/D5-PROCESSING-FILING.md")).toContain("D9 (external API)");
        expect(read("docs/api/api-architecture.md")).toContain("No admin session, no caller-selected tenant");
    });
});

describe("the gaps the document states are still gaps", () => {
    // D9.1 landed (OPWORK_AA660DC9554D_SPRINT_5D62877D85D6): the read scope and its four operations now exist. What
    // §1.3 still lists as remaining — writes, uploads, filing through the API — is still absent.
    it("D9.1 implemented: documents.read and four read operations; no documents WRITE scope or operation yet", () => {
        const catalog = read("web/lib/platform/external/scopeCatalog.ts");
        expect(catalog).toMatch(/"documents\.read": \{/);
        for (const op of ["listDocumentCategories", "listDocuments", "getDocument", "getDocumentDownloadLink"]) expect(catalog).toContain(op);
        expect(catalog).not.toMatch(/["']documents\.write["']/);
        const spec = JSON.parse(read("docs/api/openapi/alloy-public-api.v1.json")) as { paths?: Record<string, Record<string, unknown>> };
        const docPaths = Object.entries(spec.paths ?? {}).filter(([p]) => p.includes("document"));
        expect(docPaths.map(([p]) => p).sort()).toEqual(["/api/v1/document-categories", "/api/v1/documents", "/api/v1/documents/{id}", "/api/v1/documents/{id}/download-link"]);
        for (const [, methods] of docPaths) expect(Object.keys(methods)).toEqual(["get"]);
    });

    it("D10: WS11's communication_message_attachments is planned but in no migration", () => {
        expect(read("docs/platform/planning/conversation-platform-v1/CONVERSATION-PLATFORM-V1-PLAN.md")).toContain("communication_message_attachments");
        const dir = resolve(ROOT, "supabase/migrations");
        const hits = readdirSync(dir).filter((f) => f.endsWith(".sql") && readFileSync(resolve(dir, f), "utf8").includes("communication_message_attachments"));
        expect(hits).toEqual([]);
    });

    // D10 pilot landed (OPWORK_AA660DC9554D_SPRINT_5D62877D85D6): email_attachment is now a filing-queue document source,
    // and the Documents pipeline (lib/documents/inbound/inboundAttachmentFiling.ts) opens cases through the existing
    // non-form opener — but ingestion still does not call it, because WS11 storage does not exist.
    it("D10: email_attachment is an admitted case source AND a filing-queue document source", () => {
        expect(read("supabase/migrations/20261124090000_processing_participant_child_requests.sql")).toContain("'email_attachment'");
        const m = /DOCUMENT_SOURCE_KINDS[^=]*=\s*\[([^\]]*)\]/.exec(read("web/lib/pos/documentFiling/documentFilingModel.ts"));
        expect(m?.[1] ?? "").toContain("email_attachment");
    });

    it("D10: no inbound-email code opens a Processing case", () => {
        const ing = read("web/lib/communications/email/inboundEmailIngestion.ts");
        expect(ing).not.toMatch(/maybeOpenProcessingCase|processing_cases/);
    });

    it("accountability: no reminder / escalation code and no owner column for document requirements", () => {
        const dir = resolve(ROOT, "web/lib/documents");
        const files: string[] = [];
        const walk = (d: string) => {
            for (const e of readdirSync(d, { withFileTypes: true })) {
                const p = resolve(d, e.name);
                if (e.isDirectory()) walk(p);
                else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
            }
        };
        walk(dir);
        const offenders = files.filter((f) => /remind|escalat/i.test(readFileSync(f, "utf8")));
        expect(offenders).toEqual([]);
        const d6 = read("supabase/migrations/20261212090000_documents_d6_requirements.sql");
        expect(d6).not.toMatch(/\b(owner|assignee|responsible)[a-z_]*\s+(uuid|text)/i);
    });
});
