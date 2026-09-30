import { describe, expect, it } from "vitest";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * IDENTITY/ACCESS MAY NOT BE CERTIFIED BEFORE THE REPAIR IS PROVED APPLIED.
 *
 * WHY THIS GUARD EXISTS, AND WHY THE OTHER ONE WAS NOT ENOUGH.
 * `authSessionOwnerTruthfulness.test.ts` holds two things: the domain appears in exactly one of the
 * manifest's certified/pending rows, and while it is PENDING the section names the unapplied
 * migrations. Both were plant-proved. But a plant that simply MOVED the domain into the certified row
 * passed — correctly, by that guard's own contract, since its pending obligation discharges on
 * certification. So nothing anywhere stopped a future run from certifying the domain while the
 * migrations sat unapplied on the deployed primary.
 *
 * That is the one failure mode this whole convergence must not have. Migrations `20261104120000` and
 * `20261104130000` close a cross-tenant privilege path; a manifest that called the domain certified
 * while they were unapplied would tell every downstream reader — human and model — that a live
 * exposure was closed. The previous run made exactly that overstatement in its first commit and had to
 * correct it. A guard is what makes the correction permanent.
 *
 * WHAT COUNTS AS PROOF. Not migration text, and not prose. The committed hosted census artifacts,
 * which are produced by a governed action against the deployed primary and carry their own provenance:
 *
 *   1. the ledger moved — `schema_migrations.max_version` is at or past `20261104130000`;
 *   2. no mutating RPC is EXECUTE-granted to `authenticated`, `anon` or PUBLIC any more;
 *   3. both previously-unprotected tables have RLS enabled.
 *
 * INTEGRITY. An artifact is only evidence if it is the output of the query it claims to be. Each is
 * checked for `status: "executed"` and for a `query_hash` matching the SHA-256 of the committed `.sql`
 * beside it, so an artifact edited by hand to say the happy thing is rejected rather than believed.
 *
 * This guard is deliberately silent while the domain is PENDING. It is not a second opinion on the
 * pending state; it is the gate on leaving it.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const MANIFEST = "docs/context/alloy-benchmark-context.md";
const AUTHORITY_CENSUS = "certification/migrations/identity-access-model-a-authority-census.sql";
const RPC_CENSUS = "certification/migrations/identity-access-rpc-and-tenancy-census.sql";
const APPLY_CENSUS = "certification/migrations/identity-access-apply-verification.sql";

/**
 * The two migrations whose application is the gate — named individually, on purpose.
 *
 * The first version of this gate asked whether the hosted ledger's `max_version` had
 * reached `20261104130000`. That was sound only by accident: these two were the newest
 * migrations in the tree when it was written. PR 1345 then landed `20261105120000` and
 * `20261106120000`, and on 2026-09-30 the ledger read `max_version = 20261106120000`
 * while BOTH repair migrations were still unapplied — measured `false` apiece. The
 * ledger leg of this gate was passing on another lane's work.
 *
 * The other two legs (ACLs, RLS) still refused, so no false certification could have
 * occurred. But a gate with a leg that reports the wrong answer is one accident away
 * from being a gate that agrees with the wrong conclusion, so the question is now asked
 * per version rather than by high-water mark.
 *
 * THE LIST ITSELF IS THE GATE, SO IT MUST NOT LAG THE REQUIREMENTS. 20261107120000 joined
 * on 2026-09-30. It closes post_ledger_transaction, which 20261104120000 missed because it
 * matched on parameter names. Until the version was added here, this gate would have
 * certified Identity/Access with that follow-up migration entirely absent — the ACL leg
 * would have caught the open function, but the apply leg would have reported a complete
 * repair. Found by working the adversarial checklist rather than the happy path, which is
 * the only reason it was found at all.
 */
const APPLY_GATE_VERSIONS = ["20261104120000", "20261104130000", "20261107120000"] as const;

type Census = { status?: string; query_hash?: string; results?: { questions?: Record<string, { rows?: string[] }> } };

