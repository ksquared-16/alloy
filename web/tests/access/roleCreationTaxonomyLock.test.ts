/**
 * RL-32 — NORMAL ROLE CREATION SHOWS CURRENT PRODUCT, AND ALL OF IT.
 *
 * The mounted audit found the trailing "Not yet mapped to a product area" bucket had become the
 * LARGEST area in the role editor, and that it was made largest by the slices meant to make the
 * authority model legible: Work Authority V1, Attendance V1 and the Access Administration Split all
 * minted capabilities the taxonomy never learned. An administrator looking for "who may record
 * attendance" was sent to a heading named after the platform's own failure to classify.
 *
 * Two areas had the opposite problem. `Inquiries` and `Billing (legacy)` each held exactly one row,
 * the platform consults neither, and both rendered a heading, a description and a `No access` radio
 * that could never become anything else — configurability that was never real.
 *
 * ── WHAT THIS LOCK HOLDS ──
 *
 * The invariant is not a list of areas; it is a RULE, asserted against the live catalog projection:
 *
 *   every enforced capability has a product home, and nothing without one is offered as a control.
 *
 * Stated that way it survives the next capability. A list would go stale the first time someone
 * enforces a key, which is exactly how the bucket grew in the first place.
 *
 * ── NOT AN AUTHORITY CHANGE ──
 *
 * Nothing here grants, revokes or merges. Hiding an inert row removes a control that could never do
 * anything; `applyGridRowSelection` runs only when a control changes, so an absent control cannot
 * revoke a grant, and `H2`/`RL-48` still carries undrawable keys through a save.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CAPABILITY_AREAS, UNMAPPED, areaForRow } from "@/lib/access/capabilityTaxonomy";
import { buildCapabilityMatrix, normalModeMatrix } from "@/lib/access/capabilityMatrix";
import { buildPermissionGridRows, rowEnforcement, type PermissionCatalogEntry } from "@/lib/admin/permissionGrid";
import { discoverCatalogEntries } from "@/tests/access/permissionCatalogDiscovery";

const WEB = path.resolve(__dirname, "..", "..");
const read = (p: string) => fs.readFileSync(path.join(WEB, p), "utf8");
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

/*
 * The catalog comes from `discoverCatalogEntries` — the same discovery the W-11 reconciliation uses
 * — rather than a regex of my own over the migrations. A second scraper is a second definition of
 * "the catalog", and the shapes differ enough that mine silently missed the Attendance keys on the
 * first run: they are seeded through a loop over `(key, label, description)` with the group applied
 * separately. Reusing the canonical reader is the fix and the point.
 */
const DISCOVERED = discoverCatalogEntries();
/*
 * ONE LIMITATION, STATED RATHER THAN PAPERED OVER. `discoverCatalogEntries` recovers every catalog
 * KEY, but not every GROUP: several families — Attendance among them — are seeded through a loop
 * over `(key, label, description)` with the group applied separately, so the static reader returns
 * no group for them and `attendance.record.assigned_only` it does not see at all. The runtime gets
 * groups from `permission_definitions`, so the rule cases below are asserted over the entries whose
 * group IS recoverable, and the rows this slice filed are asserted DIRECTLY against the mapping —
 * which needs no catalog and is the stronger check for them anyway.
 */
const CATALOG: PermissionCatalogEntry[] = DISCOVERED.filter((e) => !!e.group_key).map((e) => ({
    key: e.key,
    label: e.label ?? e.key,
    group_key: e.group_key as string,
    description: null,
}));
const ROWS = buildPermissionGridRows(CATALOG);
const NORMAL = normalModeMatrix(buildCapabilityMatrix(ROWS, new Set()));
const normalRowIds = new Set(NORMAL.flatMap((a) => a.rows.map((r) => r.id)));
const enforcedRows = ROWS.filter((r) => !rowEnforcement(r).inert);

describe("RL-32 — every enforced capability has a product home", () => {
    it("non-vacuity: the projection sees a real catalog and a real matrix", () => {
        expect(CATALOG.length).toBeGreaterThan(60);
        expect(enforcedRows.length).toBeGreaterThan(35);
        expect(NORMAL.length).toBeGreaterThan(15);
    });

    it("no enforced row is left unmapped", () => {
        const stranded = enforcedRows
            .filter((r) => areaForRow(r) === UNMAPPED)
            .map((r) => `${r.id} (${r.label})`);
        expect(
            stranded,
            `these are enforced and have no product area — the bucket is how the editor stopped being legible: ${stranded.join(", ")}`,
        ).toEqual([]);
    });

    it("no enforced row disappears from normal mode", () => {
        // The opposite failure: tidying the editor by hiding something an organization can grant.
        const lost = enforcedRows.filter((r) => !normalRowIds.has(r.id)).map((r) => r.id);
        expect(lost, `hidden but grantable: ${lost.join(", ")}`).toEqual([]);
    });

    it("no inert row is offered as a control", () => {
        const inertShown = ROWS.filter((r) => rowEnforcement(r).inert && normalRowIds.has(r.id)).map((r) => r.id);
        expect(inertShown, `a control that changes nothing: ${inertShown.join(", ")}`).toEqual([]);
    });

    it("no area renders with nothing an administrator can grant", () => {
        const empty = NORMAL.filter((a) => a.enforcedTotal === 0 || a.rows.length === 0).map((a) => a.label);
        expect(empty, `an area with no grantable row is not a product area: ${empty.join(", ")}`).toEqual([]);
    });
});

