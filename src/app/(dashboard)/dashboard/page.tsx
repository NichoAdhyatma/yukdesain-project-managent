"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart,
  Briefcase,
  Clock,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Users,
  DollarSign,
  Loader2,
  UserCheck,
  RefreshCw,
  GitPullRequest,
} from "lucide-react";

type DashboardMetrics = {
  newOrders: number;
  unassignedProjects: number;
  activeProjects: number;
  completedThisMonth: number;
  revisionProjects: number;
  outstandingPaymentsCount: number;
  outstandingPaymentsTotal: number;
  financial: {
    grossIncome: number;
    freelancerExpenses: number;
    netRevenue: number;
  };
  upcomingDeadlines: Array<{
    id: string;
    deadline: string;
    clientName: string;
    service: { name: string };
  }>;
  projectsByStatus: Array<{ status: string; _count: { id: number } }>;
  assignedDesigners: Array<{ id: string; name: string; count: number }>;
  pendingRevisions: Array<{
    id: string;
    number: number;
    description: string;
    requestedAt: string;
    project: {
      id: string;
      projectNumber: string;
      clientName: string;
      service: { name: string };
    };
  }>;
  recentRevisions: Array<{
    id: string;
    status: string;
    requestedAt: string;
    project: { id: string; projectNumber: string };
  }>;
};

const URGENT_DEADLINE_MS = 2 * 24 * 60 * 60 * 1000;

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; color: string }> = {
  DRAFT: { label: "Draft", variant: "secondary", color: "text-gray-600 bg-gray-50 dark:bg-gray-950 dark:text-gray-400" },
  BELUM_DIKERJAKAN: { label: "Menunggu Brief", variant: "secondary", color: "text-orange-600 bg-orange-50 dark:bg-orange-950 dark:text-orange-400" },
  SEDANG_DIKERJAKAN: { label: "Dikerjakan", variant: "default", color: "text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400" },
  SELESAI: { label: "Selesai", variant: "outline", color: "text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400" },
};


export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const urgentThresholdMs = URGENT_DEADLINE_MS;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchDashboard = async () => {
    try {
      const res = await fetch("/api/dashboard");
      const data = await res.json();
      if (data.metrics) {
        setMetrics(data.metrics);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDashboard();
  }, [fetchDashboard]);

  if (isLoading || !metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Orders",
      value: metrics.newOrders,
      icon: ShoppingCart,
      color: "text-blue-600",
      bgColor: "bg-blue-50 dark:bg-blue-950",
    },
    {
      title: "Unassigned",
      value: metrics.unassignedProjects,
      icon: Briefcase,
      color: "text-orange-600",
      bgColor: "bg-orange-50 dark:bg-orange-950",
    },
    {
      title: "Active Projects",
      value: metrics.activeProjects,
      icon: Clock,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50 dark:bg-yellow-950",
    },
    {
      title: "Completed This Month",
      value: metrics.completedThisMonth,
      icon: CheckCircle,
      color: "text-green-600",
      bgColor: "bg-green-50 dark:bg-green-950",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">
          Selamat datang di YukDesain Studio Portal
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${card.bgColor}`}>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Financial Summary */}
      <Card className="border-primary/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Ringkasan Keuangan Bulan Ini
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950">
                <TrendingUp className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Gross Income</p>
                <p className="text-lg font-semibold text-green-600">
                  {formatCurrency(metrics.financial.grossIncome)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950">
                <Users className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Freelancer Expense</p>
                <p className="text-lg font-semibold text-red-600">
                  {formatCurrency(metrics.financial.freelancerExpenses)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950">
                <DollarSign className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Net Revenue</p>
                <p className="text-lg font-semibold text-primary">
                  {formatCurrency(metrics.financial.netRevenue)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Second Row: Status Breakdown + Assigned Designers */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Projects by Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle className="h-5 w-5 text-muted-foreground" />
              Projects by Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.projectsByStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Tidak ada data</p>
            ) : (
              <div className="space-y-3">
                {metrics.projectsByStatus.map((s) => {
                  const config = statusConfig[s.status] || {
                    label: s.status,
                    variant: "secondary" as const,
                    color: "text-gray-600 bg-gray-50",
                  };
                  const total = metrics.newOrders;
                  const pct = total > 0 ? Math.round((s._count.id / total) * 100) : 0;
                  return (
                    <div key={s.status} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${config.color.replace("bg-", "bg-opacity-100 ")}`} />
                          <span>{config.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{s._count.id}</span>
                          <span className="text-xs text-muted-foreground">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${config.color}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assigned Designers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserCheck className="h-5 w-5 text-muted-foreground" />
              Assigned Designers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.assignedDesigners.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Tidak ada project yang sedang dikerjakan
              </p>
            ) : (
              <div className="space-y-3">
                {metrics.assignedDesigners.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-medium text-primary">
                          {d.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{d.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.count} project aktif
                        </p>
                      </div>
                    </div>
                    <Badge variant="default">{d.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Third Row: Deadlines + Payments + Revisions */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Upcoming Deadlines */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Deadline Mendatang</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            {metrics.upcomingDeadlines.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Tidak ada deadline mendatang
              </p>
            ) : (
              <div className="space-y-3">
                {metrics.upcomingDeadlines.map((item) => {
                  const deadline = new Date(item.deadline);
                  const isUrgent = deadline.getTime() <= urgentThresholdMs;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-sm">{item.clientName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.service.name}
                        </p>
                      </div>
                      <Badge variant={isUrgent ? "destructive" : "secondary"}>
                        {formatDate(item.deadline)}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Client Reviews (Revisions) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-orange-600" />
              Pending Review
            </CardTitle>
            {metrics.pendingRevisions.length > 0 && (
              <Badge variant="destructive">{metrics.pendingRevisions.length}</Badge>
            )}
          </CardHeader>
          <CardContent>
            {metrics.pendingRevisions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Tidak ada review yang pending
              </p>
            ) : (
              <div className="space-y-3">
                {metrics.pendingRevisions.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-3 bg-orange-50/50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="secondary" className="text-xs">
                        #{rev.project.projectNumber}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(rev.requestedAt)}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{rev.project.clientName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {rev.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Outstanding Payments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-destructive" />
              Outstanding Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Total Outstanding</p>
                  <p className="text-lg font-semibold text-destructive">
                    {formatCurrency(metrics.outstandingPaymentsTotal)}
                  </p>
                </div>
                <Badge variant="destructive">
                  {metrics.outstandingPaymentsCount} orders
                </Badge>
              </div>
              {metrics.revisionProjects > 0 && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <GitPullRequest className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Pending Revisions</p>
                  </div>
                  <Badge variant="secondary">{metrics.revisionProjects}</Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
