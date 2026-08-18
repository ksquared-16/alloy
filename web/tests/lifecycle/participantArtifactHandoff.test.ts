/**
 * The five phases as ONE runtime: conversation → populated review → acknowledgment → signature.
 *
 * QA confirmed a date of birth and typed allergies, then reached artifact review and found both
 * fields EMPTY. Two separate owners were at fault, and each is pinned here.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sharedValuesToFieldIds } from "@/lib/forms/packets/sharedValuesToFieldIds";
import {
    PARTICIPANT_DEFAULT_ACCENT,
    participantBrandStyle,
    resolveParticipantBrand,
} from "@/lib/public/forms/participantBrandTheme";
import { controlForTurn, optionalSkipLabel } from "@/lib/enrollment/participantRuntime/participantTurnPresentation";

const read = (rel: string) => readFileSync(resolve(__dirname, "../../", rel), "utf8");

/**
 * Source with comments stripped.
 *
 * A control that scans raw source flags the file's own documentation — this repository has been
 * bitten by that before. A module explaining why it does NOT hardcode a colour will mention the
 * colour; a component explaining why it no longer says "Saving…" will contain the words.
 */
const code = (rel: string) =>
    read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");

const SCHEMA = {
    version: 1,
    fields: [
        { id: "field_1", type: "text", label: "Child Full Name" },
        {
            id: "field_2",
            type: "date",
            label: "Child Dob",
            field_source: { entity_type: "child", field_key: "child_date_of_birth", shared_value_key: "child_date_of_birth" },
        },
        {
            id: "field_3",
            type: "text",
            label: "Allergies",
            field_source: { entity_type: "customer_member", field_key: "allergies" },
        },
        { id: "disp_text_1", type: "text_block", label: "Page 2", content: "Handbook" },
        { id: "disp_sig_5", type: "signature", label: "Parent Signature" },
    ],
} as never;

