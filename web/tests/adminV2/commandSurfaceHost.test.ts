/**
 * A COMMAND WITH NOTHING LEFT TO COLLECT SHOULD JUST RUN.
 *
 * The four interaction hosts each name a place the operator goes to SUPPLY something: `inline_form`
 * collects fields, `communications_composer` composes, `form_delivery` picks a form,
 * `header_delegate` hands the command to the record header. None described the command that needs
 * nothing more.
 *
 * `stage_work.start` is that command. The Focus Panel already holds the subject — a specific child
 * at a specific stage — and configuration already bound the work template. Routed through
 * `header_delegate` it reached an opportunity-scoped host with no child-subject command, and the
 * operator was told, live on staging, to "use drawer header actions" for an action the drawer header
 * does not carry.
 *
 * So the host is generic and the command is not special: it forwards an identity, a subject and
 * whatever configuration bound, through the one registered-action route. Nothing here decides
 * whether the command may run — the server does, and a refusal comes back as a refusal.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import { resolveCurrentWorkActionSurface } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionSurface";
import {
    isCurrentWorkActionExecutable,
    planCurrentWorkActionExecution,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import { executeCommandSurfaceAction } from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCommandSurfaceAction";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

const read = (rel: string) => readFileSync(resolve(__dirname, "../..", rel), "utf8");
const KEY = "stage_work.start";

function action(over: Partial<CurrentWorkActionVM> = {}): CurrentWorkActionVM {
    return {
        key: KEY,
        label: "Offer spot",
        category: "supporting",
        placement: "current_work_supporting",
        handlerKey: KEY,
        actionRef: KEY,
        resolved: null,
        workTemplateKey: "offer_spot",
        ...over,
    } as CurrentWorkActionVM;
}

/** A fetch that records the call and never reaches a network. */
function recordingFetch(body: unknown = { ok: true, data: { started: true } }, status = 200) {
    return vi.fn(async () => ({ ok: status < 400, json: async () => body })) as unknown as typeof fetch;
}

describe("command_surface — the host", () => {
    it("1. a canonical action can declare the command_surface host", () => {
        expect(canonicalActionDefinition(KEY)!.interactionHost).toBe("command_surface");
    });

    it("resolves to command_surface and plans to run here", () => {
        expect(resolveCurrentWorkActionSurface(action())).toBe("command_surface");
        expect(planCurrentWorkActionExecution(action()).kind).toBe("command_surface");
    });

    it("is executable — it was not, and that is why the operator saw a dead end", () => {
        expect(isCurrentWorkActionExecutable(action())).toBe(true);
    });

    it("12. header_delegate is unchanged for the commands that actually use it", () => {
        const delegated = action({ key: "update_lead_status", handlerKey: "update_lead_status", actionRef: "update_lead_status", workTemplateKey: undefined });
        // Whatever host that command resolves to, it must not have become command_surface.
        expect(resolveCurrentWorkActionSurface(delegated)).not.toBe("command_surface");
    });
});

