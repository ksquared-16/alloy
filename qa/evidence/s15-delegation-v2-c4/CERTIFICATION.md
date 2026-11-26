# S15 — Mission Delegation V2, certification 4

Marker: S15-C4-20260902T105254Z
Candidate: 92f5473697801c06eeac948901a058eb9b84662a (promote/mission-delegation-v2)
Base: staging 3adbcfb9012c65ec6a6a423d30f609e70813ce79

This file is the entire certification change. It exists so that an unattended,
mission-delegated push -> pull request -> merge has something harmless and
uniquely identifiable to carry, and so that "unrelated content = 0" can be
checked by reading the diff rather than trusting it.

Certifies: one canonical action-authorization identity resolver, minted and
resolved identically at the policy side and at the trusted-host boundary.

Prior attempts, for the record:
- c1 promote/s15-delegation-cert  — FAILED CLOSED (prose use/mention)
- c2 promote/s15-retry-043027     — FAILED CLOSED (inferred source branch),
                                    later merged BY A HUMAN as PR #602; that
                                    merge is not S15 evidence.
- c3 promote/s15-c3-071044        — FAILED CLOSED (authorization environment
                                    derived as a database default). Never pushed.
