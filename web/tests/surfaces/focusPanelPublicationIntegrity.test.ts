/**
 * A PUBLISHED DOCUMENT MAY NOT CONTRADICT ITSELF.
 *
 * ── THE DEFECT, PLANTED VERBATIM ──────────────────────────────────────────────────────────────
 *
 * This tenant's v160 Focus Panel Summary carried `billing_preview` in `doc.sections` with
 * `visibility: "visible"`, and a `doc.metadata.focusPanelLayout` whose `grid.areas` named six other
 * cards and not that one. It published with a 200. The runtime renders the metadata layout, so the
 * panel drew six cards; every surface an investigator could read said the card was placed. Seven
 * hypotheses were eliminated before the two lists were compared against each other.
 *
 * The plant below IS that document — the real six areas, at their real coordinates, beside a real
 * visible section. What must not happen again is that it publishes.
 *
 * ── WHY THE ASSERTIONS ARE SHAPED THIS WAY ────────────────────────────────────────────────────
 *
 * The first thing proven is that the plant passes `parseLayoutDoc`, because that is the whole
 * problem: every validator the publication already ran said yes. A test that only exercised the new
 * pure function would prove the rule and not its REACH, so the route handler itself is driven, with
 * `publishLayout` mocked — and the assertion that matters most is that it was never called.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getAdminContext = vi.fn();
const getLayoutById = vi.fn();
const publishLayout = vi.fn();

vi.mock("@/lib/admin/getAdminContext", () => ({ getAdminContext: () => getAdminContext() }));
vi.mock("@/lib/access/configurationAuthority", () => ({
    LAYOUTS_LIFECYCLE: "layouts_lifecycle",
    requireConfigurationCapability: () => null,
}));
vi.mock("@/lib/adminAuth", () => ({ logAdminAudit: () => undefined }));
vi.mock("@/lib/layout/featureFlag", () => ({ isLayoutV2ConfigEnabledServer: () => true }));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/layout/entityLayoutsRepo", () => ({
    getLayoutById: (_c: unknown, id: string) => getLayoutById(id),
    publishLayout: (_c: unknown, id: string) => publishLayout(id),
}));
vi.mock("@/lib/adminV2/runtime/focusPanel/focusPanelSummaryConfigInvalidation", () => ({
    invalidateFocusPanelSummaryConfigRead: () => undefined,
}));

import { POST as publishRoute } from "@/app/api/admin/entity-layouts/[id]/publish/route";
import {
    focusPanelPublicationIntegrityIssues,
    validateFocusPanelPublicationIntegrity,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublicationIntegrity";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

/** The six areas v160 actually published, at their actual coordinates. */
const V160_AREAS = [
    { card: "business_process", colStart: 1, rowStart: 1, colSpan: 8, rowSpan: 2 },
    { card: "financials", colStart: 9, rowStart: 2, colSpan: 4, rowSpan: 1 },
    { card: "children", colStart: 1, rowStart: 3, colSpan: 6, rowSpan: 1 },
    { card: "household", colStart: 7, rowStart: 4, colSpan: 6, rowSpan: 4 },
    { card: "attendance", colStart: 7, rowStart: 8, colSpan: 6, rowSpan: 2 },
    { card: "health_safety", colStart: 1, rowStart: 6, colSpan: 6, rowSpan: 2 },
];

const section = (key: string, gridRow: number, visibility?: string) => ({
    id: `fp-card-${key.replace(/_/g, "-")}`,
    key,
    title: key,
    rows: [],
    metadata: {
        focusPanelCard: {
            key,
            instanceId: key,
            span: 2,
            density: "standard",
            tier: "work",
            gridRow,
            ...(visibility ? { visibility } : {}),
        },
    },
});

/**
 * @param extra    sections beyond the six the layout places
 * @param areas    the explicit layout's areas (defaults to exactly v160's six)
 */
const doc = (extra: ReturnType<typeof section>[] = [], areas = V160_AREAS): LayoutDoc =>
    ({
        formatVersion: 1,
        surface: "drawer",
        entityType: "opportunities",
        sections: [...V160_AREAS.map((a, i) => section(a.card, i)), ...extra],
        metadata: {
            layoutKey: "focus_panel_summary",
            focusPanelMode: "summary",
            focusPanelLayout: {
                grid: { columns: 12, areas },
                rows: areas.map((a) => ({ cells: [{ width: "full", cards: [a.card] }] })),
            },
        },
    }) as unknown as LayoutDoc;

const BILLING_PREVIEW_AREA = { card: "billing_preview", colStart: 1, rowStart: 8, colSpan: 6, rowSpan: 2 };

/** v160 verbatim: authored visible, placed nowhere. */
const PLANTED = doc([section("billing_preview", 6, "visible")]);
/** v161: the same document with the card placed in the layout the runtime reads. */
const REPAIRED = doc([section("billing_preview", 6, "visible")], [...V160_AREAS, BILLING_PREVIEW_AREA]);

