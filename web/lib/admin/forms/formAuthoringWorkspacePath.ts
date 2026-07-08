/** Canonical rich form authoring route (FormDocumentAuthoringShell). */
export function formAuthoringWorkspacePath(formId: string): string {
    return `/adminV2/forms/${formId}`;
}

/** Open rich form composer in a new tab — operator mental model: "I now have an Alloy form." */
export function openFormAuthoringWorkspace(formId: string): void {
    window.open(formAuthoringWorkspacePath(formId), "_blank", "noopener,noreferrer");
}
