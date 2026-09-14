/**
 * WHAT A HOST-INTEGRATION TEST NEEDS BEFORE ITS RESULT MEANS ANYTHING.
 *
 * Three suites have been red for weeks and triaged three times. Each time the
 * conclusion was the same — they need host state, not code — and each time the
 * finding was lost, because nothing in the repository said so. A permanently
 * red deterministic suite teaches people to ignore the list, which is the cost
 * actually being paid.
 *
 * So the prerequisite is written down, per suite, with the probe that decides
 * it. Absent the prerequisite the suite reports BLOCKED_PREREQUISITE and names
 * what was missing. Present it, the suite runs normally and a failure is a
 * failure — which is the half that matters, and the half a naive skip would
 * destroy.
 *
 * TWO THINGS THIS DELIBERATELY IS NOT:
 *
 *   NOT A WAY TO GO GREEN. A capable environment runs every case exactly as
 *   before. The skip is decided ONCE, up front, from host capability alone, and
 *   never from whether a case passed.
 *
 *   NOT AN EXCUSE TO ALLOCATE. Nothing here provisions a slot, starts a
 *   provider or frees a session. Manufacturing host load to turn a test green
 *   proves the test can be satisfied, not that the product works.
 */

export const TIER = Object.freeze({
  HOST_INTEGRATION: "HOST_INTEGRATION",
});

export const PREREQUISITE_STATUS = Object.freeze({
  CAPABLE: "CAPABLE",
  BLOCKED_PREREQUISITE: "BLOCKED_PREREQUISITE",
});

/**
 * The contracts, one per suite.
 *
 * `capabilities` are what the host must be able to offer. `valid_environment`
 * says what a legitimate certification run looks like, so nobody has to
 * rediscover it from a failure message.
 */
export const HOST_PREREQUISITES = Object.freeze({
  "development-offline-lane": {
    tier: TIER.HOST_INTEGRATION,
    capabilities: ["registered_lane_worktree", "free_lane_slot"],
    why: "it sends to a BOUND lane and asserts the run stays QUEUED; with no free slot the lane cannot be registered and the send refuses with lane_worktree_unregistered, which is a fact about the host",
    valid_environment: "a host with at least one unused lane slot and a worktree that can be registered to it",
  },
  "development-provider-lifecycle": {
    tier: TIER.HOST_INTEGRATION,
    capabilities: ["second_live_provider_lane"],
    why: "one case asserts the refusal NAMES A SAFE LANE TO FREE, which requires a second live provider lane to name; with one lane there is no safe candidate and the message is correctly different",
    valid_environment: "a host running at least two provider lanes, one of them safe to free",
  },
  "development-session-bootstrap": {
    tier: TIER.HOST_INTEGRATION,
    capabilities: ["spare_session_capacity"],
    why: "it starts an agent session and asserts a duplicate start refuses; at capacity the FIRST start already fails, so the case cannot reach the behaviour it is about",
    valid_environment: "a host with at least one session slot free beyond the one under test",
  },
});

export function prerequisiteFor(testName) {
  return HOST_PREREQUISITES[String(testName)] || null;
}

/**
 * Is the host able to give this suite a meaningful answer?
 *
 * `probes` maps a capability name to a function returning a boolean. It is a
 * parameter so the contract can be exercised in both directions without a host
 * that happens to be arranged correctly — and so that a probe which cannot tell
 * says so rather than guessing.
 *
 * AN UNKNOWN PROBE IS NOT A PASS. A capability with no probe registered is
 * treated as missing: "nobody checked" must never read as "it is fine", which
 * is the failure mode that would let this hide a real defect.
 */
export function checkHostPrerequisites(testName, { probes = {} } = {}) {
  const contract = prerequisiteFor(testName);
  if (!contract) {
    return { status: PREREQUISITE_STATUS.CAPABLE, tier: null, missing: [], contract: null };
  }
  const missing = [];
  for (const capability of contract.capabilities) {
    const probe = probes[capability];
    if (typeof probe !== "function") { missing.push({ capability, reason: "no probe registered" }); continue; }
    let ok = false;
    try { ok = probe() === true; } catch (e) { ok = false; }
    if (!ok) missing.push({ capability, reason: "host does not currently offer it" });
  }
  if (!missing.length) {
    return { status: PREREQUISITE_STATUS.CAPABLE, tier: contract.tier, missing: [], contract };
  }
  return {
    status: PREREQUISITE_STATUS.BLOCKED_PREREQUISITE,
    tier: contract.tier,
    missing,
    contract,
    // The sentence a triage reads. It says what is absent AND what a valid
    // environment looks like, so the next person does not re-derive either.
    summary: `BLOCKED_PREREQUISITE ${testName}: missing ${missing.map((m) => m.capability).join(", ")}. `
      + `${contract.why}. A valid certification environment is ${contract.valid_environment}.`,
  };
}

/**
 * The line a blocked suite prints, and the exit code it uses.
 *
 * Exit 0 with an explicit, greppable marker: a host-integration suite that
 * cannot run is not a failure of the code, and reporting it as one is how three
 * suites came to be triaged three times. The marker is deliberately distinct
 * from a pass so a reader — or a tier report — can tell them apart.
 */
export function blockedPrerequisiteReport(result) {
  return {
    line: `# BLOCKED_PREREQUISITE ${result.tier} ${result.missing.map((m) => m.capability).join(",")}`,
    summary: result.summary,
    exitCode: 0,
  };
}
