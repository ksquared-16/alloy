/**
 * EN-FI-10 — immunization evidence: reported, uploaded, reviewed, accepted/rejected, VERIFIED — kept apart.
 * Only Medical (health.manage) verifies, by one explicit act; Forms answers, uploads and Documents review never do.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { InMemorySupabase } from "../harness/inMemorySupabase";
import { classifyImmunizationEvidence, IMMUNIZATION_EVIDENCE_LABEL } from "@/lib/health/immunizationEvidence";
import { HealthFactError, verifyImmunizationFact } from "@/lib/health/healthFactService";
import { HealthAccessDeniedError } from "@/lib/health/healthAccess";

const fact = (over: Partial<{ id: string; confirmed_at: string | null; source_kind: string }> = {}) => ({ id: "f1", vaccine_key: "dtap", source_kind: "form_submission", confirmed_at: null, ...over });
const cert = (review_status: "pending" | "accepted" | "rejected" | null, over: Partial<{ status: string; validity_status: string; document_id: string }> = {}) => ({ document_id: "d1", status: "uploaded", review_status, ...over });

describe("the five layers never collapse", () => {
    it.each([
        [[], [], "nothing_on_file"],
        [[fact()], [], "reported_only"],
        [[fact()], [cert(null)], "certificate_uploaded"],
        [[fact()], [cert("pending")], "certificate_uploaded"],
        [[fact()], [cert("rejected")], "certificate_rejected"],
        [[fact()], [cert("accepted", { validity_status: "expired" })], "certificate_expired"],
        [[fact()], [cert("accepted")], "certificate_accepted_unverified"],
        [[], [cert("accepted")], "certificate_accepted_unverified"],
        [[fact({ confirmed_at: "2026-10-27T00:00:00Z" }), fact({ id: "f2" })], [cert("accepted")], "partially_verified"],
        [[fact({ confirmed_at: "2026-10-27T00:00:00Z" })], [], "verified"],
    ] as const)("facts %j, certificates %j → %s", (facts, certs, summary) => {
        expect(classifyImmunizationEvidence({ facts: [...facts], certificates: [...certs] }).summary).toBe(summary);
        expect(IMMUNIZATION_EVIDENCE_LABEL[summary]).toBeTruthy();
    });
    it("an ACCEPTED certificate beside a reported fact is still unverified Medical state", () => {
        const e = classifyImmunizationEvidence({ facts: [fact()], certificates: [cert("accepted")] });
        expect(e.certificate).toEqual({ state: "accepted", reviewed: true, document_id: "d1" });
        expect(e.medical).toEqual({ state: "unverified", verified: 0, total: 1 });
    });
    it("a quarantined certificate counts as nothing; the best available certificate is used", () => {
        expect(classifyImmunizationEvidence({ facts: [], certificates: [cert("accepted", { status: "quarantined" })] }).certificate.state).toBe("unavailable");
        expect(classifyImmunizationEvidence({ facts: [], certificates: [cert("rejected", { document_id: "d0" }), cert("accepted", { document_id: "d9" })] }).certificate).toMatchObject({ state: "accepted", document_id: "d9" });
    });
});

describe("verifyImmunizationFact — Medical's one explicit act", () => {
    const ORG = "aaaaaaaa-0000-4000-8000-0000000000aa";
    const CHILD = "c1000000-0000-4000-8000-000000000001";
    const OTHER_CHILD = "c2000000-0000-4000-8000-000000000002";
    const MANAGE = { permissionKeys: ["health.view", "health.manage"] };
    let db: InMemorySupabase;
    beforeEach(() => {
        db = new InMemorySupabase();
        db.seed("person_health_facts", [
            { id: "f1", org_id: ORG, subject_entity_type: "customer_member", subject_entity_id: CHILD, fact_kind: "immunization", payload: { vaccine_key: "dtap", doses: [{ dose_number: 1, administered_on: "2023-06-12" }] }, status: "active", source_kind: "form_submission", confirmed_at: null, confirmed_by: null, metadata: {} },
            { id: "f2", org_id: ORG, subject_entity_type: "customer_member", subject_entity_id: CHILD, fact_kind: "allergy", payload: {}, status: "active", source_kind: "operator", confirmed_at: null, metadata: {} },
            { id: "f3", org_id: ORG, subject_entity_type: "customer_member", subject_entity_id: CHILD, fact_kind: "immunization", payload: {}, status: "superseded", source_kind: "operator", confirmed_at: null, metadata: {} },
        ]);
        db.seed("documents", [
            { id: "dAcc", org_id: ORG, doc_type: "immunization_record", status: "uploaded", current_version_id: "vAcc" },
            { id: "dPend", org_id: ORG, doc_type: "immunization_record", status: "uploaded", current_version_id: "vPend" },
            { id: "dOther", org_id: ORG, doc_type: "immunization_record", status: "uploaded", current_version_id: "vOther" },
            { id: "dPhys", org_id: ORG, doc_type: "physical", status: "uploaded", current_version_id: "vPhys" },
        ]);
        db.seed("document_versions", [
            { id: "vAcc", org_id: ORG, review_status: "accepted" },
            { id: "vPend", org_id: ORG, review_status: "pending" },
            { id: "vOther", org_id: ORG, review_status: "accepted" },
            { id: "vPhys", org_id: ORG, review_status: "accepted" },
        ]);
        const own = (document_id: string, subject_id: string) => ({ org_id: ORG, document_id, subject_type: "child", subject_id, association: "owner", ended_at: null });
        db.seed("document_subjects", [own("dAcc", CHILD), own("dPend", CHILD), own("dOther", OTHER_CHILD), own("dPhys", CHILD)]);
    });
    const verify = (over: Record<string, unknown> = {}) =>
        verifyImmunizationFact(db as never, { orgId: ORG, access: MANAGE, factId: "f1", basis: "Checked against the accepted certificate", actorUserId: "u1", ...over } as never);
    const row = () => db.rows("person_health_facts").find((r) => r.id === "f1")!;

    it("health.view alone cannot verify — Medical's authority is health.manage", async () => {
        await expect(verify({ access: { permissionKeys: ["health.view", "documents.read", "documents.write"] } })).rejects.toBeInstanceOf(HealthAccessDeniedError);
        expect(row().confirmed_at).toBeNull();
    });
    it("only an active immunization fact is verified", async () => {
        await expect(verify({ factId: "f2" })).rejects.toBeInstanceOf(HealthFactError);
        await expect(verify({ factId: "f3" })).rejects.toBeInstanceOf(HealthFactError);
    });
    it("a certificate still pending review, another child's, or another type is refused", async () => {
        await expect(verify({ evidenceDocumentId: "dPend" })).rejects.toMatchObject({ code: "invalid_state" });
        await expect(verify({ evidenceDocumentId: "dOther" })).rejects.toMatchObject({ code: "invalid_input" });
        await expect(verify({ evidenceDocumentId: "dPhys" })).rejects.toMatchObject({ code: "invalid_input" });
        expect(row().confirmed_at).toBeNull();
    });
    it("a basis is required", async () => {
        await expect(verify({ basis: "" })).rejects.toMatchObject({ code: "invalid_input" });
    });
    it("verified against the accepted certificate: who, when, basis and version recorded; what the fact says is unchanged", async () => {
        const before = JSON.stringify(row().payload);
        const out = await verify({ evidenceDocumentId: "dAcc" });
        expect(out.alreadyVerified).toBe(false);
        expect(row()).toMatchObject({ confirmed_by: "u1", source_kind: "form_submission", status: "active" });
        expect(row().confirmed_at).toBeTruthy();
        expect((row().metadata as { verification: unknown }).verification).toMatchObject({ evidence_document_id: "dAcc", evidence_version_id: "vAcc", basis: "Checked against the accepted certificate" });
        expect(JSON.stringify(row().payload)).toBe(before);
        const again = await verify({ evidenceDocumentId: "dAcc", actorUserId: "u2" });
        expect(again.alreadyVerified).toBe(true);
        expect(row().confirmed_by).toBe("u1");
    });
    it("verified without a certificate on a stated basis (e.g. the state registry)", async () => {
        await verify({ basis: "State registry lookup" });
        expect((row().metadata as { verification: { evidence_document_id: unknown } }).verification.evidence_document_id).toBeNull();
    });
});

describe("no automatic path to verified", () => {
    const root = join(process.cwd(), "lib");
    const files: string[] = [];
    const walk = (d: string) => {
        for (const f of readdirSync(d)) {
            const p = join(d, f);
            if (statSync(p).isDirectory()) walk(p);
            else if (/\.(ts|tsx)$/.test(f)) files.push(p);
        }
    };
    walk(root);
    it("confirmed_at / confirmed_by on health facts are written by exactly one function: verifyImmunizationFact", () => {
        // A file that reaches the health-fact table AND assigns confirmed_at / confirmed_by a value (not a type).
        const writers = files.filter((f) => {
            const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
            return /PERSON_HEALTH_FACTS_TABLE|["']person_health_facts["']/.test(code) && /confirmed_(at|by)\s*:\s*(?!string\b)\S/.test(code);
        });
        expect(writers.map((f) => f.slice(root.length + 1)).sort()).toEqual(["health/healthFactService.ts"]);
        const src = readFileSync(join(root, "health/healthFactService.ts"), "utf8");
        const at = src.indexOf("confirmed_at: verifiedAt");
        expect(at).toBeGreaterThan(src.indexOf("export async function verifyImmunizationFact"));
    });
    it("Documents review and Forms capture never touch person_health_facts", () => {
        for (const rel of ["documents/review/documentReviewService.ts", "health/healthCaptureProposals.ts"]) {
            const src = readFileSync(join(root, rel), "utf8");
            expect(src).not.toMatch(/person_health_facts|PERSON_HEALTH_FACTS_TABLE|verifyImmunizationFact/);
        }
        expect(readFileSync(join(root, "health/healthCaptureProposals.ts"), "utf8")).toMatch(/reported:\s*true/);
    });
});