describe("command_surface — execution", () => {
    it("4. executes through the ONE registered-action route, not a new path", async () => {
        const f = recordingFetch();
        await executeCommandSurfaceAction(
            { actionKey: KEY, entityType: "child", entityId: "child-1", payload: { template_key: "offer_spot" } },
            f,
        );
        const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
        expect(url).toBe("/api/admin/actions/execute");
        expect(init.method).toBe("POST");
    });

    it("2 & 3. the resolved subject and the bound payload reach execution unchanged", async () => {
        const f = recordingFetch();
        await executeCommandSurfaceAction(
            { actionKey: KEY, entityType: "child", entityId: "child-1", payload: { template_key: "offer_spot" } },
            f,
        );
        const [, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
        const sent = JSON.parse(String(init.body));
        expect(sent.action_key).toBe(KEY);
        // The CHILD, never the enclosing opportunity — that substitution is what broke this command.
        expect(sent.entity_type).toBe("child");
        expect(sent.entity_id).toBe("child-1");
        expect(sent.payload).toEqual({ template_key: "offer_spot" });
    });

    it("7. an eligibility refusal stays authoritative and is reported verbatim", async () => {
        const f = recordingFetch({ ok: false, error: "This child has already left Waitlist." }, 200);
        const out = await executeCommandSurfaceAction({ actionKey: KEY, entityType: "child", entityId: "c" }, f);
        expect(out).toEqual({ ok: false, error: "This child has already left Waitlist." });
    });

    it("9. a transport failure is reported, never swallowed into a false success", async () => {
        const boom = vi.fn(async () => { throw new Error("network down"); }) as unknown as typeof fetch;
        const out = await executeCommandSurfaceAction({ actionKey: KEY, entityType: "child", entityId: "c" }, boom);
        expect(out.ok).toBe(false);
    });

    it("NO-OP PREVENTION — an unresolved subject refuses before reaching the route", async () => {
        /*
         * The property the whole surface rests on. Guessing a subject would put the work on the
         * wrong record, which is worse than failing; and presenting as having run would be the
         * dead button this host exists to remove.
         */
        const f = recordingFetch();
        for (const bad of [
            { actionKey: KEY, entityType: "child", entityId: "   " },
            { actionKey: KEY, entityType: "", entityId: "child-1" },
            { actionKey: "   ", entityType: "child", entityId: "child-1" },
        ]) {
            const out = await executeCommandSurfaceAction(bad, f);
            expect(out.ok, JSON.stringify(bad)).toBe(false);
        }
        expect(f).not.toHaveBeenCalled();
    });

    it("omits payload entirely when configuration bound nothing", async () => {
        const f = recordingFetch();
        await executeCommandSurfaceAction({ actionKey: "some_command", entityType: "child", entityId: "c" }, f);
        const [, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
        expect(JSON.parse(String(init.body))).not.toHaveProperty("payload");
    });
});

describe("command_surface — what it must not become", () => {
    const host = () => read("lib/adminV2/runtime/focusPanel/currentWork/executeCommandSurfaceAction.ts");

    it("5 & 6. names no action, no work template and no process", () => {
        const code = host()
            .split("\n")
            .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.includes("/*"))
            .join("\n");
        for (const forbidden of ["offer_spot", "waitlist", "enrolling", "review_waitlist_position"]) {
            expect(code.toLowerCase(), `the host must not name "${forbidden}"`).not.toContain(forbidden);
        }
    });

    it("adds no second mutation path", () => {
        // One route, and only one. A direct table write or a bespoke endpoint here would put an
        // invariant outside the runtime that owns it.
        const code = host();
        expect(code.match(/fetchImpl\(/g) ?? []).toHaveLength(1);
        expect(code).toContain("/api/admin/actions/execute");
        expect(code).not.toMatch(/supabase|from\(["']/);
    });

    it("8. does not decide confirmation policy", () => {
        // It sends the operator's press. The action declares whether a preview or second decision is
        // required, and the caller renders that BEFORE reaching here.
        expect(host()).toContain("confirmation: { confirmed: true }");
        expect(host()).toContain("must never be the thing that");
    });

    it("the card runs it against the surface's own subject, not the opportunity", () => {
        const card = read("components/admin/focusPanel/cards/CurrentWorkCard.tsx");
        expect(card).toContain("runCommandSurfaceAction");
        expect(card).toContain("context.truth?.row_subject");
        expect(card).toContain("action.workTemplateKey ? { payload: { template_key: action.workTemplateKey } }");
    });

    it("10. success takes the canonical completion path", () => {
        expect(read("components/admin/focusPanel/cards/CurrentWorkCard.tsx")).toContain("handleActionPanelComplete();");
    });
});

/**
 * THE PROCESS CARD IS A SECOND CALLER, AND IT HAD ITS OWN SWITCH.
 *
 * Wiring `command_surface` into Current Work was not enough. The control an operator actually
 * presses on the Waitlist Process Card is composed by `BusinessProcessCard`, which plans through the
 * same planner but dispatches through its OWN switch — and `command_surface` fell into its
 * `default:` branch, which carries the command into the Current Work workspace. That workspace hosts
 * capability surfaces, has no host for a command that needs nothing, and rendered
 * "This action cannot be run from What's Next" for an action no other host carries.
 *
 * Measured live: the label read "Offer spot", the selector matched one element, and thirty minutes
 * of deploy polling never produced an execute POST — because the click was never going to make one.
 */
describe("command_surface — the Process Card path", () => {
    const card = () => read("components/admin/focusPanel/cards/BusinessProcessCard.tsx");

    it("dispatches command_surface itself rather than falling through to the workspace", () => {
        const src = card();
        expect(src).toContain('case "command_surface"');
        expect(src).toContain("executeCommandSurfaceAction");
        // The default branch still exists for the surfaces that genuinely belong in the workspace.
        expect(src).toContain("default:");
    });

    it("runs against the card's own subject, never the enclosing case", () => {
        expect(card()).toContain("context.truth?.row_subject");
    });

    it("carries the configured template through to the payload", () => {
        expect(card()).toContain("plan.action.workTemplateKey");
        expect(card()).toContain("template_key: plan.action.workTemplateKey");
    });

    it("refreshes only on success, through the canonical scoped update", () => {
        const src = card();
        expect(src).toContain("dispatchOpportunityDrawerScopedUpdate");
        // A refusal must not redraw and imply something happened.
        expect(src).toContain("if (result.ok && drawerOpportunityId)");
    });
});
