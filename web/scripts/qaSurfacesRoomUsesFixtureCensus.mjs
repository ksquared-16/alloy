#!/usr/bin/env node
/**
 * Surfaces c4 run-owned room-Uses fixture CENSUS (QA Shared only, read only) — npm script dev:qa:surfaces-room-uses-fixture-census.
 * Requires the executor-issued operation authority before anything else (qa/surfacesFixtureAuthority.mjs). Not yet
 * registered in the installed toolkit, so no authority exists for it and it refuses. See qa/surfacesRoomUsesFixtureRunner.mjs.
 */
import { main } from "./qa/surfacesRoomUsesFixtureRunner.mjs";

main("census");
