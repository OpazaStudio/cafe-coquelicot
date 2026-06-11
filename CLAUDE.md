@AGENTS.md


# cafe-coquelicot — Project Context

**Stack:** next-app | drizzle | typescript

1 routes | 3 models | 15 env vars | 42 import links

**API areas:** /api/stripe

**High-impact files** (change carefully):
- lib/db/schema.ts (imported by 5 files)
- app/(admin)/admin/(panel)/produits/actions.ts (imported by 4 files)
- components/illustrations.tsx (imported by 4 files)
- lib/db/client.ts (imported by 4 files)
- tests/e2e/helpers.ts (imported by 4 files)

**Required env vars:** CI, NODE_ENV, PGLITE_DATA_DIR

---

## Instructions for Claude Code

### Two-Step Rule (mandatory)
**Step 1 — Orient:** Use wiki articles to find WHERE things live.
**Step 2 — Verify:** Read the actual source files listed in the wiki article BEFORE writing any code.

Wiki articles are structural summaries extracted by AST. They show routes, models, and file locations.
They do NOT show full function logic, middleware internals, or dynamic runtime behavior.
**Never write or modify code based solely on wiki content — always read source files first.**

Read in order at session start:
1. `.codesight/wiki/index.md` — orientation map (~200 tokens)
2. `.codesight/wiki/overview.md` — architecture overview (~500 tokens)
3. Domain article (e.g. `.codesight/wiki/auth.md`) → check "Source Files" section → read those files
4. `.codesight/CODESIGHT.md` — full context map for deep exploration

Routes marked `[inferred]` in wiki articles were detected via regex — verify against source before trusting.
If any source file shows ⚠ in the wiki, re-run `npx codesight --wiki` before proceeding.

Or use the codesight MCP server for on-demand queries:
   - `codesight_get_wiki_article` — read a specific wiki article by name
   - `codesight_get_wiki_index` — get the wiki index
   - `codesight_get_summary` — quick project overview
   - `codesight_get_routes --prefix /api/users` — filtered routes
   - `codesight_get_blast_radius --file src/lib/db.ts` — impact analysis before changes
   - `codesight_get_schema --model users` — specific model details

Only open specific files after consulting codesight context. This saves ~28,578 tokens per conversation.