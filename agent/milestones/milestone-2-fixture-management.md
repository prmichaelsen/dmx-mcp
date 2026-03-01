# Milestone 2: Fixture Management

**Goal**: Implement fixture profiles, patching, and all fixture management MCP tools
**Duration**: ~1 week
**Dependencies**: M1 - Project Foundation & OLA Client
**Status**: Not Started

---

## Overview

This milestone builds the fixture management layer — the first set of real MCP tools. Fixtures are the fundamental abstraction in DMX lighting: named instruments with typed channels at specific DMX addresses. This milestone implements fixture profiles (channel layouts), a FixtureManager for patching/unpatching fixtures to DMX addresses, built-in profiles for common fixtures, and registers all 5 fixture management tools with the MCP server.

---

## Deliverables

### 1. Fixture Profile System
- FixtureProfile model with channel definitions
- Built-in profiles (generic RGB par, generic dimmer)
- Custom profile creation support

### 2. Fixture Manager
- Patch fixture to universe/address
- Unpatch fixture
- List all patched fixtures
- Address collision detection

### 3. MCP Tools (5 tools)
- `patch_fixture` — Add a fixture to a universe at a DMX address
- `unpatch_fixture` — Remove a fixture
- `list_fixtures` — List all patched fixtures
- `list_fixture_profiles` — Browse available profiles
- `create_fixture_profile` — Define a custom profile

### 4. Unit Tests
- Fixture patching logic
- Address collision detection
- Profile validation

---

## Success Criteria

- [ ] Can patch a fixture to a universe and DMX address via MCP tool
- [ ] Can unpatch a fixture via MCP tool
- [ ] Can list all patched fixtures via MCP tool
- [ ] Can browse built-in fixture profiles via MCP tool
- [ ] Can create custom fixture profiles via MCP tool
- [ ] Address collisions are detected and rejected
- [ ] All unit tests pass

---

## Key Files to Create

```
src/
├── fixtures/
│   ├── manager.ts           # FixtureManager class
│   ├── profiles.ts          # Built-in fixture profiles
│   └── tools.ts             # MCP tool definitions
└── types/
    └── index.ts             # (updated with fixture types)
tests/
└── fixtures/
    ├── manager.test.ts
    └── profiles.test.ts
```

---

## Tasks

7. [Task 7: Implement Fixture Profile Models](../tasks/milestone-2-fixture-management/task-7-fixture-profile-models.md) - FixtureProfile, ChannelDefinition
8. [Task 8: Implement Fixture Manager](../tasks/milestone-2-fixture-management/task-8-fixture-manager.md) - Patch, unpatch, list, collision detection
9. [Task 9: Implement create_fixture_profile Tool](../tasks/milestone-2-fixture-management/task-9-create-fixture-profile-tool.md) - Custom profile creation
10. [Task 10: Register Fixture MCP Tools](../tasks/milestone-2-fixture-management/task-10-register-fixture-mcp-tools.md) - Wire all 5 tools to server
11. [Task 11: Add Built-in Fixture Profiles](../tasks/milestone-2-fixture-management/task-11-built-in-fixture-profiles.md) - Generic RGB par, generic dimmer
12. [Task 12: Add Fixture Management Tests](../tasks/milestone-2-fixture-management/task-12-fixture-management-tests.md) - Unit tests

---

## Testing Requirements

- [ ] Fixture patching stores correct universe/address
- [ ] Address collision detection works across fixtures
- [ ] Profile validation rejects invalid channel configs
- [ ] Built-in profiles load correctly
- [ ] MCP tools return correct responses

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| DMX address math errors | High | Medium | Thorough unit tests for address ranges |
| Channel type validation complexity | Low | Low | Start simple, iterate on validation rules |

---

**Next Milestone**: [Milestone 3: Scene Programming](milestone-3-scene-programming.md)
**Blockers**: M1 must be complete
**Notes**: Fixtures are the foundation all other features build on (scenes reference fixtures, cues reference scenes).
