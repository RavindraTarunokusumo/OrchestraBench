import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "OrchestraBench",
  description: "Adaptive multi-model orchestration benchmarker for code review tasks"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <Link className="brand" href="/runs/new">
              OrchestraBench
            </Link>
            <nav className="nav" aria-label="Primary navigation">
              <Link href="/runs/new">New Run</Link>
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/datasets">Datasets</Link>
              <Link href="/api/export">Export JSON</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
