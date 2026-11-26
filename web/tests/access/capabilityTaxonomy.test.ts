/**
 * The capability taxonomy, and the matrix built on it.
 *
 * The tranche's rule for this work is narrow and it is the thing these tests hold: the matrix is a
 * PRESENTATION layer. It may regroup, rename and summarise; it may not change what anyone can do.
 * So the assertions are mostly about authority NOT moving — presets that touch only their own rows,
 * mixed states that refuse to round, and capabilities that never disappear because no product area
 * claimed them.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPermissionGridRows, levelFromGrantedKeys } from "@/lib/admin/permissionGrid";
import { areaForRow, mappedGroups, CAPABILITY_AREAS, UNMAPPED } from "@/lib/access/capabilityTaxonomy";
import {
    applyAreaPreset,
    areaLevelLabel,
    buildCapabilityMatrix,
    heldMatrixAreas,
    offerableAreaLevels,
} from "@/lib/access/capabilityMatrix";

/** The catalog as the platform actually seeds it, read from the migrations rather than restated. */
function seededCatalog(): { key: string; group_key: string; label: string }[] {
    const dir = join(__dirname, "..", "..", "..", "supabase", "migrations");
    const seen = new Map<string, { key: string; group_key: string; label: string }>();
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql"))) {
        const sql = readFileSync(join(dir, f), "utf8");
        for (const m of sql.matchAll(/\('([a-z_][a-z_.]*)',\s*'([a-z_]+)',\s*'([^']+)'/g)) {
            const [, key, group_key, label] = m;
            if (!key!.includes(".")) continue;
            if (!seen.has(key!)) seen.set(key!, { key: key!, group_key: group_key!, label: label! });
        }
    }
    return [...seen.values()];
}

const CATALOG = seededCatalog();
const GRID = buildPermissionGridRows(CATALOG);

describe("the taxonomy is reconciled against the LIVE catalog, not against itself", () => {
    it("the catalog it reconciles is real", () => {
        // Non-vacuity: if the migration scrape found nothing, every mapping assertion below would
        // pass by agreeing with an empty set.
        expect(CATALOG.length).toBeGreaterThan(20);
        expect(GRID.length).toBeGreaterThan(10);
    });

    it("every technical group the catalog defines is either mapped or explicitly unmapped", () => {
        const groups = [...new Set(CATALOG.map((c) => c.group_key))];
        const unmapped = groups.filter((g) => !mappedGroups().includes(g));
        // Groups the taxonomy does not map by GROUP must be mapped row-by-row instead — that is the
        // `crm` / `operations` case. What must never happen is a row silently landing nowhere.
        for (const g of unmapped) {
            const rows = GRID.filter((r) => r.groupKey === g);
            for (const r of rows) {
                expect(areaForRow(r), `${r.id} (group ${g}) has no area`).not.toBe(UNMAPPED);
            }
        }
    });

    it("no capability is dropped by the regrouping — every row lands in exactly one area", () => {
        const matrix = buildCapabilityMatrix(GRID, new Set());
        const placed = matrix.flatMap((a) => a.rows.map((r) => r.id)).sort();
        expect(placed).toEqual(GRID.map((r) => r.id).sort());
        expect(new Set(placed).size, "a row was placed in two areas").toBe(placed.length);
    });

    it("the five configuration groups collapse for PRESENTATION and keep their rows distinct", () => {
        // The duplication the tranche named: Config, Fields, Layouts, Option sets and Sections were
        // five operator-facing entries for one concern. They are one area now — and the rows inside
        // it are still separate capabilities, which is what makes the regrouping a presentation
        // change rather than a merge of authority.
        const matrix = buildCapabilityMatrix(GRID, new Set());
        const config = matrix.find((a) => a.areaKey === "configuration");
        expect(config, "no configuration area").toBeTruthy();
        const groups = new Set(config!.rows.map((r) => r.groupKey));
        expect(groups.size).toBeGreaterThan(1);
        expect(config!.rows.length).toBe(new Set(config!.rows.map((r) => r.id)).size);
    });

    it("crm SPLITS rather than collapses — families and inquiries are different questions", () => {
        const matrix = buildCapabilityMatrix(GRID, new Set());
        const fam = matrix.find((a) => a.areaKey === "families");
        const inq = matrix.find((a) => a.areaKey === "inquiries");
        expect(fam?.rows.some((r) => r.id.startsWith("crm.customers"))).toBe(true);
        expect(inq?.rows.some((r) => r.id.startsWith("crm.opportunities"))).toBe(true);
        // Granting inquiry access must not be able to grant family access as a side effect.
        expect(fam!.rows.some((r) => r.id.startsWith("crm.opportunities"))).toBe(false);
    });

    it("users & roles is not filed under Settings", () => {
        // "Who can sign in" behind the same preset as "organization preferences" would let an
        // operator hand out access administration while intending to grant settings.
        const matrix = buildCapabilityMatrix(GRID, new Set());
        const settings = matrix.find((a) => a.areaKey === "settings");
        expect(settings?.rows.some((r) => r.id === "settings.users_roles")).toBe(false);
        expect(matrix.find((a) => a.areaKey === "users_roles")).toBeTruthy();
    });

    it("every area exists because capabilities map into it", () => {
        // `IA-R6`: no area for a product surface the catalog does not grant.
        const matrix = buildCapabilityMatrix(GRID, new Set());
        for (const a of matrix) expect(a.rows.length, `${a.areaKey} is empty`).toBeGreaterThan(0);
        for (const a of matrix) {
            if (a.areaKey === UNMAPPED) continue;
            expect(CAPABILITY_AREAS.some((c) => c.key === a.areaKey)).toBe(true);
        }
    });
});

