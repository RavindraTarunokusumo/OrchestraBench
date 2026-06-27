import type { BenchmarkTask } from "@/lib/domain/types";

export interface BenchmarkAdapter {
  source: string;
  ingest(rawDir: string): Promise<BenchmarkTask[]>;
}
