---
type: "task"
title: "Migrate auth to OAuth2"
status: "open"
created: "2026-03-20"
due: "2026-04-02"
topics:
  - "#backend-api"
  - "@priya"
---

Replace our custom session-based auth with OAuth2 (Google + GitHub providers).

## Requirements

- Support Google and GitHub as identity providers
- Implement PKCE flow for SPA clients
- Token refresh with rotation (refresh tokens are single-use)
- Backward-compatible: existing sessions work during migration window
- Session revocation endpoint for admin use

## Implementation Plan

- [x] Research OAuth2 libraries (`arctic` vs `oslo/oauth2`)
- [x] Design token storage schema (Redis + Postgres)
- [x] Extract auth logic into middleware — see [[doc:api-design-guidelines]]
- [ ] Implement Google OAuth2 provider
- [ ] Implement GitHub OAuth2 provider
- [ ] Add refresh token rotation
- [ ] Migration script for existing sessions
- [ ] E2E tests for login flows
- [ ] Update API docs — [[task:write-api-docs]]

## Notes

@priya is leading backend implementation. I'm handling the middleware extraction and integration tests. Target: ship behind feature flag by end of Sprint 14.
