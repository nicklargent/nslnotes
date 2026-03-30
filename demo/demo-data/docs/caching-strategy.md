---
type: "doc"
title: "Caching Strategy: Redis"
created: "2026-03-25"
pinned: false
topics:
  - "#backend-api"
---

# Caching Strategy

## Problem

Our API p99 latency is ~800ms on listing endpoints. Most of this is repeated database queries for data that changes infrequently. We need a caching layer.

## Decision

**Redis** (via `ioredis` client)

Evaluated Redis, Memcached, and application-level caching. Redis wins because:
1. Already in our stack for Sidekiq job queues
2. Pub/sub enables distributed cache invalidation
3. Data structures (sorted sets, hashes) fit our access patterns
4. Lua scripting for atomic cache-aside operations

## Architecture

```
Client → API Server → Cache (Redis) → Database (Postgres)
                ↑                           |
                └── cache miss path ────────┘
```

### Cache Strategy: Cache-Aside with TTL

1. Check Redis for cached value
2. On hit: return cached data (fast path, <5ms)
3. On miss: query Postgres, write to Redis with TTL, return data
4. On write: invalidate relevant cache keys

### Key Naming Convention

```
app:{resource}:{id}           → single entity
app:{resource}:list:{hash}    → paginated list (hash of query params)
app:{resource}:count          → total count for resource
```

### TTL Guidelines

| Data Type | TTL | Reason |
|-----------|-----|--------|
| User profile | 5 min | Changes infrequently |
| User list | 60 sec | New users added periodically |
| Session data | 30 min | Must stay fresh for security |
| Config | 10 min | Rarely changes |

### Invalidation

Two mechanisms:
1. **Write-through**: On entity update, delete cache key synchronously
2. **Pub/sub**: For cross-instance invalidation in multi-server deploys

```typescript
// On user update
await userRepo.update(id, data);
await cache.del(`app:user:${id}`);
await cache.publish("cache:invalidate", `app:user:${id}`);
```

## Rollout Plan

1. Add Redis client to service container
2. Implement cache-aside for `/api/v2/users` (highest traffic)
3. Monitor hit rates and latency via Datadog
4. Extend to other endpoints based on traffic analysis

## Expected Impact

- p99 latency: 800ms → <200ms (for cache hits)
- Database load: ~40% reduction on read queries
- Cache hit rate target: >85% after warm-up
