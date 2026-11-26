/**
 * P1 · Wave A — Operational Expectation ledger SUBSTRATE conformance.
 *
 * The authored Expectation ledger is the append-only, bitemporal, lineage-tracked
 * TWIN of Operational Facts. This proves the SUBSTRATE half against the real
 * migration DDL (append-only trigger, no updated_at, bitemporal columns, lineage
 * self-FK + no-self-reference + create-vs-supersede link shape, org-scoped RLS,
 * Temporal-Frame presence, footprint column) and the CLOSED vocabularies
 * (modality=5, verb=5, transition=4, standing=3). A "teeth" suite proves the
 * harness FAILS a weakened ledger; a drift suite proves a LATER migration that
 * weakens the invariants is caught.
 *
 * This certifies the SUBSTRATE only. The authoring-intake half (Authoring Act /
 * Ratification Act emission, the Authority→Standing gate) is Wave B/C; the pure
 * evaluation that reads the ledger is P3. Neither is asserted here.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    assertExpectationLedgerConforms,
    type ExpectationLedgerProbes,
} from "@/lib/operationalExpectations/expectationLedgerConformance";
import { OPERATIONAL_EXPECTATION_LEDGER_DESCRIPTOR } from "@/lib/operationalExpectations/operationalExpectationsLedgerDescriptor";
import {
    EXPECTATION_STANDINGS,
    EXPECTATION_TRANSITION_TYPES,
    EXPECTATION_VERBS,
    OPERATIONAL_EXPECTATION_REQUIRED_COLUMNS,
    OPERATIONAL_MODALITIES,
    VERB_TRANSITION_MAP,
} from "@/lib/operationalExpectations/expectationLedgerContract";
import {
    readExpectationLedgerMigrationsOrdered,
    scanExpectationLedgerSchema,
    type ExpectationLedgerSchemaFacts,
} from "./expectationLedgerSchemaScan";

/** Build probes from a set of scanned schema facts + the closed vocabularies. */
function probesFromFacts(facts: ExpectationLedgerSchemaFacts): ExpectationLedgerProbes {
    return {
        attemptMutation: (op) => ({
            rejected: facts.appendOnlyTrigger,
            message: `${op} blocked by prevent_operational_expectations_mutation`,
        }),
        // Vocabulary CHECK present ⇒ the storage layer enforces exactly the closed
        // set (absent ⇒ empty, which fails the exact-match closure check).
        modalityVocabulary: facts.modalityCheck ? OPERATIONAL_MODALITIES : [],
        verbVocabulary: facts.verbCheck ? EXPECTATION_VERBS : [],
        transitionTypeVocabulary: facts.transitionTypeCheck ? EXPECTATION_TRANSITION_TYPES : [],
        standingVocabulary: facts.standingCheck ? EXPECTATION_STANDINGS : [],
        // Shared substrate probes.
        lineageSelfReference: facts.supersedesSelfFk,
        noSelfReferenceGuard: facts.noSelfRef,
        orgScopedRls: facts.orgSelectPolicy,
        hasUpdatedAt: facts.hasUpdatedAt,
        // Authored-ledger probes.
        createLinkShapeGuard: facts.createLinkShape && facts.verbTransitionMap,
        hasValidTimeColumn: facts.hasValidFrom,
        hasAuthoredTimeColumn: facts.hasAuthoredAt,
        temporalFramePresenceGuard: facts.temporalFramePresence,
        hasFootprintColumn: facts.hasFootprint,
        presentColumns: facts.createBlockColumns,
        noOrdinaryRoleDirectInsert:
            !facts.grantsInsertToAuthenticated &&
            !facts.grantsInsertToAnon &&
            !facts.authenticatedInsertPolicy &&
            !facts.anonInsertPolicy,
        recordedTimeServerAssigned: facts.authoredAtServerAssigned,
    };
}

