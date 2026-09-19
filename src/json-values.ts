import type { JsonValue } from './types.ts';

/** The two `JsonValue` members that hold other values, and so have to be walked into. */
export type JsonContainer = readonly JsonValue[] | Readonly<Record<string, JsonValue>>;

/**
 * The mutable counterpart of {@link JsonValue}, for a value that came straight out of
 * `JSON.parse` and has not been exposed to anyone yet. Once such a value is handed back to a
 * caller it is a plain {@link JsonValue}, and nothing may mutate it again.
 */
export type MutableJsonValue =
  | string
  | number
  | boolean
  | null
  | MutableJsonValue[]
  | { [key: string]: MutableJsonValue };

/** The mutable counterpart of {@link JsonContainer}. */
export type MutableJsonContainer = MutableJsonValue[] | Record<string, MutableJsonValue>;

export function isJsonContainer(value: MutableJsonValue): value is MutableJsonContainer;
export function isJsonContainer(value: JsonValue): value is JsonContainer;
export function isJsonContainer(value: JsonValue | MutableJsonValue): value is JsonContainer | MutableJsonContainer {
  return value !== null && typeof value === 'object';
}

/** `Infinity` and `NaN` are the values `JSON.stringify` quietly turns into `null`. */
export function isUnwritableNumber(value: JsonValue): value is number {
  return typeof value === 'number' && !Number.isFinite(value);
}

/** The one `JsonValue` member a printer quotes instead of handing to `JSON.stringify`. */
export function isJsonString(value: JsonValue): value is string {
  return typeof value === 'string';
}
