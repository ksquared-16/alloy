import type { CSSProperties } from "react";
import { departmentWorkspaceShellBaseStyle } from "@/lib/visualContext/shellBaseTokens";

/**
 * CSS variable contract for department workspace bridge — mirrors Admin V2
 * `DepartmentWorkspace` so `workspace.css` selectors apply under `[data-ws-surface="department"]`.
 *
 * @deprecated Prefer `operationalWorkspaceShellStyle` from `@/lib/visualContext` when contextual
 * identity is available; this export remains the neutral base for legacy call sites.
 */
export const departmentWorkspaceBridgeRootStyle: CSSProperties = departmentWorkspaceShellBaseStyle;