describe("values collected in the conversation reach the artifact", () => {
    it("maps settled shared values onto this artifact's own field ids", () => {
        // Both binding shapes, because a real tenant's form mixes them: DOB by alias, allergies by
        // entity+field.
        const applied = sharedValuesToFieldIds(SCHEMA, {
            child_date_of_birth: "2022-08-18",
            "customer_member:allergies": "None",
        });
        expect(applied).toEqual({ field_2: "2022-08-18", field_3: "None" });
    });

    it("never fills an unbound field, and never a display block", () => {
        const applied = sharedValuesToFieldIds(SCHEMA, {
            child_date_of_birth: "2022-08-18",
            anything: "x",
        });
        // `field_1` has no canonical identity — nothing in the shared namespace may claim to be its
        // value — and a text block holds no value at all.
        expect(applied).not.toHaveProperty("field_1");
        expect(applied).not.toHaveProperty("disp_text_1");
    });

    it("the server sends the prefill and the client seeds the rendered artifact with it", () => {
        const ctx = read("lib/public/forms/resolvePublicFormEmbedContext.ts");
        expect(ctx).toContain("shared_prefill_by_field_id");
        expect(ctx).toContain("sharedValuesToFieldIds");

        const client = read("app/forms/embed/[token]/FormEmbedClient.tsx");
        expect(client).toContain("withSharedPrefill");
        // Applied on BOTH entry paths — a resumed draft and a freshly created one. QA hit the
        // resumed one.
        expect(client.match(/withSharedPrefill\(/g)?.length).toBeGreaterThanOrEqual(3);
    });

    it("a confirmed known value is written to the shared substrate, not just evidenced", () => {
        const apply = read("lib/enrollment/participantRuntime/applyParticipantTurnResponse.ts");
        const confirmBranch = apply.slice(
            apply.indexOf('disposition.action === "confirm_value"'),
            apply.indexOf('disposition.action === "write_shared_value"'),
        );
        // D-99 evidence alone left the artifacts with nothing to render: the parent agreed and the
        // value went nowhere.
        expect(confirmBranch).toContain("shallowMergeSharedValues");
        expect(confirmBranch).toContain("patch.shared_values");
    });

    it("a participant edit still wins over a settled value", () => {
        const client = read("app/forms/embed/[token]/FormEmbedClient.tsx");
        const fn = client.slice(client.indexOf("function withSharedPrefill"), client.indexOf("function withSharedPrefill") + 900);
        // Settled values fill EMPTY fields only — re-imposing them would fight the parent's typing.
        expect(fn).toContain("const empty =");
        expect(fn).toContain("if (empty)");
    });
});

describe("requiredness is the Form's, and optional has a real way out", () => {
    it("an optional missing need does not count as blocking", () => {
        const projection = read("lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds.ts");
        expect(projection).toContain("acc.occurrences.some((o) => o.required)");
        expect(projection).toContain("requires_participant_action: blocking");
    });

    it("offers a truthful resolution instead of forcing a fake answer", () => {
        const base = {
            kind: "collect_missing_value",
            prompt: "",
            proposed_value: null,
            resolves_occurrences: 1,
            input_type: "text",
            label: "Allergies",
            options: [],
        };
        const optional = { ...base, optional: true };
        expect(
            optionalSkipLabel({ next_turn: optional } as never),
        ).toBe("No known allergies");
        // Required needs get no skip — the way past them is to answer.
        expect(optionalSkipLabel({ next_turn: { ...base, optional: false } } as never)).toBeNull();
    });
});

describe("an authored date cannot degrade into a text box", () => {
    it("holds for the authored type, whatever the label says", () => {
        for (const label of ["Child Dob", "Anything At All", ""]) {
            const control = controlForTurn({
                kind: "collect_missing_value",
                prompt: "",
                proposed_value: null,
                resolves_occurrences: 1,
                input_type: "date",
                label,
                options: [],
                optional: false,
            });
            expect(control).toMatchObject({ kind: "value", inputType: "date" });
        }
    });

    it("the authored type reaches the wire from the occurrence, not a constant", () => {
        const wire = read("lib/enrollment/participantRuntime/participantObjectiveWireModel.ts");
        expect(wire).toContain("occurrence.field_type");
        expect(wire).not.toContain('return occurrence ? "text" : null');
    });
});

describe("one theme owner brands every phase", () => {
    it("resolves the tenant's authored tokens", () => {
        const brand = resolveParticipantBrand({
            accent_color: "#00A283",
            brand_name: "Firefly Early Learning",
            logo_url: "https://cdn.example.com/logo.png",
        });
        expect(brand).toEqual({
            accentColor: "#00A283",
            brandName: "Firefly Early Learning",
            logoUrl: "https://cdn.example.com/logo.png",
        });
        expect(participantBrandStyle(brand)).toEqual({ "--participant-accent": "#00A283" });
    });

    it("falls back to the platform, never to a tenant's colour", () => {
        expect(resolveParticipantBrand(null).accentColor).toBe(PARTICIPANT_DEFAULT_ACCENT);
        // Nothing tenant-specific is hardcoded anywhere in the resolver.
        expect(code("lib/public/forms/participantBrandTheme.ts")).not.toContain("#00A283");
    });

    it("refuses values that would reach a style attribute or an image tag unchecked", () => {
        expect(resolveParticipantBrand({ accent_color: "javascript:alert(1)" }).accentColor).toBe(PARTICIPANT_DEFAULT_ACCENT);
        expect(resolveParticipantBrand({ logo_url: "javascript:alert(1)" }).logoUrl).toBeNull();
    });

    it("the frame that wraps BOTH phases applies it", () => {
        const shell = read("app/forms/embed/[token]/ParentIntakeShell.tsx");
        expect(shell).toContain("participantBrandStyle(brand)");
        expect(shell).toContain('data-participant-brand=');
        // The conversation and the artifact review are both rendered inside that frame, so neither
        // can theme itself differently.
        const client = read("app/forms/embed/[token]/FormEmbedClient.tsx");
        expect(client).toContain("<IntakeFrame brand={brand}");
        expect(client).toContain("<EnrollmentConversationCard");
    });
});

describe("Continue, not Saving", () => {
    it("the primary action is one Continue, and duplicate submits are impossible", () => {
        const card = code("app/forms/embed/[token]/EnrollmentConversationCard.tsx");
        expect(card).not.toContain("Saving…");
        expect(card).not.toContain("Saving your answer");
        expect(card).toContain('{"Continue"}');
        // Persistence stays an implementation detail; the guard is the in-flight ref, not the copy.
        expect(card).toContain("inFlight.current");
    });
});
