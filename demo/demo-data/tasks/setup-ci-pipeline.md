---
type: "task"
title: "Stabilize CI pipeline"
status: "done"
created: "2026-03-15"
topics:
  - "#devops"
---

CI has been flaky for weeks — tests pass locally but fail in CI due to timing issues and resource constraints.

## Root Causes Found

1. **Parallel test workers exceeding container memory** — reduced from 8 to 4 workers
2. **Database connection pool exhaustion** — tests weren't cleaning up connections
3. **Flaky Playwright tests** — added explicit waits instead of arbitrary timeouts

## Changes Made

- [x] Configure Jest with `--maxWorkers=4` in CI
- [x] Add connection pool cleanup in test teardown
- [x] Replace `sleep()` calls with `waitForSelector()` in E2E tests
- [x] Add retry logic for known-flaky integration tests (max 2 retries)
- [x] Set up Datadog CI visibility for tracking flake rates

## Results

Build success rate: **67% → 96%** over two weeks. Average build time dropped from 14 min to 9 min.
