/**
 * THE ACCOUNTS QUEUE — narrowing, and the selection that follows from it.
 *
 * Two things are locked here and they are not the same kind of claim.
 *
 * The first is BEHAVIOURAL and pure: given rows and a filter, which rows survive, and given rows
 * and a choice, which account is open. Those are the four selection rules and the three controls,
 * asserted directly against the functions rather than through a mounted surface.
 *
 * The second is a FINANCIAL invariant, and it is the reason this module is allowed to exist at all:
 * a queue filter decides which households are LISTED and can never change what any of them owes.
 * The lock plants the strongest form of the defect it can — filter, then compare every figure on
 * every surviving row against the row it came from — because the failure mode is silent. A filter
 * that quietly recomputed a balance would look like a working filter.
 */

import { describe, expect, it } from "vitest";

import {
    NO_ACCOUNT_FILTER,
    filterAccounts,
    isAccountFilterActive,
    programDivides,
    programOptions,
    resolveAccountSelection,
    roomDivides,
    roomOptions,
    searchableNames,
} from "@/lib/financials/workspace/accountQueue";
import type { AccountRow } from "@/lib/financials/workspace/accountsRail";

const TODDLER = { id: "prog-toddler", label: "Toddler" };
const PRESCHOOL = { id: "prog-preschool", label: "Preschool" };
const SUNFLOWER = { id: "room-sunflower", label: "Sunflower Room" };
const BLUEBELL = { id: "room-bluebell", label: "Bluebell Room" };

function row(over: Partial<AccountRow> & { customerId: string }): AccountRow {
    return {
        /*
         * These rows are all POSITION-ANSWERED: their zeros are real zeros, which is what every
         * assertion in this file is about. A row whose money is merely unknown is a different
         * thing and is gated in accountsProgressivePosition.
         */
        financialTruth: "known",
        householdName: "Household",
        currencyCode: "USD",
        outstandingCents: 0,
        collectibleCents: 0,
        suppressionCents: 0,
        varianceCents: 0,
        charges: 0,
        hasOrgScoped: false,
        noActivity: false,
        hasEnrollmentAgreement: true,
        childNames: [],
        contactNames: [],
        programs: [],
        rooms: [],
        ...over,
    };
}

const ALVAREZ = row({
    customerId: "c-alvarez",
    householdName: "Alvarez Household (demo)",
    childNames: ["Ana Alvarez"],
    contactNames: ["Dana Alvarez"],
    programs: [TODDLER],
    rooms: [SUNFLOWER],
    noActivity: true,
});
const CERTHOUSE = row({
    customerId: "c-certhouse",
    householdName: "Certhouse Family",
    childNames: ["Certa Certhouse", "Certb Certhouse"],
    contactNames: ["Rosa Certhouse"],
    programs: [PRESCHOOL],
    rooms: [BLUEBELL],
    outstandingCents: 32482,
    collectibleCents: 32500,
    charges: 47,
});
const KURZMAN = row({
    customerId: "c-kurzman",
    householdName: "Kurzman Family",
    childNames: ["Kit Kurzman"],
    contactNames: [],
    programs: [PRESCHOOL],
    rooms: [SUNFLOWER],
    outstandingCents: 7500,
    collectibleCents: 7500,
    charges: 3,
});
const ROWS = [CERTHOUSE, KURZMAN, ALVAREZ];

describe("search reaches the names an operator actually types", () => {
    it("matches the household's own name", () => {
        expect(filterAccounts(ROWS, { ...NO_ACCOUNT_FILTER, search: "kurz" }).map((r) => r.customerId))
            .toEqual(["c-kurzman"]);
    });

    it("matches a CHILD's name, which is how families are usually looked up", () => {
        expect(filterAccounts(ROWS, { ...NO_ACCOUNT_FILTER, search: "Ana" }).map((r) => r.customerId))
            .toEqual(["c-alvarez"]);
    });

    it("matches a responsible adult", () => {
        expect(filterAccounts(ROWS, { ...NO_ACCOUNT_FILTER, search: "Rosa" }).map((r) => r.customerId))
            .toEqual(["c-certhouse"]);
    });

    it("is case-insensitive and matches inside a name, not only at its start", () => {
        expect(filterAccounts(ROWS, { ...NO_ACCOUNT_FILTER, search: "CERTHOUSE" }).length).toBe(1);
        expect(filterAccounts(ROWS, { ...NO_ACCOUNT_FILTER, search: "ousehold" }).map((r) => r.customerId))
            .toEqual(["c-alvarez"]);
    });

    it("searches the three canonical name sources and nothing else", () => {
        expect(searchableNames(CERTHOUSE)).toEqual([
            "Certhouse Family",
            "Certa Certhouse",
            "Certb Certhouse",
            "Rosa Certhouse",
        ]);
    });

    it("an empty search narrows nothing", () => {
        expect(filterAccounts(ROWS, NO_ACCOUNT_FILTER).length).toBe(ROWS.length);
        expect(isAccountFilterActive(NO_ACCOUNT_FILTER)).toBe(false);
        expect(isAccountFilterActive({ ...NO_ACCOUNT_FILTER, search: " " })).toBe(false);
        expect(isAccountFilterActive({ ...NO_ACCOUNT_FILTER, roomId: SUNFLOWER.id })).toBe(true);
    });
});

