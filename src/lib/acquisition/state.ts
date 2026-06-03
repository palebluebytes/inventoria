import type { Datom } from "../db/db.client";

export interface EnrichedAcquisition {
  id: string;
  name: string;
  image?: string;
  description?: string;
  brand?: string;
  source_url?: string;
  status: "wanted" | "owned";
  last_updated: number;
}

export function computeAcquisitionState(
  datoms: Datom[]
): EnrichedAcquisition[] {
  const twinsMap = new Map<string, any>();
  const eventsMap = new Map<string, any>();

  for (const datom of datoms) {
    const { entity, attribute, value, time } = datom;

    let parsedValue: any;
    try {
      parsedValue = JSON.parse(value);
      const stringAttributes = [
        "twin/name",
        "twin/image",
        "twin/description",
        "twin/brand",
        "twin/source_url",
      ];
      if (
        stringAttributes.includes(attribute) &&
        typeof parsedValue !== "string"
      ) {
        parsedValue = value;
      }
    } catch {
      parsedValue = value;
    }

    if (attribute.startsWith("twin/")) {
      if (!twinsMap.has(entity)) {
        twinsMap.set(entity, {
          id: entity,
          name: "",
          image: "",
          description: "",
          brand: "",
          source_url: "",
          last_updated: time,
        });
      }
      const twin = twinsMap.get(entity);
      const field = attribute.replace("twin/", "");
      twin[field] = parsedValue;
    } else if (attribute.startsWith("event/")) {
      if (!eventsMap.has(entity)) {
        eventsMap.set(entity, {
          id: entity,
          time,
        });
      }
      const event = eventsMap.get(entity);
      const field = attribute.replace("event/", "");
      event[field] = parsedValue;
    }
  }

  const twins = Array.from(twinsMap.values()) as EnrichedAcquisition[];
  const events = Array.from(eventsMap.values());

  for (const twin of twins) {
    twin.status = "wanted"; // Default status
    const targetEvents = events
      .filter((e) => e.target === twin.id && e.type === "AcquisitionAction")
      .sort((a, b) => a.time - b.time);

    for (const event of targetEvents) {
      if (event.status) {
        twin.status = event.status as "wanted" | "owned";
      }
      twin.last_updated = event.time;
    }
  }

  return twins;
}
