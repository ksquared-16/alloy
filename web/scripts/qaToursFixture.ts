/**
 * `npm run --silent dev:qa:tours-fixture -- --ensure|--count|--reset`
 *
 * The product script behind the installed `tours_certification` QA-bound fixture. Run ONLY by the toolkit's
 * isolated fixture executor (`vac certify-fixture tours_certification <op> --qa-run … --persona … --candidate …
 * --script-sha256 … --request-id …`), which supplies a from-scratch environment bound to one open isolated QA
 * run. It loads no .env file, so a host credential can never reach it; the guard refuses a non-loopback
 * database, a foreign namespace, a missing QA run and any outbound-provider variable before a port is built.
 * Contract and behaviour: lib/qa/toursFixture/toursCertificationFixture.ts.
 */
import { runToursFixture } from "@/lib/qa/toursFixture/toursCertificationFixture";
import { createToursFixturePorts } from "@/lib/qa/toursFixture/toursCertificationFixturePorts";

runToursFixture({
    argv: process.argv.slice(2),
    env: process.env,
    ports: () => createToursFixturePorts(process.env),
    write: (line) => process.stdout.write(`${line}\n`),
}).then(
    (code) => process.exit(code),
    () => {
        process.stdout.write("✗ fixture_crashed\n");
        process.exit(1);
    },
);
