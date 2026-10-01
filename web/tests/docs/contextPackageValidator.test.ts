import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE CONTEXT PACKAGE IS INFRASTRUCTURE, SO IT GETS A VALIDATOR RATHER THAN A PROOFREAD.
 *
 * `alloy-context.v1` tells two different consumers — GPT project sources and Vacilando lanes — what
 * an AI may treat as authoritative about Alloy. A manifest about authority that nothing checks can
 * drift in exactly the ways the corpus it describes already drifted: a lane pointing at a moved
 * document, a pending domain quietly acquiring DIRECT context, a planning tree promoted into default
 * load, Tier 1 growing one convenient file at a time.
 *
 * Every assertion here is a failure that would otherwise be silent and would mislead a model rather
 * than break a build.
 *
 * WHY THE TIER 1 CAP IS A NUMBER IN A FILE AND NOT A CONSTANT HERE.
 *
 * `tier1_cap` lives in the package manifest, and this suite asserts the foundation set matches it.
 * Growing Tier 1 therefore requires editing the cap in the same commit — which is the point. A cap
 * hard-coded in the test would be raised by whoever was adding the sixth file, in the same breath,
 * and nobody would notice the decision had been made. A cap in the manifest makes it a visible,
 * reviewable change to the package's own identity.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");
const readJson = <T>(rel: string): T => JSON.parse(read(rel)) as T;
const exists = (rel: string) => existsSync(path.join(repoRoot, rel));

const PKG_DIR = "docs/context/package";

type Lane = {
    id: string;
    status: string;
    display_name: string;
    direct?: string[];
    shared?: string[];
    reference?: string[];
    generated?: string[];
    planned_only?: string[];
    exclude_history?: string[];
    evidence?: string[];
    triggers?: string[];
    related?: string[];
    task_routing_hints?: string[];
    while_pending?: string[];
};

type Lanes = {
    schema: string;
    package: string;
    lanes: Lane[];
    shared_context_packages: Lane[];
    pending_lanes: Lane[];
    cross_lane_rule: { statement: string; steps: string[] };
};

type Pkg = {
    package_id: string;
    schema_version: string;
    package_status: string;
    tier1_cap: number;
    certified_domains: string[];
    pending_domains: { domain: string; lane: string; status: string }[];
    foundation: { path: string; load_mode: string; volatility: string }[];
    excluded_trees: { path: string; reason: string }[];
    contracts: Record<string, string>;
};

type Triggers = {
    lane_triggers: {
        trigger_id: string;
        lane: string;
        match: string;
        check_type: string;
        full_recertification: boolean;
        required_guard: string;
        doc_owner: string;
    }[];
    universal_triggers: { trigger_id: string; lane: string }[];
};

type Gpt = {
    tier1_cap: number;
    sources: { path: string; tier: number; domain: string; safe_for_default_context: boolean; load_mode: string }[];
};

const pkg = readJson<Pkg>(`${PKG_DIR}/alloy-context-package.json`);
const lanes = readJson<Lanes>(`${PKG_DIR}/vacilando-lanes.json`);
const triggers = readJson<Triggers>(`${PKG_DIR}/recertification-triggers.json`);
const gpt = readJson<Gpt>(`${PKG_DIR}/gpt-project-sources.json`);

const allLanes = (): Lane[] => [...lanes.lanes, ...lanes.shared_context_packages, ...lanes.pending_lanes];
const laneIds = (): string[] => allLanes().map((l) => l.id);

/** Every path a lane points at, by field. */
function lanePaths(lane: Lane): { field: string; p: string }[] {
    const fields = ["direct", "reference", "generated", "planned_only", "exclude_history", "evidence"] as const;
    return fields.flatMap((f) => (lane[f] ?? []).map((p) => ({ field: f, p })));
}

