"use client";

import type * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

/**
 * shadcn's ChartTooltipContent types its props against locally defined
 * ChartValueType/ChartNameType aliases that don't structurally match recharts
 * 3.x's own ValueType/NameType generics (readonly array vs array, formatter
 * variance). Casting through the consuming component's own prop type keeps
 * this resilient to whatever generics BarChart infers from its data.
 */
const renderTooltip = ChartTooltipContent as unknown as React.ComponentProps<typeof ChartTooltip>["content"];

// Value scores can reach into the tens of thousands; compact the axis ticks
// (e.g. 50000 -> "50K") so the labels are not clipped by the axis width.
const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const formatCompact = (value: number) => compactNumber.format(value);

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

const MIN_COST_DOMAIN_MAX = 0.001;

export type WorkflowChartRow = {
  workflow: string;
  resolveRate: number;
  avgValue: number;
  avgCost: number;
  count: number;
};

function buildWorkflowChartConfig(rows: WorkflowChartRow[]): ChartConfig {
  return {
    avgValue: { label: "Avg value score" },
    ...Object.fromEntries(
      rows.map((row, index) => [
        row.workflow,
        { label: row.workflow, color: CHART_COLORS[index % CHART_COLORS.length] },
      ])
    ),
  };
}

function formatCostTick(value: number): string {
  if (value === 0) {
    return "$0";
  }
  if (value < 0.01) {
    return `$${value.toFixed(4)}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatResolveRateTick(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function costDomainMax(rows: WorkflowChartRow[]): number {
  const maxCost = rows.reduce((max, row) => Math.max(max, row.avgCost), 0);
  return Math.max(maxCost * 1.15, MIN_COST_DOMAIN_MAX);
}

function ResolveRateTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: WorkflowChartRow }>;
}) {
  if (!active || !payload?.length || !payload[0].payload) {
    return null;
  }

  const row = payload[0].payload;

  return (
    <div className="border-border/50 bg-background grid min-w-[8rem] gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{row.workflow}</div>
      <div className="grid gap-1">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Resolve rate</span>
          <span className="text-foreground font-mono font-medium tabular-nums">
            {(row.resolveRate * 100).toFixed(0)}%
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Avg cost</span>
          <span className="text-foreground font-mono font-medium tabular-nums">
            {formatCostTick(row.avgCost)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Avg value</span>
          <span className="text-foreground font-mono font-medium tabular-nums">
            {row.avgValue.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Runs</span>
          <span className="text-foreground font-mono font-medium tabular-nums">{row.count}</span>
        </div>
      </div>
    </div>
  );
}

export function WorkflowCharts({ rows }: { rows: WorkflowChartRow[] }): React.JSX.Element | null {
  if (rows.length === 0) {
    return null;
  }

  const chartConfig = buildWorkflowChartConfig(rows);
  const xMax = costDomainMax(rows);
  const leaderboardRows = [...rows].sort((a, b) => b.avgValue - a.avgValue);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Resolve rate vs. cost</CardTitle>
          <CardDescription>
            Average resolve rate against average cost per run. Higher resolve rate and lower cost is
            better — top-left is the frontier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
            <ScatterChart margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                type="number"
                dataKey="avgCost"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={11}
                domain={[0, xMax]}
                tickFormatter={formatCostTick}
              />
              <YAxis
                type="number"
                dataKey="resolveRate"
                tickLine={false}
                axisLine={false}
                width={36}
                fontSize={11}
                domain={[0, 1]}
                tickFormatter={formatResolveRateTick}
              />
              <ChartTooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={(props) => (
                  <ResolveRateTooltip active={props.active} payload={props.payload} />
                )}
              />
              {rows.map((row) => (
                <Scatter
                  key={row.workflow}
                  name={row.workflow}
                  data={[row]}
                  fill={`var(--color-${row.workflow})`}
                >
                  <LabelList dataKey="workflow" position="top" offset={8} fontSize={10} />
                </Scatter>
              ))}
            </ScatterChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Value score leaderboard</CardTitle>
          <CardDescription>Average value score per workflow, higher is better.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
            <BarChart data={leaderboardRows} margin={{ left: 0, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="workflow" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} width={44} fontSize={11} tickFormatter={formatCompact} />
              <ChartTooltip content={renderTooltip} />
              <Bar dataKey="avgValue" radius={4}>
                {leaderboardRows.map((row) => (
                  <Cell key={row.workflow} fill={`var(--color-${row.workflow})`} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
