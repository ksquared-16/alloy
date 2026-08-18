import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
    AUTHORITY_SET_LOADING,
    authoritySetFailed,
    authoritySetIsWritable,
    authoritySetKeysForDisplay,
    authoritySetLoaded,
    authoritySetWriteRefusal,
} from "@/lib/access/authoritySetLoad";

/**
 * W-56 (§46, Wave 13) — `T-22`/`S-11`: *"a failed read becomes a silent total revocation on the
 * next save."*
 *
 * Three blocks:
 *   1. the representation — unknown is not empty, and only a known set may be written;
 *   2. the composed defect — the exact chain that made this an S3, asserted end to end;
 *   3. the Tier A lock (`S-11`), whose subject is DISCOVERED from source rather than enumerated.
 */

const webRoot = process.cwd();

describe("W-56 — an unloaded authority set is UNKNOWN, not EMPTY", () => {
    it("a loaded set is writable and carries its keys", () => {
        const load = authoritySetLoaded(["settings.users_roles", "reports.read"]);
        expect(authoritySetIsWritable(load)).toBe(true);
        expect([...authoritySetKeysForDisplay(load)].sort()).toEqual(["reports.read", "settings.users_roles"]);
        expect(authoritySetWriteRefusal(load)).toBeNull();
    });

    it("a loaded EMPTY set is still writable — deliberately revoking everything is a real operation", () => {
        const load = authoritySetLoaded([]);
        expect(authoritySetIsWritable(load)).toBe(true);
        expect(authoritySetWriteRefusal(load)).toBeNull();
    });

    it("a FAILED read displays as empty but is NOT writable — the distinction the Set could not hold", () => {
        const load = authoritySetFailed(new Error("boom"));
        expect([...authoritySetKeysForDisplay(load)]).toEqual([]);
        expect(authoritySetIsWritable(load)).toBe(false);
        expect(authoritySetWriteRefusal(load)).toContain("boom");
    });

    it("a LOADING set is not writable either — saving mid-flight overwrites with a partial answer", () => {
        expect(authoritySetIsWritable(AUTHORITY_SET_LOADING)).toBe(false);
        expect(authoritySetWriteRefusal(AUTHORITY_SET_LOADING)).toMatch(/still loading/i);
    });

    it("a failed read with an empty message still produces a visible refusal", () => {
        // An error state whose message is "" renders as no error at all, which is the silence
        // this state exists to break.
        for (const empty of [new Error(""), "", "   ", null, undefined, 42]) {
            const load = authoritySetFailed(empty);
            expect(load.status).toBe("failed");
            expect(authoritySetWriteRefusal(load)?.trim().length ?? 0).toBeGreaterThan(20);
        }
    });

    it("the failed refusal names the consequence, not just the fault", () => {
        const refusal = authoritySetWriteRefusal(authoritySetFailed("Read failed."));
        expect(refusal).toMatch(/empty set/i);
        expect(refusal).toMatch(/reload/i);
    });
});

/**
 * The composed defect, asserted as one chain rather than as three defensible parts.
 *
 * `PUT /api/admin/rbac/grants` deletes every grant row for `(org_id, role_key)` and skips the insert
 * when the list is empty, so the payload `[]` IS a total revocation. That is the route's contract and
 * is not changed here — what changes is that an unknown set can no longer become that payload.
 */