function census(sqlRel: string): { artifact: Census; rows: (qid: string) => string[]; hashOk: boolean } {
    const artifact = JSON.parse(read(`${sqlRel}.results.json`)) as Census;
    const actual = createHash("sha256").update(readFileSync(path.join(repoRoot, sqlRel))).digest("hex");
    return {
        artifact,
        hashOk: artifact.query_hash === actual,
        rows: (qid) => artifact.results?.questions?.[qid]?.rows ?? [],
    };
}

/** Does the manifest currently place Identity/Access in the certified row? */
function claimsCertified(): boolean {
    const manifest = read(MANIFEST);
    const certifiedRow = manifest.split("\n").find((l) => /\*\*Domains certified\*\*/.test(l)) ?? "";
    return /Identity\/Access/.test(certifiedRow);
}

/** Grantees of an `rpc_acl ~ <name> ~ <aclitems>` row. A bare grantee is PUBLIC. */
function grantees(aclRow: string): Set<string> {
    const acl = aclRow.split(" ~ ").slice(2).join(" ~ ");
    return new Set(
        acl
            .split("|")
            .map((e) => e.trim())
            .filter((e) => e.includes("="))
            .map((e) => e.split("=")[0]!.trim() || "PUBLIC"),
    );
}

const CLIENT_PRINCIPALS = ["authenticated", "anon", "PUBLIC"];

