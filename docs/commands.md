# Commands

Run commands from the repository or assigned worktree root.

## Setup

```powershell
npm install
Copy-Item .env.example .env.local
```

`OPENROUTER_API_KEY` is optional. Without it, the app uses the deterministic mock provider.

## Development

```powershell
npm run dev
```

Open the Next.js local URL printed by the command, usually `http://localhost:3000`.

## Validation

```powershell
npm run typecheck
npm run lint
npm test
```

Use `npm run typecheck` for TypeScript validation, `npm run lint` for the configured Next/ESLint script, and `npm test` for Vitest. Docs-only changes generally need typecheck and lint only.

## Production Build

```powershell
npm run build
npm start
```

`npm start` expects a successful production build first.

## Local Data

The MVP writes local runtime data to `.data/orchestrabench.json`.

Reset local benchmark data:

```powershell
Remove-Item -LiteralPath .data\orchestrabench.json
```

Export data while the app is running:

```powershell
Invoke-WebRequest http://localhost:3000/api/export -OutFile orchestrabench-export.json
```

## Database Target

`prisma/schema.prisma` defines the PostgreSQL target schema. Runtime code does not yet use Prisma, so Prisma migration/generation commands are not required for the current local MVP flow.
