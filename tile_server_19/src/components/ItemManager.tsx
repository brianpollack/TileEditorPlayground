"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";

import { useStudio } from "../app/StudioContext";
import type { ItemRecord } from "../types";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { FileDropTarget } from "./FileDropTarget";
import { ItemModelPreview } from "./ItemModelPreview";
import { Panel } from "./Panel";
import { SectionEyebrow } from "./SectionEyebrow";
import {
  compactTextInputClass,
  secondaryButtonClass,
  assetListEyebrowClass,
  assetListMetaClass,
  assetListRowClass,
  assetListTitleClass,
  badgePillClass,
  destructiveButtonClass,
  emptyStateCardClass,
  scrollableAssetListClass,
  statusChipClass,
  textInputClass,
  visibilityOptionButtonClass
} from "./uiStyles";

const flatSectionClass = "grid";
const CREATE_ITEM_PATH = "/__items/create";
const DELETE_ITEM_PATH = "/__items/delete";
const ITEM_LOOKUPS_PATH = "/__items/lookups";
const MOVE_ITEM_PATH = "/__items/move";
const UPLOAD_ITEM_IMAGE_PATH = "/__items/upload-image";
const UPLOAD_ITEM_MODEL_PATH = "/__items/upload-model";
const UPLOAD_ITEM_TEXTURE_PATH = "/__items/upload-texture";
const UPDATE_ITEM_PATH = "/__items/update";
const ITEM_CATEGORY_OPTIONS = [
  { itemType: "backpack", label: "Backpack" },
  { itemType: "body_mounted", label: "Body Mounted" },
  { itemType: "food", label: "Food" },
  { itemType: "furniture", label: "Furniture" },
  { itemType: "hat", label: "Hat" },
  { itemType: "inventory_item", label: "Inventory Item" },
  { itemType: "musical", label: "Musical" },
  { itemType: "shield", label: "Shield" },
  { itemType: "weapon", label: "Weapon" }
] as const;

type EditableItemField =
  | "base_value"
  | "description"
  | "durability"
  | "gives_light"
  | "is_consumable"
  | "is_container"
  | "level"
  | "long_description"
  | "mount_point"
  | "quality"
  | "rarity"
  | "storage_capacity"
  | "weapon_grip";

interface ItemFieldLookups {
  mountPoints: string[];
  rarities: string[];
  weaponGrips: string[];
}

function ItemSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-5 pb-[10px]">
      <SectionEyebrow className="theme-text-accent">{children}</SectionEyebrow>
    </div>
  );
}

function formatTextValue(value: string | null | undefined, fallback = "None") {
  return value && value.trim() ? value.trim() : fallback;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'");
}

