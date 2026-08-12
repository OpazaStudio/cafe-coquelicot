# Admin

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Admin subsystem handles **1 routes** and touches: auth, payment.

## Routes

- `POST` `/api/admin/product-image` → out: { error } [auth, payment, upload]
  `app/api/admin/product-image/route.ts`

## Related Models

- **admin_users** (4 fields) → [database.md](./database.md)

## Source Files

Read these before implementing or modifying this subsystem:
- `app/api/admin/product-image/route.ts`

---
_Back to [overview.md](./overview.md)_