describe("an area level is a preset over real rows, never a stored value", () => {
    const OUT_OF_GRID = ["legacy.migration.run", "billing.reconcile"];

    it("a preset touches only its own area's keys — H2 survives", () => {
        const matrix = buildCapabilityMatrix(GRID, new Set(OUT_OF_GRID));
        const docs = matrix.find((a) => a.areaKey === "documents")!;
        const next = applyAreaPreset({ area: docs, level: "write", granted: new Set(OUT_OF_GRID) });
        for (const k of OUT_OF_GRID) expect(next.has(k), k).toBe(true);
        // …and nothing from another area moved.
        const billing = matrix.find((a) => a.areaKey === "billing")!;
        for (const row of billing.rows) expect(levelFromGrantedKeys(row, next)).toBe("none");
    });

    it("Manage then No access returns the grant set to where it started", () => {
        const start = new Set(OUT_OF_GRID);
        const matrix = buildCapabilityMatrix(GRID, start);
        const docs = matrix.find((a) => a.areaKey === "documents")!;
        const granted = applyAreaPreset({ area: docs, level: "write", granted: start });
        const revoked = applyAreaPreset({ area: docs, level: "none", granted });
        expect([...revoked].sort()).toEqual([...start].sort());
    });

    it("a read-only capability under a Manage preset gets READ, not nothing and not write", () => {
        // The honest degrade. Skipping it would silently withhold access the operator asked for;
        // forcing write would grant a level the capability does not support.
        const matrix = buildCapabilityMatrix(GRID, new Set());
        for (const area of matrix) {
            const next = applyAreaPreset({ area, level: "write", granted: new Set() });
            for (const row of area.rows) {
                if (row.writeKeys.length === 0 && row.readKeys.length > 0) {
                    const offered = offerableAreaLevels(area);
                    if (offered.includes("read")) {
                        expect(levelFromGrantedKeys(row, next)).not.toBe("none");
                    }
                }
            }
        }
    });
});

describe("a disagreeing area refuses to round", () => {
    it("reports Limited with its arithmetic when its rows disagree", () => {
        const matrix0 = buildCapabilityMatrix(GRID, new Set());
        const config = matrix0.find((a) => a.areaKey === "configuration")!;
        expect(config.enforcedTotal, "configuration needs 2+ enforced rows to disagree").toBeGreaterThan(1);

        // Grant exactly one enforced row in the area.
        const one = config.rows.find((r) => r.writeKeys.length + r.readKeys.length > 0)!;
        const granted = applyAreaPreset({
            area: { ...config, rows: [one] },
            level: "write",
            granted: new Set(),
        });
        const area = buildCapabilityMatrix(GRID, granted).find((a) => a.areaKey === "configuration")!;
        if (area.granted > 0 && area.granted < area.enforcedTotal) {
            expect(area.level).toBe("limited");
            expect(areaLevelLabel(area)).toBe(`Limited · ${area.granted} of ${area.enforcedTotal}`);
        }
    });

    it("exact readings carry no count", () => {
        expect(areaLevelLabel({ level: "manage", granted: 3, enforcedTotal: 3 })).toBe("Manage");
        expect(areaLevelLabel({ level: "view", granted: 2, enforcedTotal: 2 })).toBe("View");
        expect(areaLevelLabel({ level: "none", granted: 0, enforcedTotal: 4 })).toBe("No access");
    });

    it("held areas exclude what nothing enforces", () => {
        const matrix = buildCapabilityMatrix(GRID, new Set());
        for (const a of heldMatrixAreas(matrix)) {
            expect(a.granted).toBeGreaterThan(0);
            expect(a.enforcedTotal).toBeGreaterThan(0);
        }
    });
});
