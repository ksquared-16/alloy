/**
 * EN-FI-09 — the four health document types through the canonical requirement and evidence interfaces.
 *
 * Physical examination (`physical`), health care plan, medication authorization and immunization record are SEEDED
 * Studio types (D3 `document_configuration_seed`). This proves, for each, from the seeded configuration itself: the D6
 * requirement authoring validation accepts it for a child and refuses another grain; Business Process stage authoring
 * accepts it; the ONE D6 evaluator answers missing → pending review → satisfied → expired under the type's seeded
 * validity; a requirement on it carries the medical class (health.view to see or waive). No second engine exists.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { documentRequirementDraftProblems, type DocumentRequirementDraft } from "@/lib/documents/requirements/documentRequirementPolicy";
import { documentStageRequirementRefusals } from "@/lib/documents/requirements/documentStageRequirementRefs";
import { evaluateDocumentRequirement, type EvaluableRequirement, type EvidenceDocument } from "@/lib/documents/requirements/documentRequirementEvaluator";
import { requirementTypeClasses, type RequirementTypeCatalog } from "@/lib/documents/requirements/documentRequirementService";
import { evaluateDocumentValidity } from "@/lib/documents/validity/documentValidity";
import { MEDICAL_DOCUMENT_TYPES } from "@/lib/documents/documentSensitivity";
import { MEDICAL_TYPE_KEYS, documentTypeDraftProblems } from "@/lib/documents/configuration/documentTypePolicy";
import type { ValidityPolicy } from "@/lib/documents/configuration/documentTypePolicy";
import type { StageRequirementV1 } from "@/lib/lifecycle/stageRequirementsV1";

const SEED_SQL = readFileSync(join(process.cwd(), "../supabase/migrations/20261209090100_documents_d3_studio_configuration.sql"), "utf8");
const HEALTH = ["physical", "health_care_plan", "medication_authorization", "immunization_record"] as const;

type Seeded = { key: string; label: string; category: string; subject_types: string[]; sensitivity: string; review_required: boolean; validity: ValidityPolicy };
function seeded(key: string): Seeded {
    const re = new RegExp(`\\('${key}', '([^']+)', '([a-z_]+)', ARRAY\\[([^\\]]*)\\], ARRAY\\[[^\\]]*\\], '([a-z_]+)', (true|false), '(\\{[^']*\\})'\\)`);
    const m = SEED_SQL.match(re);
    if (!m) throw new Error(`no seed row for ${key}`);
    return {
        key, label: m[1]!, category: m[2]!, subject_types: m[3]!.split(",").map((s) => s.trim().replace(/'/g, "")),
        sensitivity: m[4]!, review_required: m[5] === "true", validity: JSON.parse(m[6]!) as ValidityPolicy,
    };
}

const TODAY = "2026-10-27";
const CHILD = { subject_type: "child" as const, subject_id: "c1", created_at: "2026-01-01T00:00:00Z", journeys: [] };
const requirementFor = (key: string): EvaluableRequirement => ({
    requirement_id: `r-${key}`, requirement_key: `req_${key}`, version_id: `rv-${key}`, label: key, document_type_key: key, subject_type: "child",
    scope: { kind: "all" }, timing: { kind: "immediate" }, policy: "required", waivable: true, effective_from: null, effective_until: null,
});
const draftFor = (key: string, subject: string): DocumentRequirementDraft => ({
    label: `Required ${key}`, document_type_key: key, subject_type: subject as never, scope: { kind: "all" }, timing: { kind: "immediate" },
    policy: "required", waivable: true, effective_from: null, effective_until: null,
});

describe.each(HEALTH)("EN-FI-09 — %s", (key) => {
    const t = seeded(key);
    const typePolicy = { key, label: t.label, subject_types: t.subject_types, review_required: t.review_required };
    const evidence = (over: Partial<EvidenceDocument> & { effective_on?: string }): EvidenceDocument => ({
        document_id: `d-${key}`, status: "uploaded", review_status: "accepted", received_at: "2026-01-01T00:00:00Z",
        validity: evaluateDocumentValidity({ policy: t.validity, facts: { effective_on: over.effective_on ?? null, expires_on: null, received_on: "2026-01-01", reviewed_on: "2026-01-02" }, today: TODAY }),
        ...over,
    });
    const evaluate = (docs: EvidenceDocument[]) =>
        evaluateDocumentRequirement({ requirement: requirementFor(key), type: typePolicy, subject: CHILD, documents: docs, waivers: [], today: TODAY });

    it("is seeded as a reviewed, medical, child health type with a tracked validity, and its policy validates", () => {
        expect(t).toMatchObject({ category: "health", subject_types: ["child"], sensitivity: "medical", review_required: true });
        expect(["duration", "periodic_reconfirmation"]).toContain(t.validity.kind);
        const draft = { label: t.label, category_id: "cat", subject_types: ["child"], allowed_formats: ["pdf"], default_sensitivity: "medical", review_required: true, replacement_policy: "new_version", validity_policy: t.validity };
        expect(documentTypeDraftProblems(draft as never, { typeKey: key, categoryActive: true, publishedSensitivity: "medical" })).toEqual([]);
        // The medical floor holds: the type cannot be lowered below medical.
        expect(documentTypeDraftProblems({ ...draft, default_sensitivity: "standard" } as never, { typeKey: key, categoryActive: true, publishedSensitivity: "medical" }).length).toBeGreaterThan(0);
    });
    it("requirement authoring accepts it for a child and refuses a household requirement", () => {
        expect(documentRequirementDraftProblems(draftFor(key, "child"), { typeSubjectTypes: t.subject_types, duplicate: false })).toEqual([]);
        expect(documentRequirementDraftProblems(draftFor(key, "household"), { typeSubjectTypes: t.subject_types, duplicate: false }).map((p) => p.code)).toContain("subject_type_not_accepted_by_type");
    });
    it("a Business Process stage can name it", () => {
        const stage = [{ requirement_id: "s1", ref: { kind: "document", document_type_key: key }, level: "required" }] as unknown as StageRequirementV1[];
        expect(documentStageRequirementRefusals(stage, [{ key, label: t.label, subject_types: t.subject_types } as never])).toEqual([]);
    });
    it("the one D6 evaluator: missing → pending review → satisfied → expired under the seeded validity", () => {
        expect(evaluate([])?.state).toBe("missing");
        expect(evaluate([evidence({ review_status: "pending" })])?.state).toBe("pending_review");
        expect(evaluate([evidence({ effective_on: "2026-06-01" })])?.state).toBe("satisfied");
        expect(evaluate([evidence({ effective_on: "2025-06-01" })])?.state).toBe("expired");
    });
    it("a requirement on it is medical (health.view to see, waive or list its work)", () => {
        const catalog = new Map([[key, { key, label: t.label, default_sensitivity: t.sensitivity }]]) as unknown as RequirementTypeCatalog;
        expect(requirementTypeClasses(catalog, key).has("medical")).toBe(true);
    });
});

describe("the medical vocabulary agrees everywhere", () => {
    it("SQL document_medical_type_keys, TS MEDICAL_TYPE_KEYS and MEDICAL_DOCUMENT_TYPES name exactly the four health types", () => {
        const sql = SEED_SQL.match(/document_medical_type_keys\(\)[\s\S]*?ARRAY\[([^\]]*)\]/)?.[1]?.split(",").map((s) => s.trim().replace(/'/g, "")) ?? [];
        for (const list of [sql, [...MEDICAL_TYPE_KEYS], [...MEDICAL_DOCUMENT_TYPES]]) expect([...list].sort()).toEqual([...HEALTH].sort());
    });
});
