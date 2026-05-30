import { describe, expect, it, vi, beforeEach } from "vitest";
import { collectLinkedPersonIdsFromOpportunityRecord } from "@/lib/admin/drawer/collectLinkedPersonIdsFromOpportunityRecord";
import {
    buildInquiryChildPersonOpenSeed,
    resolveInquiryChildOpenPersonId,
} from "@/lib/admin/drawer/inquiryChildPersonOpen";
import { openInquiryChildPersonFromOpportunity } from "@/lib/admin/drawer/openInquiryChildPersonFromOpportunity";
import { openViewPersonFromOpportunity } from "@/lib/admin/drawer/openViewPersonFromOpportunity";
import {
    cachePersonDrawerChildOpenSeed,
    personDrawerSeedFromOpportunityRecord,
    stampChildLifecycleOpenContextOnPersonRecord,
} from "@/lib/admin/drawer/personDrawerOpenSeed";
import { personDrawerChildChromeActive } from "@/lib/admin/person/personDrawerChildChrome";
import {
    __clearDrawerEntitySnapshotCacheForTests,
    peekDrawerEntitySnapshot,
    putDrawerEntitySnapshot,
} from "@/lib/admin/drawerEntitySnapshotCache";

const SOPHIA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WRIGLEY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WRIGLEY_CM = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OPP_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PRIMARY_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const opportunityWithTwoChildren = {
    id: OPP_ID,
    primary_person_id: PRIMARY_ID,
    _inquiry_children: [
        {
            id: "ocm-sophia",
            customer_member_id: "cm-sophia",
            person_id: SOPHIA_ID,
            first_name: "Sophia",
            last_name: "Mitchell",
            dob: "2020-05-01",
            linked_on_inquiry: true,
        },
        {
            id: "ocm-wrigley",
            customer_member_id: WRIGLEY_CM,
            person_id: WRIGLEY_ID,
            first_name: "Wrigley",
            last_name: "Kurzman",
            dob: "2019-08-12",
            linked_on_inquiry: false,
        },
    ],
};

describe("collectLinkedPersonIdsFromOpportunityRecord — two-child parity", () => {
    it("includes both inquiry children with person_id", () => {
        const ids = collectLinkedPersonIdsFromOpportunityRecord(opportunityWithTwoChildren);
        expect(ids).toContain(SOPHIA_ID);
        expect(ids).toContain(WRIGLEY_ID);
    });

    it("resolves person_id from inquiry block when row omits person_id on click payload", () => {
        const ids = collectLinkedPersonIdsFromOpportunityRecord({
            _inquiry_children: [
                {
                    customer_member_id: WRIGLEY_CM,
                    person_id: null,
                },
                {
                    customer_member_id: WRIGLEY_CM,
                    person_id: WRIGLEY_ID,
                },
            ],
        });
        expect(ids).toEqual([WRIGLEY_ID]);
    });
});

describe("personDrawerSeedFromOpportunityRecord — inquiry child before primary", () => {
    it("prefers inquiry child seed when person is listed as inquiry child even if also primary", () => {
        const seed = personDrawerSeedFromOpportunityRecord(
            {
                primary_person_id: SOPHIA_ID,
                _primary_person_name: "Sophia Mitchell",
                _inquiry_children: [
                    {
                        person_id: SOPHIA_ID,
                        first_name: "Sophia",
                        last_name: "Mitchell",
                        dob: "2020-05-01",
                    },
                ],
            },
            SOPHIA_ID
        );
        expect(seed?.presentation_emphasis).toBe("child_lifecycle");
        expect(seed?.date_of_birth).toBe("2020-05-01");
    });

    it("builds child seed for Wrigley when only customer_member_id matches", () => {
        const seed = personDrawerSeedFromOpportunityRecord(opportunityWithTwoChildren, WRIGLEY_ID);
        expect(seed).toMatchObject({
            personId: WRIGLEY_ID,
            first_name: "Wrigley",
            last_name: "Kurzman",
            presentation_emphasis: "child_lifecycle",
        });
    });
});

