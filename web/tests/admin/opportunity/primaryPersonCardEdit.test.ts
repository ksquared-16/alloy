import { describe, expect, it, vi } from "vitest";
import {
    applyPersonPatchToOpportunityPersonList,
    buildPrimaryPersonCardPatch,
    isPrimaryPersonCardDirty,
    personContactCardValuesFromOpportunityPersonRow,
    PRIMARY_PERSON_CARD_SAVE_DELAY_MS,
    primaryPersonCardValuesFromRecord,
    resolveLinkedPersonContactCardFieldGates,
    resolvePrimaryPersonCardFieldGates,
} from "@/lib/admin/drawer/primaryPersonCardEdit";
import { personFieldOnOpportunityInteractionPolicy } from "@/lib/fields/fieldInteractionPolicy";
import { patchLinkedPersonFromOpportunityDrawer } from "@/lib/admin/drawer/linkedRecordFieldEditing";

const PERSON_ID = "11111111-1111-4111-8111-111111111111";

describe("primaryPersonCardEdit", () => {
    it("reads name parts from hydrated mirror fields", () => {
        const v = primaryPersonCardValuesFromRecord({
            primary_person_id: PERSON_ID,
            first_name: "Ada",
            last_name: "Lovelace",
            _primary_person_email: "ada@example.com",
            _primary_person_phone: "555-0100",
            _primary_person_name: "Ada Lovelace",
        });
        expect(v.first_name).toBe("Ada");
        expect(v.last_name).toBe("Lovelace");
        expect(v.email).toBe("ada@example.com");
        expect(v.phone).toBe("555-0100");
    });

    it("splits display name when mirror scalars missing", () => {
        const v = primaryPersonCardValuesFromRecord({
            primary_person_id: PERSON_ID,
            _primary_person_name: "Grace Hopper",
        });
        expect(v.first_name).toBe("Grace");
        expect(v.last_name).toBe("Hopper");
    });

    it("defaults to editable native fields when canMutate and person linked", () => {
        const gates = resolvePrimaryPersonCardFieldGates(
            { primary_person_id: PERSON_ID, _primary_person_id: PERSON_ID },
            [],
            true
        );
        expect(gates.first_name.editable).toBe(true);
        expect(gates.email.editable).toBe(true);
    });

    it("read-only when no primary person", () => {
        const gates = resolvePrimaryPersonCardFieldGates({}, [], true);
        expect(gates.phone.editable).toBe(false);
        expect(gates.phone.readOnlyReason).toMatch(/primary person/i);
    });

    it("respects read_only interaction policy on opportunity field def", () => {
        const gates = resolvePrimaryPersonCardFieldGates(
            { primary_person_id: PERSON_ID },
            [
                {
                    field_key: "email",
                    is_system: false,
                    interaction_policy: {
                        version: 1,
                        editability_mode: "read_only",
                        ownership: {
                            source_entity: "opportunity",
                            source_field: "email",
                            write_target_entity: "person",
                            write_target_field: "email",
                            write_behavior: "none",
                        },
                    },
                },
            ],
            true
        );
        expect(gates.email.editable).toBe(false);
        expect(gates.first_name.editable).toBe(true);
    });

    it("isPrimaryPersonCardDirty detects draft changes vs baseline", () => {
        const baseline = {
            first_name: "Ada",
            last_name: "Lovelace",
            email: "",
            phone: "",
            display_name: "Ada Lovelace",
        };
        expect(isPrimaryPersonCardDirty({ ...baseline, last_name: "Byron" }, baseline)).toBe(true);
        expect(isPrimaryPersonCardDirty(baseline, baseline)).toBe(false);
    });

    it("uses a short delay before card-level save (tab between name fields)", () => {
        expect(PRIMARY_PERSON_CARD_SAVE_DELAY_MS).toBeGreaterThanOrEqual(250);
        expect(PRIMARY_PERSON_CARD_SAVE_DELAY_MS).toBeLessThanOrEqual(500);
    });

    it("buildPrimaryPersonCardPatch only includes changed scalars", () => {
        const patch = buildPrimaryPersonCardPatch(
            {
                first_name: "Augusta",
                last_name: "Lovelace",
                email: "ada@example.com",
                phone: "555-0100",
                display_name: "Augusta Lovelace",
            },
            {
                first_name: "Ada",
                last_name: "Lovelace",
                email: "ada@example.com",
                phone: "555-0100",
                display_name: "Ada Lovelace",
            }
        );
        expect(patch).toEqual({ first_name: "Augusta" });
    });

    it("patchLinkedPersonFromOpportunityDrawer uses person route", async () => {
        const fetchFn = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ id: PERSON_ID, phone: "555-9999" }),
        });
        const result = await patchLinkedPersonFromOpportunityDrawer({
            personId: PERSON_ID,
            body: { phone: "555-9999" },
            fetchFn: fetchFn as unknown as typeof fetch,
        });
        expect(result.ok).toBe(true);
        expect(fetchFn).toHaveBeenCalledWith(
            `/api/admin/persons/${PERSON_ID}`,
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({ phone: "555-9999" }),
            })
        );
    });

    it("linked opportunity person row: editable when person_id and canMutate", () => {
        const gates = resolveLinkedPersonContactCardFieldGates(PERSON_ID, true);
        expect(gates.first_name.editable).toBe(true);
        expect(gates.phone.editable).toBe(true);
    });

    it("linked opportunity person row: read-only when person_id missing", () => {
        const gates = resolveLinkedPersonContactCardFieldGates("", true);
        expect(gates.email.editable).toBe(false);
        expect(gates.email.readOnlyReason).toMatch(/linked person/i);
    });

    it("personContactCardValuesFromOpportunityPersonRow splits display name", () => {
        const v = personContactCardValuesFromOpportunityPersonRow({
            name: "Alan Turing",
            email: "alan@example.com",
            phone: "555-0200",
        });
        expect(v.first_name).toBe("Alan");
        expect(v.last_name).toBe("Turing");
        expect(v.email).toBe("alan@example.com");
    });

    it("applyPersonPatchToOpportunityPersonList updates matching row only", () => {
        const host: Record<string, unknown> = {
            _opportunity_persons: [
                { id: "a", person_id: PERSON_ID, name: "Ada Lovelace", email: null, phone: null },
                { id: "b", person_id: "22222222-2222-4222-8222-222222222222", name: "Other", email: null, phone: null },
            ],
        };
        applyPersonPatchToOpportunityPersonList(host, PERSON_ID, {
            first_name: "Augusta",
            last_name: "King",
            full_name: "Augusta King",
            email: "augusta@example.com",
            phone: "555-0300",
        });
        const rows = host._opportunity_persons as Array<Record<string, unknown>>;
        expect(rows[0]?.name).toBe("Augusta King");
        expect(rows[0]?.email).toBe("augusta@example.com");
        expect(rows[1]?.name).toBe("Other");
    });

    it("honors editable_through_related_record from field defs", () => {
        const gates = resolvePrimaryPersonCardFieldGates(
            { primary_person_id: PERSON_ID },
            [
                {
                    field_key: "phone",
                    is_system: false,
                    interaction_policy: personFieldOnOpportunityInteractionPolicy("phone"),
                },
            ],
            true
        );
        expect(gates.phone.editable).toBe(true);
    });
});
