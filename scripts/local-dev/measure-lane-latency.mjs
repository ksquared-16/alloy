#!/usr/bin/env node
/** One-shot lane hot-path timings. Does not send or attach. */
import { getDevelopmentLane, getLaneOutput, listDevelopmentLanes } from "./lib/vacilando/lanes.mjs";

const mark = async (label, fn) => {
  const t0 = Date.now();
  const out = await fn();
  const ms = Date.now() - t0;
  console.log(`${label}\t${ms}ms\tok=${out?.ok}\terr=${out?.error || ""}`);
  return { ms, out };
};

await mark("list", () => listDevelopmentLanes());
await mark("inspect", () => getDevelopmentLane("alloy-identity"));
await mark("inspect2", () => getDevelopmentLane("alloy-identity"));
await mark("output", () => getLaneOutput("alloy-identity"));
await mark("output2", () => getLaneOutput("alloy-identity"));
await mark("output3", () => getLaneOutput("alloy-identity"));
