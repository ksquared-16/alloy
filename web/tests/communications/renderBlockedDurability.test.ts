/**
 * A render refusal must be durable, explainable, and unsendable.
 *
 * Carried as D-13. Eligibility refusals and provider failures were both durable
 * and operator-explainable; a RENDER refusal produced a `console.warn` and nothing
 * else. Support could see that a family was never written to and had nothing to
 * say about why.
 *
 * The fix is one narrow outcome on the EXISTING audit substrate (`workflow_events`,
 * via `emitEvent` — the same authority this module already uses for
 * `message_queued` and `message_blocked`). It is asserted at the source contract
 * level because the property that matters is structural: that a render-blocked
 * send emits a durable event and does NOT write a message row.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ENQUEUE = readFileSync(
    path.resolve(__dirname, "../../lib/communications/canonicalOutboundEnqueue.ts"),
    "utf8",
);

/** Strip comments, so an assertion about CODE is not satisfied or broken by prose. */
function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** The render-refusal branch, isolated so assertions cannot drift onto other code. */
function renderBlockBranch(): string {
    const start = ENQUEUE.indexOf("if (!renderResult.ok) {");
    expect(start, "the render refusal branch must exist").toBeGreaterThan(-1);
    const end = ENQUEUE.indexOf("const rendered = renderResult.output;", start);
    expect(end, "the render refusal branch must be bounded").toBeGreaterThan(start);
    return ENQUEUE.slice(start, end);
}

describe("the render refusal is durable", () => {
    it("emits a workflow event rather than only logging", () => {
        const branch = renderBlockBranch();
        expect(branch).toContain("emitEvent(");
        expect(branch).toContain('event_type: "message_render_blocked"');
    });

    it("records the reason and an operator sentence", () => {
        const branch = renderBlockBranch();
        expect(branch).toContain("reason: renderResult.block.code");
        expect(branch).toContain("operator_message: renderResult.block.message");
    });

    it("distinguishes itself from an eligibility block and a provider failure", () => {
        const branch = renderBlockBranch();
        // `stage` is what lets support tell the three apart on one timeline.
        expect(branch).toContain('stage: "render"');
        expect(ENQUEUE).toContain('event_type: "message_blocked"');
        expect(ENQUEUE).toContain('stage: "enqueue"');
    });
});

describe("nothing unrenderable becomes dispatchable", () => {
    it("the render branch writes NO communication_messages row", () => {
        // Comments stripped: this file discusses `communication_messages` at
        // length, and an assertion about code must not be answered by prose.
        const branch = stripComments(renderBlockBranch());
        // The dispatch poller selects from communication_messages. A row whose
        // body failed to render must never exist there — not even as `blocked`,
        // because the body it would carry is the thing that is invalid.
        expect(branch).not.toContain("insertCommunicationMessageRow");
        expect(branch).not.toContain("communication_messages");
    });

    it("it returns no message id, so no caller can treat it as sent or queued", () => {
        const branch = renderBlockBranch();
        expect(branch).toContain("communicationMessageId: null");
    });

    it("the caller is told it was refused, and why", () => {
        const branch = renderBlockBranch();
        expect(branch).toContain("skippedReason: `render_blocked:");
        expect(branch).toContain("blockedMessage: renderResult.block.message");
    });
});

describe("no unresolved template content reaches the audit row", () => {
    it("the payload carries no body, subject, or render context", () => {
        const branch = renderBlockBranch();
        const payloadStart = branch.indexOf("payload: {");
        expect(payloadStart).toBeGreaterThan(-1);
        const payload = branch.slice(payloadStart, branch.indexOf("},", payloadStart));

        // The whole point: an operator learns rendering failed and why, without
        // being shown raw `{{tokens}}` or a family's half-composed words.
        for (const forbidden of ["bodyRaw", "params.body", "rendered", "renderContext", "emailSubjectResolved"]) {
            expect(payload, `payload must not carry ${forbidden}`).not.toContain(forbidden);
        }
    });

    it("an audit failure does not become a second failure mode", () => {
        const branch = renderBlockBranch();
        // The send is refused either way; a failed audit write must not throw
        // over the top of the real outcome.
        expect(branch).toContain("try {");
        expect(branch).toContain("catch");
    });
});
