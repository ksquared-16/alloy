import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import EditablePersonContactCard from "@/components/admin/opportunity/EditablePersonContactCard";
import PrimaryPersonContactCard from "@/components/admin/opportunity/PrimaryPersonContactCard";
import { openViewPersonFromOpportunity } from "@/lib/admin/drawer/openViewPersonFromOpportunity";
import {
    resolvePrimaryPersonCardFieldGates,
    type PersonContactCardValues,
} from "@/lib/admin/drawer/primaryPersonCardEdit";

const PERSON_ID = "11111111-1111-4111-8111-111111111111";
const OPP_ID = "22222222-2222-4222-8222-222222222222";
const webRoot = resolve(__dirname, "../../..");

const openDrawer = vi.fn();

vi.mock("@/contexts/AdminDrawerContext", () => ({
    useAdminDrawer: () => ({
        drawer: { type: "opportunities", id: OPP_ID },
        stack: [{ type: "opportunities", id: OPP_ID }],
        openDrawer,
        // Repaired net: the card now reads drawerLinkPending from the context.
        drawerLinkPending: { isPending: () => false, errorForKey: () => null },
    }),
}));

const baseValues: PersonContactCardValues = {
    first_name: "Ada",
    last_name: "Lovelace",
    email: "ada@example.com",
    phone: "555-0100",
    display_name: "Ada Lovelace",
};

describe("EditablePersonContactCard live View Person path", () => {
    it("renders dev diagnostics attrs on View Person when person id is present", () => {
        const html = renderToStaticMarkup(
            <EditablePersonContactCard
                personId={PERSON_ID}
                opportunityId={OPP_ID}
                initialValues={baseValues}
                gates={resolvePrimaryPersonCardFieldGates(
                    { primary_person_id: PERSON_ID, _identity: { primary_person: { id: PERSON_ID } } },
                    [],
                    true
                )}
                canMutate
                cardPad="px-2 py-1.5"
                variant="summary"
            />
        );

        expect(html).toContain('data-testid="view-person-drawer-open"');
        expect(html).toContain(`data-view-person-target-id="${PERSON_ID}"`);
        expect(html).toContain('aria-label="View person for Ada Lovelace"');
        expect(html).not.toContain("onMouseDown");
    });

    it("openViewPersonFromOpportunity opens type persons with correct id and parent", () => {
        openDrawer.mockClear();
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("prefetch failed")));

        openViewPersonFromOpportunity({
            openDrawer,
            personId: PERSON_ID,
            opportunityId: OPP_ID,
        });

        expect(openDrawer).toHaveBeenCalledWith({
            type: "persons",
            id: PERSON_ID,
            source: "opportunity_primary_contact",
            parent: { type: "opportunities", id: OPP_ID },
            personDrawerOpenSeed: null,
            opportunityWorkspaceContext: null,
        });
    });

    it("PrimaryPersonContactCard resolves identity-only primary person id", () => {
        const html = renderToStaticMarkup(
            <PrimaryPersonContactCard
                record={{
                    _identity: { primary_person: { id: PERSON_ID, label: "Ada Lovelace" } },
                    first_name: "Ada",
                    last_name: "Lovelace",
                }}
                opportunityId={OPP_ID}
                canMutate
                fieldDefinitions={[]}
                cardPad="px-2 py-1.5"
                variant="summary"
            />
        );

        expect(html).toContain(`data-view-person-target-id="${PERSON_ID}"`);
        expect(html).toContain('aria-label="View person for Ada Lovelace"');
    });

    it("wires click handler without duplicate mousedown open", () => {
        const src = readFileSync(
            resolve(webRoot, "components/admin/opportunity/EditablePersonContactCard.tsx"),
            "utf8"
        );
        expect(src).toContain("handleViewPersonClick");
        expect(src).toContain("openViewPersonFromOpportunity");
        expect(src).not.toMatch(/onMouseDown=\{\(e\) => .*openViewPerson/);
    });
});
