/**
 * AN ADDRESS IS ONE INTERACTION.
 *
 * The parts were already suppressed from the scalar walk, which stopped the four detached
 * questions — "Street address?", "City?", "State?", "ZIP?" arriving as unrelated turns. Without a
 * replacement that suppression means a declared address is collected by NOBODY, so these guard the
 * other half: one need, one card, one save, through the shared-value path every other fact uses.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { projectEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";
import {
    addressGroups,
    addressPartSharedKey,
    addressSatisfied,
    addressWrites,
    projectParticipantAddress,
} from "@/lib/enrollment/informationNeeds/participantAddress";
import { deterministicPrompt } from "@/lib/enrollment/participantRuntime/selectNextParticipantTurn";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

const FD = "fd-1";
const CHILD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const part = (id: string, label: string, key: string, required = false) => ({
    id,
    type: "text",
    label,
    required,
    field_source: { entity_type: "person", field_key: key },
});

const SCHEMA = {
    schema_version: 1,
    title: "Enrolment",
    fields: [
        { id: "child_name", type: "text", label: "Child's full name", required: true },
        {
            id: "home_address",
            type: "group",
            label: "Home address",
            address_binding: { subject: "person", role: "guardian" },
            fields: [
                part("addr_line1", "Street address", "address_line1", true),
                part("addr_city", "City", "city", true),
                part("addr_state", "State", "state"),
                part("addr_zip", "ZIP / postal code", "postal_code"),
            ],
        },
    ],
    sections: [{ id: "s1", title: "About", field_ids: ["child_name", "home_address"] }],
} as unknown as FormSchemaV1;

const FORM = {
    requirement_id: "r1",
    form_definition_id: FD,
    form_definition_version_id: "v1",
    session_item_id: "si1",
    schema: SCHEMA,
} as never;

const project = (sharedValues: Record<string, unknown> = {}) =>
    projectEnrollmentInformationNeeds({
        forms: [FORM],
        subjectId: CHILD,
        sharedValues,
        confirmations: {} as never,
    });

const group = () => addressGroups(SCHEMA)[0]!;
const KEY = (k: string) => `person.guardian.${k}`;
const KNOWN = {
    [KEY("address_line1")]: "12 Alder Lane",
    [KEY("city")]: "Bend",
    [KEY("state")]: "OR",
    [KEY("postal_code")]: "97701",
};

describe("one need, not four questions", () => {
    it("projects the address exactly once", () => {
        const needs = project();
        const address = needs.filter((n) => n.address);
        expect(address).toHaveLength(1);
        expect(address[0]!.address!.group_field_id).toBe("home_address");
    });

    it("never projects the parts as their own questions", () => {
        const needs = project();
        for (const id of ["addr_line1", "addr_city", "addr_state", "addr_zip"]) {
            expect(
                needs.some((n) => n.occurrences.some((o) => o.form_field_id === id)),
                `${id} was asked on its own`,
            ).toBe(false);
        }
    });

    it("leaves ordinary questions exactly where they were", () => {
        expect(project().some((n) => n.occurrences.some((o) => o.form_field_id === "child_name"))).toBe(true);
    });

    it("asks for it as one address, and confirms a known one instead of retyping it", () => {
        const empty = project().find((n) => n.address)!;
        /*
         * WHOSE address — an authored label is a heading and carries no determiner, so
         * "What is home address?" is what this asserted before the binding was read for the
         * sentence. The binding here names a person with no role, which is the parent answering.
         */
        expect(deterministicPrompt(empty)).toBe("What is your home address?");
        const known = project(KNOWN).find((n) => n.address)!;
        expect(deterministicPrompt(known)).toBe("We have your home address as 12 Alder Lane, Bend, OR 97701. Is that right?");
    });
});

