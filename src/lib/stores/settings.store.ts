import { createQueryStore } from "./datoms.store";
import { derived } from "svelte/store";
import { dbClient } from "../db/db.client";
import { ingestEntity } from "../ingestion/ingest";
import { HLC_ORDER_ASC } from "../db/hlc";

// Reactive raw query store for settings datoms
export const settingsDatomsStore = createQueryStore<{
  attribute: string;
  value: string;
  time: number;
}>(
  `SELECT attribute, value, time FROM datoms WHERE entity = 'settings:global' ORDER BY ${HLC_ORDER_ASC}`
);

export interface SettingsState {
  usda_api_key: string;
  tmdb_api_key: string;
  scraper_proxy_url: string;
}

// Derived store to collapse datoms to latest values and inject fallbacks
export const settingsStore = derived(settingsDatomsStore, ($datoms) => {
  const settings: SettingsState = {
    usda_api_key: (import.meta.env?.VITE_USDA_FDC_API_KEY as string) ?? "",
    tmdb_api_key: (import.meta.env?.VITE_TMDB_API_KEY as string) ?? "",
    scraper_proxy_url:
      (import.meta.env?.VITE_SCRAPER_PROXY_URL as string) ?? "",
  };

  for (const d of $datoms) {
    if (d.attribute === "settings/usda_api_key") {
      settings.usda_api_key = d.value;
    } else if (d.attribute === "settings/tmdb_api_key") {
      settings.tmdb_api_key = d.value;
    } else if (d.attribute === "settings/scraper_proxy_url") {
      settings.scraper_proxy_url = d.value;
    }
  }

  return settings;
});

// Helper to update settings in the ledger
export async function saveSettings(state: SettingsState): Promise<void> {
  const timestamp = Date.now();
  const datoms = ingestEntity(
    {
      entity: "settings:global",
      attributes: {
        "settings/usda_api_key": state.usda_api_key,
        "settings/tmdb_api_key": state.tmdb_api_key,
        "settings/scraper_proxy_url": state.scraper_proxy_url,
      },
    },
    timestamp
  );
  await dbClient.append(datoms);
}
