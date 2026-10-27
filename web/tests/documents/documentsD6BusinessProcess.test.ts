/**
 * D6.6 — Business Process readiness CONSUMES Documents; it never decides document satisfaction.
 *
 * Proven here, as functions of explicit inputs:
 *   - a stage `document` requirement is authorable only when it names a published Studio type a child can file;
 *   - the Documents answer maps onto participant progress (satisfied / waived → satisfied; else outstanding;
 *     no answer → left unsupported, i.e. blocking);
 *   - completion sufficiency keeps its semantics: required/enforced block, recommended does not, and an Enrollment
 *     stage exception still excepts an outstanding document requirement without dressing it up as satisfied.
 * And, as source guards, that the live resolver asks Documents (before Financials) and that nothing in Business
 * Process or Enrollment reads document review state itself.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { evaluateEnrollmentCompletionSufficiency } from "@/lib/enrollment/completion/enrollmentCompletionSufficiency";
import type { EnrollmentRequirementProgress } from "@/lib/enrollment/participantProgress/enrollmentParticipantProgressTypes";
import { projectDocumentRequirementProgress } from "@/lib/enrollment/participantProgress/projectDocumentRequirementProgress";
import type { PublishedDocumentTypePolicy } from "@/lib/documents/configuration/documentTypeEnforcement";
import type { RequirementEvaluation } from "@/lib/documents/requirements/documentRequirementEvaluator";
import { documentStageRequirementRefusals } from "@/lib/documents/requirements/documentStageRequirementRefs";
import { isAuthorableRequirementKind, refuseUnauthorableRequirement, type StageRequirementV1 } from "@/lib/lifecycle/stageRequirementsV1";

const root = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

const policy = (key: string, subject_types: string[]): PublishedDocumentTypePolicy => ({
    type_id: `t-${key}`, version_id: `v-${key}`, key, label: key, category_id: null, category_label: null,
    subject_types: subject_types as PublishedDocumentTypePolicy["subject_types"], allowed_formats: ["pdf"], default_sensitivity: "standard",
    review_required: true, replacement_policy: "new_version", validity_policy: { kind: "none" },
});
const docReq = (id: string, key: string, level: StageRequirementV1["level"] = "required"): StageRequirementV1 =>
    ({ requirement_id: id, ref: { kind: "document", document_type_key: key }, level, timing: "stage_exit", enforcement: "blocking" }) as StageRequirementV1;
const unsupported = (id: string, level: EnrollmentRequirementProgress["level"] = "required"): EnrollmentRequirementProgress => ({
    requirement_id: id, kind: "document", artifact: { kind: "document", id: "immunization_record" }, level, status: "unsupported", reason: "x",
});
const evaluation = (state: RequirementEvaluation["state"], over: Partial<RequirementEvaluation> = {}): RequirementEvaluation => ({
    requirement_id: "r1", requirement_key: "r1", version_id: "v1", label: "Immunizations", document_type_key: "immunization_record", subject_type: "child",
    subject_id: "c1", policy: "required", blocking: state !== "satisfied" && state !== "waived", state, blocked_reason: state === "blocked" ? "evidence_quarantined" : null,
    evidence: { accepted: state === "satisfied" ? ["d1"] : [], pending: [], undated: [], expired: [], rejected: [], quarantined: [] }, waiver_id: state === "waived" ? "w1" : null,
    waivable: true, due_on: null, valid_until: null, expiring_soon: false, renewal_pending: false, ...over,
});

describe("authoring a stage document requirement", () => {
    it("is authorable, and names a published type a child can file", () => {
        expect(isAuthorableRequirementKind("document")).toBe(true);
        expect(refuseUnauthorableRequirement({ requirement_id: "r", ref: { kind: "document", document_type_key: "immunization_record" }, level: "required" })).toBeNull();
        const types = [policy("immunization_record", ["child"]), policy("enrollment_contract", ["household"])];
        expect(documentStageRequirementRefusals([docReq("a", "immunization_record")], types)).toEqual([]);
        expect(documentStageRequirementRefusals([docReq("b", "no_such_type")], types).map((r) => r.code)).toEqual(["unknown_document_type"]);
        expect(documentStageRequirementRefusals([docReq("c", "enrollment_contract")], types).map((r) => r.code)).toEqual(["document_type_not_for_child"]);
    });
    it("the lifecycle builder refuses an unknown or non-child type before storing (422)", () => {
        const route = read("app/api/admin/departments/[departmentId]/lifecycle-builder/route.ts");
        expect(route).toContain("documentStageRequirementRefusals");
        expect(route).toContain('code: "unknown_document_type"');
        expect(route.indexOf("documentStageRequirementRefusals(")).toBeLessThan(route.indexOf("config = setStageRequirements(config, processId, stageKey, parsed)"));
    });
});

describe("the Documents answer, in participant progress terms", () => {
    it("satisfied → satisfied with the accepted documents as evidence", () => {
        expect(projectDocumentRequirementProgress(unsupported("a"), evaluation("satisfied"))).toMatchObject({
            status: "satisfied",
            evidence: { kind: "document_requirement", document_requirement_id: "r1", documents_state: "satisfied", document_ids: ["d1"], waiver_id: null },
        });
    });
    it("waived (a Documents-owned waiver) → satisfied, citing the waiver, with no document as evidence", () => {
        expect(projectDocumentRequirementProgress(unsupported("a"), evaluation("waived"))).toMatchObject({
            status: "satisfied",
            evidence: { documents_state: "waived", waiver_id: "w1", document_ids: [] },
        });
    });
    it("missing, pending review and blocked → outstanding, with a reason", () => {
        for (const s of ["missing", "pending_review", "blocked"] as const) {
            const p = projectDocumentRequirementProgress(unsupported("a"), evaluation(s));
            expect(p.status).toBe("outstanding");
            expect(p.reason).toBeTruthy();
            expect(p.evidence).toBeUndefined();
        }
    });
    it("no answer (Documents unreadable) leaves it unsupported — blocking, never met", () => {
        expect(projectDocumentRequirementProgress(unsupported("a"), undefined).status).toBe("unsupported");
    });
});

describe("completion sufficiency keeps its semantics", () => {
    const progressOf = (...r: EnrollmentRequirementProgress[]) => ({ requirements: r });
    it("an outstanding required document blocks; Documents satisfied/waived does not", () => {
        const s = evaluateEnrollmentCompletionSufficiency({
            progress: progressOf(
                projectDocumentRequirementProgress(unsupported("missing"), evaluation("missing")),
                projectDocumentRequirementProgress(unsupported("waived"), evaluation("waived")),
                projectDocumentRequirementProgress(unsupported("ok"), evaluation("satisfied")),
            ),
        });
        expect(s.eligible).toBe(false);
        expect(s.blocking.map((b) => b.requirement_id)).toEqual(["missing"]);
        expect(s.counts).toMatchObject({ satisfied: 2, blocking: 1, excepted: 0 });
    });
    it("an Enrollment stage exception still excepts an outstanding document requirement, leaving its status visible", () => {
        const s = evaluateEnrollmentCompletionSufficiency({
            progress: progressOf(projectDocumentRequirementProgress(unsupported("missing"), evaluation("missing"))),
            exceptions: { missing: { requirement_id: "missing", reason: "Director decision", approved_by: "u1", approved_at: "2026-10-27T00:00:00Z" } },
        });
        expect(s.eligible).toBe(true);
        expect(s.requirements[0]).toMatchObject({ disposition: "excepted", status: "outstanding" });
    });
    it("a recommended document requirement never blocks", () => {
        const s = evaluateEnrollmentCompletionSufficiency({ progress: progressOf(projectDocumentRequirementProgress(unsupported("rec", "recommended"), evaluation("missing"))) });
        expect([s.eligible, s.requirements[0].disposition]).toEqual([true, "not_blocking"]);
    });
});

describe("one authority: Business Process asks Documents", () => {
    it("the live resolver asks the Documents service, before Financials", () => {
        const resolver = read("lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress.ts");
        expect(resolver).toContain("evaluateDocumentTypeRequirementsForChild");
        const documents = resolver.indexOf("const documentProjected = await projectDocumentRequirementsForChild(");
        const financial = resolver.indexOf("const projected = await projectFinancialRequirementsForChild(");
        expect(documents).toBeGreaterThan(0);
        expect(documents).toBeLessThan(financial);
    });
    it("no Business Process, lifecycle or Enrollment module reads document review state or document requirement tables", () => {
        const files: string[] = [];
        const walk = (dir: string) => {
            for (const name of readdirSync(dir)) {
                const p = join(dir, name);
                if (statSync(p).isDirectory()) walk(p);
                else if (/\.(ts|tsx)$/.test(name)) files.push(p);
            }
        };
        for (const d of ["lib/enrollment", "lib/lifecycle", "lib/businessProcesses"]) walk(resolve(root, d));
        const offenders = files.filter((f) => /review_status|document_requirement_waivers|document_requirement_versions|from\("document_versions"\)/.test(readFileSync(f, "utf8")));
        expect(offenders.map((f) => f.slice(root.length + 1))).toEqual([]);
    });
});
