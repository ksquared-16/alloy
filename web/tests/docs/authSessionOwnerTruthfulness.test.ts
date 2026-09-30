import { describe, expect, it } from "vitest";
import path from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runRouteCapabilityCheck } from "../../scripts/checkRouteCapabilities.mjs";

/**
 * THE AUTH/SESSION OWNER AND THE BENCHMARK MANIFEST MUST STAY TRUE.
 *
 * `platform/governance/authentication-and-session-model.md` is a new canonical owner, created because
 * "no canonical owner for the authentication/session layer" was a measured blocker on Identity/Access
 * certification. Most of what it says is an ABSENCE — no MFA enrollment, no trusted devices, no
 * account disabling, no customer login — and an absence claim is the kind that rots silently: the day
 * someone implements MFA, nothing about the feature makes the document wrong out loud.
 *
 * So the absences are measured here against the tree rather than trusted.
 *
 * THE NUMBER THAT MATTERS MOST. The benchmark manifest previously said "~17 assert a capability" when
 * the real figure was 460 of 879 handlers — wrong by more than an order of magnitude, and in the
 * direction that would make a reader believe the domain was essentially ungated. A documented count
 * with no binding to its measurement is a number that was true once. This test binds it.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const AUTH_DOC = "docs/platform/governance/authentication-and-session-model.md";
const MANIFEST = "docs/context/alloy-benchmark-context.md";

/** Comments explain; they do not implement. */
function codeOnly(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function sourceFiles(rel: string, out: string[] = []): string[] {
    const abs = path.join(repoRoot, rel);
    if (!existsSync(abs)) return out;
    for (const entry of readdirSync(abs)) {
        if (entry === "node_modules" || entry === ".next" || entry === "tests") continue;
        const child = `${rel}/${entry}`;
        const st = statSync(path.join(repoRoot, child));
        if (st.isDirectory()) sourceFiles(child, out);
        else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(child);
    }
    return out;
}

const PRODUCT = [...sourceFiles("web/lib"), ...sourceFiles("web/app"), ...sourceFiles("web/components")];

describe("the auth/session canonical owner exists and is reachable", () => {
    it("is canonical and indexed, so it is not an orphan the lint would flag", () => {
        expect(existsSync(path.join(repoRoot, AUTH_DOC))).toBe(true);
        expect(read(AUTH_DOC)).toMatch(/^status:\s*canonical\s*$/m);
        expect(read("docs/README.md"), "the owner is not indexed from the root README").toContain(
            "platform/governance/authentication-and-session-model.md",
        );
    });

    it("draws the provider line explicitly rather than implying repository knowledge it lacks", () => {
        const doc = read(AUTH_DOC);
        // The category is the whole reason the document can be honest about token lifetime,
        // password policy and signup openness.
        expect(doc).toContain("UNKNOWN_EXTERNAL");
        expect(doc).toMatch(/Exact evidence still missing/i);
    });
});

describe("the owner's absence claims are still true of the tree", () => {
    it("no MFA enrollment or challenge surface exists", () => {
        // Reading a factor the auth record already carries is not implementing MFA; enrolling or
        // challenging one is. Those are the calls that would make the doc wrong.
        const offenders = PRODUCT.filter((f) =>
            /\.mfa\.(enroll|challenge|verify)\s*\(|auth\.mfa\b/.test(codeOnly(read(f))),
        );
        expect(
            offenders,
            "MFA appears to be implemented. The auth/session owner says it is absent and that Alloy's own "
                + "`accessPresentationContracts` types it `unsupported | planned`. Update the document.",
        ).toEqual([]);
    });

    it("the product still declares MFA unsupported or planned about itself", () => {
        // If this literal changes the document's claim must change with it.
        expect(read("web/lib/access/accessPresentationContracts.ts")).toMatch(
            /mfaStatus:\s*"unsupported"\s*\|\s*"planned"/,
        );
    });

    it("no trusted-device concept exists", () => {
        const offenders = PRODUCT.filter((f) => /trusted_device|trustedDevice/.test(codeOnly(read(f))));
        expect(offenders, "trusted devices now exist; the auth/session owner says they do not").toEqual([]);
    });

    it("no path disables an auth account", () => {
        const offenders = PRODUCT.filter((f) =>
            /auth\.admin\.(banUser|deleteUser|updateUserById)/.test(codeOnly(read(f))),
        );
        expect(
            offenders,
            "an account-disabling path now exists. The owner states that revoking membership does NOT disable the "
                + "credential, and that distinction is operationally visible to operators. Update it.",
        ).toEqual([]);
    });

    it("the idle logout is still built-but-disabled, not on by default", () => {
        const src = read("web/lib/adminV2/runtime/useIdleSessionLogout.ts");
        expect(src, "the idle-logout flag changed shape").toMatch(
            /NEXT_PUBLIC_ALLOY_OS_IDLE_LOGOUT\s*===\s*"1"/,
        );
        expect(read(AUTH_DOC), "the owner must keep saying the timeout ships off").toMatch(/off by default/i);
    });

    it("customer/parent authentication is still declared unsolved at the identity bridge", () => {
        expect(read("web/lib/access/linkedPersonIdentity.ts")).toMatch(/customer\s+authentication\s*—?\s*that\s+remains\s+unsolved/i);
    });
});

describe("the benchmark manifest's measured counts match the measurement", () => {
    const report = runRouteCapabilityCheck() as {
        counts: { routes: number; methods: number; declared: number; none: number; pending: number; bound: number };
    };

    it("is not vacuous: the route check produces real counts", () => {
        expect(report.counts.methods).toBeGreaterThan(500);
        expect(report.counts.declared).toBeGreaterThan(0);
    });

    it("the manifest states the handler total, declared, none and pending exactly", () => {
        const manifest = read(MANIFEST);
        const c = report.counts;
        // Each number is asserted individually so a failure names WHICH one drifted, rather than
        // reporting that some unspecified figure in a long document is stale.
        expect(manifest, `handler total is ${c.methods}`).toContain(String(c.methods));
        expect(manifest, `declared+bound is ${c.declared}`).toContain(String(c.declared));
        expect(manifest, `admission-sufficient is ${c.none}`).toContain(String(c.none));
        expect(manifest, `pending is ${c.pending}`).toContain(String(c.pending));
        expect(manifest, `route file count is ${c.routes}`).toContain(String(c.routes));
    });

    it("declared capabilities are all actually bound to an enforcing helper", () => {
        // The manifest says "declare and bind". If declared ever exceeded bound, that phrase would be
        // overstating enforcement — the exact failure this whole domain is trying not to repeat.
        expect(report.counts.bound).toBe(report.counts.declared);
    });

    it("Identity/Access is listed among the certified domains, not the pending ones", () => {
        const manifest = read(MANIFEST);
        const certifiedRow = manifest.split("\n").find((l) => /\*\*Domains certified\*\*/.test(l)) ?? "";
        const pendingRow = manifest.split("\n").find((l) => /\*\*Domains pending\*\*/.test(l)) ?? "";
        expect(certifiedRow, "Identity/Access is not in the certified row").toMatch(/Identity\/Access/);
        expect(pendingRow, "Identity/Access is still listed as pending as well").not.toMatch(/Identity\/Access/);
    });
});
