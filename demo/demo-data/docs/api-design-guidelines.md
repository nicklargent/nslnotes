---
type: "doc"
title: "API Design Guidelines"
created: "2026-01-15"
pinned: true
topics:
  - "#backend-api"
---

# API Design Guidelines

Living document for our REST API conventions. All new endpoints **must** follow these patterns.

## URL Structure

```
GET    /api/v2/{resource}          # List (paginated)
GET    /api/v2/{resource}/:id      # Get single
POST   /api/v2/{resource}          # Create
PUT    /api/v2/{resource}/:id      # Full update
PATCH  /api/v2/{resource}/:id      # Partial update
DELETE /api/v2/{resource}/:id      # Soft delete
```

- Always version the API (`/v2/`)
- Use plural nouns for resources (`/users`, not `/user`)
- Nested resources max 2 levels: `/users/:id/posts`

## Request/Response Format

All responses follow this envelope:

```json
{
  "data": { ... },
  "meta": {
    "cursor": "eyJpZCI6MTIzfQ==",
    "hasMore": true
  },
  "errors": []
}
```

## Authentication

All endpoints require a valid Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

See [[task:migrate-auth-to-oauth2]] for the ongoing migration from session-based auth.

## Error Handling

Use standard HTTP status codes. Always return a machine-readable error code:

| Status | When |
|--------|------|
| 400 | Validation error (include field-level details) |
| 401 | Missing or expired token |
| 403 | Valid token but insufficient permissions |
| 404 | Resource not found |
| 409 | Conflict (duplicate, stale update) |
| 429 | Rate limited |
| 500 | Internal error (log, don't expose details) |

## Pagination

Use **cursor-based pagination** (not offset). See [[task:fix-pagination-bug]] for why we switched.

```
GET /api/v2/users?limit=20&cursor=eyJpZCI6MTIzfQ==
```

## Rate Limiting

- Default: 100 requests/minute per API key
- Burst: 20 requests/second
- Headers: `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Circuit breaker falls back to in-memory counter if Redis is down

## Code Patterns

### Route Handler

Keep route handlers thin — delegate to service classes:

```typescript
router.get("/users/:id", authMiddleware, async (req, res) => {
  const user = await userService.findById(req.params.id);
  if (!user) return res.status(404).json(notFoundError("User"));
  res.json({ data: user });
});
```

### Service Class

Business logic lives here. Services are injected with dependencies:

```typescript
class UserService {
  constructor(
    private db: ConnectionPool,
    private cache: CacheClient,
    private events: EventEmitter
  ) {}

  async findById(id: string): Promise<User | null> {
    const cached = await this.cache.get(`user:${id}`);
    if (cached) return cached;
    const user = await this.db.query("SELECT ...");
    if (user) await this.cache.set(`user:${id}`, user, 300);
    return user;
  }
}
```
