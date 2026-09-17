/**
 * PHASE 0 CERTIFICATION — does the pre-commit window NAME THE DESTINATION (P0-7.1)?
 *
 * ── WHAT THIS OWNS, AND WHAT IT DOES NOT ──
 *
 * The P0-7 audit measured cold Work Unit entry as 0 → ~10,604 ms of a centered "Thinking…" with no
 * grid areas, no cards, no queue rows and no Work View pills, then the whole surface at once. The
 * published composition genuinely does not exist in that window, so no card grid can honestly be
 * shown there — this gate does NOT assert one, and asserts the opposite: that no card structure is
 * fabricated.
 *
 * What IS authoritative from the first frame is the DESTINATION: the route named the work unit and
 * the gesture named the Work View. This file certifies that those facts reach the operator, and that
 * nothing beyond them is invented.
 *
 * The phase TIMELINE — when structure commits, when meaning arrives, the coherence window — is not
 * certifiable here, because it needs a provisioned surface against a real tenant. It is measured on
 * the deployed build by the Slice 10 timeline harness.
 */

import { expect, test, type Page } from "@playwright/test";

import { loadFixture } from "./harness";

const FIXTURE = "destinationShellFixture.tsx";
const STYLES = ["app/adminV2/components/alloyOsRuntime.css"];

type Shell = {
    bootShellPresent: boolean;
    thinkingPresent: boolean;
    destinationShell: boolean;
    workUnitAttr: string | null;
    workViewAttr: string | null;
    destinationText: string;
    subjectText: string | null;
    /** Anything that would be a fabricated card structure in this window. */
    cardKeys: string[];
    gridAreas: number;
    queueRows: number;
    workViewPills: number;
    /** Everything the operator can actually read. */
    visibleText: string;
};

async function read(page: Page): Promise<Shell> {
    return page.evaluate(() => {
        const all = (s: string) => [...document.querySelectorAll(s)];
        const q = (s: string) => document.querySelector(s);
        const txt = (e: Element | null) => (e ? (e as HTMLElement).innerText || "" : "").replace(/\s+/g, " ").trim();
        const detail = q("[data-destination-shell-detail='true']");
        return {
            bootShellPresent: !!q("[data-alloy-operational-boot-shell='true']"),
            thinkingPresent: /Thinking/i.test((document.body as HTMLElement).innerText || ""),
            destinationShell: q("[data-destination-shell='true']") != null,
            workUnitAttr: q("[data-destination-work-unit]")?.getAttribute("data-destination-work-unit") ?? null,
            workViewAttr: q("[data-destination-work-view]")?.getAttribute("data-destination-work-view") ?? null,
            destinationText: txt(detail),
            subjectText: q("[data-destination-subject='true']") ? txt(q("[data-destination-subject='true']")) : null,
            cardKeys: all("[data-universal-card-key]").map((e) => e.getAttribute("data-universal-card-key") || ""),
            gridAreas: all("[data-fp-grid-area]").length,
            queueRows: all("[data-entity-id][role='button']").length,
            workViewPills: all("[data-work-view-id]").length,
            visibleText: txt(document.body),
        } as Shell;
    });
}

async function setCase(page: Page, which: "none" | "workUnit" | "withSubject"): Promise<void> {
    await page.waitForFunction(() => (window as unknown as { __shell?: unknown }).__shell != null);
    await page.evaluate(
        (c) => (window as unknown as { __shell: { apply: (c: string) => void } }).__shell.apply(c),
        which,
    );
    await page.evaluate(
        () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    );
}

test.beforeEach(async ({ page }) => {
    const errors = await loadFixture(page, FIXTURE, STYLES, 1300);
    expect(errors, "the fixture must mount without a page error").toEqual([]);
});

test.describe("the pre-commit window names the destination", () => {
    test("THE GATE: a cold work-unit entry tells the operator WHICH surface is being prepared", async ({ page }) => {
        await setCase(page, "workUnit");
        const s = await read(page);
        expect(s.destinationShell, "the shell must report itself as a destination shell").toBe(true);
        expect(s.workUnitAttr).toBe("waitlist");
        // Humanised from the operator's own route — not a configured label, which is not known yet.
        expect(s.destinationText).toContain("Waitlist");
        // The single calm loader is RETAINED. The surface really is still preparing, and saying so
        // remains truthful; Phase 0 adds destination evidence, it does not claim readiness.
        expect(s.thinkingPresent).toBe(true);
        expect(s.bootShellPresent).toBe(true);
    });

    test("THE GATE: no card structure is fabricated before the published composition exists", async ({ page }) => {
        await setCase(page, "workUnit");
        const s = await read(page);
        // The audit is explicit that the real composition does not exist in this window. Showing a
        // skeleton grid here would be false construction, which is the thing the replacement
        // invariant bans — so the destination shell must carry none.
        expect(s.cardKeys).toEqual([]);
        expect(s.gridAreas).toBe(0);
        expect(s.queueRows).toBe(0);
        expect(s.workViewPills).toBe(0);
    });

    test("THE GATE: no business fact is invented — no counts, no statuses, no stage vocabulary", async ({ page }) => {
        await setCase(page, "workUnit");
        const { visibleText } = await read(page);
        // A digit here would be a count nobody has counted yet.
        expect(visibleText).not.toMatch(/\d/);
        for (const invented of ["Enrolling", "Waitlisted", "Past due", "Needs info", "records", "Tour"]) {
            expect(visibleText).not.toContain(invented);
        }
    });

    test("the Work View id is carried for certification but never printed as operator vocabulary", async ({ page }) => {
        await setCase(page, "workUnit");
        const s = await read(page);
        expect(s.workViewAttr).toBe("new_leads");
        // An id is not a label, and the configured label is not known yet.
        expect(s.visibleText).not.toContain("new_leads");
    });

    test("subject identity is shown when the seed truthfully knows it", async ({ page }) => {
        await setCase(page, "withSubject");
        const s = await read(page);
        expect(s.subjectText).toBe("Wrigley Kurzman");
        expect(s.workUnitAttr).toBe("new-leads");
        expect(s.destinationText).toContain("New leads");
    });

    test("with nothing known the shell is exactly what it always was — no empty destination frame", async ({ page }) => {
        await setCase(page, "none");
        const s = await read(page);
        expect(s.destinationShell).toBe(false);
        expect(s.bootShellPresent).toBe(true);
        expect(s.thinkingPresent).toBe(true);
        // No stray empty container that would read as a broken region.
        expect(s.workUnitAttr).toBeNull();
        expect(s.subjectText).toBeNull();
    });
});
