import { config as loadEnv } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const LIVE = process.env.PLAYWRIGHT_LIVE_DRAWER_PROBE === "1";
const REQUESTED_RECORD_ID = "1dd83998-4e42-450c-b45e-84ab1b8798ea";
const WORK_UNIT_SLUG = "new-leads";

async function resolveProbeRecordId(page: import("@playwright/test").Page): Promise<{
    recordId: string;
    requestedRecordStatus: number | null;
    resolution: string;
}> {
    const requestedVm = await page.request.get(
        `/api/admin/view-models/drawer/opportunity/${encodeURIComponent(REQUESTED_RECORD_ID)}`
    );
    const requestedStatus = requestedVm.status();
    if (requestedStatus === 200) {
        return {
            recordId: REQUESTED_RECORD_ID,
            requestedRecordStatus: requestedStatus,
            resolution: "requested_record",
        };
    }

    const slugRes = await page.request.get(
        `/api/admin/work-units/by-slug/${encodeURIComponent(WORK_UNIT_SLUG)}`
    );
    if (slugRes.ok()) {
        const slugJson = (await slugRes.json()) as { work_unit_id?: string };
        const workUnitId = slugJson.work_unit_id?.trim();
        if (workUnitId) {
            const queuesRes = await page.request.get(
                `/api/admin/work-units/${encodeURIComponent(workUnitId)}/queues?limit=1`
            );
            if (queuesRes.ok()) {
                const queuesJson = (await queuesRes.json()) as {
                    lanes?: Array<{ items?: Array<{ id?: string }> }>;
                };
                for (const lane of queuesJson.lanes ?? []) {
                    const first = lane.items?.[0]?.id?.trim();
                    if (first) {
                        return {
                            recordId: first,
                            requestedRecordStatus: requestedStatus,
                            resolution: "new_leads_queue_first_row",
                        };
                    }
                }
            }
        }
    }

    const searchRes = await page.request.get("/api/admin/global-search?q=household&limit=20");
    if (searchRes.ok()) {
        const searchJson = (await searchRes.json()) as {
            results?: Array<{ entity_type?: string; id?: string }>;
        };
        const opp = searchJson.results?.find((r) => r.entity_type === "opportunity" && r.id);
        if (opp?.id) {
            return {
                recordId: opp.id,
                requestedRecordStatus: requestedStatus,
                resolution: "global_search_opportunity",
            };
        }
    }

    throw new Error(
        `No drawable opportunity found. Requested record ${REQUESTED_RECORD_ID} returned HTTP ${requestedStatus}.`
    );
}
const outDir = path.join(__dirname, "../../../docs/sprints/06_2026/assets/live-drawer-panel-probe");

type ProbeBundle = {
    audit: unknown;
    probe700: unknown;
    probe1100: unknown;
    restore: unknown;
    cssOwnership: unknown;
};

