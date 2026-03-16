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
import { neutral, derived } from "@/styles/tokens/colors";
import DepartmentNode from "./DepartmentNode";
import ManagerNode from "./ManagerNode";
import { MOCK_DEPARTMENTS } from "./mockDepartments";
import { getManagersForDepartment } from "./mockManagers";
import type { DepartmentNodeData } from "./DepartmentNode";
import type { ManagerNodeData } from "./ManagerNode";
import type { DepartmentKey } from "@/lib/departmentColors";

const ZOOM_DURATION_MS = 380;

const DEPT_NODE_WIDTH = 200;
const DEPT_NODE_HEIGHT = 160;
const GAP_X = 80;
const GAP_Y = 60;
const OFFSET_X = 60;
const OFFSET_Y = 40;

function getDepartmentPosition(index: number): { x: number; y: number } {
  switch (index) {
    case 0:
      return { x: OFFSET_X, y: OFFSET_Y };
    case 1:
      return { x: OFFSET_X + DEPT_NODE_WIDTH + GAP_X, y: OFFSET_Y };
    case 2:
      return { x: OFFSET_X, y: OFFSET_Y + DEPT_NODE_HEIGHT + GAP_Y };
    case 3:
      return { x: OFFSET_X + DEPT_NODE_WIDTH + GAP_X, y: OFFSET_Y + DEPT_NODE_HEIGHT + GAP_Y };
    case 4: {
      const centerX = (OFFSET_X * 2 + DEPT_NODE_WIDTH * 2 + GAP_X) / 2 - DEPT_NODE_WIDTH / 2;
      return { x: centerX, y: OFFSET_Y + (DEPT_NODE_HEIGHT + GAP_Y) * 2 };
    }
    default:
      return {
        x: OFFSET_X + (index % 2) * (DEPT_NODE_WIDTH + GAP_X),
        y: OFFSET_Y + Math.floor(index / 2) * (DEPT_NODE_HEIGHT + GAP_Y),
      };
  }
}

const MANAGER_NODE_WIDTH = 160;
const MANAGER_GAP = 60;

function getManagerPositions(
  count: number,
  centerAt: { x: number; y: number } | null
): { x: number; y: number }[] {
  const totalWidth = count * MANAGER_NODE_WIDTH + (count - 1) * MANAGER_GAP;
  const startX = centerAt
    ? centerAt.x - totalWidth / 2 + MANAGER_NODE_WIDTH / 2
    : 80;
  const y = centerAt ? centerAt.y - 40 : 80;
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    positions.push({
      x: startX + i * (MANAGER_NODE_WIDTH + MANAGER_GAP),
      y,
    });
  }
  return positions;
}

function ZoomRunner({
  zoomingInto,
  onComplete,
}: {
  zoomingInto: { nodeId: string; key: DepartmentKey; position: { x: number; y: number } } | null;
  onComplete: (key: DepartmentKey, nodeId: string, position: { x: number; y: number }) => void;
}) {
  const { setCenter } = useReactFlow();

  useEffect(() => {
    if (!zoomingInto) return;
    const cx = zoomingInto.position.x + DEPT_NODE_WIDTH / 2;
    const cy = zoomingInto.position.y + DEPT_NODE_HEIGHT / 2;
    setCenter(cx, cy, { duration: ZOOM_DURATION_MS });
    const t = setTimeout(() => {
      onComplete(zoomingInto.key, zoomingInto.nodeId, zoomingInto.position);
    }, ZOOM_DURATION_MS);
    return () => clearTimeout(t);
  }, [zoomingInto, setCenter, onComplete]);

  return null;
}

const nodeTypes = { department: DepartmentNode, manager: ManagerNode };

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
  const [zoomingInto, setZoomingInto] = useState<{
    nodeId: string;
    key: DepartmentKey;
    position: { x: number; y: number };
  } | null>(null);
  const lastZoomedPositionRef = useRef<{ x: number; y: number } | null>(null);

  const handleZoomComplete = useCallback(
    (key: DepartmentKey, nodeId: string, position: { x: number; y: number }) => {
      lastZoomedPositionRef.current = position;
      setZoomingInto(null);
      onDepartmentClick(key);
      onNodeSelect(nodeId);
    },
    [onDepartmentClick, onNodeSelect]
  );

  const departmentNodes: Node<DepartmentNodeData & { zoomingOut?: boolean }>[] = useMemo(
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
          health: d.health,
          alertCount: d.alertCount,
          zoomingOut: zoomingInto != null && zoomingInto.nodeId !== d.id,
        },
        draggable: !zoomingInto,
        selected: selectedNodeId === d.id,
      })),
    [selectedNodeId, zoomingInto]
  );

  const managerNodes: Node<ManagerNodeData>[] = useMemo(() => {
    if (!selectedDepartmentKey) return [];
    const managers = getManagersForDepartment(selectedDepartmentKey);
    const centerAt = lastZoomedPositionRef.current;
    const positions = getManagerPositions(managers.length, centerAt);
    return managers.map((m, i) => ({
      id: m.id,
      type: "manager",
      position: positions[i],
      data: { name: m.name, departmentKey: m.departmentKey } satisfies ManagerNodeData,
      draggable: true,
      selected: selectedNodeId === m.id,
    }));
  }, [selectedDepartmentKey, selectedNodeId]);

  const nodes = zoomLevel === "company" ? departmentNodes : managerNodes;
  const [nodesState, setNodes, onNodesChange] = useNodesState(nodes);
  const [edges, , onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setNodes(nodes);
  }, [nodes, setNodes]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (zoomingInto) return;
      if (node.type === "department" && zoomLevel === "company") {
        setZoomingInto({
          nodeId: node.id,
          key: (node.data as DepartmentNodeData).departmentKey,
          position: node.position,
        });
      } else {
        onNodeSelect(node.id);
      }
    },
    [zoomLevel, onNodeSelect, zoomingInto]
  );

  const onPaneClick = useCallback(() => {
    if (!zoomingInto) onNodeSelect(null);
  }, [onNodeSelect, zoomingInto]);

  return (
    <div className="w-full h-full" style={{ backgroundColor: neutral.background }}>
      <ReactFlowProvider>
      <ReactFlow
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
        fitView={!zoomingInto}
        fitViewOptions={{ padding: 0.2, duration: 0 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color={neutral.border} />
        <ZoomRunner zoomingInto={zoomingInto} onComplete={handleZoomComplete} />
        <Controls />
        <MiniMap
          nodeColor={neutral.border}
          maskColor={derived.maskOverlay}
          style={{ backgroundColor: neutral.surface }}
        />
      </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}