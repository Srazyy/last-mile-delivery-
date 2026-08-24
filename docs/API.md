# REST API Overview

Base URL: `http://localhost:3000/api`

## Authentication
- `POST /auth/register` (customer self-register)
- `POST /auth/login`

Returns JWT token. Send as `Authorization: ******

## Customer APIs
- `POST /orders/price-preview` - computes zones, volumetric weight (`L*B*H/5000`), billable weight, rate card, COD surcharge and final price.
- `POST /orders` - creates order and stores initial immutable tracking event (`Pending`).
- `GET /orders/mine` - list customer orders.
- `GET /orders/:id/tracking` - live status + full timeline.
- `POST /orders/:id/reschedule` - only for failed orders, captures failed-attempt metadata and reassigns available agent.

## Agent/Admin Operational APIs
- `POST /orders/:id/status` - allowed flow: `Picked Up -> In Transit -> Out for Delivery -> Delivered` and `Failed`.
- `POST /orders/:id/auto-assign` (admin only) - nearest available agent based on zone/location.

## Admin APIs
- `GET /admin/dashboard/orders?status=&zoneId=&agentId=`
- `POST /admin/orders/:id/assign`
- `POST /admin/orders/:id/override-status`
- `POST/GET /admin/zones`
- `POST/GET /admin/zone-mappings`
- `POST/GET /admin/rate-cards`
- `POST/GET /admin/cod-surcharges`
- `POST/GET /admin/users`
- `GET /admin/agents`
- `PATCH /admin/agents/:id`

## Tracking History
Every state change inserts a new row in `tracking_history` with:
- `order_id`
- `status`
- `actor_user_id`
- `actor_role`
- `created_at`

Rows are append-only; existing records are never updated.
