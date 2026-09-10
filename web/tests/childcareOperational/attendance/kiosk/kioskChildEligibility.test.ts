/**
 * Who may take a child out of a nursery, decided by a tablet in a lobby.
 *
 * This is the highest-consequence decision in the Attendance program, so the
 * tests are written as the failures they prevent: a sibling's authority leaking
 * onto another child, an unasked safeguarding question reading as a clear one,
 * and a shared screen explaining a court order to whoever is next in the queue.
 */

import { describe, expect, it } from "vitest";
import {
    KIOSK_CHECK_IN_ROLES,
    KIOSK_CHECK_OUT_ROLE,
    resolveKioskChildEligibility,
    resolveKioskEligibility,
    type KioskChildFacts,
} from "@/lib/childcareOperational/attendance/kiosk/kioskChildEligibility";
import type { SafeguardingRestriction } from "@/lib/safeguarding/safeguardingRestriction";

const TODAY = "2026-09-18";
const ADULT = "person-adult";
const OTHER = "person-other";

function restriction(over: Partial<SafeguardingRestriction> = {}): SafeguardingRestriction {
    return {
        id: "r1",
        affected_person_id: ADULT,
        operational_effect: "may_not_pick_up",
        status: "active",
        review_state: "approved",
        effective_from: null,
        effective_to: null,
        ...over,
    } as SafeguardingRestriction;
}

function child(over: Partial<KioskChildFacts> = {}): KioskChildFacts {
    return {
        childId: "child-1",
        activeRoleKeys: ["parent", "authorized_pickup"],
        restrictions: [],
        safeguardingScreened: true,
        ...over,
    };
}

const checkOut = (facts: KioskChildFacts, personId: string | null = ADULT) =>
    resolveKioskChildEligibility({ operation: "check_out", personId, facts, onDate: TODAY });
const checkIn = (facts: KioskChildFacts, personId: string | null = ADULT) =>
    resolveKioskChildEligibility({ operation: "check_in", personId, facts, onDate: TODAY });

describe("checkout — every gate the Director named, each on its own", () => {
    it("allows an authorized pickup with screening established and nothing in force", () => {
        const d = checkOut(child());
        expect(d.allowed).toBe(true);
        expect(d.pickupState).toBe("authorized");
    });

    it("denies when a restriction bars this person", () => {
        const d = checkOut(child({ restrictions: [restriction()] }));
        expect(d.allowed).toBe(false);
        expect(d.pickupState).toBe("restricted");
    });

    it("denies when safeguarding was never screened, even with the pickup role", () => {
        // The whole reason the screening record exists: "no restriction on file"
        // must not mean both "we asked and there is nothing" and "nobody asked".
        const d = checkOut(child({ safeguardingScreened: false }));
        expect(d.allowed).toBe(false);
        expect(d.pickupState).toBe("unknown");
    });

    it("denies when the adult resolves to no canonical person", () => {
        // Without a person there is nothing to evaluate restrictions against, and
        // "we could not check" must never read as "nothing found".
        const d = checkOut(child(), null);
        expect(d.allowed).toBe(false);
        expect(d.internalReason).toContain("could not be resolved");
    });

    it("denies a parent who does not hold the pickup role", () => {
        // Deliberate: the vocabulary names authorized_pickup separately, so
        // reading `parent` as collection authority would invent a permission the
        // family never granted. A narrower checkout population is the accepted cost.
        const d = checkOut(child({ activeRoleKeys: ["parent", "guardian"] }));
        expect(d.allowed).toBe(false);
        expect(d.pickupState).toBe("unknown");
    });

    it("ignores a restriction that names somebody else", () => {
        const d = checkOut(child({ restrictions: [restriction({ affected_person_id: OTHER })] }));
        expect(d.allowed).toBe(true);
    });

    it("denies while a restriction naming nobody is in force", () => {
        const d = checkOut(child({ restrictions: [restriction({ affected_person_id: null })] }));
        expect(d.allowed).toBe(false);
        expect(d.pickupState).toBe("unknown");
    });
});

