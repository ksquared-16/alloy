/**
 * `npm run --silent dev:qa:tours-fixture -- --ensure|--count|--reset`
 *
 * The product script behind the installed `tours_certification` QA-bound fixture. Run ONLY by the toolkit's
 * isolated fixture executor (`vac certify-fixture tours_certification <op> --qa-run … --persona … --candidate …
 * --script-sha256 … --request-id …`), which supplies a from-scratch environment bound to one open isolated QA
 * run. It loads no .env file, so a host credential can never reach it; the guard refuses a non-loopback
 * database, a foreign namespace, a missing QA run, any outbound-provider variable, and a missing, partial or
 * inconsistent executor binding (persona org, trusted preview origin, session digest, authority record) before a
 * port is built.
 * Contract and behaviour: lib/qa/toursFixture/toursCertificationFixture.ts.
 */
import { readFileSync } from "node:fs";

import { runToursFixture } from "@/lib/qa/toursFixture/toursCertificationFixture";
import { createToursFixturePorts } from "@/lib/qa/toursFixture/toursCertificationFixturePorts";

runToursFixture({
    argv: process.argv.slice(2),
    env: process.env,
    ports: (bound) => createToursFixturePorts(process.env, bound),
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