describe("Identity/Access certification evidence gate", () => {
    it("is not vacuous: both census artifacts exist and are genuine outputs of their committed queries", () => {
        for (const sql of [AUTHORITY_CENSUS, RPC_CENSUS, APPLY_CENSUS]) {
            expect(existsSync(path.join(repoRoot, sql)), `${sql} is missing`).toBe(true);
            const c = census(sql);
            expect(c.artifact.status, `${sql} did not execute`).toBe("executed");
            expect(
                c.hashOk,
                `${sql}.results.json records a query_hash that does not match the committed .sql beside it. `
                    + "Either the query changed after the census ran, or the artifact was edited. Re-run the census.",
            ).toBe(true);
        }
    });

    it("the RPC census is internally consistent, so the ACL rows are not a partial read", () => {
        /*
         * WHY THIS IS RELATIONAL AND NOT A FLOOR.
         *
         * This asserted `acl.length > 10`, to stop the closure assertion below passing against an
         * empty list. That floor was calibrated to the pre-repair world and inverted the moment the
         * repair worked: the census lists only functions that are STILL authenticated-executable, so
         * closing 13 of 14 shrank its own subject to 1 and the guard failed on success. It is the same
         * mistake as the `broken-link > 100` baseline assertion — a hand-written number describing a
         * population that the work is meant to change.
         *
         * The durable form compares the census against itself: the enumerated ACL rows must match the
         * count the same census reports. That proves it actually measured and returned a whole answer,
         * and it holds at 14, at 1, and at 0 — which is where a finished repair lands.
         */
        const rows = census(RPC_CENSUS).rows("k_rpc");
        const acl = rows.filter((r) => r.startsWith("rpc_acl"));
        const countRow = rows.find((r) => r.startsWith("mutating_rpc_excluding_triggers ~ authenticated_executable ~"));
        expect(countRow, "the census reports no authenticated-executable count row, so it may be a partial read").toBeTruthy();
        const reported = Number((countRow ?? "").split(" ~ ").pop());
        expect(Number.isFinite(reported), `count row is unparseable: ${countRow}`).toBe(true);
        expect(
            acl.length,
            `the census enumerates ${acl.length} mutating-RPC ACL rows but reports a count of ${reported}. `
                + "A mismatch means the artifact is a partial read, and neither number can be trusted.",
        ).toBe(reported);
    });

    it("the apply census reports both repair versions by name", () => {
        // Non-vacuity for the assertion below: an artifact that mentioned neither version
        // would let "no unapplied version found" pass for the worst possible reason.
        const rows = census(APPLY_CENSUS).rows("v_applied");
        for (const v of APPLY_GATE_VERSIONS) {
            expect(
                rows.some((r) => r.startsWith(`migration ~ ${v} ~ `)),
                `the apply census does not report migration ${v} at all`,
            ).toBe(true);
        }
    });

    it("certification requires each repair migration to be applied, by version", () => {
        if (!claimsCertified()) return; // PENDING: this gate is silent, by design
        const rows = census(APPLY_CENSUS).rows("v_applied");
        const unapplied = APPLY_GATE_VERSIONS.filter(
            (v) => !rows.includes(`migration ~ ${v} ~ true`),
        );
        expect(
            unapplied,
            "the manifest certifies Identity/Access, but the hosted ledger does not contain these repair "
                + "migrations. A high-water mark is not proof: on 2026-09-30 the ledger read max_version "
                + "20261106120000 — past both of these — purely because another lane's 20261105120000 and "
                + "20261106120000 had applied, while both of these measured false. Apply them and re-run the "
                + "census, or return the domain to PENDING.",
        ).toEqual([]);
    });

    it("certification requires no mutating RPC to remain executable by a client principal", () => {
        if (!claimsCertified()) return;
        const open: string[] = [];
        for (const row of census(RPC_CENSUS).rows("k_rpc").filter((r) => r.startsWith("rpc_acl"))) {
            const g = grantees(row);
            if (CLIENT_PRINCIPALS.some((p) => g.has(p))) open.push(row.split(" ~ ")[1]!);
        }
        expect(
            open.sort(),
            "the manifest certifies Identity/Access while these mutating functions are still EXECUTE-granted to "
                + "authenticated, anon or PUBLIC on the deployed primary. Nine of them are SECURITY DEFINER, so RLS "
                + "never sees their writes, and each takes its organization as a caller-supplied parameter.",
        ).toEqual([]);
    });

    it("certification requires no mutating RPC to have lost its service_role EXECUTE", () => {
        if (!claimsCertified()) return;
        // Closing a function to clients while also making it unreachable by the server would break the
        // supported path rather than protect it — protected and broken are not the same outcome.
        const stranded: string[] = [];
        for (const row of census(RPC_CENSUS).rows("k_rpc").filter((r) => r.startsWith("rpc_acl"))) {
            if (!grantees(row).has("service_role")) stranded.push(row.split(" ~ ")[1]!);
        }
        expect(
            stranded.sort(),
            "these functions have no service_role EXECUTE, so the supported server path cannot call them",
        ).toEqual([]);
    });

    it("certification requires every public base table to have RLS enabled", () => {
        if (!claimsCertified()) return;
        const disabled = census(AUTHORITY_CENSUS)
            .rows("a_rls")
            .filter((r) => r.startsWith("rls_disabled ~ table ~ "))
            .map((r) => r.split(" ~ ").pop()!.trim());
        expect(
            disabled.sort(),
            "the manifest certifies Identity/Access while these tables have no row level security on the deployed "
                + "primary. Each carries org_id and grants authenticated SELECT, so any authenticated principal reads "
                + "every organization's rows.",
        ).toEqual([]);
    });

    it("records, while pending, exactly why it is pending — so the gate is legible without running it", () => {
        if (claimsCertified()) return;
        // The pending state is not an absence of evidence; it is evidence of an unfinished apply. Assert
        // the artifacts actually say so, rather than letting "pending" mean "nobody looked".
        const unapplied = APPLY_GATE_VERSIONS.filter(
            (v) => !census(APPLY_CENSUS).rows("v_applied").includes(`migration ~ ${v} ~ true`),
        );
        const openCount = census(RPC_CENSUS)
            .rows("k_rpc")
            .filter((r) => r.startsWith("rpc_acl"))
            .filter((r) => CLIENT_PRINCIPALS.some((p) => grantees(r).has(p))).length;
        expect(
            unapplied.length > 0 || openCount > 0,
            "Identity/Access is listed as PENDING, but the hosted evidence shows both repair migrations applied "
                + `and ${openCount} mutating functions open to clients. If the repair is in fact applied and closed, `
                + "the domain should be certified rather than held back.",
        ).toBe(true);
    });
});
