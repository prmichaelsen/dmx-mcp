# Task 21: Implement reorder_cues Tool

**Milestone**: [M4 - Cue Management & Fade Engine](../../milestones/milestone-4-cue-management-fade-engine.md)
**Estimated Time**: 30 minutes
**Dependencies**: Task 18 (CueManager), Task 20 (cue tool patterns)
**Status**: Not Started

---

## Objective

Implement the `reorder_cues` MCP tool that allows an AI agent to reorder cues within a cue list by providing the cue IDs in the desired new order.

---

## Context

Cue ordering is critical in lighting shows -- the sequence of cues determines the flow of lighting changes during a performance. After initially adding cues to a list, the agent may need to rearrange them (e.g., inserting a new look between two existing cues, or moving the finale cue to a different position).

The `reorder_cues` tool takes a cue list ID and an array of cue IDs in the desired order. The `CueManager.reorderCues()` method (implemented in Task 18) handles the validation and reordering logic:
- All existing cue IDs must be present in the input (no accidental drops)
- No duplicate IDs allowed
- No unknown IDs allowed
- The cues array is rearranged to match the provided order

This tool follows the same patterns established by the other cue tools in Task 20 (tool schema, handler function, response format).

---

## Steps

### 1. Add the reorder_cues Tool Schema

Add the tool schema definition to `src/cues/tools.ts`:

```typescript
// Add to src/cues/tools.ts

export const REORDER_CUES_TOOL = {
  name: "reorder_cues",
  description:
    "Reorder cues within a cue list by providing all cue IDs in the desired new order. " +
    "All existing cue IDs must be included — this is a complete reorder, not a partial move. " +
    "Example: to swap cues 'cue-a' and 'cue-b', provide ['cue-b', 'cue-a'].",
  inputSchema: {
    type: "object" as const,
    properties: {
      cue_list_id: {
        type: "string",
        description: "ID of the cue list to reorder",
      },
      cue_ids: {
        type: "array",
        description:
          "Array of cue IDs in the desired new order. " +
          "Must contain exactly the same set of cue IDs currently in the list.",
        items: {
          type: "string",
        },
      },
    },
    required: ["cue_list_id", "cue_ids"],
  },
};
```

### 2. Implement the reorder_cues Handler

Add the handler function to `src/cues/tools.ts`:

```typescript
// Add to src/cues/tools.ts

/**
 * Handle the reorder_cues tool call.
 *
 * Reorders cues within a cue list to match the provided ID sequence.
 * All existing cue IDs must be present in the input array, and no
 * duplicates or unknown IDs are allowed.
 *
 * @param cueListId - ID of the cue list to reorder
 * @param cueIds - Array of cue IDs in the desired new order
 * @param cueManager - CueManager instance
 */
export function handleReorderCues(
  cueListId: string,
  cueIds: string[],
  cueManager: CueManager
): {
  success: boolean;
  cueListId: string;
  newOrder: Array<{ position: number; id: string; name: string }>;
} {
  const updatedCueList = cueManager.reorderCues(cueListId, cueIds);

  return {
    success: true,
    cueListId: updatedCueList.id,
    newOrder: updatedCueList.cues.map((cue, index) => ({
      position: index + 1,
      id: cue.id,
      name: cue.name,
    })),
  };
}
```

### 3. Update the Barrel Export

Update `src/cues/index.ts` to include the new exports:

```typescript
// src/cues/index.ts

export { CueManager } from "./manager.js";
export type { CueListInfo } from "./manager.js";
export { FadeEngine } from "./fade-engine.js";
export {
  CREATE_CUE_LIST_TOOL,
  ADD_CUE_TOOL,
  REMOVE_CUE_TOOL,
  REORDER_CUES_TOOL,
  handleCreateCueList,
  handleAddCue,
  handleRemoveCue,
  handleReorderCues,
} from "./tools.js";
export type { AddCueInput } from "./tools.js";
```

### 4. Verify TypeScript Compilation

```bash
npx tsc --noEmit
```

---

## Verification

- [ ] `REORDER_CUES_TOOL` schema has `cue_list_id` (required string) and `cue_ids` (required string array) properties
- [ ] `REORDER_CUES_TOOL` description explains that all cue IDs must be included
- [ ] `handleReorderCues()` calls `cueManager.reorderCues()` with the cue list ID and cue IDs array
- [ ] `handleReorderCues()` returns success with the new order including position numbers and cue names
- [ ] Handler propagates errors from CueManager (unknown cue list, missing IDs, duplicate IDs, unknown IDs)
- [ ] `src/cues/index.ts` re-exports `REORDER_CUES_TOOL` and `handleReorderCues`
- [ ] `npx tsc --noEmit` passes with no errors

---

## Notes

- The `reorder_cues` tool requires a complete reorder -- all cue IDs must be provided in the new order. This is simpler and safer than a "move cue X to position Y" approach, because it eliminates ambiguity about how other cues shift. The agent can easily construct the full ordered array since it can call `create_cue_list` or inspect the cue list to know the current cue IDs.
- The response includes 1-based `position` numbers alongside each cue's `id` and `name`. This makes it easy for the agent to confirm the reorder was applied correctly and communicate the new order to the user.
- This is intentionally a small, focused task. The validation logic (duplicate detection, missing/unknown ID checks) lives in `CueManager.reorderCues()` (Task 18). This handler is a thin wrapper.
- An alternative design would be a `move_cue` tool that moves a single cue to a specific position. The full reorder approach was chosen because it is more flexible (can rearrange multiple cues at once) and less error-prone (no off-by-one position bugs).

---

**Next Task**: [Task 22: Register Cue MCP Tools](task-22-register-cue-mcp-tools.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
