#!/usr/bin/env node
/**
 * Surfaces c4 run-owned room-Uses fixture ENSURE (QA Shared only) — npm script dev:qa:surfaces-room-uses-fixture-ensure.
 * Requires the executor-issued operation authority before anything else (qa/surfacesFixtureAuthority.mjs);
 * loads no env file and resolves no database client until it passes. See qa/surfacesRoomUsesFixtureRunner.mjs.
 */
import { main } from "./qa/surfacesRoomUsesFixtureRunner.mjs";

main("ensure");
