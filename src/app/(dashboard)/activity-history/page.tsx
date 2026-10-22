"use client";

import { useState, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Loader2, User, Clock, ChevronDown, ChevronUp } from "lucide-react";

type ActivityLog = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actor: { id: string; name: string };
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

const entityTypeOptions = [
  { value: "Project", label: "Project" },
  { value: "Payment", label: "Payment" },
  { value: "Designer", label: "Designer" },
  { value: "Invoice", label: "Invoice" },
  { value: "Revision", label: "Revision" },
];

const actionLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  CREATED: { label: "Created", variant: "default" },
  UPDATED: { label: "Updated", variant: "secondary" },
  STATUS_CHANGED: { label: "Status Changed", variant: "secondary" },
  DESIGNER_ASSIGNED: { label: "Designer Assigned", variant: "default" },
  DESIGNER_UNASSIGNED: { label: "Designer Unassigned", variant: "outline" },
  PAYMENT_RECORDED: { label: "Payment Recorded", variant: "default" },
  BRIEF_SUBMITTED: { label: "Brief Submitted", variant: "default" },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ActionBadge({ action }: { action: string }) {
  const config = actionLabels[action] || { label: action.replace(/_/g, " "), variant: "secondary" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export default function ActivityHistoryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["activity-logs"],
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch("/api/activity-logs");
      const data = await res.json();
      return (data.logs ?? []) as ActivityLog[];
    },
  });

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredLogs = logs.filter((log) => {
    const query = search.toLowerCase();
    const matchesSearch =
      log.action.toLowerCase().includes(query) ||
      log.entityType.toLowerCase().includes(query) ||
      log.entityId.toLowerCase().includes(query) ||
      log.actor.name.toLowerCase().includes(query) ||
      (log.metadata && JSON.stringify(log.metadata).toLowerCase().includes(query));
    const matchesEntity = entityFilter === "all" || log.entityType === entityFilter;
    return matchesSearch && matchesEntity;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col gap-4 p-6 border-b border-border">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Activity History</h1>
          <p className="text-muted-foreground">Riwayat aktivitas sistem</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari aktivitas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={entityFilter}
            options={[
              { value: "all", label: "Semua" },
              ...entityTypeOptions.map(opt => ({ value: opt.value, label: opt.label })),
            ]}
            onValueChange={(v) => v && setEntityFilter(v)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Tipe Entity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua</SelectItem>
              {entityTypeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Aksi</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Tidak ada aktivitas
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => {
                    const isExpanded = expandedRows.has(log.id);
                    const detail = log.metadata?.projectNumber
                      ? `[${log.metadata.projectNumber}]`
                      : log.entityId.slice(0, 8);
                    return (
                      <Fragment key={log.id}>
                        <TableRow className="cursor-pointer" onClick={() => toggleRow(log.id)}>
                          <TableCell>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              {formatDate(log.createdAt)}
                            </div>
                          </TableCell>
                          <TableCell><ActionBadge action={log.action} /></TableCell>
                          <TableCell className="text-sm">{log.entityType}</TableCell>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              {log.actor.name}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-mono text-muted-foreground">{detail}</TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-muted/30 px-6 py-3">
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                {log.previousValue && (
                                  <div>
                                    <p className="text-muted-foreground text-xs mb-1">Previous</p>
                                    <div className="space-y-0.5">
                                      {Object.entries(log.previousValue).map(([k, v]) => (
                                        <p key={k}><span className="font-medium">{k}:</span> {String(v)}</p>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {log.newValue && (
                                  <div>
                                    <p className="text-muted-foreground text-xs mb-1">New</p>
                                    <div className="space-y-0.5">
                                      {Object.entries(log.newValue).map(([k, v]) => (
                                        <p key={k}><span className="font-medium">{k}:</span> {String(v)}</p>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {!log.previousValue && !log.newValue && (
                                  <p className="text-muted-foreground col-span-2">Tidak ada detail tambahan</p>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