describe("THE GATE — the plant is a document every existing validator accepts", () => {
    /*
     * THIS IS THE WHOLE DEFECT. If the plant failed structural validation the bug would have been
     * caught in 2026 and there would be nothing to lock.
     */
    it("passes parseLayoutDoc, which is what let it publish", () => {
        const parsed = parseLayoutDoc(PLANTED, { inferSurfaceKey: true });
        expect(parsed.ok, parsed.errors.join("; ")).toBe(true);
        expect(parsed.doc?.metadata?.focusPanelLayout, "metadata survives the parse verbatim").toBeTruthy();
    });
});

describe("THE GATE — the two card lists are compared", () => {
    it("refuses a card authored visible that the published layout does not place", () => {
        const issues = focusPanelPublicationIntegrityIssues(PLANTED);
        expect(issues.map((i) => i.card)).toEqual(["billing_preview"]);
        expect(issues[0]!.code).toBe("visible_card_not_placed");
        expect(issues[0]!.message, "the message names the repair, not just the fault")
            .toMatch(/Place the card in the layout/);
    });

    it("accepts the same document once the layout places the card", () => {
        expect(validateFocusPanelPublicationIntegrity(REPAIRED)).toEqual({ ok: true, errors: [] });
    });

    /*
     * NOT A BILLING-PREVIEW RULE. The card that regressed is protected no more than any other, and
     * a card added to the catalog next year is protected without touching the validator.
     */
    it("protects every card equally, naming none of them", () => {
        for (const card of ["household", "attendance", "children", "financials"]) {
            const without = doc([], V160_AREAS.filter((a) => a.card !== card));
            expect(validateFocusPanelPublicationIntegrity(without).ok, `${card} unplaced`).toBe(false);
        }
    });

    /*
     * THE OTHER DIRECTION OF THE SAME DISAGREEMENT: a layout placing a card the document does not
     * author renders a card with no configuration, because the visibility filter defaults an
     * unknown key to visible.
     */
    it("refuses a layout that places a card the document does not author", () => {
        const issues = focusPanelPublicationIntegrityIssues(doc([], [...V160_AREAS, BILLING_PREVIEW_AREA]));
        expect(issues.map((i) => i.code)).toEqual(["placed_card_not_authored"]);
    });
});

describe("THE GATE — what it deliberately does not refuse", () => {
    it("says nothing about a document with no explicit layout — there is only one list", () => {
        const auto = { ...doc([section("billing_preview", 6, "visible")]) } as LayoutDoc;
        auto.metadata = { layoutKey: "focus_panel_summary", focusPanelMode: "summary" };
        expect(validateFocusPanelPublicationIntegrity(auto).ok).toBe(true);
    });

    it("says nothing about a Linked or Hidden card, which is not claimed to be on the panel", () => {
        for (const v of ["linked", "hidden"]) {
            expect(validateFocusPanelPublicationIntegrity(doc([section("scheduling", 6, v)])).ok, v).toBe(true);
        }
    });

    /*
     * `milestones` requires a fact provider and none is registered, so the runtime treats it as
     * hidden. Reporting it as a publication defect would turn an awaited capability into an error
     * an operator cannot clear.
     */
    it("says nothing about a provider-unavailable card the runtime already excludes", () => {
        expect(validateFocusPanelPublicationIntegrity(doc([section("milestones", 6, "visible")])).ok).toBe(true);
    });

    it("ignores documents that are not Focus Panel Summary docs", () => {
        const other = doc([section("billing_preview", 6, "visible")]);
        (other as { metadata?: Record<string, unknown> }).metadata = { layoutKey: "something_else" };
        expect(validateFocusPanelPublicationIntegrity(other).ok).toBe(true);
    });
});

describe("THE GATE — the publication authority actually refuses", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getAdminContext.mockResolvedValue({ ok: true, orgId: "org-1", userId: "u-1", role: "admin", status: 200 });
    });

    const call = async (id: string) =>
        publishRoute(new Request("http://local/publish", { method: "POST" }) as never, {
            params: Promise.resolve({ id }),
        });

    it("returns 400 and does not publish the contradictory document", async () => {
        getLayoutById.mockResolvedValue({ id: "L", orgId: "org-1", status: "draft", doc: PLANTED });
        const res = await call("L");
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string; details: string[] };
        expect(body.error).toBe("Cannot publish a self-contradictory layout");
        expect(body.details.join(" ")).toContain("billing_preview");
        expect(publishLayout, "the record was never written").not.toHaveBeenCalled();
    });

    it("publishes the repaired document", async () => {
        getLayoutById.mockResolvedValue({ id: "L", orgId: "org-1", status: "draft", doc: REPAIRED });
        publishLayout.mockResolvedValue({ id: "L", version: 161 });
        const res = await call("L");
        expect(res.status).toBe(200);
        expect(publishLayout).toHaveBeenCalledWith("L");
    });
});
