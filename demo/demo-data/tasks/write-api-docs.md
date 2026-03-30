---
type: "task"
title: "Write API docs for v2 endpoints"
status: "open"
created: "2026-03-26"
due: "2026-04-05"
topics:
  - "#backend-api"
---

Our API docs are 6 months stale. Need to document all v2 endpoints before external partners start integrating.

## Scope

- [ ] `POST /api/v2/sessions` — new auth endpoint
- [ ] `GET /api/v2/users` — cursor pagination
- [ ] `PUT /api/v2/users/:id/profile` — profile updates
- [ ] `POST /api/v2/webhooks` — webhook registration
- [ ] `GET /api/v2/health` — healthcheck with dependency status
- [ ] Authentication section (OAuth2 flows) — depends on [[task:migrate-auth-to-oauth2]]
- [ ] Rate limiting section
- [ ] Error code reference

## Format

Using OpenAPI 3.1 spec + Redoc for rendering. Follow patterns in [[doc:api-design-guidelines]].
