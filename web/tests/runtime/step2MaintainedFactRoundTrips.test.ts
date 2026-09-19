/**
 * P0-7.6 STEP 2 — THE ROUND-TRIP ACCEPTANCE GATE.
 *
 * The product target is TIME_TO_OPERATOR_VISIBLE_COMPLETE < 1,000ms against a 9,490ms deployed
 * median, and the budget this programme spends is SERIAL ROUND TRIPS, not milliseconds. The evaluated
 * Work Unit page cost three: the records read, then an Effective Process Position enrichment, then an
 * active-tour enrichment, each awaiting the last.
 *
 * Both enrichments were already pure derivations with nowhere to get their rows from. The rows now
 * ride on the opportunity, maintained transactionally by the authority that changes them, so the
 * derivations stayed and the reads went.
 *
 * These gates exist because that is invisible in review: a reinstated `await` would still produce
 * correct rows, and every functional test would pass while the page quietly cost three trips again.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const PROVISIONING = "lib/runtime/provisioning/workUnitProvisioningAnswer.ts";
const POPULATION = "lib/runtime/provisioning/workUnitProcessPopulation.ts";

/** The evaluated-page branch: records read → derivation → projection → sort. */
function evaluatedPageBranch(): string {
    const src = read(PROVISIONING);
    const start = src.indexOf("const baseWithEpp");
    const end = src.indexOf("timings.projection_ms");
    expect(start, "the evaluated-page branch moved; this gate is measuring nothing").toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
}