test.describe("Live drawer panel CSS var probe", () => {
    test.skip(!LIVE, "Set PLAYWRIGHT_LIVE_DRAWER_PROBE=1");
    test.describe.configure({ timeout: 300_000 });

    test.beforeEach(async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
    });

    test("run __alloyAuditDrawerPanel + width probes on new-leads record route", async ({ page }) => {
        test.setTimeout(300_000);
        fs.mkdirSync(outDir, { recursive: true });

        const { recordId, requestedRecordStatus, resolution } = await resolveProbeRecordId(page);
        const recordUrl = `/workspace/work-unit/${WORK_UNIT_SLUG}/${recordId}`;

        // eslint-disable-next-line no-console -- playwright artifact
        console.log("probeRecordResolution:", { recordId, requestedRecordStatus, resolution, recordUrl });

        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.goto(recordUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });

        const preProbeDom = await page.evaluate(() => ({
            pathname: window.location.pathname,
            modalPanels: document.querySelectorAll(".adminv2-drawer-modal-panel").length,
            sidebarPanels: document.querySelectorAll(".adminv2-drawer-sidebar-panel").length,
            drawerNodes: document.querySelectorAll("[data-adminv2-drawer='true']").length,
            workspaceShellFlag: document.documentElement.getAttribute("data-adminv2-workspace-shell"),
            openingOverlay: document.querySelector("[data-opportunity-drawer-opening-overlay]")
                ? true
                : false,
        }));

        // eslint-disable-next-line no-console -- playwright artifact
        console.log("preProbeDom:", JSON.stringify(preProbeDom));

        await page.waitForFunction(
            () => document.documentElement.getAttribute("data-adminv2-workspace-shell") === "v2",
            null,
            { timeout: 60_000 }
        );

        const modalPanel = page.locator(".adminv2-drawer-modal-panel").first();
        await expect(modalPanel).toBeVisible({ timeout: 180_000 });

        await page.waitForFunction(
            () => typeof window.__alloyAuditDrawerPanel === "function",
            null,
            { timeout: 30_000 }
        );

        const bundle = await page.evaluate(async (): Promise<ProbeBundle> => {
            function pickVisiblePanel(): HTMLElement | null {
                const panels = document.querySelectorAll(".adminv2-drawer-modal-panel");
                for (const node of panels) {
                    const el = node as HTMLElement;
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) return el;
                }
                return null;
            }

            function findWinningDeclaration(el: HTMLElement, prop: "width" | "max-width") {
                const inline = el.style.getPropertyValue(prop);
                const inlinePriority = el.style.getPropertyPriority(prop);
                const computed = getComputedStyle(el);
                const computedVal = computed.getPropertyValue(prop);

                const workspaceShell = document.documentElement.getAttribute("data-adminv2-workspace-shell");
                const hasBosRail = el.classList.contains("adminv2-drawer-modal-panel--bos-rail");

                let matchedRule: string | null = null;
                try {
                    for (const sheet of Array.from(document.styleSheets)) {
                        try {
                            const rules = sheet.cssRules;
                            for (const rule of Array.from(rules)) {
                                if (!(rule instanceof CSSStyleRule)) continue;
                                const decl = rule.style.getPropertyValue(prop);
                                if (!decl) continue;
                                try {
                                    if (!el.matches(rule.selectorText)) continue;
                                } catch {
                                    continue;
                                }
                                matchedRule = `${rule.selectorText} { ${prop}: ${decl}${rule.style.getPropertyPriority(prop) === "important" ? " !important" : ""} }`;
                            }
                        } catch {
                            // cross-origin sheet
                        }
                    }
                } catch {
                    // ignore
                }

                const varName = "--adminv2-drawer-computed-width";
                const htmlInlineVar = document.documentElement.style.getPropertyValue(varName).trim();
                const htmlComputedVar = getComputedStyle(document.documentElement)
                    .getPropertyValue(varName)
                    .trim();

                const parentChain: Array<{
                    tag: string;
                    className: string;
                    overflowX: string;
                    overflow: string;
                    width: string;
                    maxWidth: string;
                    clipPath: string;
                    rectWidth: number;
                }> = [];

                let parent: HTMLElement | null = el.parentElement;
                let depth = 0;
                while (parent && depth < 8) {
                    const cs = getComputedStyle(parent);
                    const r = parent.getBoundingClientRect();
                    parentChain.push({
                        tag: parent.tagName.toLowerCase(),
                        className: parent.className?.slice?.(0, 120) ?? "",
                        overflowX: cs.overflowX,
                        overflow: cs.overflow,
                        width: cs.width,
                        maxWidth: cs.maxWidth,
                        clipPath: cs.clipPath,
                        rectWidth: Math.round(r.width),
                    });
                    parent = parent.parentElement;
                    depth += 1;
                }

                const panelRect = el.getBoundingClientRect();

                return {
                    prop,
                    inline: inline || null,
                    inlinePriority: inlinePriority || null,
                    computed: computedVal,
                    matchedAuthorRule: matchedRule,
                    expectedBosRailRule:
                        workspaceShell === "v2" && hasBosRail ?
                            `html[data-adminv2-workspace-shell="v2"] .adminv2-drawer-modal-panel--bos-rail { ${prop}: var(--adminv2-drawer-computed-width) !important }`
                        :   null,
                    htmlWorkspaceShell: workspaceShell,
                    hasBosRailClass: hasBosRail,
                    cssVarOnHtmlInline: htmlInlineVar || null,
                    cssVarOnHtmlComputed: htmlComputedVar || null,
                    inlineUsesWidthVar: el.style.width.includes("var(--adminv2-drawer-computed-width)"),
                    panelRect: {
                        left: Math.round(panelRect.left),
                        right: Math.round(panelRect.right),
                        width: Math.round(panelRect.width),
                    },
                    parentChain,
                    allModalPanels: Array.from(document.querySelectorAll(".adminv2-drawer-modal-panel")).map(
                        (node, i) => {
                            const h = node as HTMLElement;
                            const r = h.getBoundingClientRect();
                            return {
                                index: i,
                                className: h.className,
                                visible: r.width > 0 && r.height > 0,
                                width: Math.round(r.width),
                                dataDrawer: h.getAttribute("data-adminv2-drawer"),
                            };
                        }
                    ),
                };
            }

            const audit = window.__alloyAuditDrawerPanel?.();
            const probe700 = await window.__alloyProbeDrawerWidth?.(700);
            const probe1100 = await window.__alloyProbeDrawerWidth?.(1100);
            const restore = window.__alloyRestoreDrawerGeometry?.();

            const panel = pickVisiblePanel();
            const cssOwnership = panel ?
                {
                    width: findWinningDeclaration(panel, "width"),
                    maxWidth: findWinningDeclaration(panel, "max-width"),
                }
            :   null;

            return { audit, probe700, probe1100, restore, cssOwnership };
        });

        const outPath = path.join(outDir, "probe-bundle.json");
        fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2), "utf8");

        // eslint-disable-next-line no-console -- playwright artifact
        console.log("=== RAW __alloyAuditDrawerPanel ===");
        // eslint-disable-next-line no-console -- playwright artifact
        console.log(JSON.stringify(bundle.audit, null, 2));
        // eslint-disable-next-line no-console -- playwright artifact
        console.log("=== RAW __alloyProbeDrawerWidth(700) ===");
        // eslint-disable-next-line no-console -- playwright artifact
        console.log(JSON.stringify(bundle.probe700, null, 2));
        // eslint-disable-next-line no-console -- playwright artifact
        console.log("=== RAW __alloyProbeDrawerWidth(1100) ===");
        // eslint-disable-next-line no-console -- playwright artifact
        console.log(JSON.stringify(bundle.probe1100, null, 2));
        // eslint-disable-next-line no-console -- playwright artifact
        console.log("=== RAW __alloyRestoreDrawerGeometry ===");
        // eslint-disable-next-line no-console -- playwright artifact
        console.log(JSON.stringify(bundle.restore, null, 2));
        // eslint-disable-next-line no-console -- playwright artifact
        console.log("=== CSS OWNERSHIP ===");
        // eslint-disable-next-line no-console -- playwright artifact
        console.log(JSON.stringify(bundle.cssOwnership, null, 2));

        expect(bundle.audit).toBeTruthy();
        expect(bundle.probe700).toBeTruthy();
        expect(bundle.probe1100).toBeTruthy();
    });
});