describe("W-56 — the revocation chain is broken at the representation", () => {
    it("the grants PUT still treats an empty list as a total revocation (the hazard is real)", () => {
        const src = readFileSync(join(webRoot, "app/api/admin/rbac/grants/route.ts"), "utf8");
        expect(src).toMatch(/\.from\("role_permission_grants"\)\s*\n?\s*\.delete\(\)/);
        expect(src, "the insert is skipped when the list is empty, so [] deletes and restores nothing").toMatch(
            /if\s*\(permission_keys\.length\s*>\s*0\)/,
        );
    });

    it("a failed read cannot produce the revoking payload, because the guard refuses first", () => {
        const failed = authoritySetFailed("Internal error");
        // This is what the save path computes and sends.
        const payload = [...authoritySetKeysForDisplay(failed)];
        expect(payload).toEqual([]); // it WOULD be the revoking payload …
        expect(authoritySetIsWritable(failed)).toBe(false); // … and it never gets sent.
    });

    it("the surface's save is guarded before the fetch, not only on the button", () => {
        const src = readFileSync(
            join(webRoot, "components/adminV2/settings/access/AccessRolesConfigurationPage.tsx"),
            "utf8",
        );
        const saveBody = src.slice(src.indexOf("const saveGrants"), src.indexOf("const setGridLevel"));
        expect(saveBody).toContain("authoritySetIsWritable");
        expect(
            saveBody.indexOf("authoritySetIsWritable"),
            "the refusal must precede the request — a disabled attribute is a presentation fact",
        ).toBeLessThan(saveBody.indexOf("fetch("));
    });

    it("neither grants-read failure path clears the set silently any more", () => {
        const src = readFileSync(
            join(webRoot, "components/adminV2/settings/access/AccessRolesConfigurationPage.tsx"),
            "utf8",
        );
        const fetchBody = src.slice(src.indexOf("const fetchGrants"), src.indexOf("useEffect(() => {\n        if (!selected)"));
        expect(fetchBody).not.toMatch(/setGrantKeys\(new Set\(\)\)/);
        // Both exits record a failure.
        expect((fetchBody.match(/authoritySetFailed/g) ?? []).length).toBe(2);
    });

    it("an edit cannot manufacture a loaded set out of a failed read", () => {
        const src = readFileSync(
            join(webRoot, "components/adminV2/settings/access/AccessRolesConfigurationPage.tsx"),
            "utf8",
        );
        const body = src.slice(src.indexOf("const setGridLevel"), src.indexOf("const usersWithRole"));
        expect(body).toMatch(/grantLoad\.status !== "loaded"/);
    });
});

/**
 * `S-11`, Tier A — stated over **every** authority surface, not only the one that had the defect.
 *
 * The subject is DISCOVERED. An enumerated list of surfaces is a list the next surface is absent
 * from, which is the failure shape this initiative has already paid for three times (W-5's locks,
 * session 3's backing routes, session 5's enumerated authority vocabulary).
 */

/** Every `.tsx` under the Access chapter tree and the legacy role editors. */
function authoritySurfaceFiles(): string[] {
    const roots = [
        "components/adminV2/settings/access",
        "app/legacy-admin/system/access-control",
        "app/legacy-admin/system/roles",
        "app/legacy-admin/users",
        // NOT `legacy-admin/system/customer-person-roles`. `01…§41` is explicit that it is "a
        // different concept sharing a word" — the family/household relationship vocabulary, not
        // operator authority — and `W-59` requires it be dispositioned on its own terms rather
        // than swept up in an authority cleanup. It was added to this list speculatively, the scan
        // flagged a silent clear in it, and the correct response was to remove the root rather
        // than to make an unrelated change under an access workstream's name.
    ];
    const found: string[] = [];
    for (const root of roots) {
        const abs = join(webRoot, root);
        let entries: string[];
        try {
            entries = readdirSync(abs);
        } catch {
            continue;
        }
        for (const entry of entries) {
            const p = join(abs, entry);
            if (statSync(p).isFile() && entry.endsWith(".tsx")) found.push(join(root, entry));
        }
    }
    return found;
}

/**
 * A clearing of an authority set inside a read-failure path: `setX(new Set())` or `setX([])`
 * appearing inside a `catch { … }` or an `if (!res.ok) { … }` block.
 */
