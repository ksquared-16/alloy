import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { classifyPublicRuntime, isHostedRuntime } from "@/lib/publicAppUrl";

/**
 * Who may read the certification walkthrough beside the product.
 *
 * The page used to refuse on `NODE_ENV === "production"`, which means "not a customer environment"
 * only while every non-customer environment runs `next dev`. The QA server is deliberately a
 * PRODUCTION BUILD — Fast Refresh was reloading the page under the person doing manual QA — so the
 * one document the certification is run from 404ed on the only server it is meant to be read beside.
 *
 * The gate is now about WHERE this runs, not how it was built.
 */

const PAGE = readFileSync(resolve(__dirname, "../../app/dev/real-enrollment-qa/page.tsx"), "utf8");

/** The gate as the page applies it. */
const readable = (env: Record<string, string | undefined>) => !isHostedRuntime(classifyPublicRuntime(env));

describe("the QA walkthrough is readable where QA happens", () => {
    it("is readable on a managed agent slot, even built for production", () => {
        // This is the 3014 QA server: a production build on a lane slot.
        expect(readable({ ALLOY_AGENT_ENV: "slot4", NODE_ENV: "production" })).toBe(true);
    });

    it("is readable on a developer machine", () => {
        expect(readable({ NODE_ENV: "development" })).toBe(true);
    });
});

describe("it is not readable anywhere a customer could reach it", () => {
    it("is refused on a Vercel production deployment", () => {
        expect(readable({ VERCEL_ENV: "production" })).toBe(false);
    });

    it("is refused on a Vercel preview deployment", () => {
        // A preview is hosted and has real recipients; it is held to the production rule.
        expect(readable({ VERCEL_ENV: "preview" })).toBe(false);
        expect(readable({ VERCEL: "1" })).toBe(false);
    });

    it("is refused on a hosted deployment even with an agent marker present", () => {
        // Hosted wins: a stray ALLOY_AGENT_ENV must not open the page on a real deployment.
        expect(readable({ VERCEL_ENV: "production", ALLOY_AGENT_ENV: "slot4" })).toBe(false);
    });
});

describe("the page keeps its other guarantees", () => {
    it("no longer gates on NODE_ENV", () => {
        // The prose above the gate still NAMES the old rule, which is the point of it; what must be
        // gone is the gate itself.
        expect(PAGE).not.toMatch(/process\.env\.NODE_ENV\s*===\s*"production"/);
        expect(PAGE).toMatch(/isHostedRuntime\(classifyPublicRuntime\(\)\)/);
    });

    it("still serves ONE named document and takes no path argument", () => {
        // The reason this surface is safe at all: it cannot be asked for any other file.
        expect(PAGE).toContain("KELLY-QA-WALKTHROUGH.md");
        expect(PAGE).not.toMatch(/params|searchParams|req\.nextUrl/);
    });

    it("still calls notFound when refused", () => {
        expect(PAGE).toMatch(/notFound\(\)/);
    });
});
