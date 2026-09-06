<script lang="ts">
  import { untrack } from "svelte";
  import { habitsStore, type HabitLineage } from "../../stores/habits.store";
  import type { ScheduleRule } from "../../habits/habits";
  import Card from "../../ui/Card.svelte";
  import Input from "../../ui/Input.svelte";
  import Select from "../../ui/Select.svelte";
  import Textarea from "../../ui/Textarea.svelte";
  import Button from "../../ui/Button.svelte";
  import Alert from "../../ui/Alert.svelte";
  import HabitDetailHeader from "./HabitDetailHeader.svelte";
  import HabitStatCards from "./HabitStatCards.svelte";
  import HabitHeatmap from "./HabitHeatmap.svelte";
  import HabitExecutionTimeline from "./HabitExecutionTimeline.svelte";
  import ScheduleRuleEditor from "./ScheduleRuleEditor.svelte";

  // Svelte 5 props
  let {
    lineage,
    onBack,
    onUpdateId,
  }: {
    lineage: HabitLineage;
    onBack: () => void;
    onUpdateId?: (id: string) => void;
  } = $props();

  // Form states for editing
  // Snapshot the lineage head once so these initializers don't stay reactive.
  const init = untrack(() => lineage.head);
  let habitName = $state(init.name);
  let habitCategory = $state(init.category);
  // Seed the shared schedule editor from the current blueprint; it parses the
  // rule into its own widgets and writes the edited rule back via bind:value.
  let editScheduleRule = $state<ScheduleRule>(
    (init.schedule_rules as ScheduleRule) ?? {
      type: "daily_multiple",
      count: 1,
    }
  );

  let habitInstrument = $state(init.instrument || "");
  let saveStatus = $state<"idle" | "loading" | "error" | "success">("idle");
  let saveError = $state("");

  // Log Execution state
  let logNote = $state("");
  let logDifficulty = $state<"easy" | "medium" | "hard">("medium");
  let logDuration = $state<number | undefined>(undefined);
  let logStatusValue = $state<"completed" | "exempt">("completed");
  let logTargetId = $state<string>("");
  let logStatus = $state<"idle" | "loading" | "error" | "success">("idle");
  let logError = $state("");

  async function handleSaveBlueprint() {
    if (!habitName.trim()) {
      saveError = "Habit name cannot be empty";
      saveStatus = "error";
      return;
    }

    saveStatus = "loading";
    saveError = "";

    try {
      const newId = await habitsStore.updateHabit(
        lineage.head,
        habitName.trim(),
        habitCategory,
        editScheduleRule,
        habitInstrument
      );
      saveStatus = "success";
      if (onUpdateId) {
        onUpdateId(newId);
      }
      setTimeout(() => {
        saveStatus = "idle";
      }, 2000);
    } catch (e: any) {
      saveStatus = "error";
      saveError = e.message ?? String(e);
    }
  }

  async function handleLogExecution() {
    logStatus = "loading";
    logError = "";
    try {
      const metadata =
        logNote.trim() || logDuration
          ? {
              note: logNote.trim() || undefined,
              difficulty: logDifficulty,
              duration: logDuration || undefined,
            }
          : undefined;

      await habitsStore.logExecution(
        lineage.head.entity,
        habitInstrument.trim(),
        metadata,
        logStatusValue,
        logTargetId || undefined
      );

      logNote = "";
      logDuration = undefined;
      logDifficulty = "medium";
      logTargetId = "";
      logStatusValue = "completed";
      logStatus = "success";

      setTimeout(() => {
        logStatus = "idle";
      }, 2000);
    } catch (e: any) {
      logStatus = "error";
      logError = e.message ?? String(e);
    }
  }

  async function handleArchive() {
    if (
      confirm(
        "Are you sure you want to archive this habit? History will be preserved, but it will be hidden from the active list."
      )
    ) {
      try {
        await habitsStore.archiveHabit(lineage.head.entity);
        onBack();
      } catch (e: any) {
        saveStatus = "error";
        saveError = e.message ?? String(e);
      }
    }
  }
</script>

