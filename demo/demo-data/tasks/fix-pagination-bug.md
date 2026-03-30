---
type: "task"
title: "Fix pagination offset bug"
status: "open"
created: "2026-03-28"
due: "2026-03-31"
topics:
  - "#frontend"
  - "#backend-api"
---

Users see duplicate items when scrolling through paginated lists. Root cause: offset-based pagination breaks when new rows are inserted between page fetches.

## Bug Report

- **Reported by**: Customer support (3 tickets this week)
- **Severity**: Medium — data isn't lost, just confusing UX
- **Repro**: Open user list, insert new user via admin panel, scroll to next page

## Fix

Switch from offset-based to **cursor-based pagination**.

- [ ] Add `cursor` index on `created_at` column
- [ ] Update `/api/v2/users` to accept `cursor` param instead of `offset`
- [ ] Update frontend `useInfiniteQuery` hook to pass cursor
- [ ] Add E2E test for pagination with concurrent inserts
- [ ] Deprecate `offset` param in API docs

## References

- Debugging notes in daily log: 2026-03-29
- Slack thread: #eng channel, March 28
