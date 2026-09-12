/**
 * A bucket with `get`, `put` and `delete` and **no `list`**, because that is
 * what the route is handed (ADR-0096 §1 and §16).
 *
 * Its `put` honours `onlyIf.etagMatches` the way R2 does: the write is refused
 * by returning `null`, and a refused write leaves nothing behind. That one
 * behaviour is what the whole orphan design rests on, so the client half is
 * driven through the **real route** over this rather than against a second
 * fake — `tests/store-route.spec.ts` is where the route meets a live bucket.
 */
import {
  storeRequest,
  type StoreBucket,
  type StoreObject,
  type StoreObjectBody,
} from "../../../worker/src/store";

export function fakeBucket() {
  const held = new Map<string, { bytes: Uint8Array; etag: string }>();
  let minted = 0;

  const bucket: StoreBucket = {
    async get(key: string): Promise<StoreObjectBody | null> {
      const object = held.get(key);
      if (!object) return null;
      return {
        etag: object.etag,
        arrayBuffer: async () => object.bytes.slice().buffer as ArrayBuffer,
      };
    },
    async put(
      key: string,
      value: ArrayBuffer | ArrayBufferView,
      options?: { onlyIf?: { etagMatches: string } }
    ): Promise<StoreObject | null> {
      const required = options?.onlyIf?.etagMatches;
      if (required !== undefined && held.get(key)?.etag !== required) {
        return null;
      }
      const bytes =
        value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : new Uint8Array(
              value.buffer,
              value.byteOffset,
              value.byteLength
            ).slice();
      const etag = `etag-${++minted}`;
      held.set(key, { bytes, etag });
      return { etag };
    },
    async delete(key: string): Promise<void> {
      held.delete(key);
    },
  };

  return { bucket, held };
}

/** The real route over a bucket, as the `fetch` the client half takes. */
export const routeOver =
  (bucket: StoreBucket) =>
  (request: Request): Promise<Response> =>
    storeRequest(request, bucket, new URL(request.url).searchParams.get("key"));
