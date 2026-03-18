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
import ManagerNode, { MANAGER_CARD_WIDTH } from "./ManagerNode";
import AmbientFocusNode from "./AmbientFocusNode";
import {
  getDepartmentPosition,
  getCompanyGridCenter,
  getCompanyFieldAmbientB,
  getCompanyFieldAmbientWest,
  getCompanyFieldAmbientEast,
  getCompanyFieldAmbientTop,
  getCompanyFieldAmbientSouth,
  COMPANY_DEPT_NODE_WIDTH,
  COMPANY_DEPT_NODE_HEIGHT,
} from "./canvasLayout";
import { MOCK_DEPARTMENTS } from "./mockDepartments";
import { getManagersForDepartment } from "./mockManagers";
import { getManagerCardStats } from "./mockManagerStats";
import type { DepartmentNodeData } from "./DepartmentNode";
import type { ManagerNodeData } from "./ManagerNode";
import type { AmbientFocusData } from "./AmbientFocusNode";
import type { DepartmentKey } from "@/lib/departmentColors";

const ACTIVATION_MS = 160;
/** Single coherent camera move into department (no prior recenter) */
const DEPARTMENT_ENTER_MS = 720;
const AMBIENT_FADE_DELAY_MS = 2200;
const PROOF_MANAGER_LIMIT = 2;
const AMBIENT_FOCUS_SIZE = 1120;
const AMBIENT_FOCUS_HALF = AMBIENT_FOCUS_SIZE / 2;
/** Company hub ambient (grid-centered); field satellites use AMBIENT_FIELD_HALF */
const AMBIENT_HUB_HALF = 835;
const DEPT_W = COMPANY_DEPT_NODE_WIDTH;
const DEPT_H = COMPANY_DEPT_NODE_HEIGHT;

function deptCenterFromId(id: string): { x: number; y: number } | null {
  const idx = MOCK_DEPARTMENTS.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  const p = getDepartmentPosition(idx);
  return { x: p.x + DEPT_W / 2, y: p.y + DEPT_H / 2 };
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
  focusAnchor: { x: number; y: number }
): { x: number; y: number } {
  const mc = managerClusterCenter(count, focusAnchor);
  const deptCx = focusAnchor.x + DEPT_W / 2;
  return {
    x: mc.x * 0.72 + deptCx * 0.28,
    y: mc.y + 155,
  };
}

function managersForProof(key: DepartmentKey) {
  return getManagersForDepartment(key).slice(0, PROOF_MANAGER_LIMIT);
}

/** One smooth move from current viewport → department operating view */
function DepartmentEnterRunner({
  active,
  focusAnchor,
  managerCount,
  departmentKey,
}: {
  active: boolean;
  focusAnchor: { x: number; y: number } | null;
  managerCount: number;
  departmentKey: DepartmentKey | null;
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
    const deptCy = focusAnchor.y + DEPT_H / 2;
    const blendY = deptCy * 0.2 + c.y * 0.8;
    const blendX = focusAnchor.x + DEPT_W / 2;
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
  }, [active, focusAnchor, managerCount, departmentKey, setCenter]);

  return null;
}

function FitCompanyView({ zoomLevel }: { zoomLevel: "company" | "department" }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (zoomLevel !== "company") return;
    const id = window.setTimeout(() => {
      fitView({
        padding: 0.003,
        duration: 440,
        maxZoom: 2.08,
        minZoom: 0.32,
      });
    }, 0);
    return () => clearTimeout(id);
  }, [zoomLevel, fitView]);
  return null;
}

const nodeTypes = {
  department: DepartmentNode,
  manager: ManagerNode,
  ambientFocus: AmbientFocusNode,
};

const AMBIENT_ID = "__ambient_focus__";
const AMBIENT_COMPANY_B = "__ambient_company_b__";
const AMBIENT_COMPANY_W = "__ambient_company_w__";
const AMBIENT_COMPANY_E = "__ambient_company_e__";
const AMBIENT_COMPANY_T = "__ambient_company_t__";
const AMBIENT_COMPANY_S = "__ambient_company_s__";
const AMBIENT_FIELD_HALF = 410;

const AMBIENT_COMPANY_IDS = new Set([
  AMBIENT_ID,
  AMBIENT_COMPANY_B,
  AMBIENT_COMPANY_W,
  AMBIENT_COMPANY_E,
  AMBIENT_COMPANY_T,
  AMBIENT_COMPANY_S,
]);

function isAmbientNodeId(id: string): boolean {
  return AMBIENT_COMPANY_IDS.has(id);
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
  const [ambientIntensity, setAmbientIntensity] = useState(0.55);
  const [mapToolsOpen, setMapToolsOpen] = useState(false);
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
    }
  }, [zoomLevel]);

  useEffect(() => {
    if (!activatingDepartmentId || !pendingZoomRef.current) return;
    const pending = pendingZoomRef.current;
    const t = window.setTimeout(() => {
      lastZoomedPositionRef.current = pending.position;
      setFocusAnchor(pending.position);
      setActivatingDepartmentId(null);
      setAmbientIntensity(0.78);
      setMapToolsOpen(false);
      onDepartmentClick(pending.key);
      onNodeSelect(pending.nodeId);
      pendingZoomRef.current = null;
    }, ACTIVATION_MS);
    return () => clearTimeout(t);
  }, [activatingDepartmentId, onDepartmentClick, onNodeSelect]);

  useEffect(() => {
    if (zoomLevel !== "department" || !selectedDepartmentKey) return;
    const t = window.setTimeout(() => setAmbientIntensity(0.74), AMBIENT_FADE_DELAY_MS);
    return () => clearTimeout(t);
  }, [zoomLevel, selectedDepartmentKey]);

  useEffect(() => {
    if (activatingDepartmentId) setAmbientIntensity(0.92);
  }, [activatingDepartmentId]);

  useEffect(() => {
    if (zoomLevel === "company") setMapToolsOpen(false);
  }, [zoomLevel]);

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
          return idx >= 0 ? getDepartmentPosition(idx) : { x: 120, y: 80 };
        })();
      return ambientFocusAnchorBehindCards(n, fallback);
    }
    if (activatingDepartmentId) {
      return deptCenterFromId(activatingDepartmentId);
    }
    if (zoomLevel === "company") {
      return getCompanyGridCenter();
    }
    return null;
  }, [zoomLevel, selectedDepartmentKey, activatingDepartmentId]);

  const ambientHalf =
    ambientVariant === "company" ? AMBIENT_HUB_HALF : AMBIENT_FOCUS_HALF;
  const ambientIntensityForNode =
    ambientVariant === "company" ? 0.58 : ambientIntensity;

  const ambientNodes: Node<AmbientFocusData>[] = useMemo(() => {
    if (!ambientCenter) return [];
    const base = {
      type: "ambientFocus" as const,
      draggable: false,
      selectable: false,
      className: "adminv2-rf-ambient",
      zIndex: 0,
    };
    const companyIdle =
      zoomLevel === "company" && activatingDepartmentId == null;

    if (companyIdle) {
      const b = getCompanyFieldAmbientB();
      const w = getCompanyFieldAmbientWest();
      const e = getCompanyFieldAmbientEast();
      const t = getCompanyFieldAmbientTop();
      const s = getCompanyFieldAmbientSouth();
      const field = { variant: "company" as const, companyLayout: "field" as const };
      const hub = { variant: "company" as const, companyLayout: "hub" as const };
      return [
        {
          id: AMBIENT_ID,
          ...base,
          position: {
            x: ambientCenter.x - AMBIENT_HUB_HALF,
            y: ambientCenter.y - AMBIENT_HUB_HALF,
          },
          data: { intensity: 0.86, ...hub },
        },
        {
          id: AMBIENT_COMPANY_B,
          ...base,
          position: {
            x: b.x - AMBIENT_FIELD_HALF,
            y: b.y - AMBIENT_FIELD_HALF,
          },
          data: { intensity: 0.64, ...field },
        },
        {
          id: AMBIENT_COMPANY_W,
          ...base,
          position: {
            x: w.x - AMBIENT_FIELD_HALF,
            y: w.y - AMBIENT_FIELD_HALF,
          },
          data: { intensity: 0.6, ...field },
        },
        {
          id: AMBIENT_COMPANY_E,
          ...base,
          position: {
            x: e.x - AMBIENT_FIELD_HALF,
            y: e.y - AMBIENT_FIELD_HALF,
          },
          data: { intensity: 0.6, ...field },
        },
        {
          id: AMBIENT_COMPANY_T,
          ...base,
          position: {
            x: t.x - AMBIENT_FIELD_HALF,
            y: t.y - AMBIENT_FIELD_HALF,
          },
          data: { intensity: 0.58, ...field },
        },
        {
          id: AMBIENT_COMPANY_S,
          ...base,
          position: {
            x: s.x - AMBIENT_FIELD_HALF,
            y: s.y - AMBIENT_FIELD_HALF,
          },
          data: { intensity: 0.58, ...field },
        },
      ];
    }

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
        },
      },
    ];
  }, [
    ambientCenter,
    ambientHalf,
    ambientIntensityForNode,
    ambientVariant,
    zoomLevel,
    activatingDepartmentId,
  ]);

  const departmentNodes: Node<DepartmentNodeData & { zoomingOut?: boolean; activating?: boolean }>[] =
    useMemo(
      () =>
        MOCK_DEPARTMENTS.map((d, i) => ({
          id: d.id,
          type: "department",
          position: getDepartmentPosition(i),
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
          },
          draggable: !activatingDepartmentId,
          selected: selectedNodeId === d.id,
          zIndex: 60,
          className: "adminv2-rf-foreground",
        })),
      [selectedNodeId, activatingDepartmentId]
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
  const nodes = useMemo(() => {
    return [...(ambientNodes as Node[]), ...contentNodes];
  }, [ambientNodes, contentNodes]);

  const [nodesState, setNodes, onNodesChange] = useNodesState(nodes as Node[]);
  const [edges, , onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setNodes(nodes as Node[]);
  }, [nodes, setNodes]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (isAmbientNodeId(node.id)) return;
      if (activatingDepartmentId) return;
      if (node.type === "department" && zoomLevel === "company") {
        pendingZoomRef.current = {
          nodeId: node.id,
          key: (node.data as DepartmentNodeData).departmentKey,
          position: node.position,
        };
        setActivatingDepartmentId(node.id);
      } else {
        onNodeSelect(node.id);
      }
    },
    [zoomLevel, onNodeSelect, activatingDepartmentId]
  );

  const onPaneClick = useCallback(() => {
    if (!activatingDepartmentId) onNodeSelect(null);
  }, [onNodeSelect, activatingDepartmentId]);

  return (
    <div
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
          maxZoom={2}
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
          <FitCompanyView zoomLevel={zoomLevel} />
          <DepartmentEnterRunner
            active={zoomLevel === "department" && selectedDepartmentKey != null}
            focusAnchor={focusAnchor}
            managerCount={
              selectedDepartmentKey ? managersForProof(selectedDepartmentKey).length : 0
            }
            departmentKey={selectedDepartmentKey}
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