describe("Step 2 — the evaluated page costs ONE round trip", () => {
    it("THE GATE: neither first-order enrichment read survives on the evaluated path", () => {
        /*
         * PLANTED DEFECTS A and B. The requirement is ABSENT, not faster and not cached: restoring
         * either read — directly, behind a helper, or in parallel — fails here.
         */
        const branch = evaluatedPageBranch();
        expect(branch, "the EPP enrichment read is back on the evaluated page")
            .not.toMatch(/attachEffectiveEnrollmentStagesToOpportunityRows/);
        expect(branch, "the active-tour enrichment read is back on the evaluated page")
            .not.toMatch(/attachActiveTourFactsToOpportunityRows/);
        expect(read(PROVISIONING), "the retired reads must not even be imported here")
            .not.toMatch(/import .*attachEffectiveEnrollmentStagesToOpportunityRows/);
    });

    it("THE GATE: serial depth is 1 — no await between the records read and the evaluator", () => {
        /*
         * The measurement that matters, stated structurally: after the records read there is nothing
         * left to wait for. Any `await` in this branch is a serial round trip, whatever it is called.
         */
        const branch = evaluatedPageBranch();
        const awaits = [...branch.matchAll(/\bawait\b/g)].map((m) =>
            branch.slice(Math.max(0, (m.index ?? 0) - 90), (m.index ?? 0) + 60).replace(/\s+/g, " "),
        );
        expect(
            awaits,
            "the evaluated page performs work it has to WAIT for between reading records and "
            + "evaluating them. That is a serial round trip and it is the thing Step 2 removed.",
        ).toEqual([]);
    });

    it("THE GATE: the derivations are synchronous, so a read cannot hide inside one", () => {
        // An async signature is what let the round trip hide in the middle of the page. A pure
        // function cannot acquire one without changing shape here.
        /*
         * CODE ONLY. These files EXPLAIN in prose why an async signature was the problem, and a raw
         * scan reads that explanation as the thing it forbids — the same comment-versus-code trap that
         * once made a gate assert against its own documentation.
         */
        const stripComments = (src: string) =>
            src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        const epp = stripComments(read("lib/process/definitions/enrollment/maintainedParticipantFacts.ts"));
        const tourSrc = read("lib/tours/queue/attachActiveTourFactsToOpportunityRows.ts");
        expect(epp, "the maintained-fact derivation must hold no database client").not.toMatch(/SupabaseClient|\.from\(|\.rpc\(/);
        expect(epp, "the EPP derivation acquired an async boundary").not.toMatch(/\basync\b|\bawait\b/);
        const pureTour = stripComments(
            tourSrc.slice(tourSrc.indexOf("export function attachActiveTourFactsFromMaintainedFacts")),
        );
        expect(pureTour, "the tour derivation acquired an async boundary").not.toMatch(/\basync\b|\.from\(|\bawait\b/);
    });

    it("THE GATE: the maintained facts ride on the one records read", () => {
        // Dropping the column from the select silently empties both derivations — every row would
        // render as a family with no children and no tour, with nothing failing.
        expect(read(POPULATION), "the population select no longer carries the maintained facts")
            .toContain("maintained_operational_facts");
    });

    it("THE GATE: no shadow comparison path survives in production code", () => {
        /*
         * PLANTED DEFECT J. Old-versus-new identity is proven in the certification suite, against both
         * implementations directly. A shadow path in the runtime would reintroduce the very read it
         * was added to retire, while looking like diligence.
         */
        const branch = evaluatedPageBranch();
        expect(branch).not.toMatch(/shadow|compareWithLegacy|legacyEpp/i);
    });

    it("THE GATE: the projection still has exactly one evaluation owner", () => {
        // PLANTED DEFECT K.
        const branch = evaluatedPageBranch();
        expect([...branch.matchAll(/computeOperationalProjection\(/g)]).toHaveLength(1);
    });
});

describe("Step 2 — the maintained field is raw, and maintained where truth changes", () => {
    const MIGRATIONS = join(process.cwd(), "..", "supabase", "migrations");
    const STEP2 = readdirSync(MIGRATIONS).filter((f) => f.includes("maintained_operational_facts")).sort().pop()!;
    const SQL = readFileSync(join(MIGRATIONS, STEP2), "utf8");
    const CODE = SQL.replace(/^\s*--.*$/gm, "");

    it("THE GATE: exactly one dedicated column, and never metadata", () => {
        // PLANTED DEFECT I.
        expect(CODE).toContain("ADD COLUMN IF NOT EXISTS maintained_operational_facts jsonb");
        expect([...CODE.matchAll(/ALTER TABLE public\.opportunities\s+ADD COLUMN/g)]).toHaveLength(1);
        expect(CODE, "opportunities.metadata is not a durable home for maintained facts")
            .not.toMatch(/SET\s+metadata\s*=\s*jsonb_set[\s\S]{0,120}participants/);
    });

    it("THE GATE: nothing derived and nothing authorizational is persisted", () => {
        /*
         * PLANTED DEFECTS F and G. The effective stage depends on opportunities.stage_key, which moves
         * without any participant moving — a stored copy is wrong from that moment. And an
         * allowedLocationIds ANSWER stored on a row is a permission that outlives the permission.
         */
        const builder = CODE.slice(CODE.indexOf("opportunity_participant_facts"), CODE.indexOf("opportunity_active_tour_facts"));
        for (const forbidden of ["effective", "rollup", "allowed", "inherit", "operator"]) {
            expect(builder.toLowerCase(), `${forbidden} truth is derived, never persisted`).not.toContain(forbidden);
        }
        // The self-test pins the exact key set, so a new key cannot arrive unnoticed.
        expect(SQL).toContain("a non-raw key was persisted on a participant");
    });

    it("THE GATE: the lifecycle authority maintains, in its own transaction", () => {
        // PLANTED DEFECTS C and E.
        const fn = CODE.slice(
            CODE.lastIndexOf("CREATE OR REPLACE FUNCTION public.update_participation_and_maintain_facts("),
        );
        const body = fn.slice(0, fn.indexOf("$fn$;") + 5);
        expect(body, "the lifecycle mutation no longer maintains the opportunity fact")
            .toContain("refresh_opportunity_maintained_facts");
        expect(body, "the equality guard must survive").toContain("p_expected_version IS NULL OR updated_at = p_expected_version");
        expect(body).toContain("SECURITY INVOKER");
    });

    it("THE GATE: creation initializes rather than repairs", () => {
        // PLANTED DEFECT D. A post-create UPDATE would be a second lifecycle writer, and between the
        // two statements the journey would exist unmaintained.
        expect(CODE).toContain("CREATE OR REPLACE FUNCTION public.insert_enrollment_participation_and_maintain_facts(");
        const creation = read("lib/process/processInstances.ts");
        expect(creation, "creation must go through the maintaining transaction")
            .toContain('supabase.rpc(\n            "insert_enrollment_participation_and_maintain_facts"');
        const writes = [...creation.matchAll(/\.from\(PROCESS_INSTANCES_TABLE\)/g)].map((m) => {
            const fwd = creation.slice(m.index ?? 0, (m.index ?? 0) + 300).split(/;\s*\n/)[0]!;
            return /\.(insert|update|upsert|delete)\(/.exec(fwd)?.[1] ?? "read";
        });
        expect(writes.filter((w) => w !== "read"), "a direct write came back to the creation module").toEqual([]);
    });

    it("THE GATE: every tour transition maintains, cancellation explicitly", () => {
        /*
         * PLANTED DEFECT H. `applyTourBookingOpportunityIntegration` returns EARLY for a cancel,
         * before the metadata mirror every other transition passes through — so a cancel that relied
         * on the mirror would leave a cancelled tour rendering as active forever.
         */
        const tour = read("lib/tours/opportunity/tourBookingOpportunityIntegration.ts");
        const cancelBranch = tour.slice(tour.indexOf('if (kind === "canceled")'), tour.indexOf('if (kind === "confirmed_mirror"'));
        expect(cancelBranch, "the cancel branch returns early and must maintain tour facts itself")
            .toContain("maintainOpportunityTourFacts");
        const mirror = tour.slice(tour.indexOf("async function mirrorTourMetadataAndSignal"), tour.indexOf("export async function applyTourBookingOpportunityIntegration"));
        expect(mirror, "schedule / reschedule / complete / no_show all pass through the mirror")
            .toContain("maintainOpportunityTourFacts");
    });

    it("THE GATE: the migration proves itself by execution, not by text", () => {
        for (const specimen of [
            "creation did not initialize maintained truth",
            "lifecycle mutation did not maintain the opportunity fact",
            "a REFUSED write still moved the maintained facts",
            "a cross-org attempt moved the maintained facts",
            "a CANCELLED tour is still maintained as active",
            "a COMPLETED tour is still maintained as active",
            "a NO_SHOW tour is still maintained as active",
            "the tour recompute never returns an active booking",
            "recompute is not idempotent",
            "a closed participant was dropped from storage",
            "the participation-anchored journey was not rolled up",
            "a derived tour value was persisted",
            "the maintained fact survived a rolled-back transaction",
            "rollback setup did not move the maintained facts",
            "creation did not generate the defaulted columns",
            "maintenance restamped the family updated_at",
        ]) {
            expect(SQL, `the "${specimen}" specimen is gone`).toContain(specimen);
        }
        expect(SQL).toContain("SELFTEST_CLEANUP");
    });
});