describe("the package is internally coherent", () => {
    it("is not vacuous: the manifests exist, declare their schemas, and carry lanes", () => {
        expect(lanes.schema).toBe("alloy.vacilando-lanes.v1");
        expect(pkg.package_id).toBe("alloy-context.v1");
        expect(lanes.lanes.length).toBeGreaterThanOrEqual(13);
        expect(lanes.shared_context_packages.length).toBeGreaterThanOrEqual(1);
        expect(lanes.pending_lanes.length).toBeGreaterThanOrEqual(1);
        expect(triggers.lane_triggers.length).toBeGreaterThan(20);
    });

    it("every lane id is unique across lanes, shared packages and pending lanes", () => {
        const ids = laneIds();
        const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
        expect(dupes, `duplicate lane ids: ${dupes.join(", ")}`).toEqual([]);
    });

    it("every manifest and contract the package names exists", () => {
        for (const rel of Object.values(pkg.contracts)) {
            expect(exists(rel), `package names missing contract ${rel}`).toBe(true);
        }
        for (const rel of [`${PKG_DIR}/vacilando-lanes.json`, `${PKG_DIR}/recertification-triggers.json`, `${PKG_DIR}/gpt-project-sources.json`, `${PKG_DIR}/distribution-manifest.json`]) {
            expect(exists(rel), `missing manifest ${rel}`).toBe(true);
        }
    });

    it("every file a lane references exists", () => {
        const dead: string[] = [];
        for (const lane of allLanes()) {
            for (const { field, p } of lanePaths(lane)) {
                if (!exists(p)) dead.push(`${lane.id}.${field}: ${p}`);
            }
        }
        expect(dead, `lanes point at files that do not exist:\n${dead.join("\n")}`).toEqual([]);
    });

    it("every shared dependency resolves to a declared shared package", () => {
        const sharedIds = lanes.shared_context_packages.map((s) => s.id);
        const bad: string[] = [];
        for (const lane of allLanes()) {
            for (const dep of lane.shared ?? []) {
                if (!sharedIds.includes(dep)) bad.push(`${lane.id} -> ${dep}`);
            }
        }
        expect(bad, `unresolved shared dependencies: ${bad.join(", ")}`).toEqual([]);
    });

    it("every related lane resolves to a real lane", () => {
        const ids = laneIds();
        const bad: string[] = [];
        for (const lane of allLanes()) {
            for (const rel of lane.related ?? []) if (!ids.includes(rel)) bad.push(`${lane.id} -> ${rel}`);
        }
        expect(bad, `unresolved related lanes: ${bad.join(", ")}`).toEqual([]);
    });
});

describe("certification state cannot be misrepresented", () => {
    it("every certified lane has at least one DIRECT owner", () => {
        const naked = lanes.lanes.filter((l) => (l.direct ?? []).length === 0).map((l) => l.id);
        expect(
            naked,
            `certified lanes with no DIRECT owner: ${naked.join(", ")}. A lane with no owner cannot `
                + "supply context, so declaring it certified claims authority that does not exist.",
        ).toEqual([]);
    });

    it("no pending lane is represented as certified, and none supplies DIRECT context", () => {
        for (const lane of lanes.pending_lanes) {
            expect(lane.status, `${lane.id} is in pending_lanes but claims status ${lane.status}`).not.toMatch(
                /^certified/,
            );
            expect(
                lane.direct ?? [],
                `${lane.id} is pending but offers DIRECT context — that is exactly what PENDING_DISABLED forbids`,
            ).toEqual([]);
        }
    });

    it("Financials/Payments is present, PENDING_DISABLED, and says what to do instead", () => {
        const fin = lanes.pending_lanes.find((l) => l.id === "financials-payments");
        expect(fin, "the financials-payments lane is missing; routing would silently fail").toBeTruthy();
        expect(fin?.status).toBe("PENDING_DISABLED");
        expect((fin?.while_pending ?? []).length, "the pending lane gives no guidance").toBeGreaterThan(2);
        expect(
            (fin?.while_pending ?? []).join(" "),
            "the pending guidance no longer tells the agent to read implementation evidence",
        ).toMatch(/implementation|live evidence/i);
        // The package manifest must agree with the lane registry.
        const declared = pkg.pending_domains.find((d) => d.lane === "financials-payments");
        expect(declared?.status, "the package manifest disagrees with the lane registry").toBe("PENDING_DISABLED");
        expect(pkg.certified_domains).not.toContain("Financials / Payments");
        expect(pkg.package_status).toMatch(/FINANCIALS_PENDING$/);
    });

    it("the benchmark manifest and the lane registry agree about what is certified", () => {
        const certifiedRow = read("docs/context/alloy-benchmark-context.md")
            .split("\n")
            .find((l) => /\*\*Domains certified\*\*/.test(l)) ?? "";
        expect(certifiedRow, "no certified row in the benchmark manifest").toBeTruthy();
        // Every certified domain the package claims must appear in the manifest's certified row.
        for (const domain of pkg.certified_domains) {
            const loose = domain.replace(/\s*\/\s*/, "\\s*/\\s*");
            expect(
                new RegExp(loose).test(certifiedRow),
                `the package claims ${domain} is certified but the benchmark manifest's certified row does not name it`,
            ).toBe(true);
        }
        // And the manifest must still hold Financials pending.
        const pendingRow = read("docs/context/alloy-benchmark-context.md")
            .split("\n")
            .find((l) => /\*\*Domains pending\*\*/.test(l)) ?? "";
        expect(pendingRow, "the benchmark manifest no longer holds Financials pending").toMatch(
            /Financials \/ Payments/,
        );
    });

    it("the lane registry and the canonical owner map name the same owner documents", () => {
        /*
         * The owner map is the prose authority for "one concern, one owner"; the lane registry is the
         * machine form. If a lane's DIRECT owner is absent from the owner map, one of the two has
         * moved and a consumer would load a document the map does not consider authority.
         */
        const ownerMap = read("docs/context/alloy-canonical-owner-map.md");
        const missing: string[] = [];
        for (const lane of [...lanes.lanes, ...lanes.shared_context_packages]) {
            for (const p of lane.direct ?? []) {
                const basename = path.basename(p);
                if (!ownerMap.includes(basename)) missing.push(`${lane.id}: ${basename}`);
            }
        }
        expect(
            missing,
            `lane DIRECT owners absent from the canonical owner map:\n${missing.join("\n")}`,
        ).toEqual([]);
    });
});

