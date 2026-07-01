/**
 * SubjectComposition — card grid layout for one operational subject at a Focus Panel mode.
 * @see docs/platform/operator/focus-panel-architecture-vocabulary.md
 */

import type { FocusPanelCardGridSpec } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelGridRow } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";

/** Derived card presentation for one operational subject in a Focus Panel mode. */
export type SubjectComposition = {
    mode: FocusPanelMode;
    cards: FocusPanelCardModel[];
    gridSpec?: FocusPanelCardGridSpec;
    gridRows?: FocusPanelGridRow[];
};
