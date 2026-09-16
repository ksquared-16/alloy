/**
 * THE PARITY PROOF FOR MOVING PROJECTION TO THE SERVER.
 *
 * The Focus Panel's operational projections run in the browser today: `BusinessProcessCard` calls
 * `buildBusinessProcessCardEvidence` and `projectProcessCardCommands` in `useMemo`, and
 * `CurrentWorkCard` calls `projectCurrentWork`. That is why the provisioning answer must ship 78KB
 * of raw configuration — measured 100% identical between consecutive subject selections — so the
 * browser can re-derive what the server already knew.
 *
 * `projectFocusPanelOperational` moves WHERE that happens without touching WHAT it means. This file
 * is the evidence for the second half of that sentence: for every fixture below, the chokepoint's
 * output is deep-equal to calling the same canonical functions the way the cards call them today.
 *
 * Deep equality is the right bar here precisely BECAUSE the chokepoint delegates. If it ever grows
 * an algorithm of its own — a normalization, a re-order, a "small fix" — these fail, which is the
 * guard against the second projection authority this migration exists to avoid.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { projectFocusPanelOperational } from "@/lib/adminV2/runtime/focusPanel/focusPanelOperationalProjection";
import { buildBusinessProcessCardEvidence } from "@/lib/adminV2/runtime/focusPanel/businessProcess/buildBusinessProcessCardEvidence";
import { projectProcessCardCommands } from "@/lib/adminV2/runtime/focusPanel/businessProcess/projectProcessCardCommands";
import { projectCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/projectCurrentWork";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { FIXTURES, context, publishedStageInputs } from "./currentWorkFixtures";

describe("server projection is byte-for-byte what the browser produces today", () => {
    for (const fixture of FIXTURES) {
        it(`${fixture.name}`, () => {
            // THE CLIENT PATH, called exactly as the cards call it.
            const clientEvidence = buildBusinessProcessCardEvidence(fixture.context, { selectedParticipantId: null });
            const clientCommands = projectProcessCardCommands(fixture.context);
            const clientCurrentWork = projectCurrentWork(fixture.context);

            const server = projectFocusPanelOperational({ context: fixture.context, selectedParticipantId: null });

            expect(server.businessProcess.evidence).toEqual(clientEvidence);
            expect(server.businessProcess.commands).toEqual(clientCommands);
            expect(server.currentWork).toEqual(clientCurrentWork);
        });
    }

    it("carries the selected participant through unchanged", () => {
        const ctx = FIXTURES[4].context;
        const server = projectFocusPanelOperational({ context: ctx, selectedParticipantId: "cm-2" });
        expect(server.businessProcess.evidence).toEqual(
            buildBusinessProcessCardEvidence(ctx, { selectedParticipantId: "cm-2" }),
        );
    });

    it("defaults the participant to absent, which means no emphasis — never 'pick one'", () => {
        const ctx = FIXTURES[4].context;
        expect(projectFocusPanelOperational({ context: ctx })).toEqual(
            projectFocusPanelOperational({ context: ctx, selectedParticipantId: null }),
        );
    });

    it("produces command verdicts, so the browser binds handlers to a decision it did not make", () => {
        const server = projectFocusPanelOperational({ context: FIXTURES[5].context });
        // Whatever the configuration selected, each command arrives already judged.
        for (const command of server.businessProcess.commands.commands) {
            expect(command).toHaveProperty("status");
            expect(command).toHaveProperty("key");
        }
    });
});

describe("the chokepoint delegates and never re-implements", () => {
    const src = readFileSync(
        resolve(__dirname, "../../lib/adminV2/runtime/focusPanel/focusPanelOperationalProjection.ts"),
        "utf8",
    );
    const code = src
        .split("\n")
        .filter((line) => {
            const t = line.trimStart();
            return !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("//");
        })
        .join("\n");

    it("calls the existing canonical owners", () => {
        expect(code).toContain("buildBusinessProcessCardEvidence(context");
        expect(code).toContain("projectProcessCardCommands(context)");
        expect(code).toContain("projectCurrentWork(context)");
    });

    it("declares no model of its own — the envelope reuses existing types", () => {
        // A V2 model is the second authority this migration exists to avoid. Scoped to DECLARED
        // names: `adminV2` is in every import path here and is the module namespace, not a model.
        expect(code).not.toMatch(/(type|const|function)\s+\w*V2\b/);
        for (const shape of ["interface ", "class "]) expect(code).not.toContain(shape);
    });

    it("holds no branching of its own, so semantics cannot drift into it", () => {
        // No conditionals beyond the participant default: every decision belongs to a callee.
        const body = code.slice(code.indexOf("export function projectFocusPanelOperational"));
        expect(body).not.toMatch(/\bif\s*\(/);
        expect(body).not.toMatch(/\?\s*[^.]/); // no ternaries (optional chaining is fine)
    });

    it("does NOT carry a server-only marker, which took the panel down", () => {
        /*
         * The marker was in C1 and had to go: this module is reached from graphs the client also
         * imports, and `server-only` anywhere in that graph fails the Ecmascript parse — the Focus
         * Panel rendered nothing. No typecheck and no required gate saw it; a browser render did.
         *
         * Ownership is enforced by WHO CALLS IT — the two server producers — not by a directive.
         */
        expect(code).not.toContain('import "server-only"');
    });
});