describe("P1 Wave A — Expectation ledger conforms to the twin-ledger substrate", () => {
    const { concatenated, files } = readExpectationLedgerMigrationsOrdered();
    const facts = scanExpectationLedgerSchema(concatenated);
    const probes = probesFromFacts(facts);

    it("the ledger migration exists in the cumulative history", () => {
        expect(files.length).toBeGreaterThan(0);
    });

    it("conforms on the storage, lineage, and vocabulary halves", async () => {
        const report = await assertExpectationLedgerConforms(
            OPERATIONAL_EXPECTATION_LEDGER_DESCRIPTOR,
            probes,
        );
        const failed = report.checks.filter((c) => !c.passed);
        expect(failed, `failed checks: ${JSON.stringify(failed, null, 2)}`).toHaveLength(0);
        expect(report.conforms).toBe(true);
    });

    it("proves the append-only + bitemporal + lineage substrate from the migration DDL", () => {
        expect(facts.appendOnlyTrigger, "append-only trigger").toBe(true);
        expect(facts.hasUpdatedAt, "no updated_at").toBe(false);
        expect(facts.hasValidFrom, "valid_from (valid-time)").toBe(true);
        expect(facts.hasAuthoredAt, "authored_at (transaction-time)").toBe(true);
        expect(facts.supersedesSelfFk, "supersedes self-FK").toBe(true);
        expect(facts.noSelfRef, "no-self-reference guard").toBe(true);
        expect(facts.createLinkShape, "create-vs-supersede link shape").toBe(true);
        expect(facts.verbTransitionMap, "verb→transition map").toBe(true);
        expect(facts.temporalFramePresence, "temporal-frame presence").toBe(true);
        expect(facts.hasFootprint, "footprint column").toBe(true);
        expect(facts.orgSelectPolicy, "org-scoped RLS").toBe(true);
    });

    it("enforces the CLOSED vocabularies at the storage layer (no sixth modality)", () => {
        expect(facts.modalityCheck, "modality CHECK").toBe(true);
        expect(facts.verbCheck, "verb CHECK").toBe(true);
        expect(facts.transitionTypeCheck, "transition-type CHECK").toBe(true);
        expect(facts.standingCheck, "standing CHECK").toBe(true);
    });

    it("carries every required tuple/lineage/standing/footprint column", () => {
        const missing = OPERATIONAL_EXPECTATION_REQUIRED_COLUMNS.filter(
            (c) => !facts.createBlockColumns.includes(c),
        );
        expect(missing, `missing columns: ${missing.join(",")}`).toHaveLength(0);
    });
});

describe("P1 Wave A — write boundary + recorded time (static scan of the real migration)", () => {
    // STATIC migration validation (no live Postgres in this environment). Each
    // asserts the migration DDL that a live database would enforce at runtime.
    const { concatenated } = readExpectationLedgerMigrationsOrdered();
    const facts = scanExpectationLedgerSchema(concatenated);

    it("does NOT grant INSERT to `authenticated` (no direct client authoring)", () => {
        expect(facts.grantsInsertToAuthenticated).toBe(false);
    });

    it("has NO INSERT policy for `authenticated`", () => {
        expect(facts.authenticatedInsertPolicy).toBe(false);
    });

    it("gives `anon` no INSERT (neither grant nor policy)", () => {
        expect(facts.grantsInsertToAnon).toBe(false);
        expect(facts.anonInsertPolicy).toBe(false);
    });

    it("retains org-scoped SELECT for `authenticated` (read stays authorized)", () => {
        expect(facts.grantsSelectToAuthenticated).toBe(true);
        expect(facts.orgSelectPolicy).toBe(true);
    });

    it("blocks UPDATE and DELETE via the append-only trigger", () => {
        expect(facts.appendOnlyTrigger).toBe(true);
    });

    it("assigns recorded/transaction time server-side (authored_at := now())", () => {
        expect(facts.authoredAtServerAssigned).toBe(true);
    });

    it("keeps valid time distinct from recorded time", () => {
        expect(facts.hasValidFrom).toBe(true); // author-supplied effective time
        expect(facts.hasAuthoredAt).toBe(true); // server-assigned recorded time
    });

    it("the conformance report passes the write-boundary + recorded-time checks", async () => {
        const report = await assertExpectationLedgerConforms(
            OPERATIONAL_EXPECTATION_LEDGER_DESCRIPTOR,
            probesFromFacts(facts),
        );
        expect(report.checks.find((c) => c.property === "authoring_write_boundary")?.passed).toBe(true);
        expect(report.checks.find((c) => c.property === "recorded_time_server_assigned")?.passed).toBe(true);
    });
});

