# Architecture — Hamgam

## System boundary

Hamgam is a multi-channel seller operations system. The backend owns master SKU inventory, orders, returns, and channel synchronization. The Next.js frontend is a seller-facing RTL client and falls back to demo data when no API is configured.

## Data flow

```text
Basalam webhook / WooCommerce webhook or polling / Instagram manual entry
                              |
                              v
                     Connector normalization
                              |
                              v
                         Order Hub API
                              |
                              v
              idempotent order + inventory adjustment
                              |
                              v
                     Master inventory in PostgreSQL
                              |
                              v
                   Channel Sync Engine
                              |
              +---------------+----------------+
              v                                v
       Channel listings                   Sync job log
   Basalam / WooCommerce              success or connection error

Seller browser <---- REST API ----> Backend <----> PostgreSQL
       |
       +--> RTL dashboard, KPI cards, filters, Order Hub
```

## Trust boundaries

- The seller browser is untrusted input. API schemas validate request bodies and query parameters at the backend boundary.
- The backend is the authority for seller ownership, order state, inventory changes, and channel credentials.
- PostgreSQL is the persistence boundary. Transactions, idempotency keys, row locking, and optimistic versions protect inventory invariants.
- External channel APIs are untrusted dependencies. Connector retry limits and per-channel error logging prevent one channel failure from hiding the others.

## Security invariants

- Every order and inventory event is scoped to a seller and deduplicated.
- Inventory cannot become negative; concurrent updates are serialized or retried.
- Credentials must be supplied through environment or deployment secret management and must not be committed.
- Authentication and authorization are not complete in this MVP. Before public deployment, replace caller-provided `sellerId` values with authenticated session claims, encrypt channel credentials at rest, and add CSRF protection for cookie-based sessions.

## Operational path

Run backend tests, type checking, and build from `backend/`. Run frontend tests, type checking, and the production build from `frontend/`. CI runs these checks for pushes and pull requests targeting `main`.
