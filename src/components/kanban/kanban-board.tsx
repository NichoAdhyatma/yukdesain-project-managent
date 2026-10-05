"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { GripVertical, Calendar, AlertCircle, UserPlus } from "lucide-react";
import type { ProjectStatus } from "@/types";

export interface ProjectCardData {
  id: string;
  projectNumber: string;
  status: ProjectStatus;
  priority: string;
  deadline: string | null;
  clientName: string;
  agreedPrice: number;
  paidAmount: number;
  paymentStatus: string;
  service: { id: string; code: string; name: string };
  brief: {
    responses: Array<{ questionId: string; answer: string }>;
  } | null;
  assignments: Array<{
    designer: { id: string; name: string; email: string; classification: string };
    freelancerPayout: number | null;
  }>;
  payments?: Array<{
    id: string;
    amount: number;
    date: string;
    method: string | null;
    reference: string | null;
    user: { name: string };
  }>;
}

interface KanbanCardProps {
  project: ProjectCardData;
  onAssign?: (project: ProjectCardData) => void;
}

const priorityConfig: Record<string, { label: string; class: string }> = {
  URGENT: { label: "Urgent", class: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  HIGH: { label: "Tinggi", class: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400" },
  NORMAL: { label: "Normal", class: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
  LOW: { label: "Rendah", class: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

export function KanbanCard({ project, onAssign }: KanbanCardProps) {
  const priority = priorityConfig[project.priority] || priorityConfig.NORMAL;
  const deadline = project.deadline ? new Date(project.deadline) : new Date();
  const isOverdue = deadline < new Date() && project.status !== "SELESAI";
  const assigned = project.assignments?.[0];

  return (
    <Card
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("projectId", project.id);
      }}
      className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
    >
      <CardContent className="p-3 space-y-2">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {project.projectNumber}
            </span>
          </div>
          <Badge variant="outline" className={cn("text-xs", priority.class)}>
            {priority.label}
          </Badge>
        </div>

        {/* Client & Service */}
        <div>
          <p className="font-medium text-sm line-clamp-1">
            {project.clientName}
          </p>
          <p className="text-xs text-muted-foreground">
            {project.service.name}
          </p>
        </div>

        {/* Meta */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span className={cn(isOverdue && "text-red-600 dark:text-red-400 font-medium")}>
              {deadline.toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>
          {isOverdue && <AlertCircle className="h-3 w-3 text-red-600" />}
        </div>

        {/* Designer */}
        {assigned ? (
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[10px]">
                  {assigned.designer.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground truncate">
                {assigned.designer.name}
              </span>
              {assigned.designer.classification === "FREELANCER" && (
                <Badge variant="outline" className="text-[10px] px-1 py-0">FL</Badge>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => onAssign?.(project)} aria-label="Assign designer">
              <UserPlus className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="pt-1 border-t border-border">
            <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => onAssign?.(project)}>
              <UserPlus className="h-3 w-3 mr-1" /> Assign
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface KanbanColumnProps {
  status: ProjectStatus;
  label: string;
  projects: ProjectCardData[];
  onDrop?: (projectId: string, newStatus: ProjectStatus) => void;
  onAssign?: (project: ProjectCardData) => void;
}

export function KanbanColumn({ status, label, projects, onDrop, onAssign }: KanbanColumnProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("bg-accent/50");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("bg-accent/50");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("bg-accent/50");
    const projectId = e.dataTransfer.getData("projectId");
    if (projectId && onDrop) {
      onDrop(projectId, status);
    }
  };

  const columnColors: Partial<Record<ProjectStatus, string>> = {
    DRAFT: "border-t-gray-400",
    BELUM_DIKERJAKAN: "border-t-blue-500",
    SEDANG_DIKERJAKAN: "border-t-orange-500",
    SELESAI: "border-t-green-500",
  };

  return (
    <div
      className={cn(
        "flex flex-col w-72 flex-shrink-0 bg-muted/30 rounded-lg border-t-4",
        columnColors[status]
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="font-semibold text-sm">{label}</h3>
        <Badge variant="secondary" className="text-xs">
          {projects.length}
        </Badge>
      </div>

      {/* Column Content */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px] max-h-[calc(100vh-300px)]">
        {projects.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            No projects
          </div>
        ) : (
          projects.map((project) => (
            <KanbanCard key={project.id} project={project} onAssign={onAssign} />
          ))
        )}
      </div>
    </div>
  );
}

interface KanbanBoardProps {
  projects: ProjectCardData[];
  onProjectMove?: (projectId: string, newStatus: ProjectStatus) => void;
  onAssignDesigner?: (project: ProjectCardData) => void;
}

export function KanbanBoard({ projects, onProjectMove, onAssignDesigner }: KanbanBoardProps) {
  const columns: { status: ProjectStatus; label: string }[] = [
    { status: "DRAFT", label: "Draft" },
    { status: "BELUM_DIKERJAKAN", label: "Belum Dikerjakan" },
    { status: "SEDANG_DIKERJAKAN", label: "Sedang Dikerjakan" },
    { status: "SELESAI", label: "Selesai" },
  ];

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((column) => (
        <KanbanColumn
          key={column.status}
          status={column.status}
          label={column.label}
          projects={projects.filter((p) => p.status === column.status)}
          onDrop={(projectId, newStatus) => onProjectMove?.(projectId, newStatus)}
          onAssign={onAssignDesigner}
        />
      ))}
    </div>
  );
}
