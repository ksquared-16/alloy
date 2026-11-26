#!/usr/bin/env node
/**
 * `vac capacity` — the canonical surface for asking, and narrowly moving, the
 * provider capacity dimension.
 *
 *   vac capacity provider-observe [--json]
 *       Read-only. Reports every owner's answer for the provider ceiling side
 *       by side, plus execution, residency, host and queue state. Mutates
 *       nothing.
 *
 *   vac capacity set-provider-ceiling --expected N --to N --rollback-to N
 *                                     [--reason ...] [--experiment ...]
 *       Writes ONE key in host config, inside the authorised experimental
 *       window, only when the current value matches --expected, and only while
 *       naming the value it must be restored to. Everything else is refused.
 *
 * These exist because the provider experiment kept failing on tooling rather
 * than on capacity: reading the truth needed ad-hoc scripts that imported the
 * control plane, and changing one number needed general file-write authority.
 * Both are worse than the operation they were serving.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "lib", "vacilando");

function arg(name, argv) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

function usage(code = 2) {
  process.stderr.write(`Usage:
  vac capacity provider-observe [--json]
  vac capacity set-provider-ceiling --expected <n> --to <n> --rollback-to <n>
                                    [--reason "..."] [--experiment "..."]

provider-observe reads and never writes.
set-provider-ceiling writes only ALLOY_MAX_ACTIVE_PROVIDERS, only inside the
authorised experimental range, and only when --expected matches what is live.
`);
  process.exit(code);
}

const argv = process.argv.slice(2);
const sub = argv[0];

if (sub === "provider-observe") {
  const { observeProviderCapacity, renderProviderObservation } = await import(join(LIB, "capacity-provider-observe.mjs"));
  const out = await observeProviderCapacity({});
  if (argv.includes("--json")) process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  else process.stdout.write(`${renderProviderObservation(out)}\n`);
  process.exit(0);
}

if (sub === "set-provider-ceiling") {
  const { setExperimentalProviderCeiling } = await import(join(LIB, "capacity-experiment-ceiling.mjs"));
  const expected = Number(arg("expected", argv));
  const to = Number(arg("to", argv));
  const rollbackTo = Number(arg("rollback-to", argv));
  if (!Number.isInteger(expected) || !Number.isInteger(to) || !Number.isInteger(rollbackTo)) usage();
  const out = setExperimentalProviderCeiling({
    expected, requested: to, rollbackTo,
    reason: arg("reason", argv),
    experimentId: arg("experiment", argv),
  });
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(out.ok ? 0 : 1);
}

usage();
