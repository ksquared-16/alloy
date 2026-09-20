/**
 * MANAGE RESPONSIBILITY — configuring who owes, at either canonical grain.
 *
 * The filter and the gear answer two different questions on one row of controls: the Responsible
 * party dropdown shows the rows a person owes, the gear decides who owes. Folding configuration
 * into the filter would make selecting a name a money decision, so they stay separate controls.
 *
 * What these lock is the SHAPE of that separation and of the grain model — the effect-level
 * behaviour of specificity itself is locked in `arrangementGrainSpecificity`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const DETAIL = "app/adminV2/financials/FinancialsAccountWorkspaceDetail.tsx";
const PANEL = "app/adminV2/financials/FinancialsResponsibilityPanel.tsx";
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("the gear is a manage control, not a filter", () => {
    const detail = src(DETAIL);

    it("sits in the filter slot beside the responsible-party filter", () => {
        const slot = detail.slice(
            detail.indexOf('data-financials-filter-slot="true"'),
            detail.indexOf("THE SCROLL REGION BEGINS HERE"),
        );
        expect(slot).toContain('testId="responsible-party"');
        expect(slot).toContain('data-financials-manage-responsibility="gear"');
    });

    it("says what it does, because an icon shape is not a sentence", () => {
        expect(detail).toContain('aria-label="Manage responsibility"');
    });

    it("does not put configuration inside the filter dropdown", () => {
        const filter = detail.slice(detail.indexOf('testId="responsible-party"'));
        expect(filter.slice(0, 400), "the filter only sets the filter").not.toContain("setManageOpen");
    });

    it("opens a depth card in place rather than navigating", () => {
        expect(detail).toContain('data-financials-manage-responsibility="depth-card"');
        expect(strip(detail), "no route change").not.toMatch(/router\.push|<Link|window\.location\s*=/);
    });

    it("reuses the existing panel — there is no second one", () => {
        expect(detail).toContain('import FinancialsResponsibilityPanel from "@/app/adminV2/financials/FinancialsResponsibilityPanel"');
        expect(detail).not.toMatch(/ResponsibilityPanel2|ResponsibilityCard\b/);
    });
});

describe("dismissal returns to the same Details state", () => {
    const detail = src(DETAIL);

    it("re-reading the account does not reset the lens or the filters", () => {
        /*
         * The account-switch effect clears lens, subject, period and payer — correct when a
         * different family opens, and wrong after a command on the same one. The fetch is
         * separate so a commit re-reads without moving the operator.
         */
        const reload = detail.slice(detail.indexOf("const reload = useCallback"), detail.indexOf("useEffect(() => {", detail.indexOf("const reload = useCallback")));
        for (const reset of ["setLens(", "setSubject(", "setPeriodKey(", "setPayer("]) {
            expect(reload, `reload must not ${reset}`).not.toContain(reset);
        }
        expect(reload, "it does re-read").toContain("/api/admin/financials/card");
    });

    it("commits through reload, not through the account-switch path", () => {
        const commit = detail.slice(detail.indexOf("onCommitted={async"));
        expect(commit.slice(0, 300)).toContain("await reload()");
    });

    it("Escape dismisses the card and not the account", () => {
        /*
         * MEASURED before this lock: Escape closed the whole Financials surface — the workspace
         * modal listens for it, and a depth card that does not answer first hands its own
         * dismissal to its host. The operator lost the account, the lens, the filters and their
         * place in the ledger by closing a panel.
         */
        const detail = src(DETAIL);
        const card = detail.slice(detail.indexOf('data-financials-manage-responsibility="depth-card"'));
        const handler = card.slice(0, card.indexOf("<FinancialsResponsibilityPanel"));
        expect(handler).toContain('e.key !== "Escape"');
        expect(handler, "and it stops there").toContain("e.stopPropagation()");
        expect(handler).toContain("setManageOpen(false)");
        /* It can only receive the key if focus is inside it. */
        expect(src(PANEL)).toContain("tabIndex={-1}");
    });

    it("the depth card is rendered inside Details, above the activity", () => {
        expect(detail.indexOf('data-financials-manage-responsibility="depth-card"')).toBeLessThan(
            detail.indexOf("THE SCROLL REGION BEGINS HERE"),
        );
    });
});

describe("Applies to is explicit, and Household is a value", () => {
    const panel = src(PANEL);

    it("household is a named scope, never an empty selection", () => {
        expect(panel).toContain('export const HOUSEHOLD_SCOPE = "__household__"');
        const select = panel.slice(panel.indexOf('data-testid="responsibility-scope"'));
        expect(select.slice(0, 900), "no blank option that could mean the whole account").not.toMatch(
            /<option value=""/,
        );
    });

    it("lists the household's own children, from canonical membership", () => {
        expect(panel).toContain("memberOptions");
        const scopes = src("lib/financials/responsibility/readHouseholdScopes.ts");
        expect(scopes, "canonical membership").toContain('from("customer_members")');
        const detail = src(DETAIL);
        expect(detail, "not the ledger rows that happen to exist").toContain("/api/admin/financials/responsibility-scopes");
        const memberProp = detail.slice(detail.indexOf("memberOptions="));
        expect(memberProp.slice(0, 60)).toContain("scopeMembers");
        expect(memberProp.slice(0, 60), "subjects are derived from ledger rows").not.toContain("subjects");
    });

    it("the write uses the selected grain, not the charge in view", () => {
        expect(panel).toContain("arrangementMemberId: effectiveMemberId");
        const resolved = panel.slice(panel.indexOf("const effectiveMemberId"));
        expect(resolved.slice(0, 260)).toContain("HOUSEHOLD_SCOPE");
    });
});

