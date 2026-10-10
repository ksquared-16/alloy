// @vitest-environment jsdom
/**
 * Slice 4 — E2E-01 / E2E-02: Create Lead → Open Lead.
 *
 * E2E-02 measured on deployed staging: Open Lead changed the address to
 * `/workspace/work-unit/new?work_view_id=new_leads&subject_id=<opp>` and the surface stayed blank —
 * BOS pushes from above the Runtime Kernel, where a push to a seed-only work-unit route paints nothing.
 * E2E-01 measured there too: the review printed the phone as typed digits, and Continue (no API call)
 * stood between the review and Confirm.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { openCreatedLead } from "@/lib/platform/commands/createLead/openCreatedLead";
import { ADMINV2_OPERATOR_FOCUS_SELECTION_EVENT } from "@/lib/runtime/focus/operatorFocusSelection";
import { summarizeCommitParents } from "@/lib/bos/commandSession/createLeadRepeaterDraft";
import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import {
    applyCreateLeadParseToDraft,
    buildCreateLeadBosPreview,
    emptyBosCommandDraft,
    executeCreateLeadFromBosDraft,
    type CreateLeadAdapterContext,
} from "@/lib/bos/commandSession";

const webRoot = process.cwd();
const HREF = "/workspace/work-unit/new?work_view_id=new_leads&subject_id=opp-a";

function captureSelections() {
    const seen: unknown[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(ADMINV2_OPERATOR_FOCUS_SELECTION_EVENT, on);
    return { seen, stop: () => window.removeEventListener(ADMINV2_OPERATOR_FOCUS_SELECTION_EVENT, on) };
}

describe("E2E-02 — Open Lead moves attention to the created record", () => {
    let stop: (() => void) | null = null;
    afterEach(() => stop?.());

    it("inside the workspace it states the focus intent for the created record in its Work View — no route push", () => {
        const c = captureSelections();
        stop = c.stop;
        const push = vi.fn();
        const how = openCreatedLead({ href: HREF, opportunityId: "opp-a", pathname: "/workspace", push });
        expect(how).toBe("focus_selection");
        expect(push).not.toHaveBeenCalled();
        expect(c.seen).toEqual([
            { entity_type: "opportunities", entity_id: "opp-a", host_work_view_id: "new_leads", host_work_unit_key: null },
        ]);
    });

    it("uses the Work View the server returned — nothing is hard-coded to New Leads", () => {
        const c = captureSelections();
        stop = c.stop;
        openCreatedLead({
            href: "/workspace/work-unit/tours?work_view_id=tours_next_7&subject_id=opp-b",
            opportunityId: "opp-b",
            pathname: "/workspace/work-unit/new",
            push: vi.fn(),
        });
        expect(c.seen).toEqual([
            { entity_type: "opportunities", entity_id: "opp-b", host_work_view_id: "tours_next_7", host_work_unit_key: null },
        ]);
    });

    it("with only a work unit resolved, it moves to that unit", () => {
        const c = captureSelections();
        stop = c.stop;
        openCreatedLead({ href: "/workspace/work-unit/enrollment?subject_id=opp-c", opportunityId: "opp-c", pathname: "/workspace", push: vi.fn() });
        expect(c.seen).toEqual([
            { entity_type: "opportunities", entity_id: "opp-c", host_work_view_id: null, host_work_unit_key: "enrollment" },
        ]);
    });

    it("a second creation opens the second record — no id carries over", () => {
        const c = captureSelections();
        stop = c.stop;
        openCreatedLead({ href: HREF, opportunityId: "opp-a", pathname: "/workspace", push: vi.fn() });
        openCreatedLead({
            href: "/workspace/work-unit/new?work_view_id=new_leads&subject_id=opp-z",
            opportunityId: "opp-z",
            pathname: "/workspace",
            push: vi.fn(),
        });
        expect(c.seen.map((d) => (d as { entity_id: string }).entity_id)).toEqual(["opp-a", "opp-z"]);
    });

    it("outside the workspace layout a push is a genuine cold entry and stays a push", () => {
        const c = captureSelections();
        stop = c.stop;
        const push = vi.fn();
        expect(openCreatedLead({ href: HREF, opportunityId: "opp-a", pathname: "/admin/messages", push })).toBe("push");
        expect(push).toHaveBeenCalledWith(HREF);
        expect(c.seen).toHaveLength(0);
    });

    it("both Create Lead openers use it (BOS session and the legacy event host)", () => {
        const bos = readFileSync(resolve(webRoot, "app/adminV2/components/aiCommandSurface/commandSession/BosCommandSessionHost.tsx"), "utf8");
        const legacy = readFileSync(resolve(webRoot, "components/presentation/rightRail/CreateLeadEventHost.tsx"), "utf8");
        for (const src of [bos, legacy]) {
            expect(src).toContain("openCreatedLead({");
            expect(src).not.toMatch(/router\.push\(\s*(target|focusPanelHref)/);
        }
    });
});

describe("E2E-01 — Create Lead review", () => {
    const ctx: CreateLeadAdapterContext = {
        departmentId: "dept-1",
        workUnitId: "wu-1",
        surface: "bos_recommendations",
        spec: createLeadParserSpec("dept-1"),
    };

    it("shows the phone the way the rest of Alloy does", () => {
        const lines = summarizeCommitParents({
            parents: [{ id: "p1", primary: true, first_name: "Yara", last_name: "ZZQA", email: "y@test.invalid", phone: "5555550145" }],
            children: [],
        } as never);
        expect(lines[0]).toBe("Yara ZZQA · y@test.invalid · (555) 555-0145");
        const draft = applyCreateLeadParseToDraft(emptyBosCommandDraft(), ["Jordan Lee", "jordan.lee@test.com", "1231231234"].join("\n"), ctx);
        const preview = buildCreateLeadBosPreview(draft, ctx);
        expect(JSON.stringify(preview)).toContain("(123) 123-1234");
    });

    it("presentation only — the committed phone is exactly what was entered", async () => {
        const draft = applyCreateLeadParseToDraft(emptyBosCommandDraft(), ["Jordan Lee", "jordan.lee@test.com", "1231231234"].join("\n"), ctx);
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, correlation_id: "c1", data: { execution_result: { mode: "processing_review", processing_case_id: "case-1" } } }),
        });
        vi.stubGlobal("fetch", fetchMock);
        await executeCreateLeadFromBosDraft(draft, ctx);
        vi.unstubAllGlobals();
        const body = String(fetchMock.mock.calls[0]?.[1]?.body ?? "");
        expect(body).toContain("1231231234");
        expect(body).not.toContain("(123) 123-1234");
    });

    it("the review's primary is Confirm, wired to one press that confirms and executes", () => {
        const host = readFileSync(resolve(webRoot, "app/adminV2/components/aiCommandSurface/commandSession/BosCommandSessionHost.tsx"), "utf8");
        const footerPreview = host.slice(host.indexOf('session.phase === "preview" ? ('), host.indexOf('session.phase === "confirming" ? ('));
        expect(footerPreview).toContain(">\n                        Confirm\n");
        expect(footerPreview).not.toContain("Continue");
        expect(host).toContain("onConfirmPreview={() => void controller.onConfirmAndExecute()}");
        const controller = readFileSync(resolve(webRoot, "app/adminV2/components/aiCommandSurface/commandSession/useCreateLeadBosSessionController.ts"), "utf8");
        // The stale-draft check and the recorded confirmation still precede the execute.
        const fn = controller.slice(controller.indexOf("const onConfirmAndExecute"));
        expect(fn.indexOf("fingerprintBosCommandDraft")).toBeLessThan(fn.indexOf("runExecute(true)"));
        expect(fn.indexOf("onConfirmPreview()")).toBeLessThan(fn.indexOf("runExecute(true)"));
        expect(controller).toContain("if (executeInFlight.current) return;");
    });
});
