"use client";

/**
 * POS panel — now a thin alias of the canonical `WorkspacePanel` so POS, Forms,
 * Layouts, Processing and Communications share identical panel chrome (white
 * surface, Bend Pine left accent, emerald header band). Kept as a re-export to
 * avoid churn across existing POS imports.
 */

export { default } from "@/components/workspace/WorkspacePanel";