describe("what Alloy already holds", () => {
    it("reads the parts from the canonical shared keys", () => {
        const address = projectParticipantAddress(group(), KNOWN)!;
        expect(address.known_line).toBe("12 Alder Lane, Bend, OR 97701");
        expect(address.complete).toBe(true);
        expect(address.partial).toBe(false);
    });

    it("scopes the key to the role whose person holds the address", () => {
        const fields = (group() as unknown as { fields: FormField[] }).fields;
        expect(addressPartSharedKey(group(), fields[0]!)).toBe("person.guardian.address_line1");
    });

    it("recognises a partial address rather than treating it as absent", () => {
        const address = projectParticipantAddress(group(), { [KEY("address_line1")]: "12 Alder Lane" })!;
        expect(address.partial).toBe(true);
        expect(address.complete).toBe(false);
        expect(address.known_line).toBe("12 Alder Lane");
    });

    it("is satisfied by the parts the Form REQUIRES, not by every part", () => {
        const required = projectParticipantAddress(group(), {
            [KEY("address_line1")]: "12 Alder Lane",
            [KEY("city")]: "Bend",
        })!;
        expect(required.complete, "state and zip are still empty").toBe(false);
        expect(addressSatisfied(required), "but the Form only insists on street and city").toBe(true);
    });

    it("is still the participant's work while a required part is missing", () => {
        const need = project({ [KEY("address_line1")]: "12 Alder Lane" }).find((n) => n.address)!;
        expect(need.state).toBe("missing");
        expect(need.requires_participant_action).toBe(true);
    });

    it("is confirmed once the required parts are answered", () => {
        const need = project(KNOWN).find((n) => n.address)!;
        expect(need.state).toBe("confirmed");
        expect(need.requires_participant_action).toBe(false);
    });
});

describe("saving an address writes canonical keys and nothing else", () => {
    const address = () => projectParticipantAddress(group(), KNOWN)!;

    it("writes each part to the same shared key a scalar would use", () => {
        const writes = addressWrites(address(), { address_line1: "9 Birch Way", city: "Sisters" });
        expect(writes).toEqual({ "person.guardian.address_line1": "9 Birch Way", "person.guardian.city": "Sisters" });
    });

    it("does NOT touch a part the family never sent", () => {
        // The case that must never wipe a city Alloy already held.
        const writes = addressWrites(address(), { address_line1: "9 Birch Way" });
        expect(Object.keys(writes)).toEqual(["person.guardian.address_line1"]);
        expect(writes).not.toHaveProperty("person.guardian.city");
    });

    it("treats a box the family emptied as a deliberate clear", () => {
        expect(addressWrites(address(), { city: "" })).toEqual({ "person.guardian.city": "" });
    });

    it("introduces no address store — every destination is a canonical Person field", () => {
        const writes = addressWrites(address(), { address_line1: "9", city: "B", state: "OR", postal_code: "97701" });
        for (const key of Object.keys(writes)) expect(key.startsWith("person.")).toBe(true);
    });
});

describe("the runtime seams are wired", () => {
    const handler = readFileSync(new URL("../../lib/public/forms/handleParticipantTurn.ts", import.meta.url).pathname, "utf8");
    const apply = readFileSync(
        new URL("../../lib/enrollment/participantRuntime/applyAddressResponse.ts", import.meta.url).pathname,
        "utf8",
    );

    it("accepts an address turn and re-resolves against the session as it now is", () => {
        expect(handler).toContain("applyAddressResponse");
        const at = handler.indexOf("applyAddressResponse(supabase");
        expect(handler.slice(at, at + 1400)).toContain("preloadedSession");
    });

    it("never lets the browser name a destination", () => {
        const at = handler.indexOf("const addressBody");
        const block = handler.slice(at, at + 1200);
        // The server's own projection decides the shared keys; the body carries PART names only.
        expect(block).toContain("current.value.needs.needs.find");
        expect(block).not.toContain("shared_value_key");
    });

    it("writes through the shared-value path, never a table of its own", () => {
        expect(apply).toContain("shallowMergeSharedValues");
        expect(apply).not.toMatch(/\.from\("persons"\)|\.from\("customer_members"\)/);
    });
});
