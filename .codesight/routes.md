# Routes

- `POST` `/api/admin/product-image` → out: { error } [auth, payment, upload]
- `POST` `/api/e2e/orders` → out: { error } [auth, db] ✓
- `POST` `/api/stripe/webhook` [auth, payment]
