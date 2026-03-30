---
type: "note"
date: "2026-03-27"
title: "Sprint 14 Planning"
topics:
  - "#backend-api"
  - "#frontend"
  - "@sarah"
  - "@priya"
---

## Sprint 14 Planning

Sprint dates: **2026-03-30 to 2026-04-10**

Team capacity: 3 engineers x 8 pts = **24 points**
(Minus 2 pts for @marcus ramp-up overhead)

### Committed Stories

| Story | Points | Owner | Topic |
|-------|--------|-------|-------|
| OAuth2 migration | 5 | @priya | #backend-api |
| Pagination cursor fix | 3 | Me | #frontend |
| API docs (v2 endpoints) | 3 | Me | #backend-api |
| CI pipeline stabilization | 2 | @priya | #devops |
| User profile redesign | 5 | @marcus | #frontend |
| Cache layer (Redis) | 3 | Me | #backend-api |

**Total: 21 points** (buffer for unknowns)

### Sprint Goals

See [[doc:sprint-14-goals]] for the full writeup.

1. **Ship OAuth2** — users can log in via Google/GitHub, old session-based auth deprecated
2. **Fix data integrity bugs** — pagination + the duplicate webhook issue
3. **Unblock @marcus** — get him productive on frontend stories

### Risks

- OAuth2 depends on DevOps setting up the new callback URLs in staging
- @marcus hasn't touched our component library yet — may need pairing time
- Redis cache could be a rabbit hole if we hit serialization issues (see [[doc:caching-strategy]])
