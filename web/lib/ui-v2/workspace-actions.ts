/**
 * UI V2 workspace actions — stable contract for wiring to API / events / workflows.
 * Components emit these; shells or route handlers map them to concrete paths.
 * No local business mutations in block components.
 */

export type WorkspaceAction =
  | {
      type: "signal.action";
      signalId: string;
      actionId: string;
      payload?: Record<string, unknown>;
    }
  | {
      type: "queue.item.action";
      queueId: string;
      itemId: string;
      actionId: string;
      payload?: Record<string, unknown>;
    }
  | {
      type: "context.group.action";
      groupKey: string;
      actionId: string;
      targetId?: string;
      payload?: Record<string, unknown>;
    }
  | {
      type: "actions.block";
      actionId: string;
      payload?: Record<string, unknown>;
    }
  | {
      /** Drill from record body line to related entity (host resolves linkId) */
      type: "record.body.link";
      recordId: string;
      sectionId: string;
      linkId: string;
      /** Optional snippet for analytics / logging */
      linePreview?: string;
      payload?: Record<string, unknown>;
    }
  | {
      /** Record body side column — contextual chips (Call / Assign); host maps to comms / team UI */
      type: "record.interaction";
      recordId: string;
      panel: "contact" | "assignment";
      actionId: string;
      payload?: Record<string, unknown>;
    }
  | {
      type: "work.action";
      workId: string;
      actionId: string;
      payload?: Record<string, unknown>;
    }
  | {
      type: "navigate";
      /** App route or deep-link key resolved by host */
      href: string;
      preserveContext?: boolean;
    }
  | {
      /** Drill from company overview into a department workspace */
      type: "company.open_department";
      departmentKey: string;
    }
  | {
      type: "ai.assistant.submit";
      text: string;
      context?: Record<string, unknown>;
    };

export type WorkspaceActionHandler = (action: WorkspaceAction) => void;