function silentAuthorityClears(source: string): string[] {
    const offenders: string[] = [];
    const blocks = [
        ...source.matchAll(/catch\s*(?:\([^)]*\))?\s*\{([\s\S]{0,600}?)\n\s{0,20}\}/g),
        ...source.matchAll(/if\s*\(\s*!\w+\.ok\s*\)\s*\{([\s\S]{0,600}?)\n\s{0,20}\}/g),
    ];
    for (const block of blocks) {
        const body = block[1];
        const clear = /set([A-Z]\w*)\(\s*(?:new Set\(\s*\)|\[\s*\])\s*\)/.exec(body);
        if (!clear) continue;
        // An error IS recorded when the same block also sets an error or a failure state.
        const records = /setError\(|authoritySetFailed\(|setLoadError\(|throw\s/.test(body);
        if (!records) offenders.push(`set${clear[1]}(…) cleared with no error recorded`);
    }
    return offenders;
}

describe("W-56 Tier A (`S-11`) — no authority surface clears a set on a failed read without saying so", () => {
    const files = authoritySurfaceFiles();

    it("finds the surfaces it is supposed to be checking (the scan is not vacuous)", () => {
        expect(files.length).toBeGreaterThanOrEqual(4);
        expect(files.some((f) => f.endsWith("AccessRolesConfigurationPage.tsx"))).toBe(true);
    });

    it.each(files)("%s", (rel) => {
        const source = readFileSync(join(webRoot, rel), "utf8");
        expect(silentAuthorityClears(source), `${rel}: S-11 — a cleared authority set must record why`).toEqual([]);
    });

    /**
     * The other half of `S-11`, and the reason it is stated here rather than left implied: W-54
     * makes the role route REFUSE a partial-view replacement, and a surface that drops the refusal
     * on the floor turns a prevented data loss into a phantom success. Both legacy editors did
     * exactly that — `if (res.ok) fetchUsers();` with no else — so hardening the route without
     * this would have traded a destructive bug for a lying one.
     */
    function unreportedMutations(rawSource: string): string[] {
        // Comments are stripped first. A prose block between the request and its error handling
        // would otherwise push the handling out of the window and convict working code — which is
        // exactly what this scan did to the W-54 note on the canonical surface when it was written.
        // §10.2's standing lesson: the reader must read code, not the text around it.
        const source = rawSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        const offenders: string[] = [];
        for (const m of source.matchAll(/method:\s*"(PATCH|PUT|POST|DELETE)"/g)) {
            const start = m.index ?? 0;
            // Bounded by the ENCLOSING handler, not by a character count. A fixed window let the
            // next handler's error reporting satisfy the check for this one — adjacency standing in
            // for handling, which is the same "reachability standing in for enforcement" mistake
            // session 5 recorded when it made the authority-root walk ask the declaration.
            const rest = source.slice(start);
            const nextHandler = /\n\s{2,4}const \w+\s*=\s*(?:async\s*)?\(/.exec(rest);
            const end = Math.min(rest.length, nextHandler ? nextHandler.index : rest.length);
            const within = rest.slice(0, end);
            // `setError(null)` is a RESET, not a report — it must not count as handling.
            const reports = /setError\((?!null\))|setSaveError\((?!null\))|throw\s|setNewRoleError\((?!null\))/.test(
                within,
            );
            if (!reports) offenders.push(`${m[1]} at offset ${start} records no failure`);
        }
        return offenders;
    }

    it.each(files)("%s reports every authority mutation that fails", (rel) => {
        const source = readFileSync(join(webRoot, rel), "utf8");
        expect(unreportedMutations(source), `${rel}: S-11 — a refused write must not read as success`).toEqual([]);
    });

    /**
     * The fixture is SYNTHETIC, and that is a repair rather than a shortcut.
     *
     * It used to mutate `app/legacy-admin/users/UsersClient.tsx` — one of the three surfaces
     * `W-59` has now deleted, because a live operator could not reach any of them. A positive
     * control anchored to a specific file stops proving anything the day that file goes, and this
     * program has already paid three times for a lock whose SUBJECT was a hard-coded list
     * (`RL-1` twice, `RL-4`). The pattern is what the scanner must convict, so the pattern is what
     * the control states — and it cannot rot when a surface is retired.
     *
     * Stated as a PAIR. A fixture that only proves conviction would also pass against a scanner
     * that convicts everything, which is the same vacuity in the other direction.
     */
    it("bites: dropping the refusal report is detected, and correct handling is not", () => {
        const silent = `
    const save = async () => {
        const res = await fetch("/api/admin/rbac/grants", { method: "PUT" });
        if (res.ok) fetchUsers();
    };
`;
        expect(
            unreportedMutations(silent).length,
            "a mutation whose failure is never reported must be convicted",
        ).toBeGreaterThan(0);

        const reported = `
    const save = async () => {
        const res = await fetch("/api/admin/rbac/grants", { method: "PUT" });
        if (res.ok) fetchUsers();
        else setError("Save failed.");
    };
`;
        expect(
            unreportedMutations(reported),
            "a mutation that DOES report its failure must not be convicted",
        ).toEqual([]);
    });

    it("bites: reinstating the original silent clear is detected", () => {
        const src = readFileSync(
            join(webRoot, "components/adminV2/settings/access/AccessRolesConfigurationPage.tsx"),
            "utf8",
        );
        const regressed = src.replace(
            /if \(!res\.ok\) \{\s*\n\s*setGrantLoad\(\s*\n?[\s\S]*?\);\s*\n\s*return;\s*\n\s*\}/,
            "if (!res.ok) {\n                setGrantKeys(new Set());\n                return;\n            }",
        );
        expect(regressed, "the regression fixture must actually differ from the source").not.toBe(src);
        expect(silentAuthorityClears(regressed).length).toBeGreaterThan(0);
    });
});