<div class="habit-detail-view">
  <HabitDetailHeader
    category={lineage.head.category}
    scheduleRules={lineage.head.schedule_rules}
    instrument={lineage.head.instrument}
  />

  <HabitStatCards
    score={lineage.score}
    streak={lineage.streak}
    executions={lineage.executions}
  />

  <HabitHeatmap
    blueprints={lineage.blueprints}
    executions={lineage.executions}
  />

  <div class="view-columns mt-4">
    <!-- Log new execution -->
    <Card>
      <h2>Log Completion</h2>
      <div class="form-group">
        <div class="row-group">
          <!-- Logging Status Selector -->
          <div class="col-group">
            <label for="log-status-val" class="field-label">Log Status</label>
            <Select
              id="log-status-val"
              bind:value={logStatusValue}
              options={[
                { value: "completed", label: "Completed" },
                { value: "exempt", label: "Exempt (Sick/Travel/Rest)" },
              ]}
            />
          </div>

          <!-- Optional Subtarget Selector -->
          {#if lineage.head.schedule_rules?.type === "daily_multiple" && lineage.head.schedule_rules.targets}
            <div class="col-group">
              <label for="log-target" class="field-label">Target Area</label>
              <Select
                id="log-target"
                bind:value={logTargetId}
                options={[
                  { value: "", label: "General / Unspecified" },
                  ...lineage.head.schedule_rules.targets.map((tgt) => ({
                    value: tgt.id,
                    label: tgt.time_hint
                      ? `${tgt.id} (${tgt.time_hint})`
                      : tgt.id,
                  })),
                ]}
              />
            </div>
          {/if}
        </div>

        <label for="log-note" class="field-label">Qualitative Notes</label>
        <Textarea
          id="log-note"
          placeholder="How did it feel? (optional)"
          bind:value={logNote}
        />

        <div class="row-group">
          <div class="col-group">
            <label for="log-difficulty" class="field-label">Difficulty</label>
            <Select
              id="log-difficulty"
              bind:value={logDifficulty}
              options={[
                { value: "easy", label: "Easy" },
                { value: "medium", label: "Medium" },
                { value: "hard", label: "Hard" },
              ]}
            />
          </div>

          <div class="col-group">
            <label for="log-duration" class="field-label">Duration (mins)</label
            >
            <Input
              id="log-duration"
              type="number"
              min="1"
              placeholder="Duration"
              bind:value={logDuration}
            />
          </div>
        </div>

        <Button
          onclick={handleLogExecution}
          disabled={logStatus === "loading"}
          loading={logStatus === "loading"}
        >
          Submit Log
        </Button>

        {#if logStatus === "success"}
          <Alert variant="success">Execution event logged successfully!</Alert>
        {/if}
        {#if logStatus === "error"}
          <Alert variant="error">{logError}</Alert>
        {/if}
      </div>
    </Card>

    <!-- Edit blueprint -->
    <Card>
      <h2>Edit Blueprint</h2>
      <p class="description-small">
        Editing chains a new blueprint version to preserve history.
      </p>
      <div class="form-group">
        <label for="edit-name" class="field-label">Habit Name</label>
        <Input id="edit-name" placeholder="Name" bind:value={habitName} />

        <div class="row-group">
          <div class="col-group">
            <label for="edit-category" class="field-label">Category</label>
            <Select
              id="edit-category"
              bind:value={habitCategory}
              options={[
                { value: "Fitness", label: "Fitness" },
                { value: "Mind", label: "Mind" },
                { value: "Productivity", label: "Productivity" },
                { value: "Health", label: "Health" },
                { value: "Other", label: "Other" },
              ]}
            />
          </div>
        </div>

        <!-- Schedule -->
        <ScheduleRuleEditor bind:value={editScheduleRule} />

        <label for="edit-instrument" class="field-label"
          >Instrument ID (optional)</label
        >
        <Input
          id="edit-instrument"
          placeholder="twin:kettlebell_16kg"
          bind:value={habitInstrument}
        />

        <div class="action-buttons-row">
          <Button
            onclick={handleSaveBlueprint}
            disabled={saveStatus === "loading"}
            loading={saveStatus === "loading"}
          >
            Update Blueprint
          </Button>
          <Button variant="danger" onclick={handleArchive}>Archive Habit</Button
          >
        </div>

        {#if saveStatus === "success"}
          <Alert variant="success"
            >Blueprint updated! Chain updated in background.</Alert
          >
        {/if}
        {#if saveStatus === "error"}
          <Alert variant="error">{saveError}</Alert>
        {/if}
      </div>
    </Card>
  </div>

  <HabitExecutionTimeline executions={lineage.executions} />
</div>

<style>
  .habit-detail-view {
    animation: fadeIn 0.3s ease-out;
  }
  .view-columns {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-m);
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }
  .field-label {
    font-size: var(--step-n2);
    font-weight: 600;
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: calc(var(--space-3xs) * -1);
  }
  .row-group {
    display: flex;
    gap: var(--space-s);
  }
  .col-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    flex: 1;
  }
  .action-buttons-row {
    display: flex;
    gap: var(--space-xs);
    flex-wrap: wrap;
  }
  .description-small {
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
