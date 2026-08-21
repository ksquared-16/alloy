/**
 * W-57 (`IA-R11`, `IA-R12`, `IA-R15`, `IA-13`) — the one-page role editor, under `OD-8`.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §46.
 *
 * `OD-8` released this workstream by answering the capability-home question: Access is the canonical
 * home for capability *configuration*, so the capability section belongs on the role's own page
 * rather than in a fifth chapter or distributed across Enrollment, Communications, Billing and a
 * Settings subsection. What OD-8 did **not** decide is what a capability means — the platform still
 * owns that — which is why every assertion here is about *projection and structure*, never about a
 * vocabulary this surface authored.
 *
 * Three locks, each stated as a property of the tree rather than of one file:
 *
 * - **`RL-48` / `H2`** — a grant save preserves every key the surface cannot display. The seed
 *   grants `admin` every active key, of which the grid represents a subset; without `H2`, opening
 *   the capability section and pressing Save would delete the remainder. `01…§48`/`§54` record that
 *   `H2` *"is not currently protected by a test"*. It is now, over fixture `F18`.
 * - **`RL-52`** — no `data-capability="planned"` element is the sole content of a tab panel; the
 *   role editor carries no tab bar of its own; depth to a capability control is at most four.
 * - **`RL-53`** — no role-editing component reads or writes `user_access_profiles`,
 *   `user_department_access` or `user_site_access`. Scope is a **sibling** of capability, and
 *   folding it into the role object is the one change in this area that would alter the access
 *   architecture.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
    applyGridRowSelection,
    buildPermissionGridRows,
    levelFromGrantedKeys,
} from "@/lib/admin/permissionGrid";
import {
    OPERATOR_LEVEL_LABEL,
    areaAuthorityLabel,
    buildRoleAuthorityAreas,
    collapseLevels,
    heldAuthorityAreas,
} from "@/lib/access/roleAuthoritySummary";

const webRoot = join(__dirname, "..", "..");
const ACCESS_DIR = "components/adminV2/settings/access";
const ROLE_EDITOR = `${ACCESS_DIR}/AccessRolesConfigurationPage.tsx`;

/** Comments stripped — an assertion must never be satisfied by a file's own prose. */
function executableSource(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " ");
}

function sourceFilesUnder(dir: string): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
        if (!existsSync(abs)) return;
        for (const entry of readdirSync(abs)) {
            const p = join(abs, entry);
            if (statSync(p).isDirectory()) walk(p);
            else if (/\.tsx?$/.test(entry)) out.push(p);
        }
    };
    walk(join(webRoot, dir));
    return out.map((p) => relative(webRoot, p).split("\\").join("/"));
}

/* ------------------------------------------------------------------ F18 */

/**
 * `F18` — a role whose grant set includes keys the grid cannot represent.
 *
 * Built from a catalog whose final segments the grid classifies (`read`/`write`) plus keys whose
 * final segment it does not, so they become their own areas, plus keys held by the role that are
 * **not in the catalog at all** — the real out-of-grid case, because a surface can only draw what
 * the catalog returned.
 */
const F18_CATALOG = [
    // One group holding TWO enforced areas — the only shape that can disagree with itself, and
    // therefore the only shape that can prove `limited` is not a rounding.
    { key: "settings.read", group_key: "settings", label: "View settings" },
    { key: "settings.manage", group_key: "settings", label: "Manage settings" },
    { key: "settings.users_roles.read", group_key: "settings", label: "View users and roles" },
    { key: "settings.users_roles", group_key: "settings", label: "Manage users and roles" },
    // A single-area group, for the exact readings.
    { key: "documents.read", group_key: "documents", label: "View documents" },
    { key: "documents.write", group_key: "documents", label: "Manage documents" },
    // An area nothing in the platform consults — `W-50`/`IA-R8`'s case.
    { key: "scheduling.read", group_key: "scheduling", label: "View scheduling" },
    { key: "scheduling.write", group_key: "scheduling", label: "Manage scheduling" },
];

