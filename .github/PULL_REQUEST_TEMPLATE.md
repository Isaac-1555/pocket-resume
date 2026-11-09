---
name: Pull request
about: Submit a change to PocketResume
title: ''
labels: ''
assignees: ''
---

## Summary

<!-- One or two sentences describing what this PR does. -->

## Related issue

<!-- Link the issue this fixes: "Fixes #123" or "Refs #123". -->

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing behavior to change)
- [ ] Documentation update
- [ ] Refactor / cleanup
- [ ] Resume engine / PDF layout change

## How to test

<!-- Step-by-step reproduction / verification steps. -->

1. Load unpacked from this branch
2. Navigate to ...
3. Click ...
4. Observe ...

## Checklist

- [ ] I have read [CONTRIBUTING.md](../CONTRIBUTING.md)
- [ ] My changes follow the existing code style (4-space indent, no new comments unless required)
- [ ] I have not committed any secrets or `.env` files
- [ ] I have not committed build artifacts (`cloud-sync.js`, `cloud-sync-core.js`, `convex/_generated/`)
- [ ] I have updated [AGENTS.md](../AGENTS.md) if I changed the architecture, schema, or file map
- [ ] I have updated [README.md](../README.md) if I changed user-facing behavior
- [ ] I have updated [CHANGELOG.md](../CHANGELOG.md) and the popup "What's New" announcement if I bumped the version
- [ ] For engine changes: `npm run test:align` passes
- [ ] For PDF layout changes: `npm run test:render` passes
