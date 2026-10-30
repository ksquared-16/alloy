/**
 * Authorization QA persona contract, Revision 4 — synthetic contract checks (no database, no identity).
 *
 * Revision 4 may add exactly one persona (`scoped_author`, role `qa_scoped_author`, the four operator-approved grants,
 * QA Shared department D1 only, pooled identity `qa-pool-09`) and correct one Revision 3 matrix row. These checks pin
 * that: every Revision 3 persona row is unchanged, the new row is exactly the approved scope, no other identity or
 * grant appears, and the proposal handed to the registry owner and the hosted driver agree with the contract.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const CONTRACT = read("docs/platform/governance/authorization-qa-personas.md");
const D1 = "0704e72c-f73d-44b2-87d9-89924e222464";

type Row = { persona: string; org: string; identity: string; role: string; grants: string[]; scope: string };

/** §3 persona registry table rows. */
function registry(md: string): Row[] {
    const start = md.indexOf("| Contract persona | Plan persona |");
    const table = md.slice(start, md.indexOf("\n\n", start)).split("\n").slice(2);
    return table.map((line) => {
        const c = line.split("|").slice(1, -1).map((x) => x.trim());
        const code = (v: string) => [...v.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
        return { persona: code(c[1])[0], org: c[2], identity: c[3], role: code(c[4])[0], grants: code(c[5]), scope: c[6] };
    });
}

/** Revision 3's rows (contract sha256 e6d619f2…), as the installed authz_q1 plan provisions them. */
const REVISION_3: Array<Pick<Row, "persona" | "role" | "grants">> = [
    { persona: "fixture_admin", role: "qa_shared_actor", grants: ["admin"] },
    { persona: "cross_org_admin", role: "qa_secondary_admin", grants: ["admin"] },
    { persona: "doc_reader", role: "qa_doc_reader", grants: ["portal.access", "documents.read"] },
    { persona: "no_docs", role: "qa_no_docs", grants: ["portal.access", "crm.customers.read"] },
    { persona: "processing_only", role: "qa_processing_only", grants: ["portal.access", "processing.operate"] },
    { persona: "ocr", role: "qa_ocr", grants: ["portal.access", "documents.read", "processing.operate"] },
    { persona: "scoped_ops", role: "qa_scoped_ops", grants: ["portal.access", "documents.read", "processing.operate", "crm.customers.read"] },
    { persona: "scoped_forms", role: "qa_scoped_forms", grants: ["portal.access", "documents.read", "crm.customers.read", "forms.submissions", "forms.submissions.confirm"] },
    { persona: "health_viewer", role: "qa_health_viewer", grants: ["portal.access", "documents.read", "health.view"] },
    { persona: "doc_writer", role: "qa_doc_writer", grants: ["portal.access", "documents.read", "documents.write"] },
];

describe("Revision 4 registry: one added persona, every Revision 3 persona unchanged", () => {
    const rows = registry(CONTRACT);

    it("has exactly the Revision 3 personas plus scoped_author", () => {
        expect(rows.map((r) => r.persona)).toEqual([...REVISION_3.slice(0, 8).map((r) => r.persona), "scoped_author", "health_viewer", "doc_writer"]);
    });

    it("every Revision 3 persona keeps its role and grants (the dedicated actors keep their admin package)", () => {
        for (const want of REVISION_3) {
            const got = rows.find((r) => r.persona === want.persona)!;
            if (want.grants[0] === "admin") {
                expect(got.identity, want.persona).toContain(want.role);
                continue;
            }
            expect(got.role, want.persona).toBe(want.role);
            expect(got.grants, want.persona).toEqual(want.grants);
        }
    });

    it("scoped_author is exactly the approved scope: QA Shared, pooled qa-pool-09, qa_scoped_author, four grants, D1 only", () => {
        const r = rows.find((x) => x.persona === "scoped_author")!;
        expect(r.org).toBe("QA Shared");
        expect(r.identity).toContain("qa-pool-09");
        expect(r.role).toBe("qa_scoped_author");
        expect(r.grants).toEqual(["portal.access", "documents.read", "crm.customers.read", "forms.author"]);
        expect(r.scope).toMatch(/department \*\*restricted to D1\*\*; site all/);
    });

    it("no other restricted persona gains forms.author; scoped_forms stays without it", () => {
        for (const r of rows.filter((x) => x.persona !== "scoped_author" && !x.grants.includes("admin"))) {
            expect(r.grants, r.persona).not.toContain("forms.author");
        }
    });
});

describe("Revision 4 identities, matrix and change log", () => {
    it("adds qa-pool-09 and no other identity", () => {
        expect(CONTRACT).toContain("**Identities.** Eleven reusable managed identities:");
        expect(CONTRACT).toContain("`qa-pool-01` … `qa-pool-09@example.com`");
        expect(CONTRACT).not.toMatch(/qa-pool-1\d/);
        expect([...CONTRACT.matchAll(/qa-pool-09/g)].length).toBeGreaterThanOrEqual(2);
    });

    it("§3a: scoped_author has a row naming its gate; scoped_forms no longer claims POS compose as a positive", () => {
        const matrix = CONTRACT.slice(CONTRACT.indexOf("### 3a."), CONTRACT.indexOf("## 4. Sessions"));
        const row = (p: string) => matrix.split("\n").find((l) => l.startsWith(`| \`${p}\``)) ?? "";
        expect(row("scoped_author")).toContain("formsDestinationInActorScope");
        expect(row("scoped_author")).toContain("404, naming nothing, nothing written");
        const positive = row("scoped_forms").split("|")[2];
        expect(positive).not.toContain("POS compose");
        expect(row("scoped_forms")).toContain("capability refusal, never counted as scope proof");
        for (const p of ["health_viewer", "doc_writer"]) expect(row(p), p).not.toBe("");
    });

    it("§12 records the change, the run-lease / removal on close and the pin rule", () => {
        const s12 = CONTRACT.slice(CONTRACT.indexOf("## 12. Revision 4 changes"));
        expect(s12).toContain("`remove_member_access_audited`");
        expect(s12).toContain("until then `scoped_author`");
        expect(s12).toContain("**Unchanged:**");
        expect(CONTRACT).toContain("Revision 3 (sha256 `e6d619f2…3b03b6e`, Alloy PR #1616) is the contract the installed Vacilando `authz_q1` plan pins");
    });
});

describe("the registry handoff and the hosted driver agree with the contract", () => {
    const proposal = JSON.parse(read("certification/qa-shared/documents-r2-scoped-author-persona-proposal.json")) as {
        persona: { persona_key: string; custom_role: string; grants: string[]; identity: string; scope: { department: string } };
        registry_delta_for_hostcapacity: { custom_roles: Record<string, { grants: string[] }>; pool: string };
    };
    const packet = JSON.parse(read("certification/qa-shared/documents-r2r5-hostcapacity-registration-packet.json")) as {
        B_scoped_author_persona: { operator_approval: string };
    };

    it("the proposal names the same persona, role, grants, identity and D1", () => {
        expect(proposal.persona.persona_key).toBe("scoped_author");
        expect(proposal.persona.custom_role).toBe("qa_scoped_author");
        expect(proposal.persona.grants).toEqual(["portal.access", "documents.read", "crm.customers.read", "forms.author"]);
        expect(proposal.registry_delta_for_hostcapacity.custom_roles.qa_scoped_author.grants).toEqual(proposal.persona.grants);
        expect(proposal.persona.identity).toContain("qa-pool-09@example.com");
        expect(proposal.registry_delta_for_hostcapacity.pool).toBe("qa_pool_09");
        expect(proposal.persona.scope.department).toContain(D1);
    });

    it("the registration packet records the operator's exact approval", () => {
        const a = packet.B_scoped_author_persona.operator_approval;
        for (const s of ["qa-pool-09@example.com", "qa_scoped_author", "portal.access", "documents.read", "crm.customers.read", "forms.author", D1, "run-leased", "No other grants or identities"]) {
            expect(a, s).toContain(s);
        }
    });

    it("the hosted driver uses the contract's persona key and stamps the contract it actually ran against", () => {
        const driver = read("certification/documents-v1/r4_hosted_restricted_personas_cert.py");
        expect(driver).toContain('SA = "scoped_author"');
        expect(driver).toContain("docs/platform/governance/authorization-qa-personas.md");
        expect(driver).not.toMatch(/"contract_sha256": "e6d619f2/);
    });
});
