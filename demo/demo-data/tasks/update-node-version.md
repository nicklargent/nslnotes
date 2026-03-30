---
type: "task"
title: "Update Node.js to v22"
status: "cancelled"
created: "2026-03-12"
topics:
  - "#devops"
---

Planned upgrade from Node 20 LTS to Node 22.

## Why Cancelled

After investigation, Node 22 has a breaking change in the `crypto` module that affects our OAuth2 library (`arctic`). The library maintainer hasn't released a compatible version yet.

Revisit when:
- `arctic` releases v3.x with Node 22 support
- Or we complete [[task:migrate-auth-to-oauth2]] and can evaluate alternatives

Keeping Node 20 LTS — it's supported until April 2027.
