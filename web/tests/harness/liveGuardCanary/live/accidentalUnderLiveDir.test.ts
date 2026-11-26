/**
 * LIVE-SUITE GUARD CANARY — stands in for a live suite, and touches nothing.
 *
 * A real live suite reads `web/.env.certification.local` and builds a service-role client at MODULE
 * scope, then seeds and deletes in `beforeAll` / `afterAll`. This file does the harmless equivalent of
 * each step: it appends a marker to `LIVE_GUARD_CANARY_FILE` (when set) at module scope, in each hook
 * and in its test. tests/harness/liveSuiteAuthority.test.ts runs vitest on it and reads the markers: no
 * marker at all means the guard kept the file from being imported. It has no database, no network and
 * no credential, so admitting it under a real authority is harmless.
 */
import { appendFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const marker = process.env.LIVE_GUARD_CANARY_FILE;
const mark = (step: string) => {
    if (marker) appendFileSync(marker, `${step}\n`);
};

mark("module");

describe("live-suite guard canary", () => {
    beforeAll(() => mark("beforeAll"));
    afterAll(() => mark("afterAll"));
    it("runs only when admitted", () => {
        mark("test");
        expect(true).toBe(true);
    });
});
