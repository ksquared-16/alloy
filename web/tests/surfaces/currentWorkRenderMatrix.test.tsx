// @vitest-environment jsdom
/**
 * THE CARD DRAWS FROM THE SUPPLIED PROJECTION, AND FROM NO RAW CONFIGURATION.
 *
 * `published_stage_inputs` was retired from both transport frames, and the server now decides what
 * Current Work says. Proving that by reading the source cannot work: a card can import nothing from
 * the configuration and still fail to render, and a card can name the projection and still quietly
 * fall back. The only proof is to MOUNT the real component with the projection the server actually
 * computes, the raw configuration absent, and check what appears.
 *
 * The contexts are the projection-parity suite's own fixtures — one owner, so the two certifications
 * cannot drift into testing different products.
 *
 * ── WHAT "NO RAW CONFIG" MEANS HERE ──
 *
 * Each scenario renders twice: once with `publishedStageInputs` present, once with it stripped. The
 * rendered output must be IDENTICAL. That is stronger than asserting the card does not read the
 * field — it shows the field cannot change what the operator sees, whatever the card does with it.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/focusPanel/UniversalCard", () => ({
    default: ({ children }: { children?: unknown }) => <div data-uc="1">{children as never}</div>,
}));
vi.mock("@/components/workIntent/useWorkIntentOutcomeCompletion", () => ({
    useWorkIntentOutcomeCompletion: () => ({ completion: null, run: () => {} }),
}));
vi.mock("@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination", () => ({
    useDismissSignal: () => {},
    useReportPerspective: () => {},
}));

import CurrentWorkCard from "@/components/admin/focusPanel/cards/CurrentWorkCard";
import { projectFocusPanelOperational } from "@/lib/adminV2/runtime/focusPanel/focusPanelOperationalProjection";
import { FIXTURES } from "./currentWorkFixtures";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const model = { title: "Current Work", iconName: "ListChecks", tier: "work", archetype: "checklist", span: "row" } as never;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

/** The context as the CARD receives it: server projection attached, configuration optional. */
function rendered(base: OperationalContext, opts: { withRawConfig: boolean }): OperationalContext {
    return {
        ...base,
        publishedStageInputs: opts.withRawConfig ? base.publishedStageInputs : null,
        operationalProjection: projectFocusPanelOperational({ context: base }),
    } as OperationalContext;
}

/**
 * React's `useId` counter advances across mounts, so Radix stamps a different id each time. That is
 * not product output, and comparing it would make this test fail for a reason no operator can see.
 * Everything else — every class, every data attribute, every word — is compared verbatim.
 */
const normalise = (html: string) => html.replace(/radix-[_a-z0-9]+/g, "radix-ID");

async function mount(context: OperationalContext) {
    await act(async () => {
        root.render(<CurrentWorkCard model={model} context={context as never} />);
    });
    return normalise(container.innerHTML);
}

describe("the Current Work render matrix", () => {
    for (const fixture of FIXTURES) {
        it(`${fixture.name} — renders from the projection, identically without raw config`, async () => {
            const withConfig = await mount(rendered(fixture.context, { withRawConfig: true }));
            /*
             * VACUITY GUARD. A card stuck on a pending shell renders identically in every scenario,
             * which would make this whole matrix pass while proving nothing.
             *
             * The pre-settlement fixture is the deliberate exception: it has no published inputs, so
             * having nothing to say IS the right answer there, and demanding a summary would be
             * demanding the card invent one.
             */
            if (fixture.context.publishedStageInputs) {
                expect(withConfig, "the card rendered a pending shell, not Current Work").toContain(
                    'data-work-summary="true"',
                );
            } else {
                expect(withConfig.length, "the card rendered nothing at all").toBeGreaterThan(30);
            }

            await act(async () => root.render(<></>));
            const withoutConfig = await mount(rendered(fixture.context, { withRawConfig: false }));

            expect(
                withoutConfig,
                "removing published_stage_inputs changed what the operator sees — the card is still "
                    + "reading raw configuration somewhere",
            ).toBe(withConfig);
        });
    }

    it("renders the SUPPLIED decision, not one it re-derives", async () => {
        /*
         * THE CLAIM THAT IS ACTUALLY TRUE, AND THE ONE THAT MATTERS.
         *
         * An earlier version asserted the card renders nothing without a projection. It does not:
         * `buildCurrentWorkCardEvidence` projects for itself when no view model is supplied —
         * deliberately, so the authoring surfaces and the server chokepoint can both call it. A guard
         * assertion caught that the with/without renders were byte-identical, which is how the false
         * premise surfaced instead of shipping as a passing test.
         *
         * So the property worth locking is PREFERENCE, not absence: when the server supplies a
         * decision, the card renders THAT decision rather than re-deriving one.
         *
         * Proven by crossing the fixtures — one context, another fixture's projection. No hand-made
         * mutation of an internal field, which twice targeted a level the card does not render;
         * whatever the card reads, it must read it from what it was handed.
         */
        const lead = FIXTURES[0].context;

        const asItself = await mount(rendered(lead, { withRawConfig: false }));
        await act(async () => root.render(<></>));

        /*
         * The disagreement is `isEmpty`, which is the builder's OWN documented branch rather than a
         * guessed internal field. Two earlier attempts mutated levels the card does not render, and
         * crossing two fixtures could not distinguish them because they share one work template — so
         * the disagreement has to be one the builder is defined to act on.
         */
        const honest = projectFocusPanelOperational({ context: lead });
        const withForeignProjection = await mount({
            ...lead,
            publishedStageInputs: null,
            operationalProjection: { ...honest, currentWork: { ...honest.currentWork, isEmpty: true } },
        } as unknown as OperationalContext);

        expect(
            withForeignProjection,
            "the card rendered identically whether handed a populated or an empty projection — it is "
                + "re-deriving, and the server is not the authority but merely the usual source",
        ).not.toBe(asItself);
    });
});
