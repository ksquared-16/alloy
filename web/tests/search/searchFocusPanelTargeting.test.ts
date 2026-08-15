import { describe, expect, it } from "vitest";

import { FOCUS_PANEL_CARD_KEYS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import { SEARCH_CARD_KEYS, resolveSearchDestinations } from "@/lib/search/searchDestinations";
import type { SearchContext, SearchSubject } from "@/lib/search/searchContracts";

/**
 * Search must land the operator on a CARD, not on the generic drawer overlay.
 *
 * The defect this replaces: every destination was `open_drawer`, addressed by
 * record id. "Open Lennon" and "Enrollment — Waitlist" therefore shared one
 * address, the dedupe discarded one of them, and Household was often the only
 * context left standing.
 */

const OPP = "opp-1";
const CUST = "cust-1";

const child: SearchSubject = {
    kind: "child",
    id: "cm-lennon",
    display_name: "Lennon Kurzman",
    person_id: null,
    household_id: CUST,
};

/**
 * The process KEY and the work-unit KEY are deliberately DIFFERENT strings.
 *
 * They are different namespaces — `/workspace/work-unit/:slug` resolves work-unit
 * keys and Work View slugs, not process keys — and a fixture that let them coincide
 * would make the category error these tests exist to catch unobservable.
 */
const WORK_UNIT = "enrollment_pipeline";

const enrollment: SearchContext = {
    kind: "process",
    key: "enrollment",
    label: "Enrollment",
    detail: "Waitlist",
    destination_entity_type: "opportunity",
    destination_entity_id: OPP,
    destination_work_unit_key: WORK_UNIT,
};

const schedule: SearchContext = { kind: "schedule", key: "schedule", label: "Schedule", detail: "Mon / Wed / Fri" };

const resolve = (subject: SearchSubject, contexts: SearchContext[], promoted: string[] = []) =>
    resolveSearchDestinations({ subject, contexts, promotedKeys: promoted });

describe("Search targets Focus Panel cards, never the drawer", () => {
    it("emits NO open_drawer destination for any subject kind", () => {
        const subjects: Array<[SearchSubject, SearchContext[]]> = [
            [child, [enrollment, schedule]],
            [{ kind: "person", id: "p-kelly", display_name: "Kelly Kurzman", person_id: "p-kelly", household_id: CUST }, []],
            [{ kind: "household", id: CUST, display_name: "Kurzman Family", household_id: CUST }, []],
            [{ kind: "location", id: "loc-1", display_name: "North Campus" }, []],
        ];
        for (const [subject, contexts] of subjects) {
            for (const d of resolve(subject, contexts)) {
                expect(d.target).not.toBe("open_drawer");
                expect(["durable_record", "focus_panel", "route"]).toContain(d.target);
            }
        }
    });

    it("every card key Search targets exists in the canonical catalogue", () => {
        for (const key of Object.values(SEARCH_CARD_KEYS)) {
            expect(FOCUS_PANEL_CARD_KEYS as readonly string[]).toContain(key);
        }
    });

    it("child → the DURABLE CHILD, with no lens chosen on the operator's behalf", () => {
        const primary = resolve(child, [enrollment])[0];
        expect(primary.target).toBe("durable_record");
        expect(primary.subject_type).toBe("child");
        expect(primary.subject_id).toBe("cm-lennon");
        // THE POINT OF THE SLICE. Clicking "Lennon Kurzman · Child" used to commit the family's
        // Work Unit and the first Work View Lennon happened to be in. A record intent names the
        // record; it resolves no host and claims no lens.
        expect(primary.host_entity_id ?? null).toBeNull();
        expect(primary.host_work_unit_key ?? null).toBeNull();
        expect(primary.host_work_view_id ?? null).toBeNull();
    });

    it("a child with NO case and NO participation is still openable", () => {
        // The old shape returned null without a host, so a child whose enrollment had completed —
        // or who never had one — rendered as a result that could not be opened at all. A durable
        // record needs no queue, which is the whole reason the grain exists.
        const orphan = resolve({ ...child, household_id: null }, [])[0];
        expect(orphan.target).toBe("durable_record");
        expect(orphan.subject_id).toBe("cm-lennon");
    });

    it("the OPERATIONAL destination still focuses the Children card on the case", () => {
        const process = resolve(child, [enrollment]).find((d) => d.key === "process:enrollment")!;
        expect(process.target).toBe("focus_panel");
        expect(process.host_entity_type).toBe("opportunities");
        expect(process.host_entity_id).toBe(OPP);
        expect(process.item_id).toBe("cm-lennon");
    });

    it("person → the DURABLE PERSON, not the family's case panel", () => {
        const kelly: SearchSubject = {
            kind: "person",
            id: "p-kelly",
            display_name: "Kelly Kurzman",
            person_id: "p-kelly",
            household_id: CUST,
        };
        const primary = resolve(kelly, [])[0];
        expect(primary.target).toBe("durable_record");
        expect(primary.subject_type).toBe("person");
        expect(primary.subject_id).toBe("p-kelly");
        // Their household context remains available as a SEPARATE, explicitly-labelled destination.
        expect(resolve(kelly, []).some((d) => d.key === "household")).toBe(true);
    });

    it("carries the query's context as a PREFERENCE, and only one the subject holds", () => {
        const preferred = resolve(child, [enrollment, schedule], ["enrollment"])[0];
        expect(preferred.target).toBe("durable_record");
        expect(preferred.preferred_context_key).toBe("enrollment");

        // A term the subject has no context for expresses an interest the record cannot honour.
        const unheld = resolve(child, [schedule], ["enrollment"])[0];
        expect(unheld.preferred_context_key ?? null).toBeNull();

        // …and with no intent at all the host resolves its own default.
        expect(resolve(child, [enrollment])[0].preferred_context_key ?? null).toBeNull();
    });

    it("household → Household card with no item", () => {
        const household: SearchSubject = { kind: "household", id: CUST, display_name: "Kurzman Family", household_id: CUST };
        const primary = resolve(household, [])[0];
        expect(primary.card_key).toBe("household");
        expect(primary.item_id ?? null).toBeNull();
    });

    it("schedule context → Assignment card focused on the child", () => {
        const assignment = resolve(child, [schedule]).find((d) => d.key === "assignment");
        expect(assignment).toBeTruthy();
        expect(assignment!.card_key).toBe("scheduling");
        expect(assignment!.item_id).toBe("cm-lennon");
    });

    it("assignment intent promotes the Assignment destination above the rest", () => {
        const destinations = resolve(child, [enrollment, schedule], ["schedule"]);
        expect(destinations[0].key).toBe("subject");
        expect(destinations[1].key).toBe("assignment");
    });

    it("process destination carries the CONFIGURED process key as context", () => {
        const process = resolve(child, [enrollment]).find((d) => d.key === "process:enrollment");
        expect(process).toBeTruthy();
        expect(process!.card_key).toBe("current_work");
        expect(process!.context_key).toBe("enrollment");
        expect(process!.label).toBe("Enrollment");
    });

    it("a campus still routes to canonical Settings, not a card", () => {
        const primary = resolve({ kind: "location", id: "loc-1", display_name: "North Campus" }, [])[0];
        expect(primary.target).toBe("route");
        expect(primary.href).toContain("loc-1");
    });
});

describe("destination dedupe keys on operator context, not record address", () => {
    it("keeps BOTH the subject and its process even though they share one record", () => {
        // The regression: primary and process both address `opp-1`. Keying the
        // dedupe on the record collapsed them and left only Household.
        const destinations = resolve(child, [enrollment]);
        const keys = destinations.map((d) => d.key);

        expect(keys).toContain("subject");
        expect(keys).toContain("process:enrollment");
        expect(keys).toContain("household");

        const hosts = destinations.filter((d) => d.host_entity_id === OPP);
        expect(hosts.length).toBeGreaterThan(1); // same record, different contexts
    });

    it("still collapses a genuinely repeated operator context", () => {
        const twice = resolve(child, [enrollment, { ...enrollment }]);
        expect(twice.filter((d) => d.key === "process:enrollment")).toHaveLength(1);
    });

    it("stays compact — a primary plus a small number of contexts", () => {
        const destinations = resolve(child, [enrollment, schedule]);
        expect(destinations.length).toBeLessThanOrEqual(5);
        expect(destinations.filter((d) => d.primary)).toHaveLength(1);
    });
});

describe("Search uses the ONE canonical focus seam", () => {
    it("the control states intent on the shared seam, not a Search-owned mechanism", async () => {
        const { readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        const src = readFileSync(join(process.cwd(), "app/adminV2/components/GlobalSearchBox.tsx"), "utf8");
        // The control states intent; a listener INSIDE the Runtime Kernel applies it. The
        // control cannot use the hook itself — the top nav renders above every workspace
        // provider and calling it there throws. Search is not special: the same seam serves
        // every producer that names a record from outside the runtime.
        expect(src).toContain("dispatchOperatorFocusSelection");
        expect(src).not.toContain("requestFocusPanelTarget");

        // Comments stripped: the listener EXPLAINS why `openDrawer` is wrong here, so a raw
        // substring scan reads its own reasoning as the violation. Assert on code.
        const listener = readFileSync(
            join(process.cwd(), "components/adminV2/OperatorFocusAttentionListener.tsx"),
            "utf8"
        )
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, "");
        expect(listener).toContain("useWorkUnitEntryMovement");
        expect(listener).toContain("formatCardFocusAspect");
        expect(listener).not.toContain("openDrawer");
    });

    it("an OPERATIONAL child destination names the host record's WORK UNIT, never its process", () => {
        // Asserted on the operational destination because that is the only kind that carries a
        // work unit now. The property is unchanged and still load-bearing: emitting the process
        // key produced `/workspace/work-unit/enrollment`, which answers `work_unit_not_found`,
        // composes nothing, and leaves the operator on an empty page with no error.
        const process = resolve(child, [enrollment]).find((d) => d.key === "process:enrollment")!;
        expect(process.host_work_unit_key).toBe(WORK_UNIT);
        expect(process.host_work_unit_key).not.toBe(enrollment.key);
    });

    it("a process destination hosts on ITS OWN context's work unit", () => {
        const process = resolve(child, [enrollment]).find((d) => d.key === "process:enrollment");
        expect(process!.host_work_unit_key).toBe(WORK_UNIT);
        expect(process!.host_work_unit_key).not.toBe(enrollment.key);
    });

    it("a context worked by no work unit yields no work unit — it does not guess", () => {
        // Absence is honest: no queue holds the record, so no Work View's evaluated
        // page contains it and no Focus Panel can host it. Naming a unit anyway would
        // be a fabricated route that fails silently at the far end.
        const unhosted: SearchContext = { ...enrollment, destination_work_unit_key: null };
        const process = resolve(child, [unhosted]).find((d) => d.key === "process:enrollment")!;
        expect(process.host_entity_id).toBe(OPP);
        expect(process.host_work_unit_key).toBeNull();
    });

    it("falls through to a participation that IS worked somewhere", () => {
        const unhosted: SearchContext = {
            ...enrollment,
            key: "annual_registration",
            label: "Annual Registration",
            destination_work_unit_key: null,
        };
        // The cross-context fallback now lives on the HOUSEHOLD destination, which is the
        // destination that still asks "which unit works this subject at all" without naming a
        // context of its own. The property is the same one: prefer a participation that IS worked
        // somewhere over one that is worked nowhere.
        const household = resolve(child, [unhosted, enrollment]).find((d) => d.key === "household")!;
        expect(household.host_work_unit_key).toBe(WORK_UNIT);
    });
});

describe("the obsolete drawer product is unreachable from Search", () => {
    it("the Search control cannot launch a drawer", async () => {
        const { readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        const src = readFileSync(join(process.cwd(), "app/adminV2/components/GlobalSearchBox.tsx"), "utf8");
        expect(src).not.toContain("launchGlobalRecordSearchOpen");
        expect(src).not.toContain("open_drawer");
        expect(src).toContain("dispatchOperatorFocusSelection");
    });

    it("the drawer open-intent product no longer exists", async () => {
        const { readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        const src = readFileSync(join(process.cwd(), "lib/adminV2/globalRecordSearchOpen.ts"), "utf8");
        for (const gone of [
            "launchGlobalRecordSearchOpen",
            "dispatchGlobalRecordSearchOpen",
            "storeGlobalRecordSearchOpenIntent",
            "adminV2PathHasDrawerHost",
        ]) {
            expect(src).not.toContain(`export function ${gone}`);
        }
    });
});