describe("default context stays small and clean", () => {
    it("Tier 1 matches the declared cap, which must be changed deliberately", () => {
        expect(pkg.foundation).toHaveLength(pkg.tier1_cap);
        expect(gpt.tier1_cap).toBe(pkg.tier1_cap);
        const tier1 = gpt.sources.filter((s) => s.tier === 1);
        expect(tier1).toHaveLength(pkg.tier1_cap);
        expect(
            pkg.tier1_cap,
            "Tier 1 grew beyond five. That may be correct, but it is a ratified decision: raise this "
                + "number in alloy-context-package.json in the same commit and say why in the message.",
        ).toBe(5);
    });

    it("every Tier 1 path exists and is safe for default context", () => {
        for (const f of pkg.foundation) expect(exists(f.path), `Tier 1 file missing: ${f.path}`).toBe(true);
        for (const s of gpt.sources.filter((x) => x.tier === 1)) {
            expect(s.safe_for_default_context, `${s.path} is Tier 1 but not safe for default context`).toBe(true);
        }
    });

    it("no excluded, history or planning document enters DIRECT or Tier 1/2 default context", () => {
        const excluded = pkg.excluded_trees.map((t) => t.path);
        const offenders: string[] = [];
        for (const lane of allLanes()) {
            for (const p of lane.direct ?? []) {
                const hit = excluded.find((tree) => p.startsWith(tree));
                if (hit) offenders.push(`${lane.id}.direct: ${p} is inside excluded ${hit}`);
            }
        }
        for (const s of gpt.sources) {
            if (s.tier > 2 || !s.safe_for_default_context) continue;
            const hit = excluded.find((tree) => s.path.startsWith(tree));
            if (hit) offenders.push(`gpt tier ${s.tier}: ${s.path} is inside excluded ${hit}`);
        }
        expect(offenders, `excluded material promoted into default context:\n${offenders.join("\n")}`).toEqual([]);
    });

    it("a PLANNED_ONLY document is never safe for default context", () => {
        const planned = new Set(allLanes().flatMap((l) => l.planned_only ?? []));
        for (const s of gpt.sources) {
            if (!planned.has(s.path)) continue;
            expect(
                s.safe_for_default_context,
                `${s.path} is PLANNED_ONLY but marked safe for default context — intent would read as implementation`,
            ).toBe(false);
        }
    });

    it("no volatile document is embedded as timeless context", () => {
        for (const f of pkg.foundation) {
            if (f.volatility !== "volatile") continue;
            expect(
                f.load_mode,
                `${f.path} is volatile but load_mode is ${f.load_mode}; a stale embedded count reads as measured`,
            ).toBe("FETCH_LIVE");
        }
    });
});

