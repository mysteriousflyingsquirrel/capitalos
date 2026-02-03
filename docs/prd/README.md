# PRD (Product Requirements Document) – Machine-Readable Contract

This directory contains **machine-readable PRDs** (`.prd.json`) that serve as the **execution contract** for features. Per `.cursorrules`:

- **Hierarchy**: PRD → Spec → Requirements
- **Rule**: Implementation must not invent behavior not described in the PRD; do not change the PRD during implementation.

## Schema (conventions)

Each `.prd.json` file should be valid JSON and include at least:

| Field | Purpose |
|-------|--------|
| `version` | Schema version (e.g. `"1.0"`) |
| `id` | Unique slug (e.g. `funding-health-hyperliquid`) |
| `title` | Human-readable feature name |
| `source` | Reference to `docs/requirements.md` section |
| `specRef` | Reference to `docs/specs/*.spec.md` section |
| `scope.inScope` | What is in scope (array of strings) |
| `scope.outOfScope` | What is explicitly out of scope |
| `acceptanceCriteria` | Testable criteria (array of strings) |

Optional blocks (use as needed per feature):

- **`ui`**: Frames, copy strings, table columns, layout rules
- **`logic`**: Business rules, thresholds, formulas (deterministic)
- **`data`**: Required fields, missing-data behavior, SSOT references
- **`api`**: Endpoints, request/response contracts (when applicable)

## Discovery

- **INDEX.json**: Lists all PRD `id`s and file paths for tooling.
- Naming: `<feature-slug>.prd.json` (e.g. `funding-health-hyperliquid.prd.json`).

## Usage

1. Before implementing a feature, ensure a PRD exists and is approved.
2. During implementation, treat the PRD as immutable; if something is wrong, update requirements/spec/PRD first, then code.
3. Use acceptance criteria for manual or automated checks.