describe("read-back distinguishes inherited from authored", () => {
    const panel = src(PANEL);

    it("re-reads when the scope changes", () => {
        const effect = panel.slice(panel.indexOf("CHANGING THE SCOPE IS CHANGING THE SUBJECT"));
        expect(effect).toContain("readScopeArrangement(customerId, effectiveMemberId)");
        expect(effect.slice(0, 1400), "the effect is keyed on the scope").toContain("effectiveMemberId]");
    });

    it("never presents the household's arrangement as child-authored", () => {
        expect(panel).toContain("authoredAtRequestedScope");
        expect(panel).toContain("No child-specific arrangement — household responsibility applies.");
        expect(panel).toContain("Overrides household responsibility.");
        expect(panel).toContain('data-financials-scope-arrangement');
    });

    it("says whether saving creates or supersedes", () => {
        expect(panel).toContain("Nothing governs this scope yet — saving creates the first arrangement.");
        expect(panel).toContain("saving supersedes it");
    });

    it("does not reimplement specificity in React", () => {
        const stripped = strip(panel);
        expect(stripped, "precedence is the route's answer").not.toMatch(
            /customerMemberId !== null\) - Number|sort\([\s\S]{0,80}specificity/,
        );
        const route = src("app/api/admin/financials/responsibility-arrangement/route.ts");
        expect(route, "which asks the one grain-aware reader").toContain("readAccountArrangement");
    });
});

describe("one writer, three intents", () => {
    it("saves through the registered configure action and nothing else", () => {
        const panel = src(PANEL);
        expect(panel).toContain('CONFIGURE_RESPONSIBILITY_ACTION_KEY = "billing.configure_responsibility"');
        expect(panel).toContain("/api/admin/actions/execute");
        expect(panel, "no direct table write").not.toMatch(/from\("financial_responsibility_/);
    });

    it("keeps resolve and reallocate out of the configure card", () => {
        /*
         * Asserted on the CODE, not the prose: the panel's header explains at length why the two
         * charge-grain siblings are deliberately absent, and a naive substring match fails on that
         * explanation — the same way an earlier lock in this thread failed on the comment "It is
         * NOT a deposit".
         */
        const panel = strip(src(PANEL));
        expect(panel).not.toContain("billing.resolve_responsibility");
        expect(panel).not.toContain("billing.reallocate_responsibility");
    });

    it("the reads are reads", () => {
        for (const r of [
            "app/api/admin/financials/responsibility-arrangement/route.ts",
            "app/api/admin/financials/responsibility-scopes/route.ts",
        ]) {
            const code = src(r);
            expect(code, `${r} is GET only`).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)/);
            expect(code, `${r} checks fin.read`).toContain("assertFinancialsReadAllowed");
        }
    });

    it("authors fixed shares only", () => {
        const panel = strip(src(PANEL));
        expect(panel, "SHARE_METHODS_PERCENTAGE_REMAINDER_DEFERRED").not.toMatch(/percent_basis_points|"percentage"|"remainder"/);
    });
});

describe("Assignment uses the same authority, and authors nothing by opening", () => {
    const card = src("components/admin/focusPanel/cards/SchedulingCard.tsx");

    it("mounts the same panel Financials Details mounts", () => {
        expect(card).toContain('import FinancialsResponsibilityPanel from "@/app/adminV2/financials/FinancialsResponsibilityPanel"');
        expect(card, "no assignment-owned responsibility record").not.toMatch(
            /financial_responsibility_|assignment_responsibility/,
        );
    });

    it("writes nothing because a panel opened", () => {
        const section = card.slice(card.indexOf('data-assignment-responsibility="section"'));
        const opened = section.slice(0, section.indexOf("</div>"));
        expect(opened, "opening is a read").not.toMatch(/mode: "execute"|configure_responsibility/);
        /* The household read is the only thing an open performs. */
        expect(card).toContain("responsibility-scopes?customer_member_id=");
    });

    it("defaults to this child, explicitly", () => {
        expect(card).toContain("defaultScopeMemberId={child.id}");
        const panel = src(PANEL);
        expect(panel).toContain("useState<string>(defaultScopeMemberId ?? HOUSEHOLD_SCOPE)");
    });

    it("still offers Household as an alternative", () => {
        expect(card).toContain("memberOptions={household.members}");
    });

    it("resolves the household in one place, not two", () => {
        /*
         * Assignment holds a child and no household id. Teaching the assignment surface to resolve
         * households would be a second place that has to be right about it, so the scopes route
         * accepts the member and answers from `customer_members` — the column
         * `resolveBillableSourceHouseholdId` already trusts for exactly this.
         */
        expect(card, "the card does not query households itself").not.toMatch(/from\("customer_members"\)/);
        const route = src("app/api/admin/financials/responsibility-scopes/route.ts");
        expect(route).toContain("customer_member_id");
        expect(route).toContain('from("customer_members")');
    });
});