describe("P1 Wave A — lineage integrity is DB-enforced (not app-only)", () => {
    const { concatenated } = readExpectationLedgerMigrationsOrdered();
    const facts = scanExpectationLedgerSchema(concatenated);

    it("create carries no predecessor; every other verb requires one (link shape)", () => {
        expect(facts.createLinkShape).toBe(true);
    });

    it("verb and transition type cannot disagree (verb→transition map CHECK)", () => {
        expect(facts.verbTransitionMap).toBe(true);
    });

    it("rejects a self-referential predecessor", () => {
        expect(facts.noSelfRef).toBe(true);
    });

    it("rejects a cross-org predecessor at the database (trigger guard)", () => {
        expect(facts.lineageCrossOrgGuard).toBe(true);
    });

    it("cancellation is a new row — there is NO mutable status column", () => {
        expect(facts.hasStatusColumn).toBe(false);
        // and 'cancel' is a verb (a new authored row), not a status transition.
        expect(EXPECTATION_VERBS as readonly string[]).toContain("cancel");
    });
});

describe("P1 Wave A — the grammar vocabularies are closed and coherent", () => {
    it("modality is exactly the closed five", () => {
        expect([...OPERATIONAL_MODALITIES].sort()).toEqual(
            ["committed", "intended", "predicted", "prohibited", "required"],
        );
    });

    it("the five verbs map coherently to transitions (create alone has none)", () => {
        expect([...EXPECTATION_VERBS].sort()).toEqual(
            ["cancel", "correct", "create", "replace", "revise"],
        );
        expect(VERB_TRANSITION_MAP.create).toBeNull();
        expect(VERB_TRANSITION_MAP.revise).toBe("revision");
        expect(VERB_TRANSITION_MAP.correct).toBe("correction");
        expect(VERB_TRANSITION_MAP.replace).toBe("replacement");
        expect(VERB_TRANSITION_MAP.cancel).toBe("cancellation");
        // Every non-null transition is a member of the closed transition set.
        for (const verb of EXPECTATION_VERBS) {
            const t = VERB_TRANSITION_MAP[verb];
            if (t !== null) {
                expect(EXPECTATION_TRANSITION_TYPES).toContain(t);
            }
        }
    });

    it("has no fulfill/complete/close verb (Law 3)", () => {
        for (const forbidden of ["fulfill", "complete", "close", "resolve", "mark_done"]) {
            expect(EXPECTATION_VERBS as readonly string[]).not.toContain(forbidden);
        }
    });
});

