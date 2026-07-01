import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "OrchestraBench",
  description: "Adaptive multi-model orchestration benchmarker for code review tasks"
};

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard#benchmarks", label: "Benchmarks" },
  { href: "/workflows", label: "Workflows" },
  { href: "/api/export", label: "Export JSON" },
  { href: "/api/export/csv", label: "Export CSV" }
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <div className="shell">
            <header className="bg-background/95 supports-backdrop-filter:bg-background/60 sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b px-6 py-3 backdrop-blur">
              <Link href="/" className="text-lg font-semibold tracking-tight">
                OrchestraBench
              </Link>
              <nav aria-label="Primary navigation" className="flex flex-wrap items-center gap-1 text-sm">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md px-3 py-2 font-medium transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
                <ThemeToggle />
              </nav>
            </header>
            {children}
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
