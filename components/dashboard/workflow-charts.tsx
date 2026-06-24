"use client";

import type * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
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

export type WorkflowChartRow = {
  workflow: string;
  quality: number;
  value: number;
  cost: number;
};

const valueConfig: ChartConfig = {
  value: { label: "Avg value score", color: "var(--chart-1)" }
};

const qualityCostConfig: ChartConfig = {
  quality: { label: "Avg quality score", color: "var(--chart-2)" },
  cost: { label: "Avg cost (USD)", color: "var(--chart-4)" }
};

export function WorkflowCharts({ rows }: { rows: WorkflowChartRow[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Value score leaderboard</CardTitle>
          <CardDescription>Average value score per workflow, higher is better.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={valueConfig} className="aspect-auto h-64 w-full">
            <BarChart data={rows} margin={{ left: 0, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="workflow" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} width={44} fontSize={11} tickFormatter={formatCompact} />
              <ChartTooltip content={renderTooltip} />
              <Bar dataKey="value" fill="var(--color-value)" radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quality vs. cost</CardTitle>
          <CardDescription>Average quality score alongside average cost per run.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={qualityCostConfig} className="aspect-auto h-64 w-full">
            <BarChart data={rows} margin={{ left: 0, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="workflow" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} width={32} fontSize={11} />
              <ChartTooltip content={renderTooltip} />
              <Bar dataKey="quality" fill="var(--color-quality)" radius={4} />
              <Bar dataKey="cost" fill="var(--color-cost)" radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
