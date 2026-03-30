---
type: "task"
title: "Refactor UserService for connection pooling"
status: "done"
created: "2026-03-10"
topics:
  - "#tech-debt"
  - "#backend-api"
---

UserService was creating a new DB connection per request instead of using the pool. This caused connection exhaustion under load and ~15% excess memory usage.

## Changes

- [x] Inject shared connection pool via constructor
- [x] Remove per-request `createConnection()` calls
- [x] Add connection health checks
- [x] Update all tests to use pooled connections
- [x] Load test: verify connection count stays under pool max (20)

## Impact

- Memory usage down **15%** in production
- p99 latency on `/api/users` dropped from 450ms to 280ms
- Zero connection timeout errors since deploy (was ~12/day)

Deployed as part of `v2.4.1` — see daily notes from 2026-03-28.