describe("child open cache stamping", () => {
    beforeEach(() => {
        __clearDrawerEntitySnapshotCacheForTests();
    });

    it("stamps child lifecycle emphasis onto cached hydrated person rows", () => {
        putDrawerEntitySnapshot("persons", WRIGLEY_ID, {
            id: WRIGLEY_ID,
            first_name: "Wrigley",
            last_name: "Kurzman",
            _record_surface: "full",
        });
        const seed = buildInquiryChildPersonOpenSeed(
            opportunityWithTwoChildren,
            {
                person_id: WRIGLEY_ID,
                customer_member_id: WRIGLEY_CM,
                display_name: "Wrigley Kurzman",
            },
            WRIGLEY_ID
        );
        cachePersonDrawerChildOpenSeed(WRIGLEY_ID, seed);
        const cached = peekDrawerEntitySnapshot("persons", WRIGLEY_ID);
        expect(cached?._drawer_presentation_emphasis).toBe("child_lifecycle");
        expect(
            personDrawerChildChromeActive(cached as Record<string, unknown>, {
                open_source: "opportunity_inquiry_child",
            })
        ).toBe(true);
    });

    it("openViewPersonFromOpportunity stamps child seed even on cache hit", () => {
        putDrawerEntitySnapshot("persons", SOPHIA_ID, {
            id: SOPHIA_ID,
            first_name: "Sophia",
            last_name: "Mitchell",
        });
        const seed = buildInquiryChildPersonOpenSeed(
            opportunityWithTwoChildren,
            {
                person_id: SOPHIA_ID,
                customer_member_id: "cm-sophia",
                display_name: "Sophia Mitchell",
            },
            SOPHIA_ID
        );
        const opened: unknown[] = [];
        openViewPersonFromOpportunity({
            openDrawer: (params) => opened.push(params),
            personId: SOPHIA_ID,
            opportunityId: OPP_ID,
            source: "opportunity_inquiry_child",
            openSeed: seed,
        });
        expect(peekDrawerEntitySnapshot("persons", SOPHIA_ID)?._drawer_presentation_emphasis).toBe(
            "child_lifecycle"
        );
        expect(opened[0]).toMatchObject({ id: SOPHIA_ID, source: "opportunity_inquiry_child" });
    });
});

describe("resolveInquiryChildOpenPersonId", () => {
    it("falls back to opportunity inquiry row by customer_member_id", () => {
        expect(
            resolveInquiryChildOpenPersonId(opportunityWithTwoChildren, {
                person_id: null,
                customer_member_id: WRIGLEY_CM,
            })
        ).toBe(WRIGLEY_ID);
    });
});

describe("openInquiryChildPersonFromOpportunity", () => {
    beforeEach(() => {
        __clearDrawerEntitySnapshotCacheForTests();
        vi.restoreAllMocks();
    });

    it("fetches member person_id when inquiry row and click payload omit person_id", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ person_id: WRIGLEY_ID }), { status: 200 })
        );
        const opened: unknown[] = [];
        const ok = await openInquiryChildPersonFromOpportunity({
            openDrawer: (params) => opened.push(params),
            opportunityRecord: {
                _inquiry_children: [
                    {
                        customer_member_id: WRIGLEY_CM,
                        person_id: null,
                        first_name: "Wrigley",
                        last_name: "Kurzman",
                    },
                ],
            },
            opportunityId: OPP_ID,
            row: {
                person_id: null,
                customer_member_id: WRIGLEY_CM,
                display_name: "Wrigley Kurzman",
            },
        });
        expect(ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
            `/api/admin/customer-members/${WRIGLEY_CM}`,
            expect.objectContaining({ credentials: "include" })
        );
        expect(opened[0]).toMatchObject({ type: "persons", id: WRIGLEY_ID });
    });

    it("returns false for metadata-only synthetic rows", async () => {
        const ok = await openInquiryChildPersonFromOpportunity({
            openDrawer: () => {},
            opportunityRecord: opportunityWithTwoChildren,
            opportunityId: OPP_ID,
            row: {
                person_id: null,
                customer_member_id: "metadata_child:1:0",
                display_name: "Metadata Child",
            },
        });
        expect(ok).toBe(false);
    });
});

describe("stampChildLifecycleOpenContextOnPersonRecord", () => {
    it("does not overwrite existing DOB but adds emphasis", () => {
        const out = stampChildLifecycleOpenContextOnPersonRecord(
            { id: SOPHIA_ID, date_of_birth: "2020-05-01" },
            {
                personId: SOPHIA_ID,
                date_of_birth: "2019-01-01",
                presentation_emphasis: "child_lifecycle",
            }
        );
        expect(out.date_of_birth).toBe("2020-05-01");
        expect(out._drawer_presentation_emphasis).toBe("child_lifecycle");
    });
});
