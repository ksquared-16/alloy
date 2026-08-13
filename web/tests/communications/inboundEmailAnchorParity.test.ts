/**
 * The unattributed-sender anchor must mean the same thing in both runtimes.
 *
 * SMS derives it in Python; email derives it in TypeScript. If the two ever
 * disagreed, one channel's "unknown sender" surrogate would differ from the
 * other's for the same organization — so `uuid5` is checked byte-for-byte against
 * Python's `uuid.uuid5` rather than assumed compatible.
 *
 * The Python side is executed, not transcribed.
 */

import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
    INBOUND_SURROGATE_NAMESPACE,
    surrogateEmailSenderAnchor,
    uuid5,
} from "@/lib/communications/email/inboundEmailAnchor";

const ORG = "11111111-1111-1111-1111-111111111111";

const NAMES = [
    "org|parent@example.invalid",
    `${ORG}|parent@example.invalid`,
    "",
    "unicode ünïcødé | ✉️",
    "a".repeat(300),
];

function pythonUuid5(names: string[]): string[] | null {
    for (const py of ["/Users/Kelly/opt/anaconda3/bin/python3", "/usr/bin/python3", "python3"]) {
        try {
            const out = execFileSync(
                py,
                [
                    "-c",
                    `
import json, sys, uuid
ns = uuid.UUID(sys.argv[1])
print(json.dumps([str(uuid.uuid5(ns, n)) for n in json.loads(sys.argv[2])]))
`,
                    INBOUND_SURROGATE_NAMESPACE,
                    JSON.stringify(names),
                ],
                { stdio: "pipe", encoding: "utf-8" }
            );
            return JSON.parse(out);
        } catch {
            /* try the next interpreter */
        }
    }
    return null;
}

describe("uuid5 parity with Python", () => {
    const expected = pythonUuid5(NAMES);

    it("has a runnable Python reference", () => {
        // Without this the parity claim below would be vacuous.
        expect(expected, "python3 uuid.uuid5 could not be executed").not.toBeNull();
    });

    it("produces byte-identical name-based UUIDs", () => {
        expect(NAMES.map((n) => uuid5(INBOUND_SURROGATE_NAMESPACE, n))).toEqual(expected);
    });

    it("sets version 5 and the RFC 4122 variant", () => {
        const got = uuid5(INBOUND_SURROGATE_NAMESPACE, "anything");
        expect(got[14]).toBe("5");
        expect(["8", "9", "a", "b"]).toContain(got[19]);
    });
});

describe("the unattributed email sender anchor", () => {
    it("is stable for the same sender in the same organization", () => {
        const a = surrogateEmailSenderAnchor({ orgId: ORG, senderAddress: "parent@example.invalid" });
        const b = surrogateEmailSenderAnchor({ orgId: ORG, senderAddress: "parent@example.invalid" });
        expect(a).toBe(b);
    });

    it("ignores address casing and surrounding whitespace", () => {
        // Otherwise one sender would land on two conversations depending on how
        // their client happened to capitalise the address.
        expect(surrogateEmailSenderAnchor({ orgId: ORG, senderAddress: "  Parent@Example.Invalid " })).toBe(
            surrogateEmailSenderAnchor({ orgId: ORG, senderAddress: "parent@example.invalid" })
        );
    });

    it("differs across organizations for the same sender", () => {
        // The anchor is org-scoped, so one sender writing to two tenants never
        // collapses into a shared conversation.
        const other = "22222222-2222-2222-2222-222222222222";
        expect(surrogateEmailSenderAnchor({ orgId: ORG, senderAddress: "p@x.invalid" })).not.toBe(
            surrogateEmailSenderAnchor({ orgId: other, senderAddress: "p@x.invalid" })
        );
    });

    it("differs across senders in one organization", () => {
        expect(surrogateEmailSenderAnchor({ orgId: ORG, senderAddress: "a@x.invalid" })).not.toBe(
            surrogateEmailSenderAnchor({ orgId: ORG, senderAddress: "b@x.invalid" })
        );
    });
});
