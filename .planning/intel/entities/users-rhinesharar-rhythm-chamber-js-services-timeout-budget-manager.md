---
path: /Users/rhinesharar/rhythm-chamber/js/services/timeout-budget-manager.js
type: service
updated: 2026-01-22
status: active
---

# timeout-budget-manager.js

## Purpose

Manages hierarchical timeout budgets to prevent resource exhaustion through structured time allocation across nested operations.

## Exports

- **TimeoutBudget**: Class representing allocated timeout budget with abort signal integration
- **BudgetExhaustedError**: Error thrown when timeout budget is exhausted
- **DEFAULT_LIMITS**: Default timeout configuration constants

## Dependencies

None

## Used By

TBD

## Notes

Implements strict hierarchy rules where child budgets cannot exceed parent's remaining time and parent aborts cascade to all children.