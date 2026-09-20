/**
 * UNKNOWN IS NOT INHERITED.
 *
 * `locationInherited` was `!childLocationId && Boolean(opportunitySiteId)` — absence read as "the
 * child has no site of its own". At commit the answer does not carry each child's `location_id`,
 * so the card asserted "Inherited from lead" for a child that DOES own a placement, and the drawer
 * removed the badge ~1.6s later. Measured on deployed 6734f408f that removal was the single last
 * authoritative mutation on the whole surface: a false claim, corrected late.
 *
 * Same family of defect as `countOpenWork(null) === 0` — a fallback state wearing the clothes of
 * an authoritative answer.
 *
 * These gates drive the real evidence builder. The location VALUE must survive in every case;
 * only the provenance sentence is conditional.
 */
import { describe, expect, it } from "vitest";

import { buildChildrenCardEvidence } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const LEAD_SITE = "loc-lead-1";
const LEAD_LABEL = "North Campus";

/** A context whose single inquiry child is described exactly as the caller states. */
const ctx = (child: Record<string, unknown>): OperationalContext =>
    ({
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Specq household" },
        truth: {
            id: "opp-1",
            location_id: LEAD_SITE,
            _location_label: LEAD_LABEL,
            _inquiry_children: [child],
        },
        businessProcess: { key: null, label: null, stageKey: null, stages: [] },
        capabilities: { canMutate: false, maskedChannels: false },
    }) as unknown as OperationalContext;

/** The canonical inquiry-child shape the normalizer consumes (display_name + member id). */
const kid = (over: Record<string, unknown> = {}) => ({
    id: "ch-1",
    customer_member_id: "ocm-1",
    display_name: "Specee",
    ...over,
});

const only = (c: OperationalContext) => {
    const kids = buildChildrenCardEvidence(c).children;
    expect(kids, "fixture must produce exactly one child").toHaveLength(1);
    return kids[0];
};

describe("child location provenance", () => {
    it("A — UNKNOWN provenance does not claim inheritance", () => {
        // No `location_id` key at all: nothing answered the question.
        const child = only(ctx(kid()));
        expect(child.locationInherited).toBeFalsy();
    });

    it("D — the location VALUE still renders while provenance is unknown", () => {
        // The lead's site is genuinely the site in effect; withholding the qualifier must not
        // withhold the answer.
        expect(only(ctx(kid())).location).toBe(LEAD_LABEL);
    });

    it("B — KNOWN-absent own location does claim inheritance", () => {
        // The key is present and empty: the product actually knows the child owns no site.
        const child = only(ctx(kid({ location_id: null })));
        expect(child.locationInherited).toBe(true);
        expect(child.location).toBe(LEAD_LABEL);
    });

    it("C — a child-owned location never claims inheritance", () => {
        const child = only(ctx(kid({ location_id: "loc-own-9", location_label: "South Campus" })));
        expect(child.locationInherited).toBeFalsy();
        expect(child.location).toBe("South Campus");
    });

    it("E — an empty-string location does not become inheritance by coercion", () => {
        // Present-but-blank is still "answered": the child owns no site.
        const child = only(ctx(kid({ location_id: "" })));
        expect(child.locationInherited).toBe(true);
    });

    it("inheritance is never claimed when the lead itself has no site", () => {
        const c = ctx(kid({ location_id: null }));
        (c.truth as Record<string, unknown>).location_id = null;
        (c.truth as Record<string, unknown>)._location_label = null;
        expect(only(c).locationInherited).toBeFalsy();
    });
});

describe("F — the repair introduces no read", () => {
    it("the evidence builder stays a pure projection", () => {
        // It takes a context and returns a model; a read here would put I/O inside render.
        expect(buildChildrenCardEvidence.constructor.name).toBe("Function");
        const src = String(buildChildrenCardEvidence);
        for (const forbidden of ["await ", "supabase", "fetch("]) {
            expect(src).not.toContain(forbidden);
        }
    });
});
