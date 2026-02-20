# Clanker Orchestra — Capitalos

This document defines how the clanker pipeline runs:
the order, what each step must produce, retry limits, and rules.

------------------------------------------------------------
## 1. Pipeline Order
------------------------------------------------------------

```
PM → Architect → Backend → Frontend → Tester → PM wrap-up → GitHub
                                        ↑                |
                                        └── on FAIL ─────┘
```

1. **PM** — writes feature spec with acceptance criteria
2. **Architect** — produces data model, API contracts, migration plan
3. **Backend** — implements services, hooks, contexts, serverless functions, exported types
4. **Frontend** — implements pages, components, forms using Backend's types/services
5. **Tester** — validates against spec; produces PASS/FAIL report
6. **PM wrap-up** — confirms acceptance criteria met, writes summary
7. **GitHub** — creates branch, PR description, review checklist, commit message

------------------------------------------------------------
## 2. Handoff Contracts
------------------------------------------------------------

Each step must produce its artifacts before the next step begins.

| Step | Produces |
|---|---|
| **PM** | Feature spec in `docs/specs/` with title, description, acceptance criteria (checkboxes) |
| **Architect** | Updated specs, API contract (function signatures, request/response shapes), Firestore schema implications |
| **Backend** | Implemented services in `src/services/`, contexts in `src/contexts/`, hooks in `src/hooks/`, API functions in `api/`, exported types — all passing lint |
| **Frontend** | Implemented pages in `src/pages/`, components in `src/components/`, consuming Backend types — all passing lint, loading/error states handled |
| **Tester** | Structured test report (PASS / FAIL / PARTIAL) with failures, regressions, missing requirements |
| **PM wrap-up** | Updated spec with acceptance criteria checked off, summary of what shipped |
| **GitHub** | Branch, PR description, review checklist, commit messages |

------------------------------------------------------------
## 3. Retry Policy
------------------------------------------------------------

- On Tester **FAIL**: route failures back to Backend or Frontend (depending on failure type).
- Maximum **2 fix cycles** before escalating to PM for scope review.
- On 3rd failure: PM must re-evaluate spec scope or split the feature.

------------------------------------------------------------
## 4. Pipeline Rules
------------------------------------------------------------

- **No direct commits to main** — all work goes through feature branches and PRs.
- **File-driven truth** — specs, architecture, and data model docs are the source of truth, not conversation history.
- **No unrelated refactors** — each pipeline run addresses one feature/fix only; unrelated improvements get their own spec.
- **No skipping steps** — even for "small" changes, the pipeline order applies (steps can be lightweight but not skipped).
- **One concern per pipeline run** — if scope grows, PM flags it and splits.
