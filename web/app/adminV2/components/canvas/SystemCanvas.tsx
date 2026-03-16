"use client";

import { useCallback, useMemo, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
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
const MANAGER_OFFSET_X = 80;
const MANAGER_OFFSET_Y = 80;

function getManagerPositions(count: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    positions.push({
      x: MANAGER_OFFSET_X + i * (MANAGER_NODE_WIDTH + MANAGER_GAP),
      y: MANAGER_OFFSET_Y,
    });
  }
  return positions;
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
  const departmentNodes: Node<DepartmentNodeData>[] = useMemo(
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
        } satisfies DepartmentNodeData,
        draggable: true,
        selected: selectedNodeId === d.id,
      })),
    [selectedNodeId]
  );

  const managerNodes: Node<ManagerNodeData>[] = useMemo(() => {
    if (!selectedDepartmentKey) return [];
    const managers = getManagersForDepartment(selectedDepartmentKey);
    const positions = getManagerPositions(managers.length);
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
      if (node.type === "department" && zoomLevel === "company") {
        onDepartmentClick((node.data as DepartmentNodeData).departmentKey);
        onNodeSelect(node.id);
      } else {
        onNodeSelect(node.id);
      }
    },
    [zoomLevel, onDepartmentClick, onNodeSelect]
  );

  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  return (
    <div className="w-full h-full" style={{ backgroundColor: neutral.background }}>
      <ReactFlow
        nodes={nodesState}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color={neutral.border} />
        <Controls />
        <MiniMap
          nodeColor={neutral.border}
          maskColor={derived.maskOverlay}
          style={{ backgroundColor: neutral.surface }}
        />
      </ReactFlow>
    </div>
  );
}