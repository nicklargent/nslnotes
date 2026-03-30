---
type: "doc"
title: "Sprint 14 Goals"
created: "2026-03-27"
pinned: false
topics:
  - "#frontend"
  - "#backend-api"
---

# Sprint 14 Goals

**Dates**: 2026-03-30 to 2026-04-10
**Team**: 3 engineers (@priya, @marcus, me)

## Goal 1: Ship OAuth2 Authentication

Replace the legacy session-based auth with OAuth2. Users should be able to sign in with Google or GitHub accounts. Old sessions continue working during a 2-week migration window.

**Key results:**
- Google and GitHub OAuth2 providers working in staging
- Token refresh with rotation implemented
- Feature flag `oauth2_enabled` controls rollout
- Zero auth-related errors in canary deploy

Owner: @priya + me
Tracking: [[task:migrate-auth-to-oauth2]]

## Goal 2: Fix Data Integrity Issues

Two bugs affecting user trust:
1. Pagination duplicates — [[task:fix-pagination-bug]]
2. Webhook double-delivery (separate ticket)

**Key results:**
- Cursor-based pagination live on all list endpoints
- Idempotency keys on webhook delivery
- No duplicate reports from support for 1 week after deploy

Owner: Me

## Goal 3: Ramp Up @marcus

Get Marcus productive and confident on his first feature (user profile redesign).

**Key results:**
- Marcus ships at least one PR independently
- He can run the full test suite and deploy to staging
- Pair programming 2x/week on frontend patterns

Owner: Me + @sarah
See: [[note:2026-03-25-onboarding-marcus]]

## Capacity & Risks

- Total capacity: ~22 story points
- Committed: 21 points (see planning notes)
- Risk: OAuth2 depends on DevOps configuring staging callback URLs
- Risk: Marcus may need more ramp-up time than estimated
- Buffer: 1 point for unplanned work
