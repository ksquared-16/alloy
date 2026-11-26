/**
 * WIRE FORMAT for a durable record's Focus Panel model.
 *
 * `FocusPanelWorkModeModel` carries two `ReadonlyMap`s (`cardModels`, `cardReadiness`). Maps do not
 * survive JSON, so the server↔client hop needs an explicit encoding rather than an implicit one that
 * silently arrives as `{}` — a model whose card maps are empty objects composes a panel with no
 * cards and no error, which is precisely the class of silent failure this program exists to remove.
 *
 * Entry order is preserved because it is the reading order the composition depends on.
 *
 * This is a TRANSPORT concern only. Nothing here decides composition, and the decoded model is
 * structurally the same object the server built — the grid cannot tell which side produced it.
 */

import type { FocusPanelCardKey, FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type {
    FocusPanelCardReadiness,
    FocusPanelWorkModeModel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";

/** The JSON-safe shape. Identical to the model except the two maps become ordered entry arrays. */
export type DurableRecordModelWire = Omit<FocusPanelWorkModeModel, "cardModels" | "cardReadiness"> & {
    cardModels: [FocusPanelCardKey, FocusPanelCardModel][];
    cardReadiness: [FocusPanelCardKey, FocusPanelCardReadiness][];
};

export function encodeDurableRecordModel(model: FocusPanelWorkModeModel): DurableRecordModelWire {
    const { cardModels, cardReadiness, ...rest } = model;
    return { ...rest, cardModels: [...cardModels], cardReadiness: [...cardReadiness] };
}

export function decodeDurableRecordModel(wire: DurableRecordModelWire): FocusPanelWorkModeModel {
    const { cardModels, cardReadiness, ...rest } = wire;
    return { ...rest, cardModels: new Map(cardModels), cardReadiness: new Map(cardReadiness) };
}
