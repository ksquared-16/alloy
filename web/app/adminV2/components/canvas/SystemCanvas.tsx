"use client";

import { useCallback, useMemo, useEffect, useState, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import DepartmentNode from "./DepartmentNode";
import ActionPanelNode from "./ActionPanelNode";
import ManagerNode, { MANAGER_CARD_WIDTH } from "./ManagerNode";
import AmbientFocusNode from "./AmbientFocusNode";
import ChamberAmbientNode from "./ChamberAmbientNode";
import {
  getDepartmentPosition,
  getCompanyDepartmentDisplayPosition,
  getCompanyGridCenter,
  getCompanyChamberAmbientRect,
  getResponsiveLayout,
  type CompanyLayout,
} from "./canvasLayout";
import { MOCK_DEPARTMENTS } from "./mockDepartments";
import { MOCK_DEPARTMENT_ACTIONS, getActionPanelContent } from "./mockDepartmentActions";
import { getManagersForDepartment } from "./mockManagers";
import { getManagerCardStats } from "./mockManagerStats";
import type { DepartmentNodeData } from "./DepartmentNode";
import type { ManagerNodeData } from "./ManagerNode";
import type { DepartmentKey } from "@/lib/departmentColors";
import {
  AMBIENT_CHAMBER_INTENSITY,
  AMBIENT_FOCUS_ACTIVATING,
  AMBIENT_FOCUS_DEPARTMENT_ENTER,
  AMBIENT_FOCUS_DEPARTMENT_STEADY,
  AMBIENT_FOCUS_INITIAL,
  AMBIENT_FOCUS_MANAGER_STEADY,
  isManagerAmbientNodeId,
} from "./ambientTiers";

const ACTIVATION_MS = 160;
/** Single coherent camera move into department (no prior recenter) */
const DEPARTMENT_ENTER_MS = 720;
const AMBIENT_FADE_DELAY_MS = 2200;
const PROOF_MANAGER_LIMIT = 2;
const AMBIENT_FOCUS_SIZE = 1120;
const AMBIENT_FOCUS_HALF = AMBIENT_FOCUS_SIZE / 2;
const ACTION_PANEL_HEIGHT_ESTIMATE = 280;

function deptCenterFromId(id: string, layout: CompanyLayout): { x: number; y: number } | null {
  const idx = MOCK_DEPARTMENTS.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  const p = getDepartmentPosition(idx, layout);
  const W = layout.COMPANY_DEPT_NODE_WIDTH;
  const H = layout.COMPANY_DEPT_NODE_HEIGHT;
  return { x: p.x + W / 2, y: p.y + H / 2 };
}

const MANAGER_GAP = 64;
const MANAGER_Y_OFFSET = 56;

function getManagerPositions(
  count: number,
  centerAt: { x: number; y: number } | null
): { x: number; y: number }[] {
  const totalWidth = count * MANAGER_CARD_WIDTH + (count - 1) * MANAGER_GAP;
  const startX = centerAt
    ? centerAt.x - totalWidth / 2 + MANAGER_CARD_WIDTH / 2
    : 100;
  const y = centerAt ? centerAt.y + MANAGER_Y_OFFSET : 120;
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    positions.push({
      x: startX + i * (MANAGER_CARD_WIDTH + MANAGER_GAP),
      y,
    });
  }
  return positions;
}

function managerClusterCenter(
  count: number,
  centerAt: { x: number; y: number } | null
): { x: number; y: number } {
  const positions = getManagerPositions(count, centerAt);
  if (positions.length === 0) return { x: 320, y: 280 };
  const midY = positions[0].y + 124;
  const cx =
    (positions[0].x + positions[positions.length - 1].x + MANAGER_CARD_WIDTH) / 2;
  return { x: cx, y: midY };
}

/** Ambient anchor below manager card faces — specs orbit dark gap, not white tiles */
function ambientFocusAnchorBehindCards(
  count: number,
  focusAnchor: { x: number; y: number },
  layout: CompanyLayout
): { x: number; y: number } {
  const mc = managerClusterCenter(count, focusAnchor);
  const deptW = layout.COMPANY_DEPT_NODE_WIDTH;
  const deptCx = focusAnchor.x + deptW / 2;
  return {
    x: mc.x * 0.72 + deptCx * 0.28,
    y: mc.y + 155,
  };
}