describe("RL-32 — the areas this slice added stay added", () => {
    /*
     * Asserted against `areaForRow` directly. The runtime hands it the row id and the catalog group;
     * both are supplied here, so this measures the mapping itself rather than a static reader's
     * partial view of the catalog.
     */
    const areaOf = (rowId: string, groupKey: string) => areaForRow({ id: rowId, groupKey });

    it.each([
        ["work.configure", "operations", "work"],
        ["work.operate", "operations", "work"],
        ["attendance", "operations", "attendance"],
        ["attendance.record", "operations", "attendance"],
        ["attendance.record.assigned_only", "operations", "attendance"],
        ["attendance.devices", "operations", "attendance"],
        ["integrations", "integrations", "integrations"],
        ["ai.enrichment.use", "ai", "ai"],
        ["ops.jobs", "operations", "jobs"],
        ["ops.messaging", "operations", "communications"],
    ])("%s is filed under %s", (row, group, area) => {
        expect(areaOf(row, group)).toBe(area);
    });

    it("Tours is its own area and is NOT Scheduling", () => {
        expect(areaOf("tours.configure", "scheduling")).toBe("tours");
        expect(areaOf("tours.book", "scheduling")).toBe("tours");
        const scheduling = NORMAL.find((a) => a.areaKey === "scheduling");
        expect(
            scheduling?.rows.map((r) => r.id) ?? [],
            "a tour is the customer booking product, not the operating calendar",
        ).not.toContain("tours.book");
    });

    it("the areas exist in the taxonomy with operator labels, not key stems", () => {
        for (const key of ["work", "attendance", "tours", "jobs", "integrations", "ai"]) {
            const meta = CAPABILITY_AREAS.find((a) => a.key === key);
            expect(meta, `${key} area missing`).toBeTruthy();
            expect(meta!.label).not.toContain(".");
            expect(meta!.description.length).toBeGreaterThan(10);
        }
    });
});

describe("RL-32 — dormant capability is not advertised as configurable", () => {
    const shown = (rowId: string) => normalRowIds.has(rowId);

    it("the inert legacy areas are gone from normal mode", () => {
        const labels = NORMAL.map((a) => a.areaKey);
        expect(labels, "every Inquiries row is unenforced").not.toContain("inquiries");
        expect(labels, "the legacy billing pair is consulted nowhere").not.toContain("billing");
    });

    it("dormant AI controls are not offered, while the enforced one is", () => {
        // AI gets an area for the authority the platform acts on, and only that. Membership of the
        // area is the mapping's job; being OFFERED is enforcement's, so both are asserted.
        expect(areaForRow({ id: "ai.enrichment.use", groupKey: "ai" })).toBe("ai");
        expect(shown("ai.enrichment.use")).toBe(true);
        for (const dormant of ["ai.provider.config", "ai.telemetry.review"]) {
            expect(shown(dormant), `${dormant} is consulted nowhere`).toBe(false);
        }
    });

    it("dormant legacy ops.* rows are not renamed into a current product area", () => {
        for (const row of ["ops.contacts", "ops.customers", "ops.locations", "ops.opportunities", "ops.schedules"]) {
            expect(shown(row), `${row} is dormant and must not be beautified`).toBe(false);
        }
    });

    it("the unmapped bucket carries no control at all", () => {
        expect(NORMAL.find((a) => a.areaKey === UNMAPPED)).toBeUndefined();
    });
});

describe("RL-32 — presentation only, and Advanced adds no control", () => {
    it("the taxonomy names no capability semantics of its own", () => {
        const src = codeOnly(read("lib/access/capabilityTaxonomy.ts"));
        for (const f of ["applyGridRowSelection", "role_permission_grants", "seed_default_rbac"]) {
            expect(src, `${f} would make this file authority rather than presentation`).not.toContain(f);
        }
    });

    it("Advanced is key visibility, not a second editor", () => {
        /*
         * The page renders one control per row and gates only the KEY TEXT on `showAdvanced`. If a
         * radio ever appeared inside that branch the two modes would disagree about what a role can
         * be, which is the defect this taxonomy exists to remove.
         */
        const page = read("components/adminV2/settings/access/AccessRolesConfigurationPage.tsx");
        const idx = page.indexOf("showAdvanced ?");
        expect(idx).toBeGreaterThan(-1);
        const branch = page.slice(idx, idx + 700);
        expect(branch).toContain("access-role-keys-");
        expect(branch, "Advanced must not introduce a control").not.toMatch(/type="radio"/);
    });

    it("normal mode is built from the same matrix, narrowed — never a separate source", () => {
        const page = codeOnly(read("components/adminV2/settings/access/AccessRolesConfigurationPage.tsx"));
        expect(page).toMatch(/normalModeMatrix\(\s*buildCapabilityMatrix\(/);
    });
});
