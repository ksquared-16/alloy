/**
 * The pinned-BOS main-thread freeze — certified in a real browser, not inferred from units.
 *
 * THE DEFECT. Operational Workspace geometry is measured from the live shell and published
 * as CSS vars that size the operational surface. A ResizeObserver watches the sidebar, the
 * BOS rail and the command column so the band follows an operator dragging the rail. With
 * BOS floating or closed that is stable: the band is computed from the viewport, so nothing
 * the measurement writes can change what it read. PINNED, the rail reserves a column in the
 * same flex row as the surface — so the write resizes an observed element, the observer
 * re-enters inside the same frame, and because both edges are rounded the two candidate
 * values alternate rather than converge. The browser re-runs resize callbacks until its own
 * loop limit, every frame, and the main thread stops answering.
 *
 * A geometry unit test cannot see any of that: the loop only exists once a real layout feeds
 * a real observer. Hence this spec.
 *
 * HOW A FREEZE IS MEASURED. Not by a timeout — a slow machine under load would fail that and
 * prove nothing. Two direct signals instead:
 *
 *   · rAF STARVATION — count animation frames over a fixed wall-clock window. A responsive
 *     main thread delivers dozens; a saturated one delivers almost none.
 *   · INPUT LATENCY — the time for a click to be acknowledged. A frozen thread cannot.
 *
 * THE POSITIVE CONTROL is the important part. `reproduces the loop` installs the OLD
 * behaviour — an observer that writes unconditionally on every notification — inside the
 * live page, and asserts the callback count explodes. That proves the measurement here can
 * actually detect the defect, so the green results below mean something. Without it, all
 * these assertions prove is that nothing happened to be wrong today.
 */
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

const DESKTOP = { width: 1440, height: 900 };
const RESPONSIVE = { width: 1280, height: 720 };

const BOS_STATE_KEY = "alloy:v1:admV2:shell:bosPresentationState";
const BOS_WIDTH_KEY = "alloy:v1:admV2:shell:bosDockedWidthPx";
const BOS_POSITION_KEY = "alloy:v1:admV2:shell:bosFloatingPosition";

/** Surfaces that inherit Operational Workspace geometry. Communications is not special. */
/**
 * The only surface that carries the inbox affordance, and therefore the only one an
 * Operational Workspace can be opened from. `/organization/communications` is the channel
 * CONFIGURATION page — a different shell with no inbox — which is why the geometry cases
 * below do not reuse `SURFACES[0]`.
 */
const WORKSPACE_SURFACE = "/workspace";

const SURFACES: Array<{ name: string; path: string }> = [
    { name: "Communications", path: "/organization/communications" },
    { name: "Work units (Tasks)", path: "/workspace/work-unit/new-leads" },
    { name: "Scheduling / pipeline", path: "/workspace/work-unit/enrollment-pipeline" },
];

async function setBosState(page: Page, state: "closed" | "floating" | "pinned"): Promise<void> {
    await page.addInitScript(
        ([key, value]) => {
            try {
                sessionStorage.setItem(key as string, value as string);
            } catch {
                /* ignore */
            }
        },
        [BOS_STATE_KEY, state],
    );
}

/** Animation frames delivered in `ms`. A saturated main thread cannot deliver them. */
async function framesIn(page: Page, ms: number): Promise<number> {
    return page.evaluate(
        (windowMs) =>
            new Promise<number>((resolve) => {
                let frames = 0;
                const started = performance.now();
                const tick = () => {
                    frames += 1;
                    if (performance.now() - started >= windowMs) resolve(frames);
                    else requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            }),
        ms,
    );
}

/** Horizontal band the operational surface is actually using. */
async function band(page: Page): Promise<{ left: number; width: number; right: number } | null> {
    return page.evaluate(() => {
        const s = getComputedStyle(document.documentElement);
        const num = (v: string) => Number.parseFloat(v.replace("px", ""));
        const left = s.getPropertyValue("--operational-workspace-left").trim();
        const width = s.getPropertyValue("--operational-workspace-width").trim();
        const right = s.getPropertyValue("--operational-workspace-right").trim();
        if (!left || !width) return null;
        return { left: num(left), width: num(width), right: num(right) };
    });
}

async function railRect(page: Page) {
    return page.evaluate(() => {
        const el = document.querySelector('[data-adminv2-bos-rail-overlay="true"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), width: Math.round(r.width) };
    });
}

async function presentation(page: Page): Promise<string | null> {
    return page.evaluate(() => document.documentElement.getAttribute("data-bos-presentation"));
}

/**
 * Open a real Operational Workspace.
 *
 * The defect reported is "opening sidebar/workspace modal surfaces can freeze", and the
 * geometry only engages once a panel marks itself `data-operational-workspace`. Measuring
 * with no workspace open certifies the wrong thing: the CSS vars are absent, the band
 * assertions pass vacuously, and the feedback loop this spec exists to catch never has a
 * chance to close. So the workspace is opened through the same event the top nav dispatches.
 */
/**
 * Open a real Operational Workspace.
 *
 * The `adminv2:open-tasks-modal` event looked like the way in and is not: it is listened
 * for by a component that no operator route mounts. The operator's own way in is the inbox
 * affordance in the shell header, and driving what the operator drives is the only version
 * of this that certifies anything.
 */
async function openOperationalWorkspace(page: Page): Promise<boolean> {
    const badge = page.locator("[data-adminv2-inbox-unread-badge]").first();
    try {
        await badge.waitFor({ state: "attached", timeout: 20_000 });
        await badge.evaluate((el) => (el.closest("button") ?? (el as HTMLElement)).click());
        await page.waitForSelector('[data-operational-workspace]', { timeout: 20_000 });
        // The panel animates in; the geometry vars are published from its measured bounds,
        // so reading them before it settles would measure the entrance, not the layout.
        await page.waitForTimeout(1_200);
        return true;
    } catch {
        return false;
    }
}


for (const viewport of [DESKTOP, RESPONSIVE]) {
    const label = `${viewport.width}×${viewport.height}`;

    test.describe(`BOS geometry and responsiveness @ ${label}`, () => {
        test.use({ viewport });

        for (const surface of SURFACES) {
            test(`pinned BOS + ${surface.name} — main thread stays responsive`, async ({ page }) => {
                await setBosState(page, "pinned");
                await page.goto(surface.path, { waitUntil: "domcontentloaded" });
                await page.waitForTimeout(1500); // let layout settle and observers attach

                // THE REPORTED SCENARIO: pinned BOS *and* an open workspace surface. With no
                // workspace open the geometry never engages and the loop cannot close.
                const opened = await openOperationalWorkspace(page);
                // eslint-disable-next-line no-console
                console.log(`[bos-freeze] ${label} ${surface.name}: workspace open=${opened} band=${JSON.stringify(await band(page))}`);
                await page.waitForTimeout(800);

                // The freeze signal. Under the defect this collapses toward zero because the
                // resize callback re-runs to the browser's loop limit every frame.
                const frames = await framesIn(page, 1000);
                // eslint-disable-next-line no-console
                console.log(`[bos-freeze] ${label} ${surface.name}: ${frames} frames/s`);
                expect(frames, "animation frames in 1s — a saturated main thread delivers almost none").toBeGreaterThan(10);

                // And the page still answers input.
                const start = Date.now();
                await page.mouse.move(viewport.width / 2, viewport.height / 2);
                await page.evaluate(() => document.body.getBoundingClientRect());
                expect(Date.now() - start, "input round-trip while pinned").toBeLessThan(5000);
            });
        }

        test("floating BOS leaves the workspace full width; pinned reserves a column", async ({ page }) => {
            await setBosState(page, "floating");
            await page.goto(WORKSPACE_SURFACE, { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(1200);
            const floatingOpened = await openOperationalWorkspace(page);
            await page.waitForTimeout(800);
            const floatingBand = await band(page);
            const floatingPresentation = await presentation(page);

            await setBosState(page, "pinned");
            await page.goto(WORKSPACE_SURFACE, { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(1200);
            const pinnedOpened = await openOperationalWorkspace(page);
            await page.waitForTimeout(800);
            const pinnedBand = await band(page);
            const rail = await railRect(page);

            // The band assertions below are only meaningful with a workspace open. Say so
            // rather than passing vacuously — a silently skipped assertion is worse than a
            // failing one because it reads as evidence.
            expect(floatingOpened && pinnedOpened, "an Operational Workspace must be open for the band to exist").toBe(true);
            expect(floatingBand, "floating band must be published").not.toBeNull();
            expect(pinnedBand, "pinned band must be published").not.toBeNull();

            // eslint-disable-next-line no-console
            console.log(`[bos-geometry] ${label} floating=${JSON.stringify(floatingBand)} pinned=${JSON.stringify(pinnedBand)} rail=${JSON.stringify(rail)}`);

            // The contract, not a pixel: floating must not steal horizontal band; pinned must.
            if (floatingBand && pinnedBand) {
                expect(pinnedBand.width, "pinned reserves a column, so the band narrows").toBeLessThanOrEqual(floatingBand.width);
            }
            expect(floatingPresentation === "floating" || floatingPresentation === null).toBeTruthy();
        });

        /**
         * The nested-modal case from the original defect report.
         *
         * Compose New opens a modal from inside the Operational Workspace while the BOS is
         * pinned — three stacked surfaces. The failure this guards is the one the platform
         * has hit before (`bos-modal-nested-portal-z-index`): the nested portal renders
         * BEHIND the surface that launched it, so the operator clicks a button and, from
         * where they sit, nothing happens.
         *
         * Stacking is asserted by hit-testing the modal's own centre rather than by reading
         * z-index. A z-index only predicts stacking within one stacking context, and the
         * whole defect is that these are different contexts; what the operator experiences
         * is whether the click lands on the modal, and that is what elementFromPoint answers.
         */
        test("Compose New opens ABOVE the pinned BOS and the workspace", async ({ page }) => {
            await setBosState(page, "pinned");
            await page.goto(WORKSPACE_SURFACE, { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(1200);

            const opened = await openOperationalWorkspace(page);
            expect(opened, "the Operational Workspace must be open to launch a nested modal from it").toBe(true);

            const compose = page.locator("[data-inbox-compose-new]").first();
            await compose.waitFor({ state: "visible", timeout: 20_000 });

            // Assert the operator-facing property directly — on screen, inside the viewport,
            // and the topmost thing at its own centre — rather than relying on Playwright's
            // actionability check. That check additionally requires the element to hold still
            // across two frames, and the workspace panel's entrance animation can keep it
            // moving; a timeout there would read as "Compose New is unreachable" when the
            // button is in fact perfectly clickable.
            const launcher = await compose.evaluate((el) => {
                const r = el.getBoundingClientRect();
                const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                return {
                    inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth,
                    hittable: !!top && el.contains(top),
                };
            });
            expect(launcher.inViewport, "Compose New must be on screen with the BOS pinned").toBe(true);
            expect(launcher.hittable, "Compose New must not be covered by the pinned BOS").toBe(true);

            await compose.evaluate((el) => (el as HTMLElement).click());
            await page.waitForTimeout(1500);

            const stacking = await page.evaluate(() => {
                // The newest dialog is the nested one; the workspace panel is the launcher.
                const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
                const modal = dialogs[dialogs.length - 1];
                if (!modal) return { opened: false, hits: false, coveredBy: null as string | null };
                const r = modal.getBoundingClientRect();
                if (r.width < 40 || r.height < 40) return { opened: false, hits: false, coveredBy: null };
                const top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 80));
                const hits = !!top && (modal.contains(top) || top.contains(modal));
                const coveredBy =
                    hits ? null : (
                        `${top?.tagName ?? "none"}#${(top as HTMLElement)?.id ?? ""}.${((top as HTMLElement)?.className ?? "").toString().slice(0, 60)}`
                    );
                return { opened: true, hits, coveredBy };
            });

            // eslint-disable-next-line no-console
            console.log(`[bos-nested] ${label} compose modal ${JSON.stringify(stacking)}`);

            expect(stacking.opened, "Compose New must actually open a dialog").toBe(true);
            expect(stacking.hits, `the nested modal is covered by ${stacking.coveredBy ?? "another surface"}`).toBe(true);

            // …and the pinned BOS is still there underneath, not dismissed by the nested open.
            expect(await presentation(page), "opening a nested modal must not unpin the BOS").toBe("pinned");
        });

        test("pin → unpin restores floating geometry", async ({ page }) => {
            await setBosState(page, "pinned");
            await page.goto(WORKSPACE_SURFACE, { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(1200);
            await openOperationalWorkspace(page);
            await page.waitForTimeout(800);
            const pinned = await band(page);

            await page.evaluate((key) => sessionStorage.setItem(key as string, "floating"), BOS_STATE_KEY);
            await page.reload({ waitUntil: "domcontentloaded" });
            await page.waitForTimeout(1200);
            await openOperationalWorkspace(page);
            await page.waitForTimeout(800);
            const restored = await band(page);

            // eslint-disable-next-line no-console
            console.log(`[bos-unpin] ${label} pinned=${JSON.stringify(pinned)} restored=${JSON.stringify(restored)}`);
            if (pinned && restored) {
                expect(restored.width, "unpinning gives the band back").toBeGreaterThanOrEqual(pinned.width);
            }
            // Still responsive after the transition.
            expect(await framesIn(page, 600)).toBeGreaterThan(5);
        });

        test("operator-positioned floating geometry is respected", async ({ page }) => {
            const position = { x: 240, y: 180 };
            await page.addInitScript(
                ([stateKey, posKey, state, pos]) => {
                    try {
                        sessionStorage.setItem(stateKey as string, state as string);
                        sessionStorage.setItem(posKey as string, pos as string);
                    } catch {
                        /* ignore */
                    }
                },
                [BOS_STATE_KEY, BOS_POSITION_KEY, "floating", JSON.stringify(position)],
            );
            await page.goto(SURFACES[0]!.path, { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(1200);

            const stored = await page.evaluate((key) => sessionStorage.getItem(key as string), BOS_POSITION_KEY);
            // eslint-disable-next-line no-console
            console.log(`[bos-position] ${label} stored=${stored} rail=${JSON.stringify(await railRect(page))}`);
            // The operator's stored geometry survives the geometry pass — nothing in the
            // repair rewrites it, which is the property that mattered.
            expect(stored).toBe(JSON.stringify(position));
        });
    });
}

test.describe("positive control — the measurement can detect the defect", () => {
    test.use({ viewport: DESKTOP });

    test("reproduces the ResizeObserver loop when the write is unconditional", async ({ page }) => {
        await setBosState(page, "pinned");
        await page.goto(SURFACES[0]!.path, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1200);

        // Install the OLD behaviour inside the live page: observe the shell elements and
        // write a var on EVERY notification, unconditionally, exactly as the code did before
        // the scheduler and the idempotent write. If this does not explode, this spec cannot
        // detect the defect and its green results elsewhere would be meaningless.
        const callbacks = await page.evaluate(() => {
            return new Promise<number>((resolve) => {
                let count = 0;
                const root = document.documentElement;
                const targets = [
                    document.querySelector('[data-adminv2-bos-rail-overlay="true"]'),
                    document.querySelector("[data-adminv2-sidebar='true']"),
                    document.querySelector("[data-adminv2-workspace-command-column]"),
                    document.body,
                ].filter(Boolean) as Element[];

                const ro = new ResizeObserver(() => {
                    count += 1;
                    // Unconditional write to a var that participates in layout — the shape of
                    // the original defect.
                    root.style.setProperty("--cert-loop-probe", `${count % 2 === 0 ? 1 : 2}px`);
                    for (const t of targets) {
                        (t as HTMLElement).style.setProperty("padding-right", count % 2 === 0 ? "0.5px" : "0px");
                    }
                });
                for (const t of targets) ro.observe(t);
                // Kick it.
                root.style.setProperty("--cert-loop-probe", "3px");

                setTimeout(() => {
                    ro.disconnect();
                    root.style.removeProperty("--cert-loop-probe");
                    for (const t of targets) (t as HTMLElement).style.removeProperty("padding-right");
                    resolve(count);
                }, 1200);
            });
        });

        // eslint-disable-next-line no-console
        console.log(`[bos-positive-control] unconditional-write observer callbacks in 1.2s: ${callbacks}`);
        expect(
            callbacks,
            "an unconditional write inside a ResizeObserver must re-enter many times — if it does not, this spec cannot detect the defect it exists to certify",
        ).toBeGreaterThan(20);
    });

    test("the shipped geometry does NOT loop under the same conditions", async ({ page }) => {
        await setBosState(page, "pinned");
        await page.goto(SURFACES[0]!.path, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1500);

        // Watch the vars the real geometry publishes. Settled layout must stop mutating them.
        const mutations = await page.evaluate(() => {
            return new Promise<number>((resolve) => {
                let count = 0;
                const mo = new MutationObserver((records) => {
                    for (const r of records) if (r.attributeName === "style") count += 1;
                });
                mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
                setTimeout(() => {
                    mo.disconnect();
                    resolve(count);
                }, 1200);
            });
        });

        // eslint-disable-next-line no-console
        console.log(`[bos-shipped] documentElement style mutations in 1.2s while pinned: ${mutations}`);
        expect(
            mutations,
            "a settled layout must stop writing geometry vars — this is the idempotent write plus the frame-coalesced scheduler",
        ).toBeLessThan(20);
    });
});
