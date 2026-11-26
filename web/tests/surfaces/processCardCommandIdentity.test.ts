/**
 * LAUNCHER SELECTION MAY CHANGE HOW A CONFIGURED COMMAND IS PRESENTED.
 * IT MUST NEVER CHANGE WHICH CONFIGURED COMMAND IS INVOKED.
 *
 * That invariant held everywhere on the Process card except one branch. When a configured
 * command resolved to the `communications_composer` interaction host, `BusinessProcessCard`
 * dropped it and called `resolveCommunicationsComposerAction()`, which returns the FIRST
 * record-header action whose key, label or description matches a broad outreach regex.
 *
 * So a configured `send_tour_invitation` executed as whatever generic outreach action matched
 * first — normally `quick_message` — and the operator landed in a blank Compose New with the
 * tour, the recipient and the prepared invitation draft all discarded.
 *
 * Nothing underneath was missing. Carrying the identity into the shared command workspace
 * reaches the canonical path Current Work already used, where the action is matched by
 * `key` / `actionRef` / `handlerKey` and executed with `mode: "prepare"` — minting and
 * rendering the invitation WITHOUT sending it — before the contextual composer opens.
 *
 * These assertions are contract-level rather than label-level on purpose: asserting button text
 * is precisely the habit that produced the defect.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveCurrentWorkActionSurface } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionSurface";
import { planCurrentWorkActionExecution } from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import { resolveCommunicationsComposerAction } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCommunicationsComposerAction";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const readSrc = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");

const card = readSrc("components/admin/focusPanel/cards/BusinessProcessCard.tsx");

function action(over: Partial<CurrentWorkActionVM> & { key: string }): CurrentWorkActionVM {
    return {
        label: over.key,
        description: null,
        category: "communication",
        placement: "current_work_supporting",
        handlerKey: null,
        actionRef: null,
        resolved: null,
        ...over,
    } as CurrentWorkActionVM;
}

describe("the communications host still resolves as the registry declares", () => {
    it("keeps send_tour_invitation on communications_composer, not header_delegate", () => {
        // The registry comment is explicit: header_delegate "fabricated a registry execute and
        // silently sent". Rerouting the host would be a send-safety regression, not a fix.
        expect(resolveCurrentWorkActionSurface(action({ key: "send_tour_invitation" })))
            .toBe("communications_composer");
        const registry = readSrc("lib/admin/actions/actionDefinitionRegistry.ts");
        const at = registry.indexOf('key: "send_tour_invitation"');
        expect(at).toBeGreaterThan(-1);
        expect(registry.slice(at, at + 800)).toContain('interactionHost: "communications_composer"');
    });

    it("plans that host without inspecting labels", () => {
        const plan = planCurrentWorkActionExecution(action({ key: "send_tour_invitation" }));
        expect(plan.kind).toBe("communications_composer");
    });
});

describe("the Process card carries the configured command's identity", () => {
    it("opens the shared workspace on the configured key, and substitutes nothing", () => {
        const branch = card.slice(
            card.indexOf('case "communications_composer":'),
            card.indexOf('case "header_delegate":'),
        );
        expect(branch).toContain('coordination?.openCurrentWorkWorkspace?.({ kind: "action", actionKey: command.key })');
        // The substitution, gone: no resolver call, no header invoke, in this branch.
        expect(branch).not.toMatch(/resolveCommunicationsComposerAction\?\.\(\)/);
        expect(branch).not.toMatch(/invokeHeaderAction\?\.\(composer\)/);
    });

    it("never invokes a command the projection did not produce", () => {
        // Every invocation in the card's switch is keyed on the configured command or its plan.
        const invoke = card.slice(card.indexOf("const invoke = useCallback"), card.indexOf("const tourPresentation"));
        const invocations = invoke.match(/invokeHeaderAction\?\.\(([^)]*)\)/g) ?? [];
        for (const call of invocations) {
            expect(call, `invocation must carry the configured command: ${call}`).toMatch(/resolved|plan\.action|command/);
        }
    });

    it("leaves the generic resolver in place for the handoff that legitimately needs it", () => {
        // A work-item handoff ("reach out about this work") has no configured command to carry,
        // so choosing a composer generically is correct there. Scope, not deletion.
        expect(readSrc("lib/adminV2/runtime/focusPanel/currentWork/resolveWorkItemHandoff.ts"))
            .toContain("resolveCommunicationsComposerAction");
    });
});

describe("no configured command is identified by its display text", () => {
    it("the generic resolver really does match on labels — which is why it must not select commands", () => {
        const actions = [
            { key: "quick_message", label: "Message", description: "Send a message" },
            { key: "send_tour_invitation", label: "Send Tour Invitation", description: "Invite to tour" },
        ] as ResolvedActionForClient[];
        // It returns the FIRST regex match, which is not the configured command.
        expect(resolveCommunicationsComposerAction(actions)?.key).toBe("quick_message");
    });

    it("host resolution ignores label and description entirely", () => {
        const surfaceFromKey = resolveCurrentWorkActionSurface(action({ key: "send_tour_invitation" }));
        const renamed = resolveCurrentWorkActionSurface(
            action({ key: "send_tour_invitation", label: "Anything At All", description: "unrelated prose" }),
        );
        expect(renamed).toBe(surfaceFromKey);
    });
});