function sanitizeLookupText(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function formatNumberValue(value: number | null | undefined, fallback = "None") {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : fallback;
}

function formatBooleanValue(value: boolean | null | undefined) {
  if (typeof value !== "boolean") {
    return "None";
  }

  return value ? "Yes" : "No";
}

function formatTimestampValue(value: string | null | undefined) {
  if (!value) {
    return "None";
  }

  const parsedValue = new Date(value);

  if (Number.isNaN(parsedValue.getTime())) {
    return value;
  }

  return parsedValue.toLocaleString();
}

function getAssetUrl(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  if (value.startsWith("data:") || value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  return value.startsWith("/") ? value : `/${value}`;
}

function ItemField({
  label,
  mono = false,
  value
}: {
  label: string;
  mono?: boolean;
  value: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-start">
      <div className="self-center text-[10px] font-extrabold uppercase tracking-[0.12em] theme-text-muted">
        {label}
      </div>
      <div className={mono ? "break-all font-mono text-[13px] leading-5 theme-text-primary" : "text-[13px] leading-5 theme-text-primary"}>
        {value}
      </div>
    </div>
  );
}

export function ItemManager() {
  const { activeItem, activeItemId, items, removeItem, setActiveItemId, upsertItem, vaxServer } = useStudio();
  const [createItemName, setCreateItemName] = useState("");
  const [createItemStatus, setCreateItemStatus] = useState("");
  const [isCreateItemDialogOpen, setCreateItemDialogOpen] = useState(false);
  const [isCreatingItem, setCreatingItem] = useState(false);
  const [isUploadingImage, setUploadingImage] = useState(false);
  const [isReplacingModel, setReplacingModel] = useState(false);
  const [isUploadingModel, setUploadingModel] = useState(false);
  const [isUploadingTexture, setUploadingTexture] = useState(false);
  const [itemQuery, setItemQuery] = useState("");
  const [isItemImageMissing, setItemImageMissing] = useState(false);
  const [itemImageRefreshKey, setItemImageRefreshKey] = useState(0);
  const [itemAssetRefreshKey, setItemAssetRefreshKey] = useState(0);
  const [imageUploadStatus, setImageUploadStatus] = useState("");
  const [modelUploadStatus, setModelUploadStatus] = useState("");
  const [textureUploadStatus, setTextureUploadStatus] = useState("");
  const [hasLoadedModelPreview, setHasLoadedModelPreview] = useState(false);
  const [isDeletingItem, setDeletingItem] = useState(false);
  const [isMovingItem, setMovingItem] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState("");
  const [isDeleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [baseValueDraft, setBaseValueDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [durabilityDraft, setDurabilityDraft] = useState("");
  const [itemFieldErrors, setItemFieldErrors] = useState<Partial<Record<EditableItemField, string>>>({});
  const [itemFieldLookups, setItemFieldLookups] = useState<ItemFieldLookups>({
    mountPoints: [],
    rarities: [],
    weaponGrips: [],
  });
  const [itemLookupStatus, setItemLookupStatus] = useState("");
  const [givesLightDraft, setGivesLightDraft] = useState("");
  const [levelDraft, setLevelDraft] = useState("");
  const [longDescriptionDraft, setLongDescriptionDraft] = useState("");
  const [savingItemField, setSavingItemField] = useState<EditableItemField | null>(null);
  const [storageCapacityDraft, setStorageCapacityDraft] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const modelUploadInputRef = useRef<HTMLInputElement | null>(null);
  const textureUploadInputRef = useRef<HTMLInputElement | null>(null);
  const deferredItemQuery = useDeferredValue(itemQuery.trim().toLowerCase());
  const categoryEntries = Array.from(
    items.reduce((counts, itemRecord) => {
      counts.set(itemRecord.item_type, (counts.get(itemRecord.item_type) ?? 0) + 1);
      return counts;
    }, new Map<string, number>())
  )
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([key, count]) => ({ count, key, label: key }));
  const visibleItems = items.filter((itemRecord) =>
    selectedCategory ? itemRecord.item_type === selectedCategory : false
  );
  const filteredItems = visibleItems.filter((itemRecord) => {
    if (!deferredItemQuery) {
      return true;
    }

    return (
      itemRecord.name.toLowerCase().includes(deferredItemQuery) ||
      itemRecord.slug.toLowerCase().includes(deferredItemQuery) ||
      itemRecord.item_type.toLowerCase().includes(deferredItemQuery) ||
      String(itemRecord.id).includes(deferredItemQuery) ||
      (itemRecord.character ?? "").toLowerCase().includes(deferredItemQuery)
    );
  });
  const itemImageUrl =
    activeItem && vaxServer
      ? `${vaxServer}/items/${activeItem.id}/image.png${itemImageRefreshKey ? `?v=${itemImageRefreshKey}` : ""}`
      : "";
  const hasStoredItemImage = Boolean(activeItem?.thumbnail?.trim() || activeItem?.thumbnail2x?.trim());
  const hasDisplayableItemImage = hasStoredItemImage || itemImageRefreshKey > 0;

  useEffect(() => {
    setItemImageMissing(false);
  }, [itemImageUrl]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(ITEM_LOOKUPS_PATH);
        const responseBody = (await response.json()) as Partial<ItemFieldLookups & { error: string }>;

        if (!response.ok || responseBody.error) {
          throw new Error(responseBody.error ?? "Could not load item field options.");
        }

        if (!cancelled) {
          setItemFieldLookups({
            mountPoints: Array.isArray(responseBody.mountPoints)
              ? Array.from(new Set(responseBody.mountPoints.map((value) => sanitizeLookupText(value)).filter(Boolean)))
              : [],
            rarities: Array.isArray(responseBody.rarities)
              ? Array.from(new Set(responseBody.rarities.map((value) => sanitizeLookupText(value)).filter(Boolean)))
              : [],
            weaponGrips: Array.isArray(responseBody.weaponGrips)
              ? Array.from(new Set(responseBody.weaponGrips.map((value) => sanitizeLookupText(value)).filter(Boolean)))
              : []
          });
          setItemLookupStatus("");
        }
      } catch (error) {
        if (!cancelled) {
          setItemLookupStatus(error instanceof Error ? error.message : "Could not load item field options.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setHasLoadedModelPreview(false);
    setBaseValueDraft(activeItem?.base_value == null ? "" : String(activeItem.base_value));
    setDescriptionDraft(activeItem?.description ?? "");
    setDurabilityDraft(activeItem?.durability == null ? "" : String(activeItem.durability));
    setGivesLightDraft(activeItem?.gives_light == null ? "" : String(activeItem.gives_light));
    setItemImageRefreshKey(0);
    setItemAssetRefreshKey(0);
    setItemFieldErrors({});
    setImageUploadStatus("");
    setLevelDraft(activeItem?.level == null ? "" : String(activeItem.level));
    setLongDescriptionDraft(activeItem?.long_description ?? "");
    setReplacingModel(false);
    setModelUploadStatus("");
    setStorageCapacityDraft(activeItem?.storage_capacity == null ? "" : String(activeItem.storage_capacity));
    setTextureUploadStatus("");
  }, [activeItem?.id]);

  useEffect(() => {
    if (!selectedCategory) {
      return;
    }

    if (activeItem) {
      return;
    }

    if (visibleItems[0]) {
      setActiveItemId(visibleItems[0].id);
    }
  }, [activeItem, selectedCategory, setActiveItemId, visibleItems]);

  function handleDeleteItem() {
    if (!activeItem || isDeletingItem) {
      return;
    }

    const currentIndex = visibleItems.findIndex((itemRecord) => itemRecord.id === activeItem.id);
    const nextItemId =
      visibleItems[currentIndex + 1]?.id ??
      visibleItems[currentIndex - 1]?.id ??
      null;

    setDeletingItem(true);
    setDeleteStatus("");

    void (async () => {
      try {
        const response = await fetch(DELETE_ITEM_PATH, {
          body: JSON.stringify({ id: activeItem.id }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<{ error: string; id: number }>;

        if (!response.ok || responseBody.error) {
          setDeleteStatus(responseBody.error ?? "Could not delete item.");
          return;
        }

        setActiveItemId(nextItemId);
        removeItem(responseBody.id ?? activeItem.id);
        setDeleteConfirmationOpen(false);
      } catch {
        setDeleteStatus("Could not delete item.");
      } finally {
        setDeletingItem(false);
      }
    })();
  }

  function handleMoveItem(itemType: string) {
    if (!activeItem || isMovingItem || activeItem.item_type === itemType) {
      return;
    }

    const currentIndex = filteredItems.findIndex((itemRecord) => itemRecord.id === activeItem.id);
    const nextItemId =
      filteredItems[currentIndex + 1]?.id ??
      filteredItems[currentIndex - 1]?.id ??
      null;

    setMovingItem(true);
    setDeleteStatus("");

    void (async () => {
      try {
        const response = await fetch(MOVE_ITEM_PATH, {
          body: JSON.stringify({ id: activeItem.id, itemType }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<{ error: string; id: number; item_type: string }>;

        if (!response.ok || responseBody.error) {
          setDeleteStatus(responseBody.error ?? "Could not move item.");
          return;
        }

        setActiveItemId(nextItemId);
        upsertItem(responseBody as typeof activeItem);
      } catch {
        setDeleteStatus("Could not move item.");
      } finally {
        setMovingItem(false);
      }
    })();
  }

  function handleCreateItem() {
    if (!selectedCategory || isCreatingItem) {
      return;
    }

    const normalizedName = createItemName.trim();

    if (!normalizedName) {
      setCreateItemStatus("Item name is required.");
      return;
    }

    setCreatingItem(true);
    setCreateItemStatus("");

    void (async () => {
      try {
        const response = await fetch(CREATE_ITEM_PATH, {
          body: JSON.stringify({ itemType: selectedCategory, name: normalizedName }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<{ error: string }> & typeof activeItem;

        if (!response.ok || responseBody.error) {
          setCreateItemStatus(responseBody.error ?? "Could not create item.");
          return;
        }

        upsertItem(responseBody as NonNullable<typeof activeItem>);
        setActiveItemId((responseBody as NonNullable<typeof activeItem>).id);
        setCreateItemDialogOpen(false);
        setCreateItemName("");
        setCreateItemStatus("");
      } catch (error) {
        setCreateItemStatus(error instanceof Error ? error.message : "Could not create item.");
      } finally {
        setCreatingItem(false);
      }
    })();
  }

  function handleModelUpload(file: File | null) {
    if (!activeItem || !file || isUploadingModel) {
      return;
    }

    setUploadingModel(true);
    setModelUploadStatus("");
    setHasLoadedModelPreview(false);

    void (async () => {
      try {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("id", String(activeItem.id));

        const response = await fetch(UPLOAD_ITEM_MODEL_PATH, {
          body: formData,
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<{ error: string }>;

        if (!response.ok || responseBody.error) {
          setModelUploadStatus(responseBody.error ?? "Could not upload model.");
          return;
        }

        setItemAssetRefreshKey(Date.now());
        setReplacingModel(false);
        setModelUploadStatus(`${file.name} uploaded.`);
      } catch (error) {
        setModelUploadStatus(error instanceof Error ? error.message : "Could not upload model.");
      } finally {
        setUploadingModel(false);
      }
    })();
  }

  function handleImageUpload(file: File | null) {
    if (!activeItem || !file || isUploadingImage) {
      return;
    }

    setUploadingImage(true);
    setImageUploadStatus("");

    void (async () => {
      try {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("id", String(activeItem.id));

        const response = await fetch(UPLOAD_ITEM_IMAGE_PATH, {
          body: formData,
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<{ error: string; thumbnail: string | null }>;

        if (!response.ok || responseBody.error) {
          setImageUploadStatus(responseBody.error ?? "Could not upload item image.");
          return;
        }

        upsertItem({
          ...activeItem,
          thumbnail: responseBody.thumbnail ?? activeItem.thumbnail
        });
        setItemImageMissing(false);
        setItemImageRefreshKey(Date.now());
        setImageUploadStatus(`${file.name} uploaded.`);
      } catch (error) {
        setImageUploadStatus(error instanceof Error ? error.message : "Could not upload item image.");
      } finally {
        setUploadingImage(false);
      }
    })();
  }

  function handleTextureUpload(file: File | null) {
    if (!activeItem || !file || isUploadingTexture) {
      return;
    }

    setUploadingTexture(true);
    setTextureUploadStatus("");
    setHasLoadedModelPreview(false);

    void (async () => {
      try {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("id", String(activeItem.id));

        const response = await fetch(UPLOAD_ITEM_TEXTURE_PATH, {
          body: formData,
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<{ error: string }>;

        if (!response.ok || responseBody.error) {
          setTextureUploadStatus(responseBody.error ?? "Could not upload texture.");
          return;
        }

        setItemAssetRefreshKey(Date.now());
        setTextureUploadStatus(`${file.name} uploaded.`);
      } catch (error) {
        setTextureUploadStatus(error instanceof Error ? error.message : "Could not upload texture.");
      } finally {
        setUploadingTexture(false);
      }
    })();
  }

  function updateItemFields(
    primaryField: EditableItemField,
    fields: Partial<Pick<ItemRecord, EditableItemField>>
  ) {
    if (!activeItem || savingItemField) {
      return;
    }

    setSavingItemField(primaryField);
    setItemFieldErrors((currentErrors) => ({
      ...currentErrors,
      [primaryField]: ""
    }));

    void (async () => {
      try {
        const response = await fetch(UPDATE_ITEM_PATH, {
          body: JSON.stringify({
            id: activeItem.id,
            ...fields
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<ItemRecord & { error: string }>;

        if (!response.ok || responseBody.error) {
          throw new Error(responseBody.error ?? "Could not update item.");
        }

        const updatedItem = responseBody as ItemRecord;
        upsertItem(updatedItem);
        setBaseValueDraft(updatedItem.base_value == null ? "" : String(updatedItem.base_value));
        setDescriptionDraft(updatedItem.description ?? "");
        setDurabilityDraft(updatedItem.durability == null ? "" : String(updatedItem.durability));
        setGivesLightDraft(updatedItem.gives_light == null ? "" : String(updatedItem.gives_light));
        setLevelDraft(updatedItem.level == null ? "" : String(updatedItem.level));
        setLongDescriptionDraft(updatedItem.long_description ?? "");
        setStorageCapacityDraft(updatedItem.storage_capacity == null ? "" : String(updatedItem.storage_capacity));
      } catch (error) {
        setItemFieldErrors((currentErrors) => ({
          ...currentErrors,
          [primaryField]: error instanceof Error ? error.message : "Could not update item."
        }));
      } finally {
        setSavingItemField((currentField) => (currentField === primaryField ? null : currentField));
      }
    })();
  }

  function renderItemSelectField(
    field: EditableItemField,
    label: string,
    options: string[],
    value: string | null | undefined
  ) {
    const normalizedOptions = Array.from(new Set(options.map((option) => sanitizeLookupText(option)).filter(Boolean)));
    const normalizedValue = sanitizeLookupText(value);
    const hasLookupOptions = normalizedOptions.length > 0;
    const errorMessage = itemFieldErrors[field];
    const isSaving = savingItemField === field;

    return (
      <ItemField
        label={label}
        value={
          <div className="grid gap-1">
            {hasLookupOptions ? (
              <select
                className={`${compactTextInputClass} min-h-0 w-full min-w-0 py-1 pr-8`}
                disabled={isSaving}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value.trim() || null;

                  if (normalizedValue === (nextValue ?? "")) {
                    return;
                  }

                  updateItemFields(field, { [field]: nextValue } as Partial<Pick<ItemRecord, EditableItemField>>);
                }}
                value={normalizedValue}
              >
                <option value="">None</option>
                {normalizedOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={`${compactTextInputClass} min-h-0 w-full min-w-0 py-1`}
                disabled
                placeholder={itemLookupStatus ? "Lookup unavailable" : "Loading options..."}
                readOnly
                type="text"
                value={normalizedValue}
              />
            )}
            {isSaving ? <div className="text-xs theme-text-muted">Saving...</div> : null}
            {!isSaving && errorMessage ? <div className="text-xs text-[#b42318]">{errorMessage}</div> : null}
            {!isSaving && !errorMessage && !hasLookupOptions && itemLookupStatus ? (
              <div className="text-xs text-[#b42318]">{itemLookupStatus}</div>
            ) : null}
          </div>
        }
      />
    );
  }

  function renderItemBooleanField(field: "is_consumable" | "is_container", label: string, value: boolean | null | undefined) {
    const errorMessage = itemFieldErrors[field];
    const isSaving = savingItemField === field;
    const normalizedValue = value === true;

    return (
      <ItemField
        label={label}
        value={
          <div className="grid gap-1">
            <div className="flex flex-wrap gap-2">
              <button
                className={visibilityOptionButtonClass(normalizedValue)}
                disabled={isSaving}
                onClick={() => {
                  if (normalizedValue) {
                    return;
                  }

                  if (field === "is_container") {
                    const nextStorageCapacity =
                      activeItem?.storage_capacity != null && Number.isFinite(activeItem.storage_capacity)
                        ? activeItem.storage_capacity
                        : 10;
                    setStorageCapacityDraft(String(nextStorageCapacity));
                    updateItemFields(field, {
                      is_container: true,
                      storage_capacity: nextStorageCapacity
                    });
                    return;
                  }

                  updateItemFields(field, { [field]: true } as Partial<Pick<ItemRecord, EditableItemField>>);
                }}
                type="button"
              >
                Yes
              </button>
              <button
                className={visibilityOptionButtonClass(!normalizedValue)}
                disabled={isSaving}
                onClick={() => {
                  if (!normalizedValue && value === false) {
                    return;
                  }

                  if (field === "is_container") {
                    setStorageCapacityDraft("");
                    updateItemFields(field, {
                      is_container: false,
                      storage_capacity: null
                    });
                    return;
                  }

                  updateItemFields(field, { [field]: false } as Partial<Pick<ItemRecord, EditableItemField>>);
                }}
                type="button"
              >
                No
              </button>
            </div>
            {isSaving ? <div className="text-xs theme-text-muted">Saving...</div> : null}
            {!isSaving && errorMessage ? <div className="text-xs text-[#b42318]">{errorMessage}</div> : null}
          </div>
        }
      />
    );
  }

  function renderItemShortNumberField(
    field: "base_value" | "durability" | "gives_light" | "level" | "storage_capacity",
    label: string,
    draft: string,
    onDraftChange: (nextValue: string) => void,
    disabled = false
  ) {
    const errorMessage = itemFieldErrors[field];
    const isSaving = savingItemField === field;
    const isDisabled = disabled || isSaving;

    function commitNumber(nextRawValue: string) {
      if (!activeItem) {
        return;
      }

      const trimmedValue = nextRawValue.trim();
      let normalizedValue: number | null;

      if (!trimmedValue) {
        normalizedValue = field === "storage_capacity" && activeItem.is_container ? 10 : null;
      } else {
        const parsedValue = Number(trimmedValue);

        if (!Number.isFinite(parsedValue)) {
          setItemFieldErrors((currentErrors) => ({
            ...currentErrors,
            [field]: "Enter a valid number."
          }));
          return;
        }

        normalizedValue = parsedValue;
      }

      if (field === "storage_capacity" && activeItem.is_container && normalizedValue == null) {
        normalizedValue = 10;
      }

      const currentValue = activeItem[field];

      if (currentValue === normalizedValue) {
        onDraftChange(normalizedValue == null ? "" : String(normalizedValue));
        return;
      }

      onDraftChange(normalizedValue == null ? "" : String(normalizedValue));
      updateItemFields(field, { [field]: normalizedValue } as Partial<Pick<ItemRecord, EditableItemField>>);
    }

    return (
      <ItemField
        label={label}
        value={
          <div className="grid gap-1">
            <input
              className={`${compactTextInputClass} min-h-9 w-24 min-w-0 py-1`}
              disabled={isDisabled}
              inputMode="numeric"
              onBlur={(event) => {
                commitNumber(event.currentTarget.value);
              }}
              onChange={(event) => {
                onDraftChange(event.currentTarget.value);
                if (errorMessage) {
                  setItemFieldErrors((currentErrors) => ({
                    ...currentErrors,
                    [field]: ""
                  }));
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitNumber(event.currentTarget.value);
                  event.currentTarget.blur();
                }
              }}
              type="number"
              value={draft}
            />
            {isSaving ? <div className="text-xs theme-text-muted">Saving...</div> : null}
            {!isSaving && errorMessage ? <div className="text-xs text-[#b42318]">{errorMessage}</div> : null}
          </div>
        }
      />
    );
  }

  function renderItemTextField(
    field: "description" | "long_description",
    label: string,
    draft: string,
    onDraftChange: (nextValue: string) => void,
    multiline = false
  ) {
    const errorMessage = itemFieldErrors[field];
    const isSaving = savingItemField === field;

    function commitText(nextRawValue: string) {
      if (!activeItem) {
        return;
      }

      const normalizedValue = nextRawValue.trim() || null;

      if (activeItem[field] === normalizedValue) {
        onDraftChange(normalizedValue ?? "");
        return;
      }

      onDraftChange(normalizedValue ?? "");
      updateItemFields(field, { [field]: normalizedValue } as Partial<Pick<ItemRecord, EditableItemField>>);
    }

    const sharedProps = {
      className: `${textInputClass} min-w-0 w-full ${multiline ? "min-h-[7rem]" : "min-h-9 py-1"}`,
      disabled: isSaving,
      onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        commitText(event.currentTarget.value);
      },
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        onDraftChange(event.currentTarget.value);
        if (errorMessage) {
          setItemFieldErrors((currentErrors) => ({
            ...currentErrors,
            [field]: ""
          }));
        }
      },
      value: draft
    };

    return (
      <div className="grid gap-1">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] theme-text-muted">{label}</div>
        {multiline ? (
          <textarea {...sharedProps} />
        ) : (
          <input
            {...sharedProps}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitText(event.currentTarget.value);
                event.currentTarget.blur();
              }
            }}
            type="text"
          />
        )}
        {isSaving ? <div className="text-xs theme-text-muted">Saving...</div> : null}
        {!isSaving && errorMessage ? <div className="text-xs text-[#b42318]">{errorMessage}</div> : null}
      </div>
    );
  }

  return (
    <div className="min-h-0">
      <div className="grid min-h-0 gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="min-h-0 xl:h-[calc(100vh-7rem)]">
          <Panel
            className="h-full"
            description={
              selectedCategory
                ? `Browse items in the ${selectedCategory} category.`
                : "Browse item categories from the database. Creation tools will be added later."
            }
            title="Item Manager"
          >
            {selectedCategory ? (
              <>
                <div className="flex flex-col items-stretch gap-2">
                  <button
                    className={secondaryButtonClass}
                    onClick={() => {
                      setSelectedCategory(null);
                      setItemQuery("");
                    }}
                    type="button"
                  >
                    Back
                  </button>
                  <input
                    autoComplete="off"
                    className={`${textInputClass} min-w-0 w-full`}
                    onChange={(event) => {
                      setItemQuery(event.currentTarget.value);
                    }}
                    placeholder={`Filter ${selectedCategory} items`}
                    value={itemQuery}
                  />
                </div>

                <div className={scrollableAssetListClass}>
                  {filteredItems.map((itemRecord) => (
                    <button
                      className={assetListRowClass(itemRecord.id === activeItemId)}
                      key={itemRecord.id}
                      onClick={() => {
                        setActiveItemId(itemRecord.id);
                      }}
                      type="button"
                    >
                      <div className={assetListMetaClass}>
                        <span className={assetListEyebrowClass}>Item #{itemRecord.id}</span>
                        <strong className={assetListTitleClass}>{itemRecord.name}</strong>
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  className={secondaryButtonClass}
                  onClick={() => {
                    setCreateItemName("");
                    setCreateItemStatus("");
                    setCreateItemDialogOpen(true);
                  }}
                  type="button"
                >
                  Create Item
                </button>

                {!filteredItems.length ? (
                  <div className="text-sm theme-text-muted">No items match that category or filter.</div>
                ) : null}
              </>
            ) : (
              <>
                <div className="grid gap-2">
                  {categoryEntries.map((categoryEntry) => (
                    <button
                      className={assetListRowClass(false, true)}
                      key={categoryEntry.key}
                      onClick={() => {
                        setSelectedCategory(categoryEntry.key);
                        setItemQuery("");

                        if (activeItem?.item_type === categoryEntry.key) {
                          return;
                        }

                        const firstCategoryItem = items.find((itemRecord) => itemRecord.item_type === categoryEntry.key);

                        if (firstCategoryItem) {
                          setActiveItemId(firstCategoryItem.id);
                        }
                      }}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className={assetListMetaClass}>
                          <span className={assetListEyebrowClass}>Category</span>
                          <span className={assetListTitleClass}>{categoryEntry.label}</span>
                        </div>
                        <span className={badgePillClass}>{categoryEntry.count}</span>
                      </div>
                    </button>
                  ))}
                </div>

                {!categoryEntries.length ? (
                  <div className="text-sm theme-text-muted">No item categories are available.</div>
                ) : null}
              </>
            )}
          </Panel>
        </div>

        <Panel
          description={
            activeItem
              ? `Item #${activeItem.id}, ${activeItem.name}, in the ${activeItem.item_type} category`
              : "Select an item from the Item List to inspect its database fields."
          }
          footer={
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className={statusChipClass}>
                  {activeItem ? `Viewing item #${activeItem.id}` : "No item selected"}
                </div>
                {activeItem ? <div className={statusChipClass}>Type: {activeItem.item_type}</div> : null}
                {activeItem?.slug ? <div className={statusChipClass}>Slug: {activeItem.slug}</div> : null}
              </div>
              {activeItem ? (
                <div className="grid justify-items-start gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {ITEM_CATEGORY_OPTIONS.filter((option) => option.itemType !== activeItem.item_type).map((option) => (
                      <button
                        className={`${secondaryButtonClass} inline-flex w-[200px] min-w-[200px] items-center justify-center px-3`}
                        disabled={isMovingItem}
                        key={option.itemType}
                        onClick={() => {
                          handleMoveItem(option.itemType);
                        }}
                        type="button"
                      >
                        <span className="text-sm theme-text-primary">Move To&nbsp;</span>
                        <span className="text-sm font-semibold text-[#800080]">{option.label}</span>
                      </button>
                    ))}
                    <button
                      className={destructiveButtonClass}
                      onClick={() => {
                        setDeleteStatus("");
                        setDeleteConfirmationOpen(true);
                      }}
                      type="button"
                    >
                      Delete item
                    </button>
                  </div>
                  {deleteStatus ? <div className="text-sm theme-text-muted">{deleteStatus}</div> : null}
                </div>
              ) : null}
            </div>
          }
          title="Item Canvas"
        >
          <div className="min-h-[calc(100vh-12rem)] overflow-auto theme-surface-canvas-viewport p-4 md:p-6">
            {activeItem ? (
              <div className="grid gap-5">
                <div className="grid gap-6 xl:grid-cols-[minmax(26rem,calc(33.333%+100px))_minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
                  <div className="grid content-start gap-6">
                    <div className={flatSectionClass}>
                      <ItemSectionTitle>Gameplay</ItemSectionTitle>
                      <div className="grid gap-3">
                        {renderItemShortNumberField("base_value", "Base Value", baseValueDraft, setBaseValueDraft)}
                        {renderItemSelectField("rarity", "Rarity", itemFieldLookups.rarities, activeItem.rarity)}
                        {renderItemSelectField("quality", "Quality", itemFieldLookups.rarities, activeItem.quality)}
                        {renderItemShortNumberField("durability", "Durability", durabilityDraft, setDurabilityDraft)}
                        {renderItemShortNumberField("level", "Level", levelDraft, setLevelDraft)}
                        {renderItemShortNumberField("gives_light", "Gives Light", givesLightDraft, setGivesLightDraft)}
                        {renderItemBooleanField("is_consumable", "Consumable", activeItem.is_consumable)}
                        {renderItemBooleanField("is_container", "Container", activeItem.is_container)}
                        {renderItemShortNumberField(
                          "storage_capacity",
                          "Storage Capacity",
                          storageCapacityDraft,
                          setStorageCapacityDraft,
                          !activeItem.is_container
                        )}
                      </div>

                      <ItemSectionTitle>Placement</ItemSectionTitle>
                      <div className="grid gap-3">
                        <ItemField label="Slug" mono value={activeItem.slug} />
                        {activeItem.character?.trim() ? (
                          <ItemField label="Character" value={activeItem.character.trim()} />
                        ) : null}
                        {renderItemSelectField("mount_point", "Mount Point", itemFieldLookups.mountPoints, activeItem.mount_point)}
                        {renderItemSelectField("weapon_grip", "Weapon Grip", itemFieldLookups.weaponGrips, activeItem.weapon_grip)}
                      </div>
                    </div>

                    <div className={flatSectionClass}>
                      <ItemSectionTitle>Lifecycle</ItemSectionTitle>
                      <div className="grid gap-3">
                        <ItemField label="Inserted" value={formatTimestampValue(activeItem.inserted_at)} />
                        <ItemField label="Updated" value={formatTimestampValue(activeItem.updated_at)} />
                        <ItemField label="On Acquire" mono value={formatTextValue(activeItem.on_acquire)} />
                        <ItemField label="On Drop" mono value={formatTextValue(activeItem.on_drop)} />
                        <ItemField label="On Use" mono value={formatTextValue(activeItem.on_use)} />
                        <ItemField label="On Activate" mono value={formatTextValue(activeItem.on_activate)} />
                        <ItemField label="On Consume" mono value={formatTextValue(activeItem.on_consume)} />
                      </div>
                    </div>
                  </div>

                  <div className="grid content-start gap-6">
                    <div className={flatSectionClass}>
                      <ItemSectionTitle>Assets</ItemSectionTitle>
                      {itemImageUrl && hasDisplayableItemImage && !isItemImageMissing ? (
                        <FileDropTarget
                          activeLabel="Drop Item Image"
                          className="min-h-0 min-w-0 overflow-hidden border-0 bg-transparent p-0"
                          disabled={isUploadingImage}
                          idleLabel={isUploadingImage ? "Uploading image..." : "Drop or Choose Item Image"}
                          onClick={() => {
                            imageUploadInputRef.current?.click();
                          }}
                          onFileSelected={handleImageUpload}
                        >
                          <div className="border theme-border-panel p-3">
                            <img
                              alt={`${activeItem.name} item image`}
                              className="max-h-56 w-full object-contain"
                              onError={(event) => {
                                console.warn(`Missing VAX item image: ${itemImageUrl}`);
                                setItemImageMissing(true);
                              }}
                              src={itemImageUrl}
                            />
                          </div>
                        </FileDropTarget>
                      ) : (
                        <div className="grid gap-3">
                          <FileDropTarget
                            activeLabel="Drop Item Image"
                            disabled={isUploadingImage}
                            idleLabel={isUploadingImage ? "Uploading image..." : "Drop or Choose Item Image"}
                            onClick={() => {
                              imageUploadInputRef.current?.click();
                            }}
                            onFileSelected={handleImageUpload}
                          />
                          {imageUploadStatus ? <div className="text-sm theme-text-muted">{imageUploadStatus}</div> : null}
                          <input
                            accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
                            className="hidden"
                            onChange={(event) => {
                              handleImageUpload(event.currentTarget.files?.[0] ?? null);
                              event.currentTarget.value = "";
                            }}
                            ref={imageUploadInputRef}
                            type="file"
                          />
                        </div>
                      )}
                      {itemImageUrl && hasDisplayableItemImage && !isItemImageMissing ? (
                        <div className="grid gap-3">
                          {imageUploadStatus ? <div className="text-sm theme-text-muted">{imageUploadStatus}</div> : null}
                          <input
                            accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
                            className="hidden"
                            onChange={(event) => {
                              handleImageUpload(event.currentTarget.files?.[0] ?? null);
                              event.currentTarget.value = "";
                            }}
                            ref={imageUploadInputRef}
                            type="file"
                          />
                        </div>
                      ) : null}
                      {!isReplacingModel ? (
                        <ItemModelPreview
                          assetVersion={itemAssetRefreshKey}
                          currentImageUrl={itemImageUrl}
                          fallback={
                            activeItem.model ? (
                              <div className="break-all font-mono text-xs leading-5 theme-text-muted">
                                {activeItem.model}
                              </div>
                            ) : null
                          }
                          itemId={activeItem.id}
                          itemName={activeItem.name}
                          key={`${activeItem.id}:${itemAssetRefreshKey}`}
                          modelPath={activeItem.model}
                          onCaptureSaved={() => {
                            setItemImageMissing(false);
                            setItemImageRefreshKey(Date.now());
                          }}
                          onModelLoadedChange={setHasLoadedModelPreview}
                          onRequestReplaceModel={() => {
                            setReplacingModel(true);
                            setHasLoadedModelPreview(false);
                            setModelUploadStatus("");
                          }}
                          texturePaths={activeItem.textures}
                          vaxServer={vaxServer}
                        />
                      ) : null}
                      {(!activeItem.model || isReplacingModel) && !hasLoadedModelPreview ? (
                        <div className="mt-2 grid gap-3">
                          <FileDropTarget
                            activeLabel="Drop GLB or GLTF Model"
                            disabled={isUploadingModel}
                            idleLabel={isUploadingModel ? "Uploading model..." : "Upload GLB or GLTF Model"}
                            onClick={() => {
                              modelUploadInputRef.current?.click();
                            }}
                            onFileSelected={handleModelUpload}
                          />
                          {modelUploadStatus ? <div className="text-sm theme-text-muted">{modelUploadStatus}</div> : null}
                          <input
                            accept=".glb,.gltf,model/gltf-binary,model/gltf+json,application/json"
                            className="hidden"
                            onChange={(event) => {
                              handleModelUpload(event.currentTarget.files?.[0] ?? null);
                              event.currentTarget.value = "";
                            }}
                            ref={modelUploadInputRef}
                            type="file"
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className={flatSectionClass}>
                      <ItemSectionTitle>Description</ItemSectionTitle>
                      {renderItemTextField("description", "Description", descriptionDraft, setDescriptionDraft)}
                      {renderItemTextField(
                        "long_description",
                        "Long Description",
                        longDescriptionDraft,
                        setLongDescriptionDraft,
                        true
                      )}
                    </div>

                    {!hasLoadedModelPreview ? (
                      <div className={flatSectionClass}>
                        <ItemSectionTitle>Textures</ItemSectionTitle>
                        {activeItem.textures.length ? (
                          <div className="grid gap-2">
                            {activeItem.textures.map((texturePath) => (
                              <div className="px-3 py-2" key={texturePath}>
                                <div className="break-all font-mono text-sm theme-text-primary">{texturePath}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="grid gap-3">
                            <div className={emptyStateCardClass}>No texture paths are stored for this item.</div>
                            <FileDropTarget
                              activeLabel="Drop Texture PNG"
                              disabled={isUploadingTexture}
                              idleLabel={isUploadingTexture ? "Uploading texture..." : "Upload Texture PNG"}
                              onClick={() => {
                                textureUploadInputRef.current?.click();
                              }}
                              onFileSelected={handleTextureUpload}
                            />
                            {textureUploadStatus ? <div className="text-sm theme-text-muted">{textureUploadStatus}</div> : null}
                            <input
                              accept="image/png,.png"
                              className="hidden"
                              onChange={(event) => {
                                handleTextureUpload(event.currentTarget.files?.[0] ?? null);
                                event.currentTarget.value = "";
                              }}
                              ref={textureUploadInputRef}
                              type="file"
                            />
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className={emptyStateCardClass}>No items are available in the database.</div>
            )}
          </div>
        </Panel>

        {isDeleteConfirmationOpen && activeItem ? (
          <ConfirmationDialog
            actions={
              <>
                <button
                  className={secondaryButtonClass}
                  onClick={() => {
                    if (!isDeletingItem) {
                      setDeleteConfirmationOpen(false);
                      setDeleteStatus("");
                    }
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={destructiveButtonClass}
                  disabled={isDeletingItem}
                  onClick={handleDeleteItem}
                  type="button"
                >
                  {isDeletingItem ? "Deleting..." : "Delete item"}
                </button>
              </>
            }
            description={`This will mark item #${activeItem.id}, ${activeItem.name}, as deleted in the database.`}
            title="Delete Item"
          >
            {deleteStatus ? <div className="text-sm theme-text-muted">{deleteStatus}</div> : null}
          </ConfirmationDialog>
        ) : null}
        {isCreateItemDialogOpen && selectedCategory ? (
          <ConfirmationDialog
            actions={
              <>
                <button
                  className={secondaryButtonClass}
                  onClick={() => {
                    if (!isCreatingItem) {
                      setCreateItemDialogOpen(false);
                      setCreateItemStatus("");
                      setCreateItemName("");
                    }
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={secondaryButtonClass}
                  disabled={isCreatingItem}
                  onClick={handleCreateItem}
                  type="button"
                >
                  {isCreatingItem ? "Creating..." : "Create item"}
                </button>
              </>
            }
            description={`Create a new item in the ${selectedCategory} category.`}
            title="Create Item"
          >
            <div className="grid gap-3">
              <input
                autoFocus
                className={`${textInputClass} min-w-0 w-full`}
                onChange={(event) => {
                  setCreateItemName(event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleCreateItem();
                  }
                }}
                placeholder="Item name"
                value={createItemName}
              />
              {createItemStatus ? <div className="text-sm theme-text-muted">{createItemStatus}</div> : null}
            </div>
          </ConfirmationDialog>
        ) : null}
      </div>
    </div>
  );
}
