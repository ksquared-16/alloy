/**
 * Stage configuration UX audit — measured, not asserted from taste.
 *
 * A refinement sprint that starts in an editor is guessing. This walks the four family stages,
 * captures full-page evidence, and MEASURES the things the brief names: dead whitespace, the
 * number of distinct type sizes and radii in play, control alignment, and how much a collapsed
 * page communicates.
 *
 * It writes `evidence/ux-audit/<phase>.json` so before/after is a diff of numbers rather than a
 * pair of adjectives. Run with UX_AUDIT_PHASE=before|after.
 */

import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * OPT-IN ONLY. This file matches the certify project's `*.cert.spec.ts` glob, so a plain
 * `alloy-certify verify` would run it — and with a defaulted phase it would silently OVERWRITE
 * the recorded baseline with post-change measurements. A measurement harness that can destroy its
 * own control is worse than no harness. Set UX_AUDIT_PHASE explicitly to run it.
 */
const PHASE = process.env.UX_AUDIT_PHASE ?? "";
const OUT = path.join(__dirname, "..", "evidence", "ux-audit", PHASE || "unset");

const STAGES = ["lead", "tour", "decision", "waitlist"] as const;

type StageMetrics = {
    stage: string;
    /** Fraction of the editor column's pixels covered by no text/control at all. */
    deadSpaceRatio: number;
    editorWidthPx: number;
    contentWidthPx: number;
    /** Widest run of horizontal emptiness to the right of content, in px. */
    rightGutterPx: number;
    distinctFontSizes: string[];
    distinctRadii: string[];
    /** Left edges of labelled controls — a disciplined grid has very few. */
    controlLeftEdges: number[];
    /** Share of labelled controls landing on the six dominant columns. */
    gridAdherence: number;
    controlCount: number;
    charsPerThousandPx: number;
    collapsedTextChars: number;
    collapsedAnswers: Record<string, boolean>;
    pageHeightPx: number;
};

async function openStage(page: import("@playwright/test").Page, stage: string) {
    await page.goto("/adminV2/settings/organization/processes");
    await page.waitForLoadState("domcontentloaded");
    const close = page.getByTestId("business-process-close-wizard");
    if (await close.count()) await close.first().click().catch(() => {});

    // The BOS assistant floats over the right half of the viewport; it would corrupt both the
    // screenshots and the width measurements.
    const bosClose = page.getByRole("button", { name: "Close", exact: true });
    if (await bosClose.count()) await bosClose.first().click().catch(() => {});

    await page.getByTestId("business-process-tab-stages").click();
    // "Loading process…" renders before the stage tabs exist — wait for the real thing.
    const tab = page.getByTestId(`lifecycle-stage-tab-${stage}`);
    await tab.waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
    if (!(await tab.count())) return false;
    await tab.click();
    await page.getByTestId("stage-editor-v2").waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForTimeout(1200);
    return true;
}

/**
 * Measure the editor column. Dead space is computed from the union of text/control bounding
 * boxes against the column's own box — an honest ratio, not a guess about padding.
 */
async function measure(page: import("@playwright/test").Page, stage: string): Promise<StageMetrics | null> {
    return page.evaluate((stageKey) => {
        const editor = document.querySelector('[data-testid="stage-editor-v2"]') as HTMLElement | null;
        if (!editor) return null;
        const box = editor.getBoundingClientRect();

        const fontSizes = new Set<string>();
        const radii = new Set<string>();
        const leftEdges: number[] = [];
        let inkArea = 0;
        let contentRight = box.left;

        const leaves: HTMLElement[] = [];
        editor.querySelectorAll("*").forEach((el) => {
            const node = el as HTMLElement;
            const cs = getComputedStyle(node);
            if (cs.display === "none" || cs.visibility === "hidden") return;
            const r = node.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) return;

            const isControl = /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(node.tagName);
            const ownText = Array.from(node.childNodes)
                .filter((n) => n.nodeType === Node.TEXT_NODE)
                .map((n) => (n.textContent || "").trim())
                .join("");

            if (isControl || ownText.length) {
                fontSizes.add(cs.fontSize);
                leaves.push(node);
                inkArea += r.width * r.height;
                contentRight = Math.max(contentRight, r.right);
                if (isControl || /LABEL|H1|H2|H3|H4|P/.test(node.tagName)) {
                    leftEdges.push(Math.round(r.left - box.left));
                }
            }
            if (isControl || node.className?.toString?.().includes("rounded")) {
                if (cs.borderRadius && cs.borderRadius !== "0px") radii.add(cs.borderRadius);
            }
        });

        const area = box.width * box.height;

        /**
         * Grid discipline, measured as ADHERENCE rather than as a count of distinct edges.
         * Counting distinct edges punishes a page for having more content — a deeply nested but
         * perfectly aligned layout scores worse than a shallow sloppy one. What matters is the
         * share of controls that land on the layout's dominant columns.
         */
        const edgeFreq = new Map<number, number>();
        for (const e of leftEdges) edgeFreq.set(e, (edgeFreq.get(e) ?? 0) + 1);
        const ranked = [...edgeFreq.entries()].sort((a, b) => b[1] - a[1]);
        const topEdges = ranked.slice(0, 6);
        const onGrid = topEdges.reduce((n, [, c]) => n + c, 0);
        const gridAdherence = leftEdges.length ? onGrid / leftEdges.length : 1;

        return {
            stage: stageKey,
            // Nested boxes double-count, so clamp — this is a relative signal across phases,
            // measured identically before and after, not an absolute truth.
            deadSpaceRatio: Math.max(0, Math.min(1, 1 - inkArea / Math.max(area, 1))),
            editorWidthPx: Math.round(box.width),
            contentWidthPx: Math.round(contentRight - box.left),
            rightGutterPx: Math.round(box.right - contentRight),
            distinctFontSizes: [...fontSizes].sort(
                (a, b) => parseFloat(a) - parseFloat(b),
            ),
            distinctRadii: [...radii].sort(),
            controlLeftEdges: [...new Set(leftEdges)].sort((a, b) => a - b),
            gridAdherence,
            controlCount: leftEdges.length,
            /** Content per vertical pixel — the honest reading of "density". */
            charsPerThousandPx:
                Math.round(
                    ((editor.innerText || "").replace(/\s+/g, " ").trim().length / Math.max(box.height, 1)) * 1000,
                ),
            collapsedTextChars: (editor.innerText || "").replace(/\s+/g, " ").trim().length,
            collapsedAnswers: {},
            pageHeightPx: Math.round(box.height),
        } as StageMetrics;
    }, stage);
}

