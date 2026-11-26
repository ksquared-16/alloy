/**
 * Shared mission visibility filters (rail, Needs You, portfolio).
 * Keep this dependency-free so operator-views can import it without pulling
 * the full conversation/runtime graph.
 */

/** Demo / DX fixtures — never show in operator Needs You or mission rail. */
export function isFixtureMission(title, missionId) {
  const t = String(title || "");
  if (/^DX7\s+Fixture/i.test(t)) return true;
  if (/\bFixture\s*—/i.test(t) || /\bFixture\s+-/i.test(t)) return true;
  if (/^dx7[_-]/i.test(String(missionId || ""))) return true;
  if (/^msn_fixture/i.test(String(missionId || ""))) return true;
  return false;
}
