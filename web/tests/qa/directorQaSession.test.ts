/**
 * THE QA RUNTIME MUST NOT LOSE THE DIRECTOR'S PLACE OR THEIR WORDS.
 *
 * A human acceptance pass runs for an hour beside a product under active repair, so the document it
 * lives in WILL reload. These hold the three rules that make that survivable: position comes back,
 * unsubmitted testimony comes back, and a build change neither throws the Director to the start nor
 * silently re-attributes what they wrote about a different build.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
    clearDrafts,
    isEmptyDraft,
    readDraft,
    readPosition,
    resolveResumeIndex,
    writeDraft,
    writePosition,
    type QaScope,
} from "@/lib/qa/runtime/directorQaSession";

/** A minimal, synchronous localStorage. The real one is per-browser; this one is per-test. */
class MemoryStorage implements Storage {
    private map = new Map<string, string>();
    get length() { return this.map.size; }
    clear() { this.map.clear(); }
    getItem(k: string) { return this.map.has(k) ? (this.map.get(k) as string) : null; }
    key(i: number) { return [...this.map.keys()][i] ?? null; }
    removeItem(k: string) { this.map.delete(k); }
    setItem(k: string, v: string) { this.map.set(k, String(v)); }
}

const SCOPE: QaScope = {
    suiteKey: "core_financials_director_qa",
    environment: "staging",
    catalogVersion: "2026-09-15.1",
    deployedRevision: "aaaaaaaaaaaa",
};
const NEXT_BUILD: QaScope = { ...SCOPE, deployedRevision: "bbbbbbbbbbbb" };

const KEYS = ["financial_subject", "add_charge_draft", "post_charge", "manage_responsibility"];

beforeEach(() => {
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, "window", {
        value: { localStorage: storage },
        configurable: true,
        writable: true,
    });
});

describe("the Director's position", () => {
    it("comes back on the scenario they were on, not the first one", () => {
        writePosition(SCOPE, "post_charge", true);
        const at = resolveResumeIndex({ scenarioKeys: KEYS, resultOf: () => "not_run", stored: readPosition(SCOPE) });
        expect(at.index).toBe(2);
        expect(at.started, "a reload lands back inside the walkthrough, not on the landing surface").toBe(true);
        expect(at.source).toBe("stored");
    });

    it("comes back even on a scenario already accepted — they may be re-reading it", () => {
        writePosition(SCOPE, "financial_subject", true);
        const at = resolveResumeIndex({ scenarioKeys: KEYS, resultOf: () => "pass", stored: readPosition(SCOPE) });
        expect(at.index).toBe(0);
        expect(at.source).toBe("stored");
    });

    it("resumes at the first unaccepted scenario when this browser remembers nothing", () => {
        const accepted = new Set(["financial_subject", "add_charge_draft"]);
        const at = resolveResumeIndex({
            scenarioKeys: KEYS,
            resultOf: (k) => (accepted.has(k) ? "pass" : "not_run"),
            stored: null,
        });
        expect(at.index).toBe(2);
        expect(at.started, "a fresh open offers Resume rather than dropping you mid-walkthrough").toBe(false);
        expect(at.source).toBe("first_unaccepted");
    });

    it("treats fail and blocked as unaccepted — they are work remaining, not work done", () => {
        const at = resolveResumeIndex({
            scenarioKeys: KEYS,
            resultOf: (k) => (k === "financial_subject" ? "pass" : k === "add_charge_draft" ? "fail" : "not_run"),
            stored: null,
        });
        expect(at.index).toBe(1);
    });

    /*
     * THE BASELINE RULE, HALF ONE. Position is keyed by suite and environment only, and stores a
     * scenario KEY. A new build must not cost the Director their place, and renumbering the catalog
     * must not move it silently to a different scenario.
     */
    it("survives a build change and a catalog renumbering", () => {
        writePosition(SCOPE, "post_charge", true);
        const reordered = ["post_charge", "financial_subject", "add_charge_draft", "manage_responsibility"];
        const at = resolveResumeIndex({
            scenarioKeys: reordered,
            resultOf: () => "not_run",
            stored: readPosition(NEXT_BUILD),
        });
        expect(at.source).toBe("stored");
        expect(reordered[at.index], "the same scenario, wherever it now sits").toBe("post_charge");
    });

    it("falls back rather than pointing at a scenario this catalog no longer has", () => {
        writePosition(SCOPE, "a_retired_scenario", true);
        const at = resolveResumeIndex({ scenarioKeys: KEYS, resultOf: () => "not_run", stored: readPosition(SCOPE) });
        expect(at.source).toBe("first_unaccepted");
        expect(at.index).toBe(0);
    });
});

