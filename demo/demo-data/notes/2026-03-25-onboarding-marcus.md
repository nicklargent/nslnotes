---
type: "note"
date: "2026-03-25"
title: "Onboarding: Marcus Rivera"
topics:
  - "#onboarding"
  - "@marcus"
  - "@sarah"
---

## Onboarding Plan for @marcus

Start date: 2026-03-24 (Monday)
Buddy: Me
Manager: @sarah

### Week 1 Goals

- [x] Dev environment setup (laptop, accounts, repo access)
- [x] Walk through repo structure and key services
- [ ] First PR — small bug fix or test addition
- [ ] Meet the team (1:1s with each engineer)
- [ ] Read [[doc:api-design-guidelines]] and [[doc:sprint-14-goals]]

### Dev Environment Checklist

- [x] GitHub access + SSH keys
- [x] Slack channels: `#eng`, `#deploys`, `#incidents`
- [x] Local dev running (Docker Compose + hot reload)
- [x] CI/CD overview — how to trigger and monitor builds
- [ ] Staging environment access (waiting on DevOps)
- [ ] Datadog dashboard access

### Architecture Overview (Shared with Marcus)

Our stack:
- **API**: Node.js + Express + TypeScript
- **Database**: PostgreSQL 15 + Prisma ORM
- **Cache**: Redis (being added — see [[doc:caching-strategy]])
- **Frontend**: React 18 + Vite + Tailwind
- **Infra**: AWS ECS + Terraform

Key patterns to know:
1. All API routes go through auth middleware (being refactored, see [[task:migrate-auth-to-oauth2]])
2. Business logic lives in service classes, never in route handlers
3. We use repository pattern for data access
4. Frontend uses React Query for server state

### Notes from Our Walkthrough

Marcus has strong React experience from his last role. Weaker on backend/Node.js — should pair on API work first to build confidence. He asked good questions about our error handling patterns and testing strategy.

He's excited about the user profile redesign — assigning that to him for Sprint 14.
