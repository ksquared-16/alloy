/**
 * Both runtimes must read the same Message-ID.
 *
 * Inbound SMS is Python; inbound EMAIL arrives on the Resend webhook, which is
 * TypeScript. Both parse the header Alloy mints, so the two implementations are
 * run against one shared fixture list here — a change to either that the other
 * does not match fails the build. Same arrangement as
 * `contracts/communications/sms-keywords.json` for the keyword vocabulary.
 *
 * The Python side is executed for real rather than transcribed, so this cannot
 * pass by someone updating a copied expectation.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
    correlationCandidates,
    domainOf,
    mintOutboundMessageId,
    parseAlloyMessageId,
    parseReferenceMessageIds,
} from "@/lib/communications/email/emailMessageId";

const MSG = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-8888-4777-8666-555555555555";

/** Cases chosen for disagreement risk, not for coverage of the happy path. */
const PARSE_CASES: string[] = [
    `<alloy.${MSG}@school.example>`,
    `  <alloy.${MSG}@school.example>  `,
    `<ALLOY.${MSG.toUpperCase()}@School.Example>`,
    "<CAF=abc123@mail.gmail.com>",
    "<alloy.hello@school.example>",
    "<alloy.@school.example>",
    "<alloy.../etc/passwd@school.example>",
    // A forged id from someone else's domain whose local part is exactly six
    // characters followed by a real UUID. Without the `alloy.` prefix check,
    // slicing the prefix length off blindly would yield a valid-looking message
    // id and hand an attacker a lookup key. The prefix guard is what refuses it,
    // and this is the case that makes that guard non-redundant.
    `<xxxxxx${MSG}@attacker.example>`,
    `<notus.${MSG}@attacker.example>`,
    "no angle brackets",
    "<unterminated",
    "",
];

const REFERENCE_CASES: string[] = [
    `<x@foreign.example> <alloy.${OTHER}@s.example> <alloy.${MSG}@s.example>`,
    `<a@gmail.com> <b@outlook.com> <alloy.${MSG}@s.example>`,
    `<alloy.${MSG}@s.example> <alloy.${MSG}@s.example>`,
    "<a@gmail.com>",
    "",
];

const MINT_CASES: Array<[string, string]> = [
    [MSG, "hello@school.example"],
    [MSG, "Front Desk <desk@a.example>"],
    ["not-a-uuid", "a@b.example"],
    [MSG, "nodomain"],
    [MSG, ""],
];

const REPO_ROOT = path.resolve(process.cwd(), "..");
const BACKEND = path.join(REPO_ROOT, "backend");

function pythonBinary(): string | null {
    for (const candidate of ["/Users/Kelly/.nvm/../../opt/anaconda3/bin/python3", "/usr/bin/python3", "python3"]) {
        try {
            execFileSync(candidate, ["-c", "print(1)"], { stdio: "pipe" });
            return candidate;
        } catch {
            /* try the next one */
        }
    }
    return null;
}

/** Run the Python implementation over the same fixtures and return its answers. */
function pythonAnswers(): {
    parse: (string | null)[];
    references: string[][];
    mint: (string | null)[];
    candidates: string[][];
} | null {
    const py = pythonBinary();
    if (!py || !fs.existsSync(path.join(BACKEND, "app/services/communications/email_message_id.py"))) {
        return null;
    }
    const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(BACKEND)})
from app.services.communications.email_message_id import (
    correlation_candidates, mint_outbound_message_id, parse_alloy_message_id, parse_reference_message_ids,
)
parse_cases = json.loads(sys.argv[1])
reference_cases = json.loads(sys.argv[2])
mint_cases = json.loads(sys.argv[3])
print(json.dumps({
    "parse": [parse_alloy_message_id(c) for c in parse_cases],
    "references": [parse_reference_message_ids(c) for c in reference_cases],
    "mint": [mint_outbound_message_id(communication_message_id=a, from_email=b) for a, b in mint_cases],
    "candidates": [
        correlation_candidates(in_reply_to=parse_cases[0], references=reference_cases[0]),
        correlation_candidates(in_reply_to=None, references=reference_cases[0]),
        correlation_candidates(in_reply_to=None, references=None),
    ],
}))
`;
    try {
        const out = execFileSync(
            py,
            ["-c", script, JSON.stringify(PARSE_CASES), JSON.stringify(REFERENCE_CASES), JSON.stringify(MINT_CASES)],
            { stdio: "pipe", encoding: "utf-8" }
        );
        return JSON.parse(out);
    } catch {
        return null;
    }
}

describe("Message-ID parity between the two inbound runtimes", () => {
    const python = pythonAnswers();

    it("has a runnable Python implementation to compare against", () => {
        // If this ever goes red the parity claim below is vacuous, so it fails
        // loudly rather than letting the suite skip itself into green.
        expect(python, "Python email_message_id could not be executed").not.toBeNull();
    });

    it("parses identically, including the cases designed to disagree", () => {
        expect(PARSE_CASES.map((c) => parseAlloyMessageId(c))).toEqual(python!.parse);
    });

    it("reads References chains identically", () => {
        expect(REFERENCE_CASES.map((c) => parseReferenceMessageIds(c))).toEqual(python!.references);
    });

    it("mints identically, including the refusals", () => {
        expect(
            MINT_CASES.map(([id, from]) => mintOutboundMessageId({ communicationMessageId: id, fromEmail: from }))
        ).toEqual(python!.mint);
    });

    it("orders correlation evidence identically", () => {
        expect([
            correlationCandidates({ inReplyTo: PARSE_CASES[0], references: REFERENCE_CASES[0] }),
            correlationCandidates({ inReplyTo: null, references: REFERENCE_CASES[0] }),
            correlationCandidates({ inReplyTo: null, references: null }),
        ]).toEqual(python!.candidates);
    });
});

describe("the TypeScript reader on its own terms", () => {
    it("round-trips what it mints", () => {
        const minted = mintOutboundMessageId({ communicationMessageId: MSG, fromEmail: "a@b.example" })!;
        expect(parseAlloyMessageId(minted)).toBe(MSG);
    });

    it("prefers In-Reply-To over References", () => {
        expect(
            correlationCandidates({
                inReplyTo: `<alloy.${MSG}@s.example>`,
                references: `<alloy.${OTHER}@s.example>`,
            })[0]
        ).toBe(MSG);
    });

    it("falls back to the nearest References ancestor", () => {
        expect(
            correlationCandidates({
                inReplyTo: null,
                references: `<alloy.${OTHER}@s.example> <alloy.${MSG}@s.example>`,
            })
        ).toEqual([MSG, OTHER]);
    });

    it("yields nothing when no threading evidence is ours", () => {
        expect(correlationCandidates({ inReplyTo: "<x@gmail.com>", references: "<y@gmail.com>" })).toEqual([]);
    });

    it("extracts the sending domain", () => {
        expect(domainOf("a@B.Example")).toBe("b.example");
        expect(domainOf("nodomain")).toBeNull();
    });
});
