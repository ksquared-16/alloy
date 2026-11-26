/**
 * P1 · Wave C — author-time self-ratification (orchestration behavior). A
 * held-authority human self-ratifies to binding; without held authority the act
 * lands proposed; predicted always model; AI never binds. Standing is server-
 * computed (the DB WHERE-clauses are proven in authority/authorityModelMigration.test.ts).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { authorOperationalExpectation } from "@/lib/operationalExpectations/intake/authorOperationalExpectation";
import { FakeAuthoringGateway } from "../intake/fakeAuthoringGateway";
import { TRUSTED_CONTEXT, validCreateInput } from "../intake/authoringFixtures";

let gw: FakeAuthoringGateway;
beforeEach(() => { gw = new FakeAuthoringGateway(); });

// The trusted actor holds the claimed authority for the room subject-type.
const holdAuthority = (authorityKey: string) => gw.heldAuthorities.add(`${TRUSTED_CONTEXT.actorUserId}:${authorityKey}`);

describe("author-time self-ratification", () => {
    it("a held-authority human self-ratifies a required expectation → binding", async () => {
        holdAuthority("room-lead:room-2");
        const r = await authorOperationalExpectation(
            validCreateInput({ authority: { authorityKey: "room-lead:room-2", authorClass: "human" } }),
            TRUSTED_CONTEXT, gw,
        );
        expect(r.status).toBe("authored");
        if (r.status === "authored") expect(r.act.standing).toBe("binding");
    });

    it("a human WITHOUT held authority lands proposed (later ratifiable)", async () => {
        const r = await authorOperationalExpectation(
            validCreateInput({ authority: { authorityKey: "licensing:ratio", authorClass: "human" } }),
            TRUSTED_CONTEXT, gw,
        );
        expect(r.status).toBe("authored");
        if (r.status === "authored") expect(r.act.standing).toBe("proposed");
    });

    it("predicted is always model — never self-ratifies, even holding authority", async () => {
        holdAuthority("forecast:occupancy");
        const r = await authorOperationalExpectation(
            validCreateInput({ modality: "predicted", authority: { authorityKey: "forecast:occupancy", authorClass: "human" } }),
            TRUSTED_CONTEXT, gw,
        );
        if (r.status === "authored") expect(r.act.standing).toBe("model");
    });

    it("an AI author never self-ratifies → proposed, even if an authority is 'held'", async () => {
        holdAuthority("rec:staffing");
        const r = await authorOperationalExpectation(
            validCreateInput({ authority: { authorityKey: "rec:staffing", authorClass: "ai" } }),
            TRUSTED_CONTEXT, gw,
        );
        if (r.status === "authored") expect(r.act.standing).toBe("proposed");
    });

    it("a self-ratifying authoring act is a single Authoring Act (no separate Ratification Act)", async () => {
        holdAuthority("room-lead:room-2");
        await authorOperationalExpectation(
            validCreateInput({ authority: { authorityKey: "room-lead:room-2", authorClass: "human" } }),
            TRUSTED_CONTEXT, gw,
        );
        expect(gw.commits).toHaveLength(1);
        expect(gw.events).toHaveLength(1);
    });
});
