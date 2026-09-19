import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    ALLOY_SECTION_LIST,
    ALLOY_SECTION_MAP,
    alloySectionDomAttrs,
    expectedBlockingSections,
    getAlloySection,
    type AlloySectionCache,
} from "@/lib/perf/alloySectionMap";
import { perfSection } from "@/lib/perf/perfNamespaceLog";

const webRoot = process.cwd();
const repoRoot = join(webRoot, "..");
const readSrc = (rel: string): string => readFileSync(join(webRoot, rel), "utf8");
const readDoc = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");

const WU_IDS = Array.from({ length: 16 }, (_, i) => `WU-${String(i).padStart(2, "0")}`);
const WS_IDS = Array.from({ length: 11 }, (_, i) => `WS-${String(i).padStart(2, "0")}`);
const ALL_IDS = [...WU_IDS, ...WS_IDS];
const SNAPSHOT_IDS = ["WU-02", "WS-03", "WS-04", "WS-06"];
const OVERLAY_IDS = ["WU-15", "WS-10"];
const VALID_CACHE: AlloySectionCache[] = ["bootstrap", "session", "network", "snapshot", "none"];

const DOC_PATH = "docs/platform/operator/runtime-surface-section-map.md";

describe("Alloy section map — registry integrity", () => {
    it("registers every WU-00..WU-15 and WS-00..WS-10 section exactly once", () => {
        for (const id of ALL_IDS) {
            expect(ALLOY_SECTION_MAP[id], `missing section ${id}`).toBeDefined();
        }
        expect(ALLOY_SECTION_LIST).toHaveLength(ALL_IDS.length);
        const ids = ALLOY_SECTION_LIST.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("each entry has a valid surface, cache enum, owner path, and name", () => {
        for (const entry of ALLOY_SECTION_LIST) {
            expect(entry.surface).toBe(entry.id.startsWith("WU-") ? "work_unit" : "workspace");
            expect(VALID_CACHE).toContain(entry.cache);
            if (entry.owner === null) {
                // A null owner is a claim that nothing renders this section. It has to say why.
                expect(entry.ownerNote, `${entry.id} needs an ownerNote`).toBeTruthy();
            } else {
                expect(entry.owner).toMatch(/^web\/.+\.tsx?$/);
            }
            expect(entry.name.length).toBeGreaterThan(0);
            expect(entry.dataSource.length).toBeGreaterThan(0);
        }
    });

    it("getAlloySection resolves known ids and returns null for unknown", () => {
        expect(getAlloySection("WU-05")?.name).toBe("Condensed Queue Rows");
        expect(getAlloySection("ZZ-99")).toBeNull();
    });
});

describe("Alloy section map — readiness / blocking contract", () => {
    it("marks KPI snapshot sections non-blocking with snapshot cache", () => {
        for (const id of SNAPSHOT_IDS) {
            const entry = ALLOY_SECTION_MAP[id];
            expect(entry.snapshot, `${id} must be a snapshot section`).toBe(true);
            expect(entry.blocking, `${id} must not block after snapshot`).toBe(false);
            expect(entry.cache).toBe("snapshot");
        }
    });

    it("represents Focus Panel active-mode blocking behavior", () => {
        // Summary blocks only while active; inactive Work/Activity do not block.
        expect(ALLOY_SECTION_MAP["WU-09"].blocking).toBe(true);
        expect(ALLOY_SECTION_MAP["WU-09"].blockingNote).toMatch(/active/i);
        expect(ALLOY_SECTION_MAP["WU-10"].blocking).toBe(false);
        expect(ALLOY_SECTION_MAP["WU-11"].blocking).toBe(false);
    });

    it("blocks the core surface gates and leaves rails/overlays non-blocking", () => {
        for (const id of ["WU-00", "WU-01", "WU-03", "WU-04", "WU-07", "WU-08", "WS-00", "WS-02", "WS-05"]) {
            expect(ALLOY_SECTION_MAP[id].blocking, `${id} should block`).toBe(true);
        }
        // Queue body: WU-05 OR WU-06 resolves the blocking region — both are blocking-capable.
        expect(ALLOY_SECTION_MAP["WU-05"].blocking).toBe(true);
        expect(ALLOY_SECTION_MAP["WU-06"].blocking).toBe(true);
        for (const id of ["WU-12", "WU-13", "WU-14", "WS-07", "WS-08", "WS-09"]) {
            expect(ALLOY_SECTION_MAP[id].blocking, `${id} should not block core reveal`).toBe(false);
        }
    });

    it("operational workspace overlay blocks only when explicitly opened", () => {
        for (const id of OVERLAY_IDS) {
            const entry = ALLOY_SECTION_MAP[id];
            expect(entry.blocking).toBe(false);
            expect(entry.blockingNote).toMatch(/when_open/i);
            expect(entry.name).toMatch(/Operational Workspace Overlay/i);
        }
    });
});

describe("Alloy section map — DOM attributes", () => {
    it("builds the five data-alloy-section-* attributes for a known id", () => {
        const attrs = alloySectionDomAttrs("WU-02");
        expect(attrs).toEqual({
            "data-alloy-section-id": "WU-02",
            "data-alloy-section-name": "Work Unit KPI Strip",
            "data-alloy-section-owner": ALLOY_SECTION_MAP["WU-02"].owner,
            "data-alloy-section-blocking": "false",
            "data-alloy-section-cache": "snapshot",
            // Emitted FROM the registry — the component no longer hand-writes this name.
            "data-alloy-section": "WU.HEADER_CALCULATIONS",
        });
    });

    it("returns an empty object for an unknown id (never throws)", () => {
        expect(alloySectionDomAttrs("nope")).toEqual({});
    });
});

describe("perfSection logger", () => {
    afterEach(() => vi.restoreAllMocks());

    it("emits a [perf:section] line with section id + status", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        perfSection("WU-02", "ready", { source: "bootstrap", blocking: false, since_nav_ms: 312 });
        expect(warn).toHaveBeenCalledTimes(1);
        const [tag, payload] = warn.mock.calls[0];
        expect(tag).toBe("[perf:section]");
        expect(payload).toMatchObject({
            phase: "WU-02",
            status: "ready",
            source: "bootstrap",
            blocking: false,
            since_nav_ms: 312,
        });
    });
});

/**
 * This block used to carry its OWN hardcoded list of section -> owner paths — a third copy of a fact
 * the registry already owns, beside the registry itself and the components. It drifted exactly as a
 * duplicated fact does: eight of its paths named files that no longer existed, so eight cases could
 * not pass and the suite sat red. The list is gone; the cases are derived from the registry, so the
 * owner is stated once and this can only go red when the wiring is genuinely missing.
 */
describe("Section map — DOM wiring presence on key roots", () => {
    // Skipped: no renderer (owner null), and the workspace twins that share a Work Unit root — both
    // pinned with their reasons in the dedicated blocks at the end of this file.
    const SHARED_ROOT_TWINS = new Set(["WS-00", "WS-09", "WS-10"]);
    const cases: Array<[string, string]> = ALLOY_SECTION_LIST.filter(
        (e) => e.owner !== null && !SHARED_ROOT_TWINS.has(e.id),
    ).map((e) => [e.id, (e.owner as string).replace(/^web\//, "")]);

    it.each(cases)("%s is wired via alloySectionDomAttrs in its owner root", (id, rel) => {
        const src = readSrc(rel);
        // Tolerate inline ternaries (e.g. mode/surface-keyed roots): require the helper call and the id literal.
        expect(src).toContain("alloySectionDomAttrs(");
        expect(src).toContain(`"${id}"`);
    });

    it("operational overlay overlay shell is not constrained by queue/focus split vars", () => {
        // WU-15 / WS-10 share AdminV2WorkspaceBosModalShell — it uses the full drawer canvas vars,
        // never the work-unit split layout token.
        const shell = readSrc("app/adminV2/components/AdminV2WorkspaceBosModalShell.tsx");
        expect(shell).toContain('alloySectionDomAttrs("WU-15")');
        expect(shell).not.toContain("data-alloy-os-runtime-split");
    });
});

describe("Section map — documentation completeness", () => {
    const doc = readDoc(DOC_PATH);

    it("documents every WU and WS section id", () => {
        for (const id of ALL_IDS) {
            expect(doc, `doc missing ${id}`).toContain(id);
        }
    });

    it("documents each section name from the registry", () => {
        for (const entry of ALLOY_SECTION_LIST) {
            expect(doc, `doc missing name for ${entry.id}`).toContain(entry.name);
        }
    });

    it("states the KPI snapshot law over the snapshot sections", () => {
        expect(doc).toMatch(/KPI snapshot law/i);
        for (const id of SNAPSHOT_IDS) expect(doc).toContain(id);
    });

    it("states the operational workspace overlay law and the registration rule", () => {
        expect(doc).toMatch(/operational workspace overlay law/i);
        expect(doc).toMatch(/full available width|full operating canvas/i);
        expect(doc).toMatch(/must register an entry|Registration rule/i);
    });

    it("is linked from the four reference docs", () => {
        const link = "runtime-surface-section-map.md";
        expect(readDoc("docs/README.md")).toContain(link);
        expect(readDoc("docs/platform/operator/alloy-runtime-specification.md")).toContain(link);
        expect(readDoc("docs/platform/operator/operational-surface-design-system.md")).toContain(link);
        expect(readDoc("docs/platform/operator/operational-mode-default-state-doctrine.md")).toContain(link);
    });
});


/**
 * The registry is what the visible-completion metric reads to know WHICH regions it is waiting on,
 * and it emits `owner` straight into the DOM. So an entry that names a file which is not there is
 * not a stale comment — it is the metric attributing a section to a component that cannot paint it.
 *
 * Seven entries had rotted to exactly that before these gates existed, because the only owner
 * assertion checked that the string LOOKED like a path (`/^web\/.+\.tsx?$/`) and never that it
 * resolved. A shape check on a path is not a check on a path.
 */
describe("Alloy section map — the owner has to be real", () => {
    it("every named owner file exists on disk", () => {
        const missing = ALLOY_SECTION_LIST.filter(
            (e) => e.owner !== null && !existsSync(join(repoRoot, e.owner)),
        ).map((e) => `${e.id} -> ${e.owner}`);
        expect(missing, `registry owners that do not exist:\n${missing.join("\n")}`).toEqual([]);
    });

    it("every named owner file actually emits section identity", () => {
        const silent = ALLOY_SECTION_LIST.filter(
            (e) => e.owner !== null && !readDoc(e.owner).includes("alloySectionDomAttrs"),
        ).map((e) => `${e.id} -> ${e.owner}`);
        expect(silent, `owners that never call alloySectionDomAttrs:\n${silent.join("\n")}`).toEqual([]);
    });

    it("a section with no renderer emits no owner attribute", () => {
        for (const entry of ALLOY_SECTION_LIST.filter((e) => e.owner === null)) {
            expect(alloySectionDomAttrs(entry.id)).not.toHaveProperty("data-alloy-section-owner");
        }
    });
});

/**
 * There were TWO section-identity conventions on these roots: the registry's `data-alloy-section-*`
 * and an older hand-written `data-alloy-section="WU.HEADER"`. The old one is load-bearing — the
 * runtime split controller and the acceptance specs select on it — so it was converged rather than
 * deleted: the registry owns the name and emits it, and no component restates it.
 */
describe("Alloy section map — one source of section identity", () => {
    const REGISTERED_LEGACY = new Set(
        ALLOY_SECTION_LIST.map((e) => e.legacyDomSection).filter(Boolean) as string[],
    );

    it("emits the legacy name from the registry for aliased sections", () => {
        expect(alloySectionDomAttrs("WU-01")["data-alloy-section"]).toBe("WU.HEADER");
        expect(alloySectionDomAttrs("WS-02")["data-alloy-section"]).toBe("WS.HEADER");
        expect(alloySectionDomAttrs("WU-03")["data-alloy-section"]).toBe("WU.WORK_VIEW_PILLS");
        // A section with no legacy name emits no legacy attribute.
        expect(alloySectionDomAttrs("WU-12")).not.toHaveProperty("data-alloy-section");
    });

    it("no component hand-writes a name the registry already owns", () => {
        const offenders: string[] = [];
        for (const entry of ALLOY_SECTION_LIST) {
            if (!entry.owner) continue;
            const src = readDoc(entry.owner);
            for (const legacy of REGISTERED_LEGACY) {
                if (src.includes(`data-alloy-section="${legacy}"`)) {
                    offenders.push(`${entry.owner} hand-writes ${legacy}`);
                }
            }
        }
        expect(offenders, offenders.join("\n")).toEqual([]);
    });
});

/**
 * The metric can only wait on a section it can SEE. Every Work Unit section that has a renderer must
 * therefore reach the DOM through the registry.
 *
 * Three ids are excluded, each for a stated reason rather than convenience:
 *   - WU-13 has no renderer at all (`owner: null`), so there is nothing to stamp.
 *   - WS-00 / WS-09 / WS-10 are the workspace registrations of roots SHARED with their Work Unit
 *     twins (WU-00 / WU-14 / WU-15). One element cannot carry two ids, and it emits the WU one.
 *     Making that surface-aware needs the surface threaded into shared shells — new product state,
 *     which this slice is explicitly not allowed to add. Pinned here so it cannot drift silently.
 */
describe("Alloy section map — every applicable Work Unit section reaches the DOM", () => {
    const SHARED_ROOT_WITH_WU_TWIN: Record<string, string> = {
        "WS-00": "WU-00",
        "WS-09": "WU-14",
        "WS-10": "WU-15",
    };

    it("stamps every Work Unit section that something renders", () => {
        const unstamped = ALLOY_SECTION_LIST.filter((e) => e.surface === "work_unit")
            .filter((e) => e.owner !== null)
            .filter((e) => !readDoc(e.owner as string).includes(`"${e.id}"`))
            .map((e) => `${e.id} -> ${e.owner}`);
        expect(unstamped, `Work Unit sections not reaching the DOM:\n${unstamped.join("\n")}`).toEqual([]);
    });

    it("pins the shared-root workspace sections that emit their Work Unit twin's id", () => {
        for (const [wsId, wuId] of Object.entries(SHARED_ROOT_WITH_WU_TWIN)) {
            expect(ALLOY_SECTION_MAP[wsId].owner).toBe(ALLOY_SECTION_MAP[wuId].owner);
            expect(readDoc(ALLOY_SECTION_MAP[wsId].owner as string)).not.toContain(`"${wsId}"`);
        }
    });
});

/**
 * COVERAGE IS A REGISTRY QUESTION.
 *
 * WU-07 sat absent from the canonical DOM while coverage was reported complete, and the reason it
 * survived scrutiny is that "which sections should be here" was a judgement made per run rather
 * than a rule anything could fail. Its owner was `EntityDrawerOperatingShell`, which NOTHING
 * renders: the only reference is a pure re-export nothing imports, and no caller ever passed
 * `focusPanelPresentation`, so the attributes could not be emitted even if something did.
 *
 * The earlier owner gates did not catch it because they asked whether the file EXISTS and whether
 * it CONTAINS the emitter. Both were true. Existence is not reachability.
 */
describe("Alloy section map — expected blocking coverage is derived, not asserted", () => {
    const CANON = { focusPanelMode: "summary", queueBody: "rows" } as const;

    it("derives the canonical Work Unit / Summary blocking set from the registry", () => {
        expect(expectedBlockingSections(CANON)).toEqual(["WU-01", "WU-03", "WU-04", "WU-05", "WU-07", "WU-08", "WU-09"]);
    });

    it("excludes mode-inactive members by the registry rule, not a harness exception", () => {
        const work = expectedBlockingSections({ focusPanelMode: "work", queueBody: "rows" });
        expect(work).not.toContain("WU-09");
        // WU-10 is the active member there but is non-blocking, so it is not a coverage target.
        expect(work).not.toContain("WU-10");
        const empty = expectedBlockingSections({ focusPanelMode: "summary", queueBody: "placeholder" });
        expect(empty).toContain("WU-06");
        expect(empty).not.toContain("WU-05");
    });

    it("never expects a section nothing renders, or one that is only open on demand", () => {
        const all = expectedBlockingSections(CANON);
        for (const id of ["WU-13", "WU-15"]) expect(all).not.toContain(id);
        // The shell contains the others and can never own completion, so it is not a target either.
        expect(all).not.toContain("WU-00");
    });

    it("every expected blocking section names a live owner that emits its id", () => {
        for (const id of expectedBlockingSections(CANON)) {
            const entry = ALLOY_SECTION_MAP[id];
            expect(entry.owner, `${id} must name an owner`).toBeTruthy();
            expect(existsSync(join(repoRoot, entry.owner as string)), `${id} owner missing`).toBe(true);
            expect(readDoc(entry.owner as string), `${id} owner must emit its id`).toContain(`"${id}"`);
        }
    });

    it("applicability and owner agree: nothing renders it iff it says so", () => {
        for (const e of ALLOY_SECTION_LIST) {
            if (e.applicability === "never") {
                expect(e.owner, `${e.id} says never but names an owner`).toBeNull();
            } else {
                expect(e.owner, `${e.id} is ${e.applicability} but has no owner`).not.toBeNull();
            }
        }
    });

    it("every exclusive section declares the group it is exclusive within", () => {
        for (const e of ALLOY_SECTION_LIST) {
            if (e.applicability === "exclusive") expect(e.exclusiveGroup, `${e.id}`).toBeTruthy();
            else expect(e.exclusiveGroup, `${e.id} should not declare a group`).toBeUndefined();
        }
    });

    it("WU-07 is owned by the host that actually renders, not the dead re-export chain", () => {
        const owner = ALLOY_SECTION_MAP["WU-07"].owner as string;
        expect(owner).toContain("InlineOpportunityFocusPanel");
        // One section, one emitter: the unreachable drawer shell must not claim it too.
        expect(readDoc("web/components/admin/drawer/EntityDrawerOperatingShell.tsx"))
            .not.toContain('alloySectionDomAttrs("WU-07")');
    });
});
