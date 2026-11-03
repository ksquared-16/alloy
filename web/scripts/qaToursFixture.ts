/**
 * `npm run --silent dev:qa:tours-fixture -- --ensure|--count|--reset`
 *
 * The product script behind the installed `tours_certification` QA-bound fixture. Run ONLY by the toolkit's
 * isolated fixture executor (`vac certify-fixture tours_certification <op> --qa-run … --persona … --candidate …
 * --script-sha256 … --request-id …`), which supplies a from-scratch environment bound to one open isolated QA
 * run. It loads no .env file, so a host credential can never reach it; the guard refuses a non-loopback
 * database, a foreign namespace, a missing QA run, any outbound-provider variable, and a missing, partial or
 * inconsistent executor binding (persona org, trusted preview origin, session digest) before anything is read.
 * Then AUTHORITY v2 (scripts/qa/toursFixtureAuthority.mjs): the executor's live record — org, database, API
 * identity, target hold, program pins — verified before the service key, the session file or any client, and
 * re-verified on the exact frozen configuration immediately before the client exists. A v1 record is refused.
 * Contract and behaviour: lib/qa/toursFixture/toursCertificationFixture.ts.
 */
import { readFileSync } from "node:fs";

import { runToursFixture } from "@/lib/qa/toursFixture/toursCertificationFixture";
import { createToursFixturePorts } from "@/lib/qa/toursFixture/toursCertificationFixturePorts";
import { runAttestedToursConnection, verifyToursFixtureAuthorityV2 } from "./qa/toursFixtureAuthority.mjs";

const env = process.env;

runToursFixture({
    argv: process.argv.slice(2),
    env,
    verify: (operation) => verifyToursFixtureAuthorityV2(env, { operation }),
    attest: (operation, apiOrigin, connect) => runAttestedToursConnection(env, { operation, url: env.DATABASE_URL, clientEnv: env, apiOrigin, connect }),
    ports: ({ world, session, client }) => createToursFixturePorts(client, { world, session }),
    readFile: (path) => {
        try {
            return readFileSync(path, "utf8");
        } catch {
            return null;
        }
    },
    write: (line) => process.stdout.write(`${line}\n`),
}).then(
    (code) => process.exit(code),
    () => {
        process.stdout.write("✗ fixture_crashed\n");
        process.exit(1);
    },
);
