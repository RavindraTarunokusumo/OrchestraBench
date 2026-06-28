import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCostUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

export function formatScore(value: number): string {
  return value.toFixed(1);
}