describe("draft testimony", () => {
    it("survives a reload of the same build, exactly as typed", () => {
        writeDraft(SCOPE, "post_charge", {
            observation: "The balance moved by $75.00.",
            expected: "",
            classification: "",
        });
        const back = readDraft(SCOPE, "post_charge");
        expect(back.draft.observation).toBe("The balance moved by $75.00.");
        expect(back.carriedFrom, "this build's own draft is not a carry-over").toBeNull();
    });

    it("keeps each scenario's notes separate", () => {
        writeDraft(SCOPE, "post_charge", { observation: "posted", expected: "", classification: "" });
        writeDraft(SCOPE, "add_charge_draft", { observation: "drafted", expected: "", classification: "" });
        expect(readDraft(SCOPE, "post_charge").draft.observation).toBe("posted");
        expect(readDraft(SCOPE, "add_charge_draft").draft.observation).toBe("drafted");
    });

    it("stores nothing for an empty form, so a blank draft cannot shadow an earlier one", () => {
        writeDraft(SCOPE, "post_charge", { observation: "something", expected: "", classification: "" });
        writeDraft(NEXT_BUILD, "post_charge", { observation: "", expected: "", classification: "" });
        const back = readDraft(NEXT_BUILD, "post_charge");
        expect(back.draft.observation).toBe("something");
        expect(back.carriedFrom?.deployedRevision).toBe(SCOPE.deployedRevision);
    });

    /*
     * THE BASELINE RULE, HALF TWO. A draft is about the build in front of you, so it is never
     * silently adopted onto a different one — and never destroyed either. It is offered back,
     * labelled with where it came from, and the Director decides.
     */
    it("offers an earlier build's notes rather than adopting or destroying them", () => {
        writeDraft(SCOPE, "post_charge", {
            observation: "Collectible did not move.",
            expected: "It should have dropped to zero.",
            classification: "PRODUCT_DEFECT",
        });
        const onNewBuild = readDraft(NEXT_BUILD, "post_charge");
        expect(onNewBuild.draft.observation, "the words are not lost").toBe("Collectible did not move.");
        expect(onNewBuild.draft.classification).toBe("PRODUCT_DEFECT");
        expect(onNewBuild.carriedFrom, "and they are labelled as another build's").not.toBeNull();
        expect(onNewBuild.carriedFrom?.deployedRevision).toBe(SCOPE.deployedRevision);
        expect(onNewBuild.carriedFrom?.catalogVersion).toBe(SCOPE.catalogVersion);
    });

    it("prefers this build's own draft over any carried-over one", () => {
        writeDraft(SCOPE, "post_charge", { observation: "old build", expected: "", classification: "" });
        writeDraft(NEXT_BUILD, "post_charge", { observation: "this build", expected: "", classification: "" });
        const back = readDraft(NEXT_BUILD, "post_charge");
        expect(back.draft.observation).toBe("this build");
        expect(back.carriedFrom).toBeNull();
    });

    it("forgets a scenario's drafts across every build once a result is submitted", () => {
        writeDraft(SCOPE, "post_charge", { observation: "old", expected: "", classification: "" });
        writeDraft(NEXT_BUILD, "post_charge", { observation: "new", expected: "", classification: "" });
        clearDrafts(NEXT_BUILD, "post_charge");
        const back = readDraft(NEXT_BUILD, "post_charge");
        expect(back.draft.observation, "submitted testimony must not reappear as unsubmitted").toBe("");
        expect(back.carriedFrom).toBeNull();
    });

    it("leaves other scenarios' drafts alone when one is submitted", () => {
        writeDraft(SCOPE, "post_charge", { observation: "posted", expected: "", classification: "" });
        writeDraft(SCOPE, "add_charge_draft", { observation: "drafted", expected: "", classification: "" });
        clearDrafts(SCOPE, "post_charge");
        expect(readDraft(SCOPE, "add_charge_draft").draft.observation).toBe("drafted");
    });

    it("separates environments, so a local walkthrough is not staging testimony", () => {
        writeDraft(SCOPE, "post_charge", { observation: "staging note", expected: "", classification: "" });
        const local = readDraft({ ...SCOPE, environment: "local" }, "post_charge");
        expect(local.draft.observation).toBe("");
        expect(local.carriedFrom).toBeNull();
    });

    it("reads an empty draft as empty", () => {
        expect(isEmptyDraft({ observation: "", expected: "  ", classification: "" })).toBe(true);
        expect(isEmptyDraft({ observation: "x", expected: "", classification: "" })).toBe(false);
    });
});

describe("a browser that refuses to store", () => {
    it("degrades to forgetting rather than throwing", () => {
        Object.defineProperty(globalThis, "window", {
            value: {
                get localStorage(): Storage {
                    throw new Error("The operation is insecure.");
                },
            },
            configurable: true,
            writable: true,
        });
        expect(() => writePosition(SCOPE, "post_charge", true)).not.toThrow();
        expect(readPosition(SCOPE)).toBeNull();
        expect(() => writeDraft(SCOPE, "post_charge", { observation: "x", expected: "", classification: "" })).not.toThrow();
        expect(readDraft(SCOPE, "post_charge").draft.observation).toBe("");
        expect(() => clearDrafts(SCOPE, "post_charge")).not.toThrow();
    });
});

describe("the runtime never writes testimony into the acceptance record", () => {
    it("has no writer for a result, and no network call at all", () => {
        const src = require("node:fs").readFileSync(
            require("node:path").join(process.cwd(), "lib/qa/runtime/directorQaSession.ts"),
            "utf8",
        ) as string;
        for (const forbidden of ["fetch(", "XMLHttpRequest", "navigator.sendBeacon", "supabase", "qa_director_acceptance_results"]) {
            expect(src.includes(forbidden), `the session store must not reach ${forbidden}`).toBe(false);
        }
    });
});