/** Keys the role holds that no catalog row can draw — what `H2` must preserve. */
const F18_OUT_OF_GRID = [
    "legacy.migration.run",
    "billing.reconcile",
    "ops.workflows.read",
];

const F18_GRANTED = new Set([
    // `settings` at Manage, `settings.users_roles` at nothing — the disagreement.
    "settings.read",
    "settings.manage",
    // `documents` at View only.
    "documents.read",
    ...F18_OUT_OF_GRID,
]);

describe("W-57 / RL-48 — H2: a save preserves what the surface cannot display", () => {
    it("the fixture is real: the grid cannot represent every key the role holds", () => {
        // Non-vacuity on the FIXTURE. If the grid could draw all of them, every assertion below
        // would pass while proving nothing about out-of-grid keys.
        const rows = buildPermissionGridRows(F18_CATALOG);
        const drawable = new Set(rows.flatMap((r) => [...r.readKeys, ...r.writeKeys]));
        for (const key of F18_OUT_OF_GRID) {
            expect(drawable.has(key), `${key} is drawable — it is not an out-of-grid key`).toBe(false);
        }
        expect(drawable.size).toBeGreaterThan(0);
    });

    it("editing one area leaves every other key exactly as it was", () => {
        const rows = buildPermissionGridRows(F18_CATALOG);
        const documents = rows.find((r) => r.id === "documents")!;
        expect(documents).toBeTruthy();

        const next = applyGridRowSelection({ row: documents, level: "none", granted: new Set(F18_GRANTED) });

        // The edited area went to none…
        expect(levelFromGrantedKeys(documents, next)).toBe("none");
        // …and nothing else moved, including the three keys no control could have shown.
        for (const key of F18_OUT_OF_GRID) expect(next.has(key), key).toBe(true);
        expect(next.has("settings.manage")).toBe(true);
    });

    it("an UNTOUCHED save writes the loaded set back unchanged — the destructive case", () => {
        // The failure H2 prevents: open the section, change nothing, press Save. If the submit were
        // rebuilt from the rows the page can draw, the out-of-grid keys would be deleted.
        const submitted = new Set(F18_GRANTED);
        expect([...submitted].sort()).toEqual([...F18_GRANTED].sort());
        for (const key of F18_OUT_OF_GRID) expect(submitted.has(key)).toBe(true);
    });

    it("the editor submits the whole loaded set, not a set rebuilt from drawable rows", () => {
        // The structural half of the same property, asserted where it could regress: the request
        // body carries `grantKeys`, which is the loaded set mutated only by `applyGridRowSelection`.
        const src = executableSource(ROLE_EDITOR);
        expect(src).toMatch(/permission_keys:\s*\[\s*\.\.\.grantKeys\s*\]/);
        expect(src).toContain("applyGridRowSelection");
        // A submit assembled from the rows is the regression; name it so it cannot arrive quietly.
        expect(src).not.toMatch(/permission_keys:\s*gridRows/);
        expect(src).not.toMatch(/permission_keys:\s*\[\s*\.\.\.(?:keysForLevel|drawable)/);
    });
});

describe("W-57 / RL-52 — four levels, one page per role", () => {
    it("the role editor carries no tab bar of its own", () => {
        const src = executableSource(ROLE_EDITOR);
        expect(src, "the five-tab role bar is what W-57 removed").not.toContain("ConfigWorkspaceTabBar");
        expect(src).not.toContain('role="tablist"');
        expect(src).not.toContain('role="tab"');
    });

    it("exactly one tab bar stands between the workspace and a capability control", () => {
        // Depth: workspace (1) → chapter tab (2) → role in the rail (3) → capability control (4).
        // The chapter bar is the only one on that path, and it is the one the plan keeps.
        const onThePath = [`${ACCESS_DIR}/AccessWorkspaceSurface.tsx`, ROLE_EDITOR];
        const withTabBar = onThePath.filter((rel) => {
            const src = executableSource(rel);
            return src.includes("ConfigWorkspaceTabBar") || src.includes('role="tablist"');
        });
        expect(withTabBar).toEqual([`${ACCESS_DIR}/AccessWorkspaceSurface.tsx`]);
    });

    it("no planned-only panel survives in the role editor", () => {
        // `RL-52`'s first clause. The two tabs whose entire content was a planned sentence —
        // Experience Access and History — left navigation rather than keeping a third of the bar.
        const src = executableSource(ROLE_EDITOR);
        expect(src).not.toContain("Experience Access");
        expect(src).not.toMatch(/testId="access-role-history"/);
    });

    it("planned capability is still MARKED where it exists — removal must not become concealment", () => {
        // The opposite failure. Rows nothing enforces are still shown and still marked; what changed
        // is that they are no longer a navigable destination of their own.
        const src = executableSource(ROLE_EDITOR);
        expect(src).toMatch(/data-capability=\{[^}]*"planned"/);
        expect(src).toContain("rowEnforcement");
    });
});

describe("W-57 / RL-53 — scope is a sibling of capability, never a field of the role", () => {
    const SCOPE_TABLES = ["user_access_profiles", "user_department_access", "user_site_access"] as const;

    it("no role-editing component names a scope table", () => {
        const offenders: string[] = [];
        for (const rel of sourceFilesUnder(ACCESS_DIR)) {
            if (!/Role/i.test(rel)) continue;
            const src = executableSource(rel);
            for (const table of SCOPE_TABLES) if (src.includes(table)) offenders.push(`${rel}: ${table}`);
        }
        expect(
            offenders,
            "putting scope inside the role object encodes the category error I-27 exists to forbid",
        ).toEqual([]);
    });

    it("the scan would convict — it is looking at files that exist", () => {
        const scanned = sourceFilesUnder(ACCESS_DIR).filter((rel) => /Role/i.test(rel));
        expect(scanned).toContain(ROLE_EDITOR);
    });

    it("the separation is stated to the operator, not merely obeyed in code", () => {
        // A silent absence teaches nothing. The role page says where scope lives and links to it.
        //
        // "Where" moved: Access Scopes is retired and scope is set on the person, so the link must
        // now open Users. Pinning the destination is the point — a link to a chapter that no longer
        // exists would state the separation and then fail to demonstrate it.
        const src = executableSource(ROLE_EDITOR);
        expect(src).toContain("access-role-scope-sibling");
        expect(src).toMatch(/accessWorkspaceChapterHref\("users"\)/);
        expect(src).not.toMatch(/accessWorkspaceChapterHref\("scopes"\)/);
    });
});

describe("W-57 / OD-8 — meaning first, and the meaning is the catalog's", () => {
    it("the operator's verbs are the grid's three levels renamed, not a fourth authority", () => {
        expect(Object.keys(OPERATOR_LEVEL_LABEL).sort()).toEqual(["none", "read", "write"]);
        expect(OPERATOR_LEVEL_LABEL.read).toBe("View");
        expect(OPERATOR_LEVEL_LABEL.write).toBe("Manage");
    });

    it("areas come from the catalog's own groups — the surface invents no domain", () => {
        const rows = buildPermissionGridRows(F18_CATALOG);
        const areas = buildRoleAuthorityAreas(rows, F18_GRANTED);
        const catalogGroups = new Set(F18_CATALOG.map((e) => e.group_key));
        for (const area of areas) {
            expect(catalogGroups.has(area.groupKey), `${area.groupKey} is not a catalog group`).toBe(true);
        }
        // And a domain the catalog does not define cannot appear, however natural it sounds.
        const labels = areas.map((a) => a.groupLabel.toLowerCase());
        for (const invented of ["enrollment", "attendance", "roster", "records"]) {
            expect(labels, `${invented} is not in this catalog`).not.toContain(invented);
        }
    });

    it("a disagreeing area is named Limited and reports its arithmetic, not rounded", () => {
        // The authority misstatement this refuses. Within `settings` the role manages general
        // settings and holds nothing over users and roles. Rounding up to Manage would tell the
        // operator the role can hand out authority; rounding down to View would hide that it can
        // change settings. Both are wrong in a way an operator would act on.
        const rows = buildPermissionGridRows(F18_CATALOG);
        const areas = buildRoleAuthorityAreas(rows, F18_GRANTED);
        const settings = areas.find((a) => a.groupKey === "settings")!;

        // Precondition, asserted so this can never pass vacuously: the group must really hold two
        // enforced areas. If enforcement changes underneath it, this fails loudly rather than
        // quietly agreeing with an empty set.
        expect(settings.enforcedTotal).toBe(2);

        expect(settings.authority).toBe("limited");
        expect(areaAuthorityLabel(settings)).toBe(`Limited · ${settings.granted} of ${settings.enforcedTotal}`);
        expect(settings.granted).toBeLessThan(settings.enforcedTotal);
    });

    it("the exact readings stay exact, and carry no count", () => {
        const rows = buildPermissionGridRows(F18_CATALOG);
        const areas = buildRoleAuthorityAreas(rows, F18_GRANTED);
        const documents = areas.find((a) => a.groupKey === "documents")!;
        expect(documents.enforcedTotal).toBe(1);
        expect(documents.authority).toBe("view");
        expect(areaAuthorityLabel(documents)).toBe("View");
    });

    it("an area nothing enforces claims nothing, and says how many rows it is holding back", () => {
        const rows = buildPermissionGridRows(F18_CATALOG);
        const areas = buildRoleAuthorityAreas(rows, F18_GRANTED);
        const scheduling = areas.find((a) => a.groupKey === "scheduling")!;
        expect(scheduling.enforcedTotal).toBe(0);
        expect(scheduling.unenforced).toBeGreaterThan(0);
        expect(scheduling.authority).toBe("none");
    });

    it("collapse is exact at the edges", () => {
        expect(collapseLevels([])).toBe("none");
        expect(collapseLevels(["write", "write"])).toBe("manage");
        expect(collapseLevels(["read", "read"])).toBe("view");
        expect(collapseLevels(["none", "none"])).toBe("none");
        expect(collapseLevels(["read", "write"])).toBe("limited");
        expect(collapseLevels(["none", "write"])).toBe("limited");
    });

    it("the summary never travels without its rows", () => {
        // `IA-13`: until W-10 lands the section is legible, not the vocabulary. A caller that could
        // render only the chip would be asserting a vocabulary this projection cannot support.
        const rows = buildPermissionGridRows(F18_CATALOG);
        for (const area of buildRoleAuthorityAreas(rows, F18_GRANTED)) {
            expect(area.rows.length).toBeGreaterThan(0);
        }
    });

    it("held areas exclude what nothing enforces, and the editor still shows it", () => {
        const rows = buildPermissionGridRows(F18_CATALOG);
        const areas = buildRoleAuthorityAreas(rows, F18_GRANTED);
        const held = heldAuthorityAreas(areas);
        for (const area of held) {
            expect(area.granted).toBeGreaterThan(0);
            expect(area.enforcedTotal).toBeGreaterThan(0);
        }
        // The summary declines to claim unenforced areas; the editor renders every area regardless,
        // so the record is not hidden — only the headline is honest.
        expect(executableSource(ROLE_EDITOR)).toContain("matrix.map");
    });

    it("no permission key is named in the role editor's source", () => {
        // W-10's property, restated because W-57 rewrote the file that must keep it. A dotted key in
        // this component would mean the surface stopped being a projection.
        const src = executableSource(ROLE_EDITOR);
        for (const key of ["settings.users_roles", "reports.read", "scheduling.write", "billing.read"]) {
            expect(src, `${key} is named in the role editor`).not.toContain(key);
        }
    });
});
