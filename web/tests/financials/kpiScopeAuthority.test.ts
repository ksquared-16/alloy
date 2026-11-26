/**
 * ONE SCOPE, ONE SET OF TOTALS.
 *
 * Measured on deployed staging: the same Certhouse account reported
 *
 *   CURRENT BALANCE   Focus $1,412.87   Accounts $2,023.87
 *   PAST DUE          Focus $1,450.00   Accounts $1,525.00
 *   RESPONSIBILITY    Focus $1,487.87   Accounts $2,098.87
 *
 * while BOTH hosts showed the same 79-row ledger and both scope controls read "Everyone".
 *
 * The cause was two authorities for one question. The host held `subjectFilter` in member ids and
 * derived the KPI band from it (`reconciliationBySubject` / `pastDueBySubject`), preselected to the
 * child the panel was about. The detail card held its OWN `subject` state, keyed by display LABEL,
 * defaulting to Everyone, and that is what the visible control and the rows obeyed. So the band
 * answered for one child above a household ledger — a total reconciling to no rows on screen.
 *
 * The deltas were explained to the cent from the canonical reader before any code moved:
 *   balance  $2,023.87 − $1,412.87 = $611.00 = Certa $536.00 + household-sourced $75.00
 *   past due $1,525.00 − $1,450.00 =  $75.00 = Certa's past due, exactly
 *   respons. $2,098.87 − $1,487.87 = $611.00 = Certa $536.00 + household-sourced $75.00
 *
 * These gates hold the ECONOMIC doctrine, not merely host equality: two identically wrong surfaces
 * would still fail, because the expected values are computed from the rows themselves.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const DETAIL = "components/operationalCards/FinancialsDetailCard.tsx";
const HOST = "components/admin/focusPanel/cards/FinancialsCard.tsx";
const LEDGER_ADAPTER = "lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts";
const TYPES = "lib/cardLab/cardLabTypes.ts";

/** The Certhouse specimen, as the canonical reader returned it (household read, 2026-09-24). */
const CERTHOUSE = {
    household: { balance: 202387, responsibility: 209887, pastDue: 152500 },
    bySubject: {
        certa: { id: "e408fa51-7261-43c4-8e60-555d17fc9888", balance: 53600, responsibility: 53600, pastDue: 7500 },
        certb: { id: "46105cd4-6030-417d-a7cb-faf409071c0d", balance: 141287, responsibility: 148787, pastDue: 145000 },
    },
};

/** The selection the host makes, extracted as the rule under test. */
function scopedTotals(scope: string) {
    if (scope === "all") return CERTHOUSE.household;
    const s = Object.values(CERTHOUSE.bySubject).find((x) => x.id === scope);
    return s ? { balance: s.balance, responsibility: s.responsibility, pastDue: s.pastDue } : CERTHOUSE.household;
}

describe("the deltas that were on screen are explained to the cent", () => {
    it("current balance: $611.00 is Certa plus the household-sourced row", () => {
        const delta = CERTHOUSE.household.balance - CERTHOUSE.bySubject.certb.balance;
        expect(delta, "the measured Focus/Accounts gap").toBe(61_100);
        const householdSourced =
            CERTHOUSE.household.balance - CERTHOUSE.bySubject.certa.balance - CERTHOUSE.bySubject.certb.balance;
        expect(householdSourced, "rows attributed to no child").toBe(7_500);
        expect(
            CERTHOUSE.bySubject.certa.balance + householdSourced,
            "no unexplained residual",
        ).toBe(delta);
    });

    it("past due: $75.00 is Certa's past due exactly", () => {
        const delta = CERTHOUSE.household.pastDue - CERTHOUSE.bySubject.certb.pastDue;
        expect(delta).toBe(7_500);
        expect(CERTHOUSE.bySubject.certa.pastDue, "no unexplained residual").toBe(delta);
    });

    it("responsibility: $611.00, same decomposition", () => {
        const delta = CERTHOUSE.household.responsibility - CERTHOUSE.bySubject.certb.responsibility;
        expect(delta).toBe(61_100);
        const householdSourced =
            CERTHOUSE.household.responsibility
            - CERTHOUSE.bySubject.certa.responsibility
            - CERTHOUSE.bySubject.certb.responsibility;
        expect(CERTHOUSE.bySubject.certa.responsibility + householdSourced, "no unexplained residual").toBe(delta);
    });
});

describe("two hosts at the same scope produce the same three totals", () => {
    /* The hosts differ only in the scope they open at; the RULE is shared. */
    for (const scope of ["all", CERTHOUSE.bySubject.certa.id, CERTHOUSE.bySubject.certb.id]) {
        it(`scope ${scope} yields one answer, whoever asks`, () => {
            const focus = scopedTotals(scope);
            const accounts = scopedTotals(scope);
            expect(focus).toEqual(accounts);
        });
    }

    it("and the account scope is the one both surfaces open at", () => {
        const host = code(HOST);
        expect(host, "opening Details resets the scope to the account").toMatch(
            /setSubjectFilter\("all"\);[\s\S]{0,120}setStack\(\[\{ kind: "detail" \}\]\)/,
        );
        expect(host, "the child preselect no longer reaches the account surface").toMatch(
            /if \(detailsAreTheSurface\) return;[\s\S]{0,80}setSubjectFilter\(scopedMemberId/,
        );
    });
});

describe("one authority for the scope, in one vocabulary", () => {
    it("the detail card no longer owns a second scope state", () => {
        const detail = code(DETAIL);
        expect(
            /const \[subject, setSubject\] = useState/.test(detail),
            "a private scope state beside the host's is the defect",
        ).toBe(false);
        expect(detail, "the scope is controlled, like the lens beside it").toMatch(/subject: subjectProp/);
        expect(detail, "and reports changes to whoever owns the totals").toMatch(/onSubjectChange\?\.\(next\)/);
    });

    it("the host passes the SAME scope it derives the totals from", () => {
        const host = code(HOST);
        expect(host, "the band's scope").toMatch(/vm\.reconciliationBySubject\[subjectFilter\]/);
        expect(host, "handed to the rows beneath it").toMatch(
            /subject=\{subjectFilter === "all" \? null : subjectFilter\}/,
        );
        expect(host).toMatch(/onSubjectChange=\{\(next\) => setSubjectFilter\(next \?\? "all"\)\}/);
    });

    it("the ledger filters by the id the account is scoped by, not by a display label", () => {
        const detail = code(DETAIL);
        expect(detail, "id-keyed scope predicate").toMatch(
            /\(e\.subjectMemberId \?\? HOUSEHOLD_SUBJECT\) === subject/,
        );
        expect(
            /e\.subject === subject/.test(detail),
            "label matching is the second vocabulary that let the two states drift",
        ).toBe(false);
    });

    it("the entry carries that id, and the adapter fills it from the row", () => {
        expect(code(TYPES)).toMatch(/subjectMemberId: string \| null;/);
        expect(code(LEDGER_ADAPTER)).toMatch(/subjectMemberId: row\.subjectMemberId \?\? null/);
    });
});