describe("recertification triggers are wired to real lanes and real guards", () => {
    it("every trigger names a lane that exists", () => {
        const ids = laneIds();
        const bad = triggers.lane_triggers.filter((t) => !ids.includes(t.lane)).map((t) => t.trigger_id);
        expect(bad, `triggers naming unknown lanes: ${bad.join(", ")}`).toEqual([]);
        for (const u of triggers.universal_triggers) expect(u.lane).toBe("*");
    });

    it("every trigger a lane references is defined", () => {
        const defined = new Set(triggers.lane_triggers.map((t) => t.trigger_id));
        const missing: string[] = [];
        for (const lane of allLanes()) {
            for (const t of lane.triggers ?? []) if (!defined.has(t)) missing.push(`${lane.id} -> ${t}`);
        }
        expect(missing, `lanes reference undefined triggers: ${missing.join(", ")}`).toEqual([]);
    });

    it("every trigger names an owner document that exists", () => {
        const bad = triggers.lane_triggers
            .filter((t) => t.doc_owner.endsWith(".md") && !exists(t.doc_owner))
            .map((t) => `${t.trigger_id} -> ${t.doc_owner}`);
        expect(bad, `triggers naming missing owner documents: ${bad.join(", ")}`).toEqual([]);
    });

    it("every certified lane carries at least one trigger", () => {
        const naked = lanes.lanes.filter((l) => (l.triggers ?? []).length === 0).map((l) => l.id);
        expect(
            naked,
            `certified lanes with no staleness trigger: ${naked.join(", ")}. A lane that cannot go `
                + "stale is a lane nobody will ever re-check.",
        ).toEqual([]);
    });

    it("the Financials trigger fires on stillness, not on change", () => {
        // The one inverted trigger in the registry. If someone "fixes" it into a change-trigger, the
        // gate stops meaning seven quiet days and the domain could certify mid-mutation.
        const fin = triggers.lane_triggers.find((t) => t.lane === "financials-payments");
        expect(fin, "no trigger for the pending Financials lane").toBeTruthy();
        expect(fin?.match).toMatch(/ABSENCE of change|quiet days/i);
        expect(fin?.full_recertification).toBe(true);
    });
});

describe("lane boundaries are stated, not implied", () => {
    it("every lane says what it owns and what it does not", () => {
        for (const lane of allLanes()) {
            const l = lane as unknown as { owns?: string[]; does_not_own?: string[] };
            expect((l.owns ?? []).length, `${lane.id} does not say what it owns`).toBeGreaterThan(0);
            expect(
                (l.does_not_own ?? []).length,
                `${lane.id} does not say what it does NOT own — adjacent-concern leakage is the common failure`,
            ).toBeGreaterThan(0);
        }
    });

    it("every lane carries routing hints and forbidden inferences", () => {
        for (const lane of allLanes()) {
            expect((lane.task_routing_hints ?? []).length, `${lane.id} has no routing hints`).toBeGreaterThan(0);
            const forbidden = (lane as unknown as { forbidden?: string[] }).forbidden ?? [];
            expect((forbidden).length, `${lane.id} declares no forbidden inferences`).toBeGreaterThan(0);
        }
    });

    it("the cross-lane rule names one primary mutation lane", () => {
        expect(lanes.cross_lane_rule.statement).toMatch(/ONE primary mutation lane/i);
        expect(lanes.cross_lane_rule.steps.length).toBeGreaterThanOrEqual(4);
    });

    it("a shared context package is never offered as a primary routing target in the lanes list", () => {
        const sharedIds = lanes.shared_context_packages.map((s) => s.id);
        const leaked = lanes.lanes.filter((l) => sharedIds.includes(l.id)).map((l) => l.id);
        expect(leaked, `shared packages duplicated into the primary lane list: ${leaked.join(", ")}`).toEqual([]);
    });
});

describe("the generated artifacts are current", () => {
    it("the builder reports no drift, so the committed manifests match their inputs", () => {
        /*
         * gpt-project-sources.json and distribution-manifest.json are DERIVED. Hand-editing either, or
         * changing a lane without regenerating, produces manifests that disagree about the same corpus
         * — the precise drift this package exists to eliminate.
         */
        let out = "";
        try {
            out = execFileSync("node", ["scripts/build-context-package.mjs", "--check"], {
                cwd: repoRoot,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"],
            });
        } catch (error) {
            const e = error as { stdout?: string; stderr?: string };
            throw new Error(
                "the generated context-package manifests are stale. Run "
                    + `'node scripts/build-context-package.mjs'.\n${e.stderr ?? ""}${e.stdout ?? ""}`,
            );
        }
        expect(out).toMatch(/are current/);
    });
});
