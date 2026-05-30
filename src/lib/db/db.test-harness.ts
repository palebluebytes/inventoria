import { dbClient, type Datom } from "./db.client";
import { fromPartial } from "@total-typescript/shoehorn";

export interface TestState {
  stage: "none" | "writing" | "verifying";
  enabled: boolean;
  entityId: string;
  value: string;
  time: number;
  result: "passed" | "failed" | "idle" | "running";
  error: string;
}

const LOCAL_STORAGE_KEY = "inventoria_test_state";

export function getTestState(): TestState {
  const data = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (data) {
    try {
      return JSON.parse(data);
    } catch {
      // fallback if JSON corrupt
    }
  }
  return {
    stage: "none",
    enabled: false,
    entityId: "",
    value: "",
    time: 0,
    result: "idle",
    error: "",
  };
}

export function saveTestState(state: TestState) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
}

export async function runTestStep(): Promise<TestState> {
  const state = getTestState();
  if (!state.enabled) return state;

  if (state.stage === "writing") {
    // Phase 2: verify survival after page reload
    state.stage = "verifying";
    state.result = "running";
    saveTestState(state);

    try {
      await dbClient.init("/test_inventoria.db");

      // Query the database to find the appended datom
      const rows = await dbClient.query<{
        entity: string;
        attribute: string;
        value: string;
        time: number;
      }>(
        "SELECT entity, attribute, value, time FROM datoms WHERE entity = ? AND attribute = 'test/status'",
        [state.entityId]
      );

      if (rows.length === 0) {
        throw new Error("Datom not found in OPFS database after reload");
      }

      const row = rows[0];
      const parsedValue = JSON.parse(row.value);
      if (parsedValue !== state.value) {
        throw new Error(
          `Value mismatch: expected ${state.value}, got ${parsedValue}`
        );
      }

      state.result = "passed";
      state.stage = "none";
      state.error = "";
    } catch (err: any) {
      state.result = "failed";
      state.stage = "none";
      state.error = err.message || String(err);
    } finally {
      saveTestState(state);
    }
  }
  return getTestState();
}

export async function startTest(): Promise<void> {
  const state = getTestState();
  state.enabled = true;
  state.stage = "writing";
  state.result = "running";
  state.entityId = `test:twin_${Math.floor(Math.random() * 1000000)}`;
  state.value = `val_${Math.floor(Math.random() * 1000000)}`;
  state.time = Date.now();
  state.error = "";
  saveTestState(state);

  try {
    await dbClient.init("/test_inventoria.db");

    // Use shoehorn fromPartial to construct our partial Datom mock type-safely.
    // In a real environment, the ingestion layer maps full objects, but here we construct a partial one for test validation.
    const testDatom = fromPartial<Datom>({
      entity: state.entityId,
      attribute: "test/status",
      value: state.value,
      time: state.time,
    });

    // Make sure we have the required fields filled in or validated by the test datom
    if (
      !testDatom.entity ||
      !testDatom.attribute ||
      testDatom.value === undefined ||
      !testDatom.time
    ) {
      throw new Error("Shoehorn mock datom is missing required fields");
    }

    await dbClient.append([testDatom as Datom]);

    // Force page reload to test OPFS survival across application restart/refreshes
    window.location.reload();
  } catch (err: any) {
    state.result = "failed";
    state.stage = "none";
    state.error = err.message || String(err);
    saveTestState(state);
  }
}
