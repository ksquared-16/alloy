/**
 * Next's server runtime sets `globalThis.AsyncLocalStorage` before any app module loads, and Next reads it when its
 * own modules are first evaluated. An operator command is not a Next server, so this sets it first. Import it before
 * anything else in the command (import order is evaluation order).
 */

import { AsyncLocalStorage } from "async_hooks";

const g = globalThis as { AsyncLocalStorage?: unknown };
g.AsyncLocalStorage ??= AsyncLocalStorage;

export {};
