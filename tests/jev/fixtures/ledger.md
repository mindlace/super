# Superconductor ledger — design: docs/superpowers/design/2026-10-01-1200-shop.md

## Specs
- auth: spec-a.md — status: dispatched (task 3, agentId a1, branch auth, wave 1, tier: dispatched at capable — rationale: greenfield)
- billing: spec-b.md — status: dispatched (task 4, agentId a2, wave 1)
- search: docs/superpowers/specs/search.md — status: pending

## Adjudications
- 2026-10-02 auth [defect-class: missing-declaration]: who validates tokens? → middleware (design §3)
- 2026-10-03 billing [defect-class: schema-drift]: currency column type? → integer cents (design §5)

## Frame-defect tally
- missing-declaration: 2 — instances: 2026-10-02 auth token validation; 2026-10-04 billing hook
- unmodeled-consumer: 1 — instances: 2026-10-05 search index reader