function managersForProof(key: DepartmentKey) {
  return getManagersForDepartment(key).slice(0, PROOF_MANAGER_LIMIT);
}

type ScreenToFlowFn = (position: { x: number; y: number }) => { x: number; y: number };

/** Exposes React Flow's screenToFlowPosition to parent (must be inside ReactFlowProvider). */
function SetScreenToFlowRef({
  projectRef,
}: {
  projectRef: React.MutableRefObject<ScreenToFlowFn | null>;
}) {
  const { screenToFlowPosition } = useReactFlow();
  useEffect(() => {
    projectRef.current = screenToFlowPosition;
    return () => {
      projectRef.current = null;
    };
  }, [screenToFlowPosition, projectRef]);
  return null;
}

/** One smooth move from current viewport → department operating view */
function DepartmentEnterRunner({
  active,
  focusAnchor,
  managerCount,
  departmentKey,
  layout,
}: {
  active: boolean;
  focusAnchor: { x: number; y: number } | null;
  managerCount: number;
  departmentKey: DepartmentKey | null;
  layout: CompanyLayout;
}) {
  const { setCenter } = useReactFlow();
  const ranKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active) {
      ranKeyRef.current = null;
      return;
    }
    if (!focusAnchor || managerCount < 1 || !departmentKey) {
      return;
    }
    const runKey = `${departmentKey}-${focusAnchor.x}-${focusAnchor.y}`;
    if (ranKeyRef.current === runKey) return;

    const c = managerClusterCenter(managerCount, focusAnchor);
    const deptW = layout.COMPANY_DEPT_NODE_WIDTH;
    const deptH = layout.COMPANY_DEPT_NODE_HEIGHT;
    const deptCy = focusAnchor.y + deptH / 2;
    const blendY = deptCy * 0.2 + c.y * 0.8;
    const blendX = focusAnchor.x + deptW / 2;
    const cx = blendX * 0.26 + c.x * 0.74;
    const cy = blendY;

    let cancelled = false;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (cancelled) return;
        setCenter(cx, cy, {
          zoom: 1.58,
          duration: DEPARTMENT_ENTER_MS,
          interpolate: "smooth",
        } as { duration: number; zoom: number; interpolate: string });
        ranKeyRef.current = runKey;
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
    };
  }, [active, focusAnchor, managerCount, departmentKey, layout, setCenter]);

  return null;
}

function FitCompanyView({
  zoomLevel,
  fitViewPadding,
}: {
  zoomLevel: "company" | "department";
  fitViewPadding: number;
}) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (zoomLevel !== "company") return;
    const id = window.setTimeout(() => {
      fitView({
        padding: fitViewPadding,
        duration: 420,
        maxZoom: 2.05,
        minZoom: 0.26,
        nodes: MOCK_DEPARTMENTS.map((d) => ({ id: d.id })),
      });
    }, 0);
    return () => clearTimeout(id);
  }, [zoomLevel, fitView, fitViewPadding]);
  return null;
}

const PANEL_OFFSET_BELOW_BUTTON = 8;

const nodeTypes = {
  department: DepartmentNode,
  actionPanel: ActionPanelNode,
  manager: ManagerNode,
  ambientFocus: AmbientFocusNode,
  chamberAmbient: ChamberAmbientNode,
};

const AMBIENT_ID = "__ambient_focus__";
const AMBIENT_CHAMBER = "__ambient_chamber__";

function isAmbientNodeId(id: string): boolean {
  return id === AMBIENT_ID || id === AMBIENT_CHAMBER;
}

export type SystemCanvasProps = {
  zoomLevel: "company" | "department";
  selectedDepartmentKey: DepartmentKey | null;
  selectedNodeId: string | null;
  onDepartmentClick: (key: DepartmentKey) => void;
  onNodeSelect: (nodeId: string | null) => void;
};

export default function SystemCanvas({
  zoomLevel,
  selectedDepartmentKey,
  selectedNodeId,
  onDepartmentClick,
  onNodeSelect,
}: SystemCanvasProps) {
  const [activatingDepartmentId, setActivatingDepartmentId] = useState<string | null>(null);
  const [ambientIntensity, setAmbientIntensity] = useState(AMBIENT_FOCUS_INITIAL);
  const selectedNodeIdRef = useRef<string | null>(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;
  const ambientFadeTimerRef = useRef<number | null>(null);
  const [mapToolsOpen, setMapToolsOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<{
    nodeId: string;
    actionId: string;
    flowPosition: { x: number; y: number };
  } | null>(null);
  const screenToFlowRef = useRef<ScreenToFlowFn | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(
    () => (typeof window !== "undefined" ? window.innerWidth : 1920)
  );
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const layout = useMemo(() => getResponsiveLayout(viewportWidth), [viewportWidth]);
  const pendingZoomRef = useRef<{
    nodeId: string;
    key: DepartmentKey;
    position: { x: number; y: number };
  } | null>(null);

  const lastZoomedPositionRef = useRef<{ x: number; y: number } | null>(null);
  const [focusAnchor, setFocusAnchor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (zoomLevel === "company") {
      setFocusAnchor(null);
      if (ambientFadeTimerRef.current != null) {
        window.clearTimeout(ambientFadeTimerRef.current);
        ambientFadeTimerRef.current = null;
      }
      setAmbientIntensity(AMBIENT_FOCUS_INITIAL);
    }
  }, [zoomLevel]);

  useEffect(() => {
    if (!activatingDepartmentId || !pendingZoomRef.current) return;
    const pending = pendingZoomRef.current;
    const t = window.setTimeout(() => {
      lastZoomedPositionRef.current = pending.position;
      setFocusAnchor(pending.position);
      setActivatingDepartmentId(null);
      setAmbientIntensity(AMBIENT_FOCUS_DEPARTMENT_ENTER);
      if (ambientFadeTimerRef.current != null) {
        window.clearTimeout(ambientFadeTimerRef.current);
      }
      ambientFadeTimerRef.current = window.setTimeout(() => {
        ambientFadeTimerRef.current = null;
        setAmbientIntensity(
          isManagerAmbientNodeId(selectedNodeIdRef.current)
            ? AMBIENT_FOCUS_MANAGER_STEADY
            : AMBIENT_FOCUS_DEPARTMENT_STEADY
        );
      }, AMBIENT_FADE_DELAY_MS);
      setMapToolsOpen(false);
      onDepartmentClick(pending.key);
      onNodeSelect(pending.nodeId);
      pendingZoomRef.current = null;
    }, ACTIVATION_MS);
    return () => clearTimeout(t);
  }, [activatingDepartmentId, onDepartmentClick, onNodeSelect]);

  useEffect(() => {
    if (zoomLevel !== "department" || !selectedDepartmentKey) return;
    if (isManagerAmbientNodeId(selectedNodeId)) {
      setAmbientIntensity(AMBIENT_FOCUS_MANAGER_STEADY);
    } else if (selectedNodeId === null) {
      setAmbientIntensity(AMBIENT_FOCUS_DEPARTMENT_STEADY);
    }
  }, [selectedNodeId, zoomLevel, selectedDepartmentKey]);

  useEffect(() => {
    if (activatingDepartmentId) setAmbientIntensity(AMBIENT_FOCUS_ACTIVATING);
  }, [activatingDepartmentId]);

  useEffect(() => {
    if (zoomLevel === "company") setMapToolsOpen(false);
  }, [zoomLevel]);

  useEffect(() => {
    if (!activeAction) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveAction(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeAction]);

  const onQuickActionClick = useCallback(
    (nodeId: string, actionId: string, event: React.MouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const clickX = rect.left + rect.width / 2;
      const clickY = rect.bottom;
      const screenToFlow = screenToFlowRef.current;
      if (!screenToFlow) return;
      const flowPoint = screenToFlow({ x: clickX, y: clickY });
      const panelW = layout.actionPanelWidth;
      let flowX = flowPoint.x - panelW / 2;
      let flowY = flowPoint.y + PANEL_OFFSET_BELOW_BUTTON;
      const container = canvasContainerRef.current;
      if (container) {
        const vr = container.getBoundingClientRect();
        const flowTL = screenToFlow({ x: vr.left, y: vr.top });
        const flowBR = screenToFlow({ x: vr.right, y: vr.bottom });
        flowX = Math.max(flowTL.x, Math.min(flowBR.x - panelW, flowX));
        flowY = Math.max(flowTL.y, Math.min(flowBR.y - ACTION_PANEL_HEIGHT_ESTIMATE, flowY));
      }
      setActiveAction({ nodeId, actionId, flowPosition: { x: flowX, y: flowY } });
    },
    [layout.actionPanelWidth]
  );

  const ambientVariant: "company" | "focus" = useMemo(() => {
    if (zoomLevel === "department" && selectedDepartmentKey) return "focus";
    if (activatingDepartmentId != null) return "focus";
    return "company";
  }, [zoomLevel, selectedDepartmentKey, activatingDepartmentId]);

  const ambientCenter = useMemo(() => {
    if (zoomLevel === "department" && selectedDepartmentKey) {
      const n = managersForProof(selectedDepartmentKey).length;
      const pos = lastZoomedPositionRef.current;
      const fallback =
        pos ??
        (() => {
          const idx = MOCK_DEPARTMENTS.findIndex((d) => d.key === selectedDepartmentKey);
          return idx >= 0 ? getDepartmentPosition(idx, layout) : { x: 120, y: 80 };
        })();
      return ambientFocusAnchorBehindCards(n, fallback, layout);
    }
    if (activatingDepartmentId) {
      return deptCenterFromId(activatingDepartmentId, layout);
    }
    if (zoomLevel === "company") {
      return getCompanyGridCenter(layout);
    }
    return null;
  }, [zoomLevel, selectedDepartmentKey, activatingDepartmentId, layout]);

  const ambientHalf = AMBIENT_FOCUS_HALF;
  const ambientIntensityForNode = ambientIntensity;
  const focusAmbientTier: "department" | "manager" =
    zoomLevel === "department" && isManagerAmbientNodeId(selectedNodeId) ? "manager" : "department";

  const ambientNodes: Node[] = useMemo(() => {
    const companyIdle =
      zoomLevel === "company" && activatingDepartmentId == null;

    if (companyIdle) {
      const rect = getCompanyChamberAmbientRect(layout);
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      /* 1×1 flow bounds so fitView / controls don’t zoom to the full ambient rect */
      return [
        {
          id: AMBIENT_CHAMBER,
          type: "chamberAmbient" as const,
          position: { x: cx - 0.5, y: cy - 0.5 },
          width: 1,
          height: 1,
          draggable: false,
          selectable: false,
          className: "adminv2-rf-ambient adminv2-rf-chamber-ambient",
          zIndex: 0,
          style: { width: 1, height: 1 },
          data: {
            intensity: AMBIENT_CHAMBER_INTENSITY,
            width: rect.width,
            height: rect.height,
          },
        },
      ];
    }

    if (!ambientCenter) return [];
    const base = {
      type: "ambientFocus" as const,
      draggable: false,
      selectable: false,
      className: "adminv2-rf-ambient",
      zIndex: 0,
    };
    return [
      {
        id: AMBIENT_ID,
        ...base,
        position: {
          x: ambientCenter.x - ambientHalf,
          y: ambientCenter.y - ambientHalf,
        },
        data: {
          intensity: ambientIntensityForNode,
          variant: ambientVariant,
          focusTier: focusAmbientTier,
        },
      },
    ];
  }, [
    ambientCenter,
    ambientHalf,
    ambientIntensityForNode,
    ambientVariant,
    focusAmbientTier,
    zoomLevel,
    activatingDepartmentId,
    layout,
  ]);

  const departmentNodes: Node<DepartmentNodeData & { zoomingOut?: boolean; activating?: boolean }>[] =
    useMemo(
      () =>
        MOCK_DEPARTMENTS.map((d, i) => {
          const actions = MOCK_DEPARTMENT_ACTIONS[d.key];
          return {
            id: d.id,
            type: "department",
            position: getCompanyDepartmentDisplayPosition(i, layout),
            data: {
              name: d.name,
              departmentKey: d.key,
              primaryKpi: d.primaryKpi,
              primaryValue: d.primaryValue,
              secondaryKpi: d.secondaryKpi,
              secondaryValue: d.secondaryValue,
              compact1Label: d.compact1Label,
              compact1Value: d.compact1Value,
              compact2Label: d.compact2Label,
              compact2Value: d.compact2Value,
              health: d.health,
              alertCount: d.alertCount,
              zoomingOut:
                activatingDepartmentId != null && activatingDepartmentId !== d.id,
              activating: activatingDepartmentId === d.id,
              quickActions: actions?.quickActions,
              nextBestAction: actions?.nextBestAction,
              isPriority: actions?.isPriority,
              onQuickActionClick,
              tileWidth: layout.COMPANY_GRID_DEPT_WIDTH,
              tileHeight: layout.COMPANY_GRID_DEPT_HEIGHT,
              cardPad: layout.CARD_PAD,
              primarySignal: d.primarySignal,
              secondaryContext: d.secondaryContext,
              agentSummary: d.agentSummary,
              agentRollup: d.agentRollup,
              agentStates: d.agentStates,
              topPerformer: d.topPerformer,
            },
            draggable: !activatingDepartmentId,
            selected: selectedNodeId === d.id,
            zIndex: 60,
            className: "adminv2-rf-foreground",
          };
        }),
      [selectedNodeId, activatingDepartmentId, onQuickActionClick, layout]
    );

  const managerNodes: Node<ManagerNodeData>[] = useMemo(() => {
    if (!selectedDepartmentKey) return [];
    const managers = managersForProof(selectedDepartmentKey);
    const centerAt = lastZoomedPositionRef.current;
    const positions = getManagerPositions(managers.length, centerAt);
    return managers.map((m, i) => {
      const stats = getManagerCardStats(m.id);
      return {
        id: m.id,
        type: "manager",
        position: positions[i],
        data: {
          name: m.name,
          departmentKey: m.departmentKey,
          stat1Label: stats.stat1Label,
          stat1Value: stats.stat1Value,
          stat2Label: stats.stat2Label,
          stat2Value: stats.stat2Value,
          enterStaggerMs: i * 64,
        } satisfies ManagerNodeData,
        draggable: true,
        selected: selectedNodeId === m.id,
        zIndex: 500,
        className: "adminv2-rf-foreground adminv2-rf-manager",
      };
    });
  }, [selectedDepartmentKey, selectedNodeId]);

  const contentNodes = zoomLevel === "company" ? departmentNodes : managerNodes;
  const actionPanelNode: Node | null = useMemo(() => {
    if (!activeAction || zoomLevel !== "company") return null;
    const content = getActionPanelContent(activeAction.actionId);
    const title = content?.title ?? "Action";
    const description = content?.description ?? "";
    const records = content?.records ?? [];
    const primaryLabel = content?.primaryLabel ?? "OK";
    const secondaryLabel = content?.secondaryLabel;
    return {
      id: "__action_panel__",
      type: "actionPanel",
      position: activeAction.flowPosition,
      data: {
        title,
        description,
        records,
        primaryLabel,
        secondaryLabel,
        panelWidth: layout.actionPanelWidth,
        onClose: () => setActiveAction(null),
      },
      draggable: false,
      selectable: false,
      zIndex: 300,
      className: "adminv2-rf-foreground",
    };
  }, [activeAction, zoomLevel, layout.actionPanelWidth]);

  const nodes = useMemo(() => {
    const list: Node[] = [...(ambientNodes as Node[]), ...contentNodes];
    if (actionPanelNode) list.push(actionPanelNode);
    return list;
  }, [ambientNodes, contentNodes, actionPanelNode]);

  const [nodesState, setNodes, onNodesChange] = useNodesState(nodes as Node[]);
  const [edges, , onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setNodes(nodes as Node[]);
  }, [nodes, setNodes]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id === "__action_panel__") return;
      setActiveAction(null);
      if (isAmbientNodeId(node.id)) return;
      if (activatingDepartmentId) return;
      if (node.type === "department" && zoomLevel === "company") {
        const idx = MOCK_DEPARTMENTS.findIndex((d) => d.id === node.id);
        pendingZoomRef.current = {
          nodeId: node.id,
          key: (node.data as DepartmentNodeData).departmentKey,
          position: idx >= 0 ? getDepartmentPosition(idx, layout) : node.position,
        };
        setActivatingDepartmentId(node.id);
      } else {
        onNodeSelect(node.id);
      }
    },
    [zoomLevel, onNodeSelect, activatingDepartmentId, layout]
  );

  const onPaneClick = useCallback(() => {
    setActiveAction(null);
    if (!activatingDepartmentId) onNodeSelect(null);
  }, [onNodeSelect, activatingDepartmentId]);

  return (
    <div
      ref={canvasContainerRef}
      className="w-full h-full relative overflow-hidden"
      style={{
        backgroundColor: derived.canvasChamberBase,
        backgroundImage: `
          radial-gradient(ellipse 84% 50% at 44% 30%, ${derived.canvasChamberBlueMist} 0%, transparent 56%),
          radial-gradient(ellipse 56% 44% at 76% 62%, ${derived.canvasChamberPineDrift} 0%, transparent 58%),
          radial-gradient(ellipse 100% 72% at 50% 112%, ${derived.canvasChamberVignetteEdge} 0%, transparent 46%),
          linear-gradient(168deg, ${derived.canvasChamberDeep} 0%, ${derived.canvasChamberBase} 42%, ${derived.canvasChamberDeep} 100%)
        `,
      }}
    >
      <ReactFlowProvider>
        <ReactFlow
          className="w-full h-full"
          nodes={nodesState}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          minZoom={0.1}
          maxZoom={2.35}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          proOptions={{ hideAttribution: true }}
          fitView={false}
          fitViewOptions={{ padding: 0.28, duration: 0 }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={26}
            size={1.35}
            color={derived.canvasChamberGridDot}
          />
          <SetScreenToFlowRef projectRef={screenToFlowRef} />
          <FitCompanyView zoomLevel={zoomLevel} fitViewPadding={layout.fitViewPadding} />
          <DepartmentEnterRunner
            active={zoomLevel === "department" && selectedDepartmentKey != null}
            focusAnchor={focusAnchor}
            managerCount={
              selectedDepartmentKey ? managersForProof(selectedDepartmentKey).length : 0
            }
            departmentKey={selectedDepartmentKey}
            layout={layout}
          />
          <div
            className="pointer-events-none"
            style={{
              position: "absolute",
              right: 10,
              bottom: 10,
              zIndex: 220,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
            }}
          >
            <div className="pointer-events-auto">
              {mapToolsOpen && (
                <div
                  className="adminv2-canvas-tools-tray"
                  style={{
                    borderColor: derived.border,
                    backgroundColor: neutral.surface,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: derived.textSecondary,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      Overview
                    </span>
                    <button
                      type="button"
                      onClick={() => setMapToolsOpen(false)}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: brand.primary,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "2px 6px",
                      }}
                    >
                      Close
                    </button>
                  </div>
                  <MiniMap
                    nodeColor={(n) => (isAmbientNodeId(n.id) ? "transparent" : neutral.border)}
                    maskColor={derived.maskOverlay}
                    style={{
                      width: 168,
                      height: 96,
                      backgroundColor: neutral.surface,
                    }}
                  />
                  <div
                    style={{
                      borderColor: derived.border,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderRadius: 8,
                      overflow: "hidden",
                    }}
                  >
                    <Controls showInteractive={false} />
                  </div>
                </div>
              )}
              <button
                type="button"
                className="adminv2-canvas-tools-fab"
                style={{
                  borderColor: derived.border,
                  backgroundColor: neutral.surface,
                  boxShadow: derived.cardShadow,
                }}
                aria-expanded={mapToolsOpen}
                aria-label={mapToolsOpen ? "Hide map and zoom controls" : "Show map and zoom controls"}
                onClick={() => setMapToolsOpen((o) => !o)}
              >
                {mapToolsOpen ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke={brand.primary}
                      strokeWidth={2.2}
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M4 10h4V6H4v4zm6 10h4v-4h-4v4zm0-10h10v4H10V10zM4 20h4v-4H4v4z"
                      fill={brand.primary}
                      opacity={0.85}
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
