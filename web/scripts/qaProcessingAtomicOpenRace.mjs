#!/usr/bin/env node
/**
 * D10-A2 entry point for the QA-bound isolated fixture `processing_atomic_open_race` (operations `run`, `reset`).
 * Started only by the toolkit's isolated fixture executor; a manual run is refused by the authority check.
 */
import { main } from "./qa/processingAtomicOpenRace.mjs";

const op = process.argv[2];
await main(op === "reset" ? "reset" : op === "run" ? "run" : String(op));
