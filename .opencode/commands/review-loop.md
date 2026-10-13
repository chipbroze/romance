---
description: Automatically runs a feature through the coder-critic review loop.
---

You are an orchestrator. Execute the following automated multi-agent cycle based on the user's request:

1. **Implementation Phase:** 
   - Invoke `@coder` to implement the requested changes.
   - Wait for `@coder` to return its implementation summary and modified files.

2. **Critique Phase:**
   - Take the output/diff from `@coder` and immediately pass it to `@critic` for a rigorous code review.

3. **Refinement Loop:**
   - If `@critic` lists any **BLOCKERS**, send those exact points back to `@coder` to fix. Repeat the critique phase until `@critic` returns **APPROVED**.
   - If `@critic` outputs **APPROVED**, summarize the final success and changes for the user.
