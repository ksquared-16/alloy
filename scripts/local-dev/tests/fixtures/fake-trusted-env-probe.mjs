#!/usr/bin/env node
// Fixture: proves toolkit-owned child received trusted env without printing secrets.
// Writes only "present" or "absent" to ALLOY_TEST_PROBE, then listens on PORT.
import http from "node:http";
import fs from "node:fs";

const probe = process.env.ALLOY_TEST_PROBE;
const expected = process.env.ALLOY_TEST_FIXTURE_SECRET;
const actual = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (probe) {
  fs.writeFileSync(probe, actual && expected && actual === expected ? "present" : "absent");
}
const port = Number(process.env.PORT || 3000);
http.createServer((_q, s) => s.end("ok")).listen(port);
