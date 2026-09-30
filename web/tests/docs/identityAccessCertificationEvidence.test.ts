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

/** The migration whose application is the gate. */
const APPLY_GATE_VERSION = "20261104130000";

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
        for (const sql of [AUTHORITY_CENSUS, RPC_CENSUS]) {
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

    it("the RPC census still reports the ACL rows this gate reads", () => {
        // A gate that read an empty list would pass its closure assertion for the worst reason.
        const acl = census(RPC_CENSUS).rows("k_rpc").filter((r) => r.startsWith("rpc_acl"));
        expect(acl.length, "the census reports no mutating-RPC ACL rows at all").toBeGreaterThan(10);
    });

    it("certification requires the ledger to show the repair applied", () => {
        if (!claimsCertified()) return; // PENDING: this gate is silent, by design
        const ledger = census(AUTHORITY_CENSUS)
            .rows("j_ledger")
            .find((r) => r.startsWith("schema_migrations ~ max_version"));
        expect(ledger, "the authority census carries no schema_migrations max_version row").toBeTruthy();
        const applied = (ledger ?? "").split(" ~ ").pop()!.trim();
        expect(
            applied >= APPLY_GATE_VERSION,
            `the manifest certifies Identity/Access, but the hosted ledger's newest applied migration is `
                + `${applied}, before ${APPLY_GATE_VERSION}. The repair is not applied on the deployed primary, so `
                + "the exposure it closes is still open. Re-run the census after applying, or return the domain to "
                + "PENDING.",
        ).toBe(true);
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
        const ledger = census(AUTHORITY_CENSUS)
            .rows("j_ledger")
            .find((r) => r.startsWith("schema_migrations ~ max_version")) ?? "";
        const applied = ledger.split(" ~ ").pop()!.trim();
        const openCount = census(RPC_CENSUS)
            .rows("k_rpc")
            .filter((r) => r.startsWith("rpc_acl"))
            .filter((r) => CLIENT_PRINCIPALS.some((p) => grantees(r).has(p))).length;
        expect(
            applied < APPLY_GATE_VERSION || openCount > 0,
            `Identity/Access is listed as PENDING, but the hosted evidence shows the ledger at ${applied} and `
                + `${openCount} mutating functions open to clients. If the repair is in fact applied and closed, the `
                + "domain should be certified rather than held back.",
        ).toBe(true);
    });
});
