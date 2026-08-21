/**
 * Project Runtime — the top of the hierarchy: active project, epics, sprint tree.
 *
 * Honest scope for Phase 1: the toolkit has exactly ONE authoritative project —
 * the canonical repository. There is no multi-project registry and no "epic"
 * record type. So this runtime projects a single real project and records
 * "multiple projects" and "epics" as explicit gaps rather than inventing a
 * folder of fictional projects.
 *
 * Source of truth per field:
 *   project.name/root/base → alloy-ro root + worker-status base
 *   sprint hierarchy       → the occupied slots (Sprint Runtime), grouped
 */
import { gap } from "./model.mjs";
import { humanize } from "./sprint.mjs";

export function projectProject(raw, sprints) {
  const rootInfo = raw.root || {};
  const canonical = rootInfo.canonical || rootInfo.Canonical || null;
  const name = humanize(((canonical || "alloy").split("/").pop() || "alloy"));

  return {
    // The one authoritative project today.
    key: "alloy",
    name: name || "Alloy",
    root: canonical,
    base_ref: raw.base?.ref || "origin/staging",
    base_sha: raw.base?.sha || null,
    // Sprint hierarchy = the live occupied slots, ordered.
    sprint_keys: sprints.map((s) => s.key),
    sprint_count: sprints.length,
    // Explicit, honest gaps — surfaced, never fabricated.
    epics: [],
    projects_available: [{ key: "alloy", name: name || "Alloy", active: true }],
    gaps: [
      gap("projects_available[]", "No multi-project registry exists; the toolkit has one canonical repo.", "A project registry (e.g. projects/*.env) or config-declared project list."),
      gap("epics[]", "No epic record type; the toolkit tracks initiatives and sprints, not epics.", "An epic ↔ initiative grouping in initiative state or a new epic record."),
    ],
  };
}
