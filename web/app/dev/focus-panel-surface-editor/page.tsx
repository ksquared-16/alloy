import SurfaceEditorDevClient from "@/app/dev/focus-panel-surface-editor/SurfaceEditorDevClient";

/** Dev-only, no-auth mirror of the gated /settings/surfaces Focus Panel editor. */
export default function FocusPanelSurfaceEditorDevPage() {
    return <SurfaceEditorDevClient />;
}
