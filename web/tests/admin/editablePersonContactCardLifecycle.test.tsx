// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import EditablePersonContactCard from "@/components/admin/opportunity/EditablePersonContactCard";
import { drawerOperatingIsDirty } from "@/lib/admin/drawer/drawerOperatingSaveCoordinator";
import {
    patchLinkedPersonFromOpportunityDrawer,
    resolvePrimaryPersonCardFieldGates,
    type PersonContactCardValues,
} from "@/lib/admin/drawer/primaryPersonCardEdit";
import {
    mountCard,
    runEditableCardContract,
    setNativeInputValue,
    type EditableCardContractAdapter,
} from "../../experience/editing/editableCardContractHarness";

/**
 * EditablePersonContactCard verified against the reusable Editable Card Runtime contract
 * (interaction, not render-only) + a couple of card-specific behaviors.
 */
const PERSON_ID = "11111111-1111-4111-8111-111111111111";
const OPP_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("@/contexts/AdminDrawerContext", () => ({
    useAdminDrawer: () => ({
        drawer: { type: "opportunities", id: OPP_ID },
        stack: [{ type: "opportunities", id: OPP_ID }],
        openDrawer: vi.fn(),
        drawerLinkPending: { isPending: () => false, errorForKey: () => null },
    }),
}));

vi.mock("@/lib/admin/drawer/primaryPersonCardEdit", async (orig) => {
    const actual = await orig<typeof import("@/lib/admin/drawer/primaryPersonCardEdit")>();
    return { ...actual, patchLinkedPersonFromOpportunityDrawer: vi.fn() };
});

const patchMock = vi.mocked(patchLinkedPersonFromOpportunityDrawer);

const baseValues: PersonContactCardValues = {
    first_name: "Ada",
    last_name: "Lovelace",
    email: "ada@example.com",
    phone: "555-0100",
    display_name: "Ada Lovelace",
};

const editableGates = () =>
    resolvePrimaryPersonCardFieldGates(
        { primary_person_id: PERSON_ID, _identity: { primary_person: { id: PERSON_ID } } },
        [],
        true,
    );

const firstNameInput = (c: HTMLElement) => c.querySelector('input[aria-label="First name"]') as HTMLInputElement;
const saveButton = (c: HTMLElement) =>
    Array.from(c.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim().startsWith("Save"))!;

function adapter(): EditableCardContractAdapter {
    return {
        mount: () =>
            mountCard(
                <EditablePersonContactCard
                    personId={PERSON_ID}
                    opportunityId={OPP_ID}
                    initialValues={baseValues}
                    gates={editableGates()}
                    canMutate
                    cardPad="px-2 py-1.5"
                    variant="summary"
                    saveTrigger="explicit"
                />,
            ),
        edit: (container) => {
            const input = firstNameInput(container);
            setNativeInputValue(input, "Adelaide");
            return { input, dirtyValue: "Adelaide" };
        },
        save: async (container) => {
            await act(async () => {
                saveButton(container).click();
            });
        },
        arrangeSuccess: () =>
            patchMock.mockResolvedValue({
                ok: true,
                status: 200,
                json: { first_name: "Adelaide", last_name: "Lovelace", email: "ada@example.com", phone: "555-0100", full_name: "Adelaide Lovelace" },
            } as Awaited<ReturnType<typeof patchLinkedPersonFromOpportunityDrawer>>),
        arrangeFailure: (error) =>
            patchMock.mockResolvedValue({ ok: false, status: 500, error } as Awaited<
                ReturnType<typeof patchLinkedPersonFromOpportunityDrawer>
            >),
        reset: () => patchMock.mockReset(),
    };
}

describe("EditablePersonContactCard — editable card runtime contract", () => {
    runEditableCardContract(adapter());

    it("clean edit is a no-op (same value does not go dirty)", () => {
        const card = adapter().mount();
        try {
            act(() => setNativeInputValue(firstNameInput(card.container), "Ada"));
            expect(card.container.textContent).not.toContain("Unsaved changes");
            expect(drawerOperatingIsDirty()).toBe(false);
        } finally {
            card.unmount();
        }
    });

    it("no self-managed save flags remain (delegates to the runtime)", () => {
        const src = readFileSync(
            resolve(__dirname, "../../../components/admin/opportunity/EditablePersonContactCard.tsx"),
            "utf8",
        );
        expect(src).toContain("useEditableCardRuntime");
        expect(src).not.toMatch(/useState[^\n]*saving/i);
        expect(src).not.toContain("setSavedFlash");
        expect(src).not.toContain("setSaveError");
    });
});
