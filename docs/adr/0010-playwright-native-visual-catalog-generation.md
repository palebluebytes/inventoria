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

**Note (2026-08-17):** two details above have drifted from the code.

Mobile Safari was never added. `playwright.config.ts` defines two projects, Desktop Chrome and Mobile Chrome, and both are Chromium. The Nix environment now ships Chromium alone, so WebKit is not available to add one without changing `flake.nix` first.

Baselines are produced by CI rather than locally. The suite runs on `ubuntu-latest` via `.github/workflows/e2e.yml`, whose fonts and rendering differ from a NixOS workstation, so a baseline captured locally is not the image the runner compares against. To rebaseline, run that workflow by hand with its `update-snapshots` input on and commit the artifact it uploads. The local command above still works for inspecting a diff on your own machine; it just does not produce the committed baseline.
