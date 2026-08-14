# 10. Playwright Native Visual Catalog Generation

**Status:** Accepted  
**Implemented:** `tests/visual-catalog.spec.ts` and its snapshots

**Context:**
We want a workflow that saves screen captures for both desktop and mobile devices to enable faster iteration and testing for UI changes. We need a tool that supports both a fast visual catalog and visual regression testing, integrating well with local-first development. We evaluated Lost Pixel, but their recent announcement that the team is joining Figma and sunsetting the service makes it a risky dependency.

**Decision:**
We will use Playwright's native visual testing capabilities (`expect(page).toHaveScreenshot`) to capture and verify the UI state. We will define a dedicated `tests/visual-catalog.spec.ts` test that:

1. Seeds realistic data into the local-first database via automated UI interactions.
2. Navigates to all primary dashboards.
3. Captures full-page screenshots across all target viewports (Desktop Chrome, Mobile Chrome, and Mobile Safari).

Snapshots are committed to the repository, allowing developers to review changes locally and catch visual regressions in CI.

**Consequences:**

- **Pros:**
  - Standardizes testing on our existing Playwright setup, keeping dependencies lean.
  - Fully local-first and works offline, in perfect alignment with Inventoria's architecture.
  - No risk of service sunsetting or vendor lock-in.
  - Snapshot updates can be run with a single command: `pnpm playwright test tests/visual-catalog.spec.ts --update-snapshots`.
- **Cons:**
  - committing binary PNG files directly to git can increase the repository size (mitigated by only keeping visual catalog screenshots for key pages).
  - Lacks a hosted PR review dashboard out-of-the-box, though visual comparison tools are built directly into HTML report output.
