import type { ItemRecord } from "../types";

export const ITEM_NUMBER_FIELDS = [
  "base_value",
  "durability",
  "gives_light",
  "level",
  "storage_capacity"
] as const;
export const ITEM_TEXT_FIELDS = [
  "description",
  "long_description",
  "mount_point",
  "quality",
  "rarity",
  "weapon_grip"
] as const;
export const ITEM_BOOLEAN_FIELDS = ["is_consumable", "is_container"] as const;
export const ITEM_EDITABLE_FIELDS = [
  ...ITEM_NUMBER_FIELDS,
  ...ITEM_TEXT_FIELDS,
  ...ITEM_BOOLEAN_FIELDS
] as const;

export type EditableRemoteItemField = (typeof ITEM_EDITABLE_FIELDS)[number];
export type EditableRemoteItemUpdate = Partial<Pick<ItemRecord, EditableRemoteItemField>>;

export function pickItemUpdateFields(source: Readonly<Record<string, unknown>>) {
  const nextFields: EditableRemoteItemUpdate = {};

  for (const field of ITEM_EDITABLE_FIELDS) {
    if (field in source) {
      nextFields[field] = source[field] as never;
    }
  }

  return nextFields;
}