describe("program and room narrow by the canonical current placement", () => {
    it("filters by program", () => {
        expect(filterAccounts(ROWS, { ...NO_ACCOUNT_FILTER, programId: PRESCHOOL.id }).map((r) => r.customerId))
            .toEqual(["c-certhouse", "c-kurzman"]);
    });

    it("filters by room", () => {
        expect(filterAccounts(ROWS, { ...NO_ACCOUNT_FILTER, roomId: SUNFLOWER.id }).map((r) => r.customerId))
            .toEqual(["c-kurzman", "c-alvarez"]);
    });

    it("composes with search and with each other", () => {
        expect(
            filterAccounts(ROWS, { search: "a", programId: PRESCHOOL.id, roomId: SUNFLOWER.id, state: null })
                .map((r) => r.customerId),
        ).toEqual(["c-kurzman"]);
    });

    it("offers a facet when choosing it would narrow, not merely when it has two values", () => {
        /*
         * The lens bar's rule — "more than one distinct value" — was wrong here and hid a working
         * control. A centre with ONE classroom still has families in it and families outside it.
         */
        const oneRoom = [KURZMAN, ALVAREZ, row({ customerId: "c-noroom", householdName: "No Room" })];
        const options = roomOptions(oneRoom);
        expect(options).toEqual([SUNFLOWER]);
        expect(roomDivides(oneRoom, options), "one room still separates who is in it").toBe(true);
        expect(
            filterAccounts(oneRoom, { ...NO_ACCOUNT_FILTER, roomId: SUNFLOWER.id }).map((r) => r.customerId),
            "and choosing it narrows the queue",
        ).toEqual(["c-kurzman", "c-alvarez"]);

        /* One option that EVERY row carries excludes nothing, and is offered as nothing. */
        const allSame = [KURZMAN, ALVAREZ];
        expect(roomDivides(allSame, roomOptions(allSame))).toBe(false);
        expect(roomDivides([], [])).toBe(false);
        expect(programDivides(ROWS, programOptions(ROWS))).toBe(true);
    });

    it("offers only the facets present in the cohort, each with its configured label", () => {
        expect(programOptions(ROWS)).toEqual([PRESCHOOL, TODDLER]);
        expect(roomOptions(ROWS)).toEqual([BLUEBELL, SUNFLOWER]);
        /* A household the subject read did not reach carries no facets and offers none. */
        expect(programOptions([row({ customerId: "c-bare" })])).toEqual([]);
    });
});

describe("a queue filter never changes what a household owes", () => {
    /*
     * THE INVARIANT THIS MODULE EXISTS TO PROTECT. Every figure on a surviving row must be the
     * same object's figure, unchanged — not merely equal by luck on one field.
     */
    it("returns the very same rows, with every financial figure untouched", () => {
        for (const filter of [
            { ...NO_ACCOUNT_FILTER, search: "cert" },
            { ...NO_ACCOUNT_FILTER, programId: PRESCHOOL.id },
            { ...NO_ACCOUNT_FILTER, roomId: SUNFLOWER.id },
            { search: "a", programId: PRESCHOOL.id, roomId: SUNFLOWER.id, state: null },
        ]) {
            for (const survivor of filterAccounts(ROWS, filter)) {
                const original = ROWS.find((r) => r.customerId === survivor.customerId)!;
                expect(survivor, `${survivor.customerId} was rebuilt rather than passed through`).toBe(original);
                expect(survivor.outstandingCents).toBe(original.outstandingCents);
                expect(survivor.collectibleCents).toBe(original.collectibleCents);
                expect(survivor.suppressionCents).toBe(original.suppressionCents);
                expect(survivor.varianceCents).toBe(original.varianceCents);
                expect(survivor.charges).toBe(original.charges);
            }
        }
    });

    it("narrowing cannot add a household the cohort did not contain", () => {
        for (const filter of [
            { ...NO_ACCOUNT_FILTER, search: "" },
            { ...NO_ACCOUNT_FILTER, search: "zzz" },
            { ...NO_ACCOUNT_FILTER, programId: "prog-nonexistent" },
        ]) {
            const out = filterAccounts(ROWS, filter);
            expect(out.length).toBeLessThanOrEqual(ROWS.length);
            for (const r of out) expect(ROWS).toContain(r);
        }
    });
});

describe("the workspace opens on an account", () => {
    it("selects the first account when nothing is chosen", () => {
        expect(resolveAccountSelection(ROWS, null)).toBe("c-certhouse");
    });

    it("keeps an explicit choice that is still in the cohort", () => {
        expect(resolveAccountSelection(ROWS, "c-alvarez")).toBe("c-alvarez");
    });

    it("follows the cohort when the choice is narrowed away", () => {
        const narrowed = filterAccounts(ROWS, { ...NO_ACCOUNT_FILTER, programId: PRESCHOOL.id });
        expect(resolveAccountSelection(narrowed, "c-alvarez")).toBe("c-certhouse");
    });

    it("selects nothing over an empty cohort rather than fabricating one", () => {
        expect(resolveAccountSelection([], null)).toBeNull();
        expect(resolveAccountSelection([], "c-certhouse")).toBeNull();
    });

    it("is stable: re-resolving its own answer changes nothing", () => {
        const first = resolveAccountSelection(ROWS, null);
        expect(resolveAccountSelection(ROWS, first)).toBe(first);
    });
});
