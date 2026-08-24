# Last-Mile Delivery Tracker

Production-style full-stack tracker with **Customer**, **Delivery Agent**, and **Admin** roles.

## Features
- Customer registration/login (JWT auth)
- Order creation with pickup/drop, package dimensions, actual weight, order/payment type
- Automatic pickup/drop zone detection from zone mappings
- Volumetric weight (`L×B×H/5000`) and billable weight (`max(actual, volumetric)`)
- DB-configured pricing via rate cards + COD surcharges (no hardcoded pricing in order flow)
- Price preview before order confirmation
- Admin management of zones, mappings, rates, COD, users, agents, orders
- Manual assignment + auto assignment to nearest available agent
- Delivery lifecycle: `Picked Up -> In Transit -> Out for Delivery -> Delivered` (+ `Failed`)
- Immutable tracking history on every state change (timestamp + actor)
- Failed delivery rescheduling with customer action + reassignment attempt
- Live tracking endpoint with complete timeline
- Email notification on every status change
- Admin order filtering by status, zone, agent + status override

## Tech Stack
- Backend: Node.js, Express
- DB: SQLite
- Frontend: static HTML/JS demo client (`public/index.html`)
- Auth: JWT + role-based middleware

## Project Structure
- `src/server.js` - app entrypoint
- `src/routes/` - auth/orders/admin REST endpoints
- `src/services/` - pricing, assignment, tracking, notifications
- `src/middleware/auth.js` - RBAC auth middleware
- `db/schema.sql` - schema migration
- `src/migrate.js` - migration runner
- `src/seed.js` - seed admin/config data
- `docs/API.md` - API reference

## Setup
1. Install dependencies
   ```bash
   npm install
   ```
2. Configure environment
   ```bash
   cp .env.example .env
   ```
3. Run migration
   ```bash
   npm run migrate
   ```
4. Seed admin + starter config
   ```bash
   npm run seed
   ```
5. Start app
   ```bash
   npm run dev
   ```
6. Open `http://localhost:3000`

## Default Credentials
After `npm run seed`:
- Email: `admin@lastmile.local`
- Password: `Admin@123`

## Testing
Run targeted unit tests:
```bash
npm test
```

## Notes
- Pricing is calculated from DB-managed `rate_cards` + `cod_surcharges`.
- If SMTP is not configured, emails are logged to console using nodemailer stream transport.
- Tracking history is append-only in `tracking_history`.