/** The eight questions a director should be able to answer without expanding anything. */
function collapsedAnswers(text: string, stage: string): Record<string, boolean> {
    const t = text.toLowerCase();
    return {
        whatStageIsThis: t.includes(stage),
        whatStaffDo: /work item|contact family|no work items/.test(t),
        howFamiliesLeave: /ways out|continue to|close as|no ways out/.test(t),
        whatNeedsAttention: /attention/.test(t),
        whatCanHappen: /outcome/.test(t),
    };
}

test.describe("stage configuration UX audit", () => {
    test.skip(!PHASE, "UX_AUDIT_PHASE not set — measurement is opt-in");

    test(`captures and measures the family stages (${PHASE})`, async ({ page }) => {
        fs.mkdirSync(OUT, { recursive: true });
        await page.setViewportSize({ width: 1512, height: 982 });

        const all: StageMetrics[] = [];

        for (const stage of STAGES) {
            const ok = await openStage(page, stage);
            if (!ok) {
                console.log(`  [audit] stage ${stage} not present — skipped`);
                continue;
            }

            /**
             * Three DEFINED states, so before/after compares like with like. Measuring "the page
             * as it happens to open" would flatter or damn either phase purely by which sections
             * default to open — which this sprint deliberately changes.
             */
            const setSections = async (open: boolean) => {
                for (const id of ["experience", "requirements", "representation", "identity"]) {
                    // The section header is the FIRST DIRECT child button. Matching any
                    // descendant with aria-expanded would hit nested pickers and toggle the
                    // section the wrong way — which silently corrupted an earlier measurement.
                    const header = page.locator(`#stage-section-${id} > button`).first();
                    if (!(await header.count())) continue;
                    const isOpen = (await header.getAttribute("aria-expanded")) === "true";
                    if (isOpen !== open) await header.click().catch(() => {});
                    await page.waitForTimeout(200);
                }
            };

            // ── State 1: landing — what the operator actually gets on arrival.
            await page.screenshot({ path: path.join(OUT, `${stage}-01-landing.png`), fullPage: true });
            const landingText = await page.getByTestId("stage-editor-v2").innerText().catch(() => "");

            // ── State 2: every section collapsed. The progressive-disclosure test.
            await setSections(false);
            await page.waitForTimeout(400);
            const collapsedM = await measure(page, stage);
            const collapsedText = await page.getByTestId("stage-editor-v2").innerText().catch(() => "");
            await page.screenshot({ path: path.join(OUT, `${stage}-02-collapsed.png`), fullPage: true });

            // ── State 3: every section open. Where density and grid discipline are judged.
            await setSections(true);
            const workItems = page.getByTestId("stage-operating-plan-work-items-collapsible");
            if (await workItems.count()) {
                const isOpen = await workItems.first().evaluate((el) => (el as HTMLDetailsElement).open);
                if (!isOpen) await workItems.first().locator("summary").click().catch(() => {});
            }
            await page.waitForTimeout(700);
            const expandedM = await measure(page, stage);
            await page.screenshot({ path: path.join(OUT, `${stage}-03-expanded.png`), fullPage: true });

            if (!collapsedM || !expandedM) {
                console.log(`  [audit] stage ${stage} has no editor — skipped`);
                continue;
            }

            collapsedM.collapsedAnswers = collapsedAnswers(collapsedText, stage);
            const merged: StageMetrics & { expanded: StageMetrics; landingChars: number } = {
                ...collapsedM,
                landingChars: landingText.replace(/\s+/g, " ").trim().length,
                expanded: expandedM,
            };
            all.push(merged);

            const answered = Object.values(collapsedM.collapsedAnswers).filter(Boolean).length;
            console.log(
                `  [audit] ${stage.padEnd(9)} width=${expandedM.editorWidthPx} | ` +
                    `COLLAPSED h=${collapsedM.pageHeightPx} chars=${collapsedM.collapsedTextChars} answers=${answered}/5 | ` +
                    `EXPANDED h=${expandedM.pageHeightPx} density=${expandedM.charsPerThousandPx}ch/kpx ` +
                    `sizes=${expandedM.distinctFontSizes.length} radii=${expandedM.distinctRadii.length} ` +
                    `grid=${(expandedM.gridAdherence * 100).toFixed(0)}% of ${expandedM.controlCount}`,
            );
        }

        fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(all, null, 2));
        console.log(`  [audit] wrote ${all.length} stage metrics to ${OUT}/metrics.json`);
        expect(all.length).toBeGreaterThan(0);
    });
});