describe("P1 Wave A — the harness has teeth (rejects a non-conforming ledger)", () => {
    function goodFacts(): ExpectationLedgerSchemaFacts {
        return {
            appendOnlyTrigger: true,
            supersedesSelfFk: true,
            noSelfRef: true,
            createLinkShape: true,
            verbTransitionMap: true,
            modalityCheck: true,
            verbCheck: true,
            transitionTypeCheck: true,
            standingCheck: true,
            temporalFramePresence: true,
            orgSelectPolicy: true,
            hasValidFrom: true,
            hasAuthoredAt: true,
            hasFootprint: true,
            hasUpdatedAt: false,
            createBlockColumns: [...OPERATIONAL_EXPECTATION_REQUIRED_COLUMNS],
            grantsInsertToAuthenticated: false,
            grantsInsertToAnon: false,
            authenticatedInsertPolicy: false,
            anonInsertPolicy: false,
            grantsSelectToAuthenticated: true,
            authoredAtServerAssigned: true,
            lineageCrossOrgGuard: true,
            hasStatusColumn: false,
        };
    }

    it("baseline good facts conform", async () => {
        const report = await assertExpectationLedgerConforms(
            OPERATIONAL_EXPECTATION_LEDGER_DESCRIPTOR,
            probesFromFacts(goodFacts()),
        );
        expect(report.conforms).toBe(true);
    });

    it("fails append_only when the mutation trigger is missing", async () => {
        const report = await assertExpectationLedgerConforms(
            OPERATIONAL_EXPECTATION_LEDGER_DESCRIPTOR,
            probesFromFacts({ ...goodFacts(), appendOnlyTrigger: false }),
        );
        expect(report.conforms).toBe(false);
        expect(report.checks.find((c) => c.property === "append_only")?.passed).toBe(false);
    });

    it("fails no_updated_at when the ledger is mutable", async () => {
        const report = await assertExpectationLedgerConforms(
            OPERATIONAL_EXPECTATION_LEDGER_DESCRIPTOR,
            probesFromFacts({ ...goodFacts(), hasUpdatedAt: true }),
        );
        expect(report.conforms).toBe(false);
        expect(report.checks.find((c) => c.property === "no_updated_at")?.passed).toBe(false);
    });

    it("fails modality_closure when the closed-five CHECK is missing", async () => {
        const report = await assertExpectationLedgerConforms(
            OPERATIONAL_EXPECTATION_LEDGER_DESCRIPTOR,
            probesFromFacts({ ...goodFacts(), modalityCheck: false }),
        );
        expect(report.conforms).toBe(false);
        expect(report.checks.find((c) => c.property === "modality_closure")?.passed).toBe(false);
    });

    it("fails modality_closure when a sixth modality is admitted", async () => {
        const probes = probesFromFacts(goodFacts());
        probes.modalityVocabulary = [...OPERATIONAL_MODALITIES, "permitted"];
        const report = await assertExpectationLedgerConforms(
            OPERATIONAL_EXPECTATION_LEDGER_DESCRIPTOR,
            probes,
        );
        expect(report.conforms).toBe(false);
        expect(report.checks.find((c) => c.property === "modality_closure")?.passed).toBe(false);
    });

    it("fails the lineage half when the no-self-reference guard is missing", async () => {
        const report = await assertExpectationLedgerConforms(
            OPERATIONAL_EXPECTATION_LEDGER_DESCRIPTOR,
            probesFromFacts({ ...goodFacts(), noSelfRef: false }),
        );
        expect(report.conforms).toBe(false);
        expect(report.checks.find((c) => c.property === "no_self_reference_guard")?.passed).toBe(false);
    });

    it("fails authoring_write_boundary when authenticated is granted INSERT", async () => {
        const report = await assertExpectationLedgerConforms(
            OPERATIONAL_EXPECTATION_LEDGER_DESCRIPTOR,
            probesFromFacts({ ...goodFacts(), grantsInsertToAuthenticated: true }),
        );
        expect(report.conforms).toBe(false);
        expect(report.checks.find((c) => c.property === "authoring_write_boundary")?.passed).toBe(false);
    });

    it("fails authoring_write_boundary when an authenticated INSERT policy exists", async () => {
        const report = await assertExpectationLedgerConforms(
            OPERATIONAL_EXPECTATION_LEDGER_DESCRIPTOR,
            probesFromFacts({ ...goodFacts(), authenticatedInsertPolicy: true }),
        );
        expect(report.conforms).toBe(false);
        expect(report.checks.find((c) => c.property === "authoring_write_boundary")?.passed).toBe(false);
    });

    it("fails recorded_time_server_assigned when authored_at is not server-assigned", async () => {
        const report = await assertExpectationLedgerConforms(
            OPERATIONAL_EXPECTATION_LEDGER_DESCRIPTOR,
            probesFromFacts({ ...goodFacts(), authoredAtServerAssigned: false }),
        );
        expect(report.conforms).toBe(false);
        expect(report.checks.find((c) => c.property === "recorded_time_server_assigned")?.passed).toBe(false);
    });

    it("fails required_columns_present when a tuple facet column is absent", async () => {
        const report = await assertExpectationLedgerConforms(
            OPERATIONAL_EXPECTATION_LEDGER_DESCRIPTOR,
            probesFromFacts({
                ...goodFacts(),
                createBlockColumns: OPERATIONAL_EXPECTATION_REQUIRED_COLUMNS.filter((c) => c !== "temporal_frame"),
            }),
        );
        expect(report.conforms).toBe(false);
        expect(report.checks.find((c) => c.property === "required_columns_present")?.passed).toBe(false);
    });
});

describe("P1 Wave A — no later-wave behavior has begun (substrate only)", () => {
    // The Expectation lib is types + closed vocabularies + one descriptor + pure
    // conformance harnesses. It must contain NO authoring intake, Standing
    // resolver, transition handler, evaluation, or DB write path.
    const libDir = join(__dirname, "../../lib/operationalExpectations");
    const files = readdirSync(libDir).filter((f) => f.endsWith(".ts"));
    // Executable write/intake/eval tokens (call sites), NOT doc-comment prose.
    const forbidden = [
        /emitEvent\s*\(/,
        /\.insert\s*\(/,
        /createClient\s*\(/,
        /from\s+["']@supabase/,
        /function\s+\w*(?:authorByVerb|createExpectation|reviseExpectation|correctExpectation|replaceExpectation|cancelExpectation|resolveStanding|resolveAuthority|evaluate\w*)\s*\(/,
    ];

    it("has real files to scan", () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const f of files) {
        it(`${f} contains no intake/standing/transition/eval/write behavior`, () => {
            // Strip block + line comments so DOC prose ("NO evaluation …") is ignored.
            const code = readFileSync(join(libDir, f), "utf8")
                .replace(/\/\*[\s\S]*?\*\//g, " ")
                .replace(/\/\/[^\n]*/g, " ");
            for (const re of forbidden) {
                expect(re.test(code), `${f} unexpectedly matches ${re}`).toBe(false);
            }
        });
    }
});

describe("P1 Wave A — cumulative-schema drift detection (a LATER weakening is caught)", () => {
    // A faithful stand-in for the real Wave A migration's invariant-creating DDL.
    const baseMigration = `-- 20260717000000_operational_expectations_ledger_p1_wave_a.sql
        CREATE TABLE public.operational_expectations (
            id uuid PRIMARY KEY,
            org_id uuid NOT NULL,
            authority_key text NOT NULL,
            author_class text NOT NULL,
            modality text NOT NULL,
            subject_kind text NOT NULL,
            subject_ref jsonb NOT NULL,
            condition jsonb NOT NULL,
            temporal_frame jsonb NOT NULL,
            verb text NOT NULL,
            transition_type text,
            supersedes_expectation_id uuid REFERENCES public.operational_expectations (id) ON DELETE RESTRICT,
            standing text NOT NULL,
            footprint jsonb NOT NULL DEFAULT '{}'::jsonb,
            valid_from timestamptz NOT NULL,
            authored_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT operational_expectations_modality_check CHECK (modality = ANY (ARRAY['required','prohibited','intended','committed','predicted'])),
            CONSTRAINT operational_expectations_verb_check CHECK (verb = ANY (ARRAY['create','revise','correct','replace','cancel'])),
            CONSTRAINT operational_expectations_transition_type_check CHECK (transition_type IS NULL OR transition_type = ANY (ARRAY['revision','correction','cancellation','replacement'])),
            CONSTRAINT operational_expectations_standing_check CHECK (standing = ANY (ARRAY['proposed','binding','model'])),
            CONSTRAINT operational_expectations_create_link_shape CHECK (true),
            CONSTRAINT operational_expectations_verb_transition_map CHECK (true),
            CONSTRAINT operational_expectations_no_self_reference CHECK (supersedes_expectation_id <> id),
            CONSTRAINT operational_expectations_temporal_frame_present CHECK (temporal_frame <> '{}'::jsonb)
        );
        CREATE POLICY operational_expectations_select_org ON public.operational_expectations FOR SELECT USING (true);
        DROP TRIGGER IF EXISTS trg_prevent_operational_expectations_mutation ON public.operational_expectations;
        CREATE TRIGGER trg_prevent_operational_expectations_mutation
            BEFORE UPDATE OR DELETE ON public.operational_expectations FOR EACH ROW EXECUTE FUNCTION public.prevent_operational_expectations_mutation();`;

    it("the base migration reads as a clean substrate (baseline)", () => {
        const facts = scanExpectationLedgerSchema(baseMigration);
        expect(facts.appendOnlyTrigger).toBe(true);
        expect(facts.hasUpdatedAt).toBe(false);
        expect(facts.noSelfRef).toBe(true);
        expect(facts.modalityCheck).toBe(true);
        expect(facts.hasValidFrom).toBe(true);
        expect(facts.hasAuthoredAt).toBe(true);
    });

    it("detects a LATER migration that DROPS the append-only trigger", () => {
        const drift = `${baseMigration}
        -- 20260901000000_oops_make_expectations_mutable.sql
        DROP TRIGGER trg_prevent_operational_expectations_mutation ON public.operational_expectations;`;
        expect(scanExpectationLedgerSchema(drift).appendOnlyTrigger).toBe(false);
    });

    it("detects a LATER migration that ADDS updated_at (makes the ledger mutable)", () => {
        const drift = `${baseMigration}
        -- 20260901000000_oops_add_updated_at.sql
        ALTER TABLE public.operational_expectations ADD COLUMN updated_at timestamptz;`;
        expect(scanExpectationLedgerSchema(drift).hasUpdatedAt).toBe(true);
    });

    it("detects a LATER migration that DROPS the modality closure CHECK", () => {
        const drift = `${baseMigration}
        -- 20260901000000_oops_open_modality.sql
        ALTER TABLE public.operational_expectations DROP CONSTRAINT operational_expectations_modality_check;`;
        expect(scanExpectationLedgerSchema(drift).modalityCheck).toBe(false);
    });

    it("a same-migration DROP-then-CREATE (re-create) is NOT drift", () => {
        expect(scanExpectationLedgerSchema(baseMigration).appendOnlyTrigger).toBe(true);
    });
});
