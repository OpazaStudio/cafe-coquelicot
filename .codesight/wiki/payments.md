# Payments

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Payments subsystem handles **1 routes** and touches: auth, payment.

## Routes

- `POST` `/api/stripe/webhook` [auth, payment]
  `app/api/stripe/webhook/route.ts`

## Source Files

Read these before implementing or modifying this subsystem:
- `app/api/stripe/webhook/route.ts`

---
_Back to [overview.md](./overview.md)_