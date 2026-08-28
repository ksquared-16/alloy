/**
 * WORKSTREAM F — the client contract, asserted at the seams a browser proof cannot cover cheaply.
 *
 * The browser proves the surface opens. These prove the things that would still be wrong if it did:
 * that intent is never inferred, that the address is built in one place, and that the wire encoding
 * does not silently drop the card maps (a model whose maps arrive as `{}` composes an empty panel
 * with no error — the exact silent failure this program exists to remove).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    DURABLE_RECORD_BASE,
    durableRecordEntityType,
    durableRecordHref,
    durableSubjectTypeFor,
    isDurableSubjectType,
} from "@/lib/runtime/focus/durableRecordRoute";
import {
    decodeDurableRecordModel,
    encodeDurableRecordModel,
} from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableRecordModelWire";
import { focusPanelWorkModeModelFromDurablePerson } from "@/lib/adminV2/runtime/focusPanel/durableSubject/focusPanelWorkModeModelFromDurableSubject";
import { personEmploymentSignal } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durablePersonSubjectModel";
import type { PersonEmploymentComposition } from "@/lib/employment/buildPersonEmploymentComposition";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("the durable address has one builder and one vocabulary", () => {
    it("maps attention entity types onto durable grains", () => {
        expect(durableSubjectTypeFor("persons")).toBe("person");
        expect(durableSubjectTypeFor("person")).toBe("person");
        expect(durableSubjectTypeFor("customer_members")).toBe("child");
        expect(durableSubjectTypeFor("child")).toBe("child");
        expect(durableSubjectTypeFor("customers")).toBe("household");
        expect(durableSubjectTypeFor("household")).toBe("household");
    });

    it("an opportunity has NO durable grain — it has an operational home", () => {
        expect(durableSubjectTypeFor("opportunities")).toBeNull();
        expect(durableSubjectTypeFor("opportunity")).toBeNull();
        /*
         * `customers` WAS ASSERTED NULL HERE, on the line below the opportunity — and the two were
         * never the same statement.
         *
         * A case has an operational home, so a durable case would route around the queue it belongs
         * to. That reasoning is intact, which is why the two lines above stay. A household is not a
         * case: it is `customers` + `customer_persons` + `customer_members`, it may carry several
         * cases or none, and it outlives all of them. Resolving it through a case made an ACTIVE
         * QUEUE the existence authority for a family — so a family whose enrollment had completed
         * produced no subject destination at all and could not be opened.
         */
    });

    /** A grain → the table name the attention resolver speaks. Total over the union, by construction. */
    it("maps every durable grain onto its canonical table", () => {
        expect(durableRecordEntityType("person")).toBe("persons");
        expect(durableRecordEntityType("child")).toBe("customer_members");
        // The arm a two-way ternary silently got wrong: a household sent as `persons` finds nothing
        // and 404s a record that plainly exists.
        expect(durableRecordEntityType("household")).toBe("customers");
    });

    it("builds the canonical address, with the aspect riding it", () => {
        expect(durableRecordHref("person", "p-1")).toBe(`${DURABLE_RECORD_BASE}/person/p-1`);
        expect(durableRecordHref("child", "m-1", "child_identity")).toBe(
            `${DURABLE_RECORD_BASE}/child/m-1?card=child_identity`,
        );
        // An absent aspect is not an empty query string — the default composition decides.
        expect(durableRecordHref("person", "p-1", null)).toBe(`${DURABLE_RECORD_BASE}/person/p-1`);
        expect(durableRecordHref("person", "p 1")).toContain("p%201");
    });

    it("refuses a grain with no durable composer", () => {
        expect(isDurableSubjectType("person")).toBe(true);
        expect(isDurableSubjectType("child")).toBe(true);
        expect(isDurableSubjectType("opportunity")).toBe(false);
        expect(isDurableSubjectType("")).toBe(false);
    });
});

describe("intent is declared, never inferred", () => {
    const src = read("lib/runtime/focus/useOperatorRecordFocus.ts");

    it("the durable branch is gated on the caller's declared intent", () => {
        expect(src).toContain('request.intent === "durable_record"');
    });

    it("the default is operational — a caller that says nothing keeps its old answer", () => {
        // No branch may key durable behaviour off the entity type or the pathname; those are what
        // "inferred" would look like here.
        expect(src).not.toMatch(/intent\s*=\s*entityType/);
        expect(src).not.toMatch(/intent\s*\?\?\s*["']durable_record["']/);
    });

    it("components never build the durable address themselves", () => {
        // One builder, one place. A component that pushed its own string is how every caller ends up
        // with its own routing rules — the defect this adapter exists to prevent.
        expect(src).toContain("durableRecordHref");
        const surface = read("components/presentation/durableRecord/DurableRecordSurface.tsx");
        expect(surface).not.toContain("/workspace/record/");
    });
});

describe("the wire format preserves the card maps", () => {
    function composition(): PersonEmploymentComposition {
        return {
            is_staff: true,
            current: {
                id: "emp-1",
                status: "active",
                state_label: "Active",
                is_open: true,
                position_label: "Lead Teacher",
                employment_type: "full_time",
                employment_type_label: "Full time",
                primary_location_id: null,
                primary_location_label: "Riverside",
                external_employee_id: null,
                start_date: "2026-01-05",
                end_date: null,
                end_reason_key: null,
            },
            periods: [],
            configured_facts: [],
            never_employed: false,
        };
    }

    const model = focusPanelWorkModeModelFromDurablePerson({
        mode: "summary",
        subject: {
            personId: "p-1",
            label: "Dana Okafor",
            truth: { id: "p-1" },
            imageUrl: null,
            employment: personEmploymentSignal("p-1", "Dana Okafor", composition()),
        },
        canMutate: false,
    });

    it("survives a real JSON round trip with its cards intact", () => {
        const wire = JSON.parse(JSON.stringify(encodeDurableRecordModel(model)));
        const decoded = decodeDurableRecordModel(wire);
        // The failure this guards: Maps JSON-encode to `{}`, so a naive hop yields a panel with no
        // cards and no error.
        expect(decoded.cardModels).toBeInstanceOf(Map);
        expect(decoded.cardReadiness).toBeInstanceOf(Map);
        expect([...decoded.cardModels.keys()]).toEqual(["staff"]);
        expect(decoded.cardReadiness.get("staff")).toBe("ready");
        expect(decoded.cardModels.get("staff")?.insight).toBe("Lead Teacher at Riverside");
    });

    it("preserves subject, phase and grain across the hop", () => {
        const decoded = decodeDurableRecordModel(
            JSON.parse(JSON.stringify(encodeDurableRecordModel(model))),
        );
        expect(decoded.subject).toEqual(model.subject);
        expect(decoded.phase).toBe("settled");
        expect(decoded.source).toBe("durable_subject");
        expect(decoded.context.grain).toBe("person");
    });
});

describe("the durable surface renders the shared grid, not a second panel", () => {
    const surface = read("components/presentation/durableRecord/DurableRecordSurface.tsx");

    it("mounts OpportunityFocusPanelModeGrid", () => {
        expect(surface).toContain("OpportunityFocusPanelModeGrid");
    });

    it("builds no drawer, no Records panel, and no synthetic work unit", () => {
        for (const forbidden of ["openDrawer", "AdminEntityDrawer", "work_unit_id", "ProvisioningAnswer"]) {
            expect(surface, `${forbidden} must not appear on the durable surface`).not.toContain(forbidden);
        }
    });

    it("re-resolves access server-side rather than trusting the navigation", () => {
        const route = read("app/api/admin/durable-record/route.ts");
        expect(route).toContain("requireAdminOrOps");
        expect(route).toContain("scopeDimensionsFromAccess");
        expect(route).toContain("resolveAttentionTarget");
    });
});
