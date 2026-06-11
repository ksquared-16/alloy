/**
 * UI session cache TTLs for warm navigation — operator sessions, not authoritative data.
 * Stale entries refresh silently; presentation is retained until refresh completes.
 */
export const ADMINV2_UI_SESSION_CACHE_TTL_MS = 20 * 60 * 1000;

/** Queue row client cache — lane retention across pill switches and warm work-unit return. */
export const ADMINV2_QUEUE_ROW_CLIENT_CACHE_TTL_MS = 20 * 60 * 1000;
