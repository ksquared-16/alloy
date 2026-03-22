import type { ContextBlockConfig } from "../context-config";
import type { RecordWorkspaceModel, RecordWorkspaceSourcePayload } from "../workspace-types";
import { normalizeContextRelationshipGroups, type ContextRelationshipRawData } from "./context-adapter";

export type ToRecordWorkspaceModelInput = {
  model: Omit<RecordWorkspaceModel, "workspaceLevel">;
  contextConfig?: ContextBlockConfig | null;
  contextRaw?: ContextRelationshipRawData;
  role?: string;
};

export function toRecordWorkspaceModel(input: ToRecordWorkspaceModelInput): RecordWorkspaceModel {
  const { model, contextConfig, contextRaw, role } = input;
  let context = model.context;
  if (contextConfig && contextRaw) {
    context = normalizeContextRelationshipGroups(contextConfig, contextRaw, {
      level: "record",
      role,
    });
  }
  return {
    workspaceLevel: "record",
    ...model,
    context,
  };
}

export function toRecordWorkspaceModelFromPayload(_payload: RecordWorkspaceSourcePayload): RecordWorkspaceModel {
  throw new Error("toRecordWorkspaceModelFromPayload: scaffold — implement when record API is defined.");
}
