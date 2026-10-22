"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendingUp, Download, Loader2 } from "lucide-react";

type MonthlyData = {
  month: string;
  monthDate: string;
  grossIncome: number;
  freelancerExpenses: number;
  netRevenue: number;
};

type OutstandingPayment = {
  id: string;
  orderNumber: string;
  clientName: string;
  amount: number;
  status: string;
  deadline: string;
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

export default function FinancialPage() {
  const queryClient = useQueryClient();

  const { data: financialData, isLoading } = useQuery({
    queryKey: ["financial"],
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch("/api/financial");
      const data = await res.json();
      return {
        monthlyData: (data.monthlyData ?? []) as MonthlyData[],
        outstandingPayments: (data.outstandingPayments ?? []) as OutstandingPayment[],
        totalOutstanding: (data.totalOutstanding ?? 0) as number,
      };
    },
  });

  const monthlyData = financialData?.monthlyData ?? [];
  const outstandingPayments = financialData?.outstandingPayments ?? [];
  const totalOutstanding = financialData?.totalOutstanding ?? 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Get current month data
  const totalGrossIncome = monthlyData.reduce((sum, m) => sum + m.grossIncome, 0);
  const totalFreelancerExpenses = monthlyData.reduce((sum, m) => sum + m.freelancerExpenses, 0);
  const totalNetRevenue = monthlyData.reduce((sum, m) => sum + m.netRevenue, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-4 p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Financial</h1>
            <p className="text-muted-foreground">
              Ringkasan keuangan studio
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Gross Income (6 bulan)
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(totalGrossIncome)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Freelancer Expenses (6 bulan)
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(totalFreelancerExpenses)}
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Net Revenue (6 bulan)
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {formatCurrency(totalNetRevenue)}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Monthly Recap */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Monthly Recap</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bulan</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Expense</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyData.map((data) => (
                    <TableRow key={data.monthDate}>
                      <TableCell className="font-medium">{data.month}</TableCell>
                      <TableCell className="text-right text-green-600">
                        {formatCurrency(data.grossIncome)}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {formatCurrency(data.freelancerExpenses)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-primary">
                        {formatCurrency(data.netRevenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Outstanding Payments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Outstanding Payments</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outstandingPayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Tidak ada outstanding payments
                      </TableCell>
                    </TableRow>
                  ) : (
                    outstandingPayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-medium">{payment.orderNumber}</TableCell>
                        <TableCell>{payment.clientName}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(payment.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={payment.status === "UNPAID" ? "destructive" : "secondary"}
                          >
                            {payment.status === "UNPAID" ? "Belum Bayar" : "DP"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {totalOutstanding > 0 && (
                <div className="p-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Total Outstanding</span>
                    <span className="text-lg font-bold text-destructive">
                      {formatCurrency(totalOutstanding)}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
