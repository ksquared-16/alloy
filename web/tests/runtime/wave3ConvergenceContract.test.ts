/**
 * WAVE-3 CONVERGENCE — the document owns first-order truth for three configured cards.
 *
 * Measured on deployed staging before this change: business_process, children and household made
 * their first CORRECT visible statement ~2,974ms after the first card wave, and only once the
 * drawer arrived. Withholding the drawer did not make them late — it left them WRONG: children
 * read "—" for a site the document row already named, business_process read the generic card title
 * with an empty timeline, and household showed a contact it could not act on.
 *
 * These gates hold the resulting contract. They are deliberately split between the two halves that
 * can each break independently:
 *
 *   the COMPOSER must carry the values (it already read every one of them);
 *   the COMMIT MODEL must project them (it previously hardcoded `stages: []`).
 *
 * WHY SOURCE ASSERTIONS. The composer is a ~2,000-line async function over a live Supabase client;
 * standing up a fixture that reaches the binding block would test the fixture, not the contract.
 * The decisions being pinned are single expressions — which resolver, which key, which argument —
 * so the gates read those expressions. Where a decision IS drivable as a pure function, it is
 * driven instead: see `focusPanelWorkModeModelFromProvisioningAnswer` below, which is exercised
 * for real.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCommitCriticalOperationalContext } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** Comments stripped, so a negative assertion reads code and not the prose explaining it. */
const codeOf = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ANSWER = codeOf(read("lib/runtime/provisioning/workUnitProvisioningAnswer.ts"));
const MODEL = codeOf(read("lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer.ts"));
const BODY = codeOf(read("components/admin/focusPanel/OpportunityFocusPanelBody.tsx"));

/** A minimal commit input. Only the fields under test are meaningful. */
const input = (over: Record<string, unknown> = {}) =>
    ({
        mode: "work",
        subjectId: "opp-1",
        title: "Specq household",
        statusLabel: "Waitlist",
        statusKey: "waitlist",
        canMutate: false,
        perspective: null,
        stageWorkRuntime: null,
        operationalProjection: null,
        situation: { stageKey: "waitlist", stageLabel: "Waitlist", purpose: null },
        primaryAction: null,
        subjectIdentityTruth: null,
        subjectGrain: null,
        ...over,
    }) as never;

describe("BUSINESS_PROCESS — the configured rail is not a settlement fact", () => {
    it("A — configured lifecycle stages are carried into the commit context", () => {
        const stages = [
            { key: "lead", label: "Lead" },
            { key: "tour", label: "Tour", support: ["North Campus"] },
            { key: "enrolled", label: "Enrolled" },
        ];
        const ctx = buildCommitCriticalOperationalContext(input({ businessProcessStages: stages }));
        expect(ctx.businessProcess.stages).toHaveLength(3);
        expect((ctx.businessProcess.stages as Array<{ key: string }>).map((s) => s.key)).toEqual([
            "lead",
            "tour",
            "enrolled",
        ]);
    });

    it("B — the configured process name is carried", () => {
        const ctx = buildCommitCriticalOperationalContext(input({ businessProcessName: "Enrollment" }));
        expect((ctx.businessProcess as { name?: string }).name).toBe("Enrollment");
    });

    it("C — the current stage comes from situation.stageKey, with no statusDefs lookup", () => {
        const ctx = buildCommitCriticalOperationalContext(input());
        expect(ctx.businessProcess.stageKey).toBe("waitlist");
        // The composer must NOT have to read status definitions to answer the rail.
        expect(ANSWER).toContain("statusDefs: []");
        expect(ANSWER).not.toMatch(/from\(["'`]status_definitions["'`]\)/);
    });

    it("D — stage annotations survive the carry", () => {
        const ctx = buildCommitCriticalOperationalContext(
            input({ businessProcessStages: [{ key: "tour", label: "Tour", support: ["North Campus"] }] }),
        );
        const [stage] = ctx.businessProcess.stages as Array<{ support?: readonly string[] }>;
        expect(stage.support).toEqual(["North Campus"]);
    });

    it("an unstaged context is still a real answer — empty rail, not a crash", () => {
        expect(buildCommitCriticalOperationalContext(input()).businessProcess.stages).toEqual([]);
        expect(
            buildCommitCriticalOperationalContext(input({ businessProcessStages: null })).businessProcess.stages,
        ).toEqual([]);
    });

    it("E — Recent activity is NOT promoted into the first-order commit contract", () => {
        // It is a DropdownMenu trigger with a count — "zero rows on the card face" — so it stays
        // drawer-owned enrichment. Promoting it would put an on-demand affordance on the
        // completion path.
        expect(ANSWER).not.toContain("businessProcessActivity");
        expect(MODEL).not.toContain("businessProcessActivity");
        expect(BODY).not.toContain("businessProcessActivity");
    });

    it("B2 — the process name comes from the configured process, never a literal", () => {
        /*
         * Gate B drives the MODEL with an explicit name, so it cannot see the COMPOSER hardcoding
         * one. A plant substituting the generic "Business Process" for `wave3ProcessName` walked
         * straight through until this was added.
         */
        expect(ANSWER).toContain("businessProcessName: wave3ProcessName");
        expect(ANSWER).not.toMatch(/businessProcessName:\s*["'`]/);
    });

    it("D2 — the record reaches the rail builder, or annotations are silently lost", () => {
        /*
         * Same blind spot as B2: gate D supplies `support` directly to the model. The annotations
         * are resolved inside the rail builder FROM THE RECORD, so passing `record: null` produces
         * a rail with stages and no annotations — visibly poorer, and previously ungated.
         */
        const call = ANSWER.slice(
            ANSWER.indexOf("buildOpportunityWorkspaceLifecycleRail({"),
            ANSWER.indexOf("const wave3ProcessName"),
        );
        expect(call.length).toBeGreaterThan(50);
        expect(call).toContain("record: wave3Record");
        expect(call).not.toMatch(/record:\s*null/);
    });

    it("the rail is computed by the canonical pure builder, not re-derived", () => {
        expect(ANSWER).toContain("buildOpportunityWorkspaceLifecycleRail(");
        expect(ANSWER).toContain("businessProcessStages: wave3Rail?.stages ?? []");
    });
});

describe("CHILDREN — the canonical location, or genuinely nothing", () => {
    it("F/I — projected from the existing canonical resolver, and only that one", () => {
        expect(ANSWER).toContain("resolveOpportunityLeadLocationFields(");
        // No second location authority: the composer must not hand-roll the precedence chain.
        expect(ANSWER).not.toMatch(/_location_label\s*\?\?\s*[\w.]*_location_name/);
    });

    it("G — a known location is carried, so it cannot degrade to the placeholder", () => {
        // Carried from the ONE resolved answer (see the LOCATION block) — the row label when
        // the row has one, otherwise the canonical lookup.
        expect(ANSWER).toContain("_location_label: wave3LocationLabel");
        expect(ANSWER).toContain("_location_id: wave3LeadLocation.locationId");
    });

    it("H — an absent location stays absent; no site is fabricated", () => {
        // Conditional spread: the key is omitted entirely when the resolver found nothing, rather
        // than binding an empty string that would render as a real (blank) site.
        expect(ANSWER).toMatch(/\.\.\.\(wave3LocationLabel \? \{ _location_label/);
        expect(ANSWER).not.toMatch(/_location_label:\s*["'`]/);
    });
});

describe("LOCATION — one canonical answer, feeding both consumers", () => {
    /*
     * The last wave-3 dependency. Deployed measurement proved the document row carries
     * `location_id` (a uuid) and no label: `_location_name` is CONSUMED in the document path but
     * PRODUCED on the drawer's, where `opportunityEntityRecord` reads the locations row. So one
     * authorized lookup was added — and it must stay ONE, feeding both the rail annotation and
     * Children.
     */
    it("uses the canonical provider, not a hand-rolled locations read", () => {
        expect(ANSWER).toContain("resolveLocationById(");
        expect(ANSWER).toContain("canonicalLocationDisplay(");
        expect(ANSWER).not.toMatch(/from\(["'`]locations["'`]\)/);
    });

    it("D/J — ONE resolved label feeds BOTH the rail annotation and Children", () => {
        // Two lookups, or two different variables, would let the two cards disagree about the site.
        expect(ANSWER).toContain("locationLabel: wave3LocationLabel");
        expect(ANSWER).toContain("_location_label: wave3LocationLabel");
        expect((ANSWER.match(/resolveLocationById\(/g) ?? []).length).toBe(1);
    });

    it("B — the uuid is never used as the visible label", () => {
        expect(ANSWER).not.toMatch(/_location_label:\s*wave3LocationId/);
        expect(ANSWER).not.toMatch(/locationLabel:\s*wave3LocationId/);
    });

    it("A — the lookup is actually performed when the row has an id but no label", () => {
        expect(ANSWER).toMatch(/if \(!wave3LocationLabel && wave3LocationId\)/);
    });

    it("F/G — neither absence nor failure fabricates a label", () => {
        // Conditional spread: no key at all rather than an empty string, which would render as a
        // real blank site. And the catch assigns null — never a label, never "".
        expect(ANSWER).toMatch(/\.\.\.\(wave3LocationLabel \? \{ _location_label/);
        const guard = ANSWER.slice(ANSWER.indexOf("if (!wave3LocationLabel && wave3LocationId)"), ANSWER.indexOf("const wave3UpdatedAt"));
        expect(guard).toContain("catch");
        expect(guard).toMatch(/wave3LocationLabel = null;/);
        expect(guard).not.toMatch(/wave3LocationLabel = ["'`]/);
    });

    it("H — the lookup is org-scoped at the document's own boundary", () => {
        expect(ANSWER).toContain("resolveLocationById(req.supabase, req.orgId,");
    });
});

describe("HOUSEHOLD — identity may travel; authority may not", () => {
    it("J — updated_at is the existing subject-row timestamp", () => {
        expect(ANSWER).toContain("strOrNull(wave3Record.updated_at)");
        expect(ANSWER).toContain("updated_at: wave3UpdatedAt");
    });

    it("K — primary contact identity survives", () => {
        expect(ANSWER).toContain('"person.primary_contact_name": primaryContactName');
    });

    it("L — primary_person_id is carried, which is what the editable affordance requires", () => {
        expect(ANSWER).toContain("strOrNull(wave3Record.primary_person_id)");
        expect(ANSWER).toContain("primary_person_id: wave3PrimaryPersonId");
    });

    it("M/N — NO permission verdict is transported; authority stays request-time", () => {
        // The bindings block must never carry an authorization answer. `canMutate` continues to
        // reach the model as a request-evaluated input, which is a different thing entirely.
        const bindings = ANSWER.slice(
            ANSWER.indexOf("const subjectIdentityTruthBindings"),
            ANSWER.indexOf("const childBindings"),
        );
        expect(bindings.length).toBeGreaterThan(50);
        for (const forbidden of ["canEdit", "canMutate", "allowedLocationIds", "permissionKeys", "roleKeys"]) {
            expect(bindings).not.toContain(forbidden);
        }
    });

    it("canMutate still reaches the commit model as a request-time input", () => {
        expect(MODEL).toContain("canMutate: input.canMutate");
        const ctx = buildCommitCriticalOperationalContext(input({ canMutate: true }));
        expect((ctx as { capabilities?: { canMutate?: boolean } }).capabilities?.canMutate).toBe(true);
    });
});

describe("GENERAL — configuration remains the authority", () => {
    it("O/P/Q — the convergence names no card membership", () => {
        // Ownership rules may exist per card; MEMBERSHIP comes from the published layout. A
        // hardcoded seven-card list here would make a configuration change silently wrong.
        const block = ANSWER.slice(ANSWER.indexOf("const wave3Record"), ANSWER.indexOf("const primaryContactName"));
        for (const card of ["business_process", "household", "children", "attendance", "health_safety"]) {
            expect(block).not.toContain(`"${card}"`);
        }
    });

    it("R — nothing freezes the drawer out of correcting these cards later", () => {
        // The commit values are inputs to the same context the settled frame rebuilds; no branch
        // may pin them against a later authoritative answer.
        expect(MODEL).not.toMatch(/freeze|preventSettled|ignoreDrawer/i);
    });

    it("the carried values add no read — every one was already selected", () => {
        const population = read("lib/runtime/provisioning/workUnitProcessPopulation.ts");
        for (const col of ["updated_at", "primary_person_id", "location_id"]) {
            expect(population).toContain(col);
        }
    });
});
