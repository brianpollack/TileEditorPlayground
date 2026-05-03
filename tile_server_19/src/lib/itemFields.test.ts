import assert from "node:assert/strict";
import test from "node:test";

import {
  ITEM_BOOLEAN_FIELDS,
  ITEM_EDITABLE_FIELDS,
  ITEM_NUMBER_FIELDS,
  ITEM_TEXT_FIELDS,
  pickItemUpdateFields
} from "./itemFields.ts";

test("editable item field list has no duplicate fields", () => {
  assert.equal(new Set(ITEM_EDITABLE_FIELDS).size, ITEM_EDITABLE_FIELDS.length);
});

test("editable item field list is composed from typed field groups", () => {
  assert.deepEqual(
    ITEM_EDITABLE_FIELDS,
    [
      ...ITEM_NUMBER_FIELDS,
      ...ITEM_TEXT_FIELDS,
      ...ITEM_BOOLEAN_FIELDS
    ]
  );
});

test("pickItemUpdateFields keeps only editable item fields", () => {
  assert.deepEqual(
    pickItemUpdateFields({
      base_value: 12,
      description: "A field that should pass through.",
      id: 42,
      is_container: true,
      unknown_field: "ignored"
    }),
    {
      base_value: 12,
      description: "A field that should pass through.",
      is_container: true
    }
  );
});

test("pickItemUpdateFields preserves explicit null updates", () => {
  assert.deepEqual(
    pickItemUpdateFields({
      durability: null,
      rarity: null
    }),
    {
      durability: null,
      rarity: null
    }
  );
});
