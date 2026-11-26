/**
 * F3 — THE FOCUS PANEL'S FINANCIALS CARD MUST ACTUALLY ISSUE ITS READ.
 *
 * Measured on deployed staging, four mounts of four: the card mounted, sat at
 * `data-financials-empty="loading"`, and issued ZERO `/api/admin/financials/card` requests for the
 * whole observation, while Enrollment, Household and Children hydrated beside it. The host's
 * projection was present, non-null, and carried no `cards` key — so a gate that asked only
 * "is there a projection?" was true, both bootstrap effects returned early, and nobody ever
 * fetched. The recorded payload is in certification/financials/w7-repair-1/.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { hostRunsCardProducers } from "@/lib/adminV2/runtime/focusPanel/hostRunsCardProducers";
import { projectFocusPanelOperational } from "@/lib/adminV2/runtime/focusPanel/focusPanelOperationalProjection";

type Projection = Parameters<typeof hostRunsCardProducers>[0];

describe("the three states a self-fetching card has to tell apart", () => {
    it("no projection at all — nobody is sending one, so bootstrap", () => {
        expect(hostRunsCardProducers(null)).toBe(false);
        expect(hostRunsCardProducers(undefined)).toBe(false);
    });

    it("a projection with NO cards key — no producers on this path, ever, so bootstrap", () => {
        /* The exact shape `projectFocusPanelOperational` composes. */
        const measured = { businessProcess: {}, currentWork: {} } as unknown as Projection;
        expect(hostRunsCardProducers(measured)).toBe(false);
    });

    it("a projection carrying cards: null — the producers own this path and have not answered", () => {
        const pending = { businessProcess: {}, currentWork: {}, cards: null } as unknown as Projection;
        expect(hostRunsCardProducers(pending), "wait for them rather than racing them").toBe(true);
    });

    it("a projection carrying produced cards — wait for mine", () => {
        const ready = {
            businessProcess: {}, currentWork: {},
            cards: { financials: { state: "ready" }, attendance: { state: "ready" }, health: { state: "ready" } },
        } as unknown as Projection;
        expect(hostRunsCardProducers(ready)).toBe(true);
    });

    it("the distinction survives JSON, which is where it is actually read", () => {
        const absent = JSON.parse(JSON.stringify({ businessProcess: {}, currentWork: {} })) as Projection;
        const nulled = JSON.parse(JSON.stringify({ businessProcess: {}, currentWork: {}, cards: null })) as Projection;
        expect(hostRunsCardProducers(absent)).toBe(false);
        expect(hostRunsCardProducers(nulled)).toBe(true);
    });
});

describe("bound to the composer that actually produced the starved payload", () => {
    /*
     * This is the fact that makes the "no cards key" case real rather than hypothetical. If this
     * composer ever starts stating `cards`, the Focus Panel card will go back to WAITING for it —
     * so that change must be made deliberately, with this test as the place it is noticed.
     */
    it("projectFocusPanelOperational states no cards key", () => {
        const src = readFileSync(
            path.join(process.cwd(), "lib/adminV2/runtime/focusPanel/focusPanelOperationalProjection.ts"),
            "utf8",
        );
        const body = src.slice(src.indexOf("export function projectFocusPanelOperational"));
        const returned = body.slice(body.indexOf("return {"), body.indexOf("\n}"));
        expect(returned.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/\bcards\s*:/);
        expect(typeof projectFocusPanelOperational, "and the composer is the real one").toBe("function");
    });

    it("answers false for the payload actually recorded from deployed staging", () => {
        const p = path.join(process.cwd(), "../certification/financials/w7-repair-1/f3-operational-projection.json");
        if (!existsSync(p)) return; /* evidence file is the artifact, not the contract */
        const rec = JSON.parse(readFileSync(p, "utf8")) as { projectionKeys: string[] | null; hasCardsKey: boolean | null };
        expect(rec.hasCardsKey, "the deployed projection carried no cards key").toBe(false);
        const rebuilt = Object.fromEntries((rec.projectionKeys ?? []).map((k) => [k, {}])) as unknown as Projection;
        expect(hostRunsCardProducers(rebuilt), "so the card must bootstrap itself there").toBe(false);
    });
});

describe("the card asks the question at the right grain", () => {
    const CARD = readFileSync(
        path.join(process.cwd(), "components/admin/focusPanel/cards/FinancialsCard.tsx"),
        "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    it("derives the bootstrap gate from the producer question, not from the host question", () => {
        expect(/const hostSuppliesProjection = hostRunsCardProducers\(context\.operationalProjection\);/.test(CARD)).toBe(true);
        expect(
            /hostSuppliesProjection = context\.operationalProjection != null/.test(CARD),
            "the host-level question is gone, not merely shadowed",
        ).toBe(false);
    });

    it("and stops calling a producerless path 'provisioning'", () => {
        const prov = CARD.slice(CARD.indexOf("const provisioningAccount ="));
        const decl = prov.slice(0, prov.indexOf(";"));
        expect(decl).toMatch(/hostRunsCardProducers\(context\.operationalProjection\)/);
        expect(decl, "the old host-level test would keep the pending frame up forever").not.toMatch(
            /context\.operationalProjection != null/,
        );
    });
});