describe("check-in is a different question, and deliberately so", () => {
    it("admits a parent with no pickup role", () => {
        expect(checkIn(child({ activeRoleKeys: ["parent"] })).allowed).toBe(true);
    });

    it("admits a guardian, and an authorized pickup", () => {
        for (const role of KIOSK_CHECK_IN_ROLES) {
            expect(checkIn(child({ activeRoleKeys: [role] })).allowed, `role ${role}`).toBe(true);
        }
    });

    it("does NOT require safeguarding screening", () => {
        // A child arriving into care is not a release. Demanding screening here
        // would turn an unasked administrative question into a locked front door.
        expect(checkIn(child({ activeRoleKeys: ["parent"], safeguardingScreened: false })).allowed).toBe(true);
    });

    it("refuses somebody with no relationship to this child at all", () => {
        expect(checkIn(child({ activeRoleKeys: [] })).allowed).toBe(false);
    });

    it("refuses an emergency contact — not a routine drop-off relationship", () => {
        expect(checkIn(child({ activeRoleKeys: ["emergency_contact"] })).allowed).toBe(false);
    });

    it("still refuses a person we can see is restricted", () => {
        const d = checkIn(child({ activeRoleKeys: ["parent"], restrictions: [restriction()] }));
        expect(d.allowed).toBe(false);
    });

    it("refuses a restricted person for contact restrictions too", () => {
        const d = checkIn(
            child({ activeRoleKeys: ["parent"], restrictions: [restriction({ operational_effect: "contact_restricted" })] }),
        );
        expect(d.allowed).toBe(false);
    });
});

describe("SIBLINGS — authority never leaks between children", () => {
    const emma = child({ childId: "emma", activeRoleKeys: ["parent", "authorized_pickup"] });
    const finn = child({ childId: "finn", activeRoleKeys: ["household_contact"] });

    it("resolves each child independently, mixed in one interaction", () => {
        const rows = resolveKioskEligibility({
            operation: "check_out",
            personId: ADULT,
            children: [emma, finn],
            onDate: TODAY,
        });
        expect(rows.map((r) => [r.childId, r.allowed])).toEqual([
            ["emma", true],
            ["finn", false],
        ]);
    });

    it("does not let a restriction on one child deny the other", () => {
        const restrictedEmma = child({ childId: "emma", restrictions: [restriction()] });
        const clearFinn = child({ childId: "finn" });
        const rows = resolveKioskEligibility({
            operation: "check_out",
            personId: ADULT,
            children: [restrictedEmma, clearFinn],
            onDate: TODAY,
        });
        expect(rows.map((r) => r.allowed)).toEqual([false, true]);
    });

    it("does not let an unscreened sibling deny a screened one", () => {
        const rows = resolveKioskEligibility({
            operation: "check_out",
            personId: ADULT,
            children: [child({ childId: "a", safeguardingScreened: false }), child({ childId: "b" })],
            onDate: TODAY,
        });
        expect(rows.map((r) => r.allowed)).toEqual([false, true]);
    });

    it("evaluates one child per input row and invents none", () => {
        const rows = resolveKioskEligibility({ operation: "check_in", personId: ADULT, children: [emma, finn], onDate: TODAY });
        expect(rows).toHaveLength(2);
        expect(new Set(rows.map((r) => r.childId))).toEqual(new Set(["emma", "finn"]));
    });
});

describe("a shared screen is told nothing sensitive", () => {
    const SENSITIVE = [
        "restriction",
        "safeguarding",
        "court",
        "order",
        "custody",
        "restrain",
        "pick up",
        "authorized",
        "screen",
    ];

    it("says only 'see a member of staff' for every denial there is", () => {
        const denials = [
            checkOut(child({ restrictions: [restriction()] })),
            checkOut(child({ safeguardingScreened: false })),
            checkOut(child(), null),
            checkOut(child({ activeRoleKeys: ["parent"] })),
            checkOut(child({ restrictions: [restriction({ affected_person_id: null })] })),
            checkIn(child({ activeRoleKeys: [] })),
            checkIn(child({ activeRoleKeys: ["parent"], restrictions: [restriction()] })),
        ];
        for (const d of denials) {
            expect(d.allowed).toBe(false);
            expect(d.publicReason).toBe("Please see a member of staff.");
            for (const word of SENSITIVE) {
                expect(d.publicReason.toLowerCase(), `leaked "${word}"`).not.toContain(word);
            }
        }
    });

    it("keeps the real reason for the audit trail, where it belongs", () => {
        // The distinction is the point: denials must be explicable afterwards to
        // an operator, and inexplicable at the tablet.
        const d = checkOut(child({ restrictions: [restriction()] }));
        expect(d.internalReason.length).toBeGreaterThan(0);
        expect(d.internalReason).not.toBe(d.publicReason);
    });

    it("says nothing at all when it allows", () => {
        expect(checkOut(child()).publicReason).toBe("");
    });
});

describe("the vocabulary is pinned", () => {
    it("keeps checkout on the role the org catalog actually names", () => {
        expect(KIOSK_CHECK_OUT_ROLE).toBe("authorized_pickup");
        expect(KIOSK_CHECK_IN_ROLES).toContain("authorized_pickup");
        // Widening check-in is a product decision; this makes it a visible one.
        expect([...KIOSK_CHECK_IN_ROLES].sort()).toEqual(["authorized_pickup", "guardian", "parent"]);
    });
});
