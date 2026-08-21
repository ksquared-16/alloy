/**
 * Execution providers Vacilando may bind to a Development Lane.
 *
 * Claude and Cursor are both real Alloy slot providers. Gateway admission
 * previously refused Cursor, which kept IDE sessions outside the lane model.
 * This is not a new scheduler and not a third-party plugin surface.
 */
export const EXECUTION_PROVIDERS = Object.freeze(["claude", "cursor"]);

export function normalizeExecutionProvider(raw, fallback = "claude") {
  const v = String(raw || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!v) return fallback;
  if (v === "claudecode" || v === "claude-code") return "claude";
  if (v === "cursor-agent" || v === "cursoride" || v === "cursor_ide") return "cursor";
  if (EXECUTION_PROVIDERS.includes(v)) return v;
  return null;
}

export function isSupportedExecutionProvider(raw) {
  return normalizeExecutionProvider(raw, "") != null;
}
