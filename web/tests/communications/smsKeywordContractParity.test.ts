/**
 * Phase 0 commit 3 — SMS keyword contract parity (TypeScript side).
 *
 * Inbound SMS is handled in Python; the preference vocabulary and composer are
 * TypeScript. Both load contracts/communications/sms-keywords.json. This test
 * fails the build if the TypeScript implementation drifts from the contract —
 * the Python side has the mirror-image test.
 *
 * These are behavioral assertions against the parser, not source-shape regexes:
 * every token in the contract is fed through parseSmsKeyword.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

import {
    parseSmsKeyword,
    keywordTargetState,
    SMS_KEYWORD_CATEGORIES,
    type SmsKeyword,
} from "@/lib/communications/v2/smsKeywords";
import { PREFERENCE_CATEGORIES } from "@/lib/communications/v2/preferences";

type Contract = {
    version: string;
    keywords: Record<SmsKeyword, string[]>;
    affected_preference_categories: string[];
    target_state: Record<SmsKeyword, string | null>;
};

const contract: Contract = JSON.parse(
    readFileSync(path.resolve(__dirname, "../../../contracts/communications/sms-keywords.json"), "utf8")
);

describe("SMS keyword contract parity", () => {
    it("classifies every contract token identically", () => {
        for (const [keyword, tokens] of Object.entries(contract.keywords) as Array<[SmsKeyword, string[]]>) {
            for (const token of tokens) {
                expect(parseSmsKeyword(token), `${token} should classify as ${keyword}`).toBe(keyword);
                expect(parseSmsKeyword(token.toUpperCase())).toBe(keyword);
            }
        }
    });

    it("agrees with the contract on target state", () => {
        for (const [keyword, expected] of Object.entries(contract.target_state) as Array<
            [SmsKeyword, string | null]
        >) {
            expect(keywordTargetState(keyword)).toBe(expected);
        }
    });

    it("affects exactly the contract's preference categories", () => {
        expect([...SMS_KEYWORD_CATEGORIES].sort()).toEqual([...contract.affected_preference_categories].sort());
    });

    it("only names categories that exist in the preference vocabulary", () => {
        for (const category of SMS_KEYWORD_CATEGORIES) {
            expect(PREFERENCE_CATEGORIES).toContain(category);
        }
    });

    it("covers operational, not only transactional and marketing", () => {
        // Carrier semantics: STOP suppresses ALL SMS. Operational is the bulk of
        // what the platform sends, so omitting it would make STOP near-useless.
        expect(SMS_KEYWORD_CATEGORIES).toContain("sms_operational");
    });
});

describe("SMS keyword parsing behavior", () => {
    it("reads only the first token", () => {
        expect(parseSmsKeyword("please stop by tomorrow")).toBeNull();
        expect(parseSmsKeyword("stop please")).toBe("stop");
    });

    it("does not treat 'yes' as a resubscribe keyword", () => {
        // Removed deliberately: "Yes" answers ordinary questions and is not a
        // carrier-standard START keyword.
        expect(parseSmsKeyword("yes")).toBeNull();
    });

    it("returns null for malformed input rather than throwing", () => {
        for (const body of ["", "   ", "\n\t"]) {
            expect(parseSmsKeyword(body)).toBeNull();
        }
    });

    it("HELP changes no preference state", () => {
        expect(keywordTargetState("help")).toBeNull();
    });
});
