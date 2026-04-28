"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";

import { useStudio } from "../app/StudioContext";
import type { PersonalityRecord } from "../types";
import { actionButtonClass } from "./buttonStyles";
import { CheckerboardFrame } from "./CheckerboardFrame";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { FileDropTarget } from "./FileDropTarget";
import { Panel } from "./Panel";
import { SectionEyebrow } from "./SectionEyebrow";
import {
  assetListEyebrowClass,
  assetListMetaClass,
  assetListRowClass,
  assetListTitleClass,
  compactTextInputClass,
  emptyStateCardClass,
  readOnlyInputClass,
  scrollableAssetListClass,
  secondaryButtonClass,
  statusChipClass,
  textInputClass,
  visibilityOptionButtonClass
} from "./uiStyles";

const CREATE_PERSONALITY_PATH = "/__personalities/create";
const PREPARE_RANDOM_PERSONALITY_PROMPT_PATH = "/__personalities/randomize-prompt";
const RANDOMIZE_PERSONALITY_PATH = "/__personalities/randomize";
const UPLOAD_PERSONALITY_PROFILE_PATH = "/__personalities/upload-profile";
const UPDATE_PERSONALITY_PATH = "/__personalities/update";

const PERSONALITY_SHORT_TEXT_FIELDS = [
  "name",
  "voice_id",
  "chat_provider",
  "chat_model",
  "role",
  "titles",
  "temperament",
  "emotional_range",
  "speech_pattern",
  "accent"
] as const;

const PERSONALITY_TEXTAREA_FIELDS = [
  "summary",
  "goals",
  "backstory",
  "hidden_desires",
  "fears",
  "family_description",
  "areas_of_expertise",
  "specialties",
  "secrets_you_know",
  "things_you_can_share",
  "smalltalk_topics_enjoyed",
  "other_world_knowledge",
  "physical_description",
  "distinguishing_feature",
  "speech_style",
  "mannerisms",
  "clothing_style"
] as const;

const PERSONALITY_REQUIRED_NUMBER_FIELDS = [
  "base_hp",
  "gold",
  "reputation",
  "aggression",
  "altruism",
  "honesty",
  "courage",
  "impulsiveness",
  "optimism",
  "sociability",
  "loyalty",
  "goodness"
] as const;

const PERSONALITY_OPTIONAL_NUMBER_FIELDS = ["age"] as const;
const PERSONALITY_RANGE_FIELDS = [
  { field: "reputation", label: "Reputation", low: "Hated", high: "Loved" },
  { field: "aggression", label: "Aggression", low: "Passive", high: "Violent" },
  { field: "altruism", label: "Altruism", low: "Selfish", high: "Selfless" },
  { field: "honesty", label: "Honesty", low: "Deceptive", high: "Transparent" },
  { field: "courage", label: "Courage", low: "Cowardly", high: "Fearless" },
  { field: "impulsiveness", label: "Impulsiveness", low: "Calculating", high: "Reckless" },
  { field: "optimism", label: "Optimism", low: "Cynical", high: "Hopeful" },
  { field: "sociability", label: "Sociability", low: "Reserved", high: "Charismatic" },
  { field: "loyalty", label: "Loyalty", low: "Disloyal", high: "Very loyal" },
  { field: "goodness", label: "Goodness", low: "Pure evil", high: "Lawful good" }
] as const;

type PersonalityShortTextField = (typeof PERSONALITY_SHORT_TEXT_FIELDS)[number];
type PersonalityTextareaField = (typeof PERSONALITY_TEXTAREA_FIELDS)[number];
type PersonalityRequiredNumberField = (typeof PERSONALITY_REQUIRED_NUMBER_FIELDS)[number];
type PersonalityOptionalNumberField = (typeof PERSONALITY_OPTIONAL_NUMBER_FIELDS)[number];
type EditablePersonalityField =
  | PersonalityShortTextField
  | PersonalityTextareaField
  | PersonalityRequiredNumberField
  | PersonalityOptionalNumberField
  | "gender";

type PersonalityDraftState = Record<EditablePersonalityField, string>;

function PersonalitySectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-5 pb-[10px]">
      <SectionEyebrow className="theme-text-accent">{children}</SectionEyebrow>
    </div>
  );
}

function PersonalityField({
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
      <div
        className={
          mono
            ? "break-all font-mono text-[13px] leading-5 theme-text-primary"
            : "text-[13px] leading-5 theme-text-primary"
        }
      >
        {value}
      </div>
    </div>
  );
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

function createPersonalityDrafts(
  personality: PersonalityRecord | null
): PersonalityDraftState {
  return {
    accent: personality?.accent ?? "",
    age: personality?.age == null ? "" : String(personality.age),
    aggression: personality ? String(personality.aggression) : "",
    altruism: personality ? String(personality.altruism) : "",
    areas_of_expertise: personality?.areas_of_expertise ?? "",
    backstory: personality?.backstory ?? "",
    base_hp: personality ? String(personality.base_hp) : "",
    chat_model: personality?.chat_model ?? "",
    chat_provider: personality?.chat_provider ?? "",
    clothing_style: personality?.clothing_style ?? "",
    courage: personality ? String(personality.courage) : "",
    distinguishing_feature: personality?.distinguishing_feature ?? "",
    emotional_range: personality?.emotional_range ?? "",
    family_description: personality?.family_description ?? "",
    fears: personality?.fears ?? "",
    gender: personality?.gender ?? "NB",
    goals: personality?.goals ?? "",
    gold: personality ? String(personality.gold) : "",
    goodness: personality ? String(personality.goodness) : "",
    hidden_desires: personality?.hidden_desires ?? "",
    honesty: personality ? String(personality.honesty) : "",
    impulsiveness: personality ? String(personality.impulsiveness) : "",
    loyalty: personality ? String(personality.loyalty) : "",
    mannerisms: personality?.mannerisms ?? "",
    name: personality?.name ?? "",
    other_world_knowledge: personality?.other_world_knowledge ?? "",
    optimism: personality ? String(personality.optimism) : "",
    physical_description: personality?.physical_description ?? "",
    reputation: personality ? String(personality.reputation) : "",
    role: personality?.role ?? "",
    secrets_you_know: personality?.secrets_you_know ?? "",
    smalltalk_topics_enjoyed: personality?.smalltalk_topics_enjoyed ?? "",
    sociability: personality ? String(personality.sociability) : "",
    specialties: personality?.specialties ?? "",
    speech_pattern: personality?.speech_pattern ?? "",
    speech_style: personality?.speech_style ?? "",
    summary: personality?.summary ?? "",
    temperament: personality?.temperament ?? "",
    things_you_can_share: personality?.things_you_can_share ?? "",
    titles: personality?.titles ?? "",
    voice_id: personality?.voice_id ?? ""
  };
}

export function PersonalityManager() {
  const {
    activePersonality,
    activePersonalitySlug,
    personalities,
    setActivePersonalitySlug,
    upsertPersonality
  } = useStudio();
  const [createPersonalityName, setCreatePersonalityName] = useState("");
  const [createPersonalityStatus, setCreatePersonalityStatus] = useState("");
  const [isCreatePersonalityDialogOpen, setCreatePersonalityDialogOpen] = useState(false);
  const [isCreatingPersonality, setCreatingPersonality] = useState(false);
  const [isPreparingRandomizePrompt, setPreparingRandomizePrompt] = useState(false);
  const [isRandomizeDialogOpen, setRandomizeDialogOpen] = useState(false);
  const [isSubmittingRandomizePrompt, setSubmittingRandomizePrompt] = useState(false);
  const [isUploadingProfileImage, setUploadingProfileImage] = useState(false);
  const [randomizeModelOptions, setRandomizeModelOptions] = useState<string[]>([]);
  const [profileImageStatus, setProfileImageStatus] = useState("");
  const [selectedRandomizeModel, setSelectedRandomizeModel] = useState("");
  const [personalityQuery, setPersonalityQuery] = useState("");
  const [randomizePromptDraft, setRandomizePromptDraft] = useState("");
  const [randomizeStatus, setRandomizeStatus] = useState("");
  const [drafts, setDrafts] = useState<PersonalityDraftState>(() => createPersonalityDrafts(activePersonality));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<EditablePersonalityField, string>>>({});
  const [savingField, setSavingField] = useState<EditablePersonalityField | null>(null);
  const profileUploadInputRef = useRef<HTMLInputElement | null>(null);
  const deferredPersonalityQuery = useDeferredValue(personalityQuery.trim().toLowerCase());

  useEffect(() => {
    setDrafts(createPersonalityDrafts(activePersonality));
    setFieldErrors({});
    setProfileImageStatus("");
    setRandomizeStatus("");
    setSavingField(null);
  }, [activePersonality?.character_slug]);

  const filteredPersonalities = personalities.filter((personality) => {
    if (!deferredPersonalityQuery) {
      return true;
    }

    return (
      personality.character_slug.toLowerCase().includes(deferredPersonalityQuery) ||
      personality.name.toLowerCase().includes(deferredPersonalityQuery) ||
      (personality.role ?? "").toLowerCase().includes(deferredPersonalityQuery) ||
      (personality.titles ?? "").toLowerCase().includes(deferredPersonalityQuery) ||
      (personality.summary ?? "").toLowerCase().includes(deferredPersonalityQuery)
    );
  });

  function setDraftValue(field: EditablePersonalityField, value: string) {
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [field]: value
    }));
  }

  function clearFieldError(field: EditablePersonalityField) {
    setFieldErrors((currentErrors) => ({
      ...currentErrors,
      [field]: ""
    }));
  }

  function handleCreatePersonality() {
    if (isCreatingPersonality) {
      return;
    }

    const normalizedName = createPersonalityName.trim();

    if (!normalizedName) {
      setCreatePersonalityStatus("Personality name is required.");
      return;
    }

    setCreatingPersonality(true);
    setCreatePersonalityStatus("");

    void (async () => {
      try {
        const response = await fetch(CREATE_PERSONALITY_PATH, {
          body: JSON.stringify({
            name: normalizedName
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<PersonalityRecord & { error: string }>;

        if (!response.ok || responseBody.error) {
          setCreatePersonalityStatus(responseBody.error ?? "Could not create personality.");
          return;
        }

        const createdPersonality = responseBody as PersonalityRecord;
        upsertPersonality(createdPersonality);
        setActivePersonalitySlug(createdPersonality.character_slug);
        setCreatePersonalityDialogOpen(false);
        setCreatePersonalityName("");
        setCreatePersonalityStatus("");
        setPersonalityQuery("");
      } catch (error) {
        setCreatePersonalityStatus(error instanceof Error ? error.message : "Could not create personality.");
      } finally {
        setCreatingPersonality(false);
      }
    })();
  }

  function handleOpenRandomizeDialog() {
    if (!activePersonality || isPreparingRandomizePrompt || isSubmittingRandomizePrompt) {
      return;
    }

    setPreparingRandomizePrompt(true);
    setRandomizeStatus("");

    void (async () => {
      try {
        const response = await fetch(PREPARE_RANDOM_PERSONALITY_PROMPT_PATH, {
          body: JSON.stringify({
            character_slug: activePersonality.character_slug
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<{
          defaultModel: string;
          error: string;
          modelOptions: string[];
          prompt: string;
        }>;

        if (
          !response.ok ||
          responseBody.error ||
          typeof responseBody.prompt !== "string" ||
          !Array.isArray(responseBody.modelOptions) ||
          typeof responseBody.defaultModel !== "string"
        ) {
          setRandomizeStatus(responseBody.error ?? "Could not prepare the OpenRouter prompt.");
          return;
        }

        setRandomizeModelOptions(responseBody.modelOptions);
        setSelectedRandomizeModel(responseBody.defaultModel);
        setRandomizePromptDraft(responseBody.prompt);
        setRandomizeDialogOpen(true);
        setRandomizeStatus("");
      } catch (error) {
        setRandomizeStatus(error instanceof Error ? error.message : "Could not prepare the OpenRouter prompt.");
      } finally {
        setPreparingRandomizePrompt(false);
      }
    })();
  }

  function handleSubmitRandomizePrompt() {
    if (!activePersonality || isSubmittingRandomizePrompt) {
      return;
    }

    const normalizedPrompt = randomizePromptDraft.trim();

    if (!normalizedPrompt) {
      setRandomizeStatus("Prompt is required.");
      return;
    }

    if (!selectedRandomizeModel) {
      setRandomizeStatus("Choose a model.");
      return;
    }

    setSubmittingRandomizePrompt(true);
    setRandomizeStatus("");

    void (async () => {
      try {
        const response = await fetch(RANDOMIZE_PERSONALITY_PATH, {
          body: JSON.stringify({
            character_slug: activePersonality.character_slug,
            model: selectedRandomizeModel,
            prompt: normalizedPrompt
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<PersonalityRecord & { error: string }>;

        if (!response.ok || responseBody.error) {
          setRandomizeStatus(responseBody.error ?? "Could not randomize personality.");
          return;
        }

        const updatedPersonality = responseBody as PersonalityRecord;
        upsertPersonality(updatedPersonality);
        setActivePersonalitySlug(updatedPersonality.character_slug);
        setDrafts(createPersonalityDrafts(updatedPersonality));
        setRandomizeDialogOpen(false);
        setRandomizeStatus("");
      } catch (error) {
        setRandomizeStatus(error instanceof Error ? error.message : "Could not randomize personality.");
      } finally {
        setSubmittingRandomizePrompt(false);
      }
    })();
  }

  function handleProfileImageUpload(file: File | null) {
    if (!activePersonality || !file || isUploadingProfileImage) {
      return;
    }

    setUploadingProfileImage(true);
    setProfileImageStatus("");

    void (async () => {
      try {
        const formData = new FormData();
        formData.set("character_slug", activePersonality.character_slug);
        formData.set("file", file);

        const response = await fetch(UPLOAD_PERSONALITY_PROFILE_PATH, {
          body: formData,
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<PersonalityRecord & { error: string }>;

        if (!response.ok || responseBody.error) {
          setProfileImageStatus(responseBody.error ?? "Could not upload profile image.");
          return;
        }

        const updatedPersonality = responseBody as PersonalityRecord;
        upsertPersonality(updatedPersonality);
        setDrafts(createPersonalityDrafts(updatedPersonality));
        setProfileImageStatus(`${file.name} uploaded.`);
      } catch (error) {
        setProfileImageStatus(error instanceof Error ? error.message : "Could not upload profile image.");
      } finally {
        setUploadingProfileImage(false);
      }
    })();
  }

  function updatePersonalityFields(
    primaryField: EditablePersonalityField,
    fields: Partial<PersonalityRecord>
  ) {
    if (!activePersonality || savingField) {
      return;
    }

    setSavingField(primaryField);
    clearFieldError(primaryField);

    void (async () => {
      try {
        const response = await fetch(UPDATE_PERSONALITY_PATH, {
          body: JSON.stringify({
            character_slug: activePersonality.character_slug,
            ...fields
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<PersonalityRecord & { error: string }>;

        if (!response.ok || responseBody.error) {
          throw new Error(responseBody.error ?? "Could not update personality.");
        }

        const updatedPersonality = responseBody as PersonalityRecord;
        upsertPersonality(updatedPersonality);
        setDrafts(createPersonalityDrafts(updatedPersonality));
      } catch (error) {
        setFieldErrors((currentErrors) => ({
          ...currentErrors,
          [primaryField]: error instanceof Error ? error.message : "Could not update personality."
        }));
      } finally {
        setSavingField((currentField) => (currentField === primaryField ? null : currentField));
      }
    })();
  }

  function commitTextField(
    field: PersonalityShortTextField | PersonalityTextareaField,
    required = false
  ) {
    if (!activePersonality) {
      return;
    }

    const rawValue = drafts[field];
    const normalizedValue = rawValue.trim();

    if (required && !normalizedValue) {
      setFieldErrors((currentErrors) => ({
        ...currentErrors,
        [field]: "This field is required."
      }));
      return;
    }

    const nextValue = (required ? normalizedValue : normalizedValue || null) as PersonalityRecord[typeof field];
    const currentValue = activePersonality[field];

    if (currentValue === nextValue) {
      setDraftValue(field, required ? normalizedValue : normalizedValue || "");
      return;
    }

    setDraftValue(field, required ? normalizedValue : normalizedValue || "");
    updatePersonalityFields(field, { [field]: nextValue } as Partial<PersonalityRecord>);
  }

  function commitNumberField(
    field: PersonalityRequiredNumberField | PersonalityOptionalNumberField,
    label: string,
    options: { allowNull?: boolean; max?: number; min?: number } = {}
  ) {
    if (!activePersonality) {
      return;
    }

    const rawValue = drafts[field].trim();

    if (!rawValue) {
      if (options.allowNull) {
        if (activePersonality[field] === null) {
          setDraftValue(field, "");
          return;
        }

        setDraftValue(field, "");
        updatePersonalityFields(field, { [field]: null } as Partial<PersonalityRecord>);
        return;
      }

      setFieldErrors((currentErrors) => ({
        ...currentErrors,
        [field]: `${label} is required.`
      }));
      return;
    }

    const parsedValue = Number(rawValue);

    if (!Number.isInteger(parsedValue)) {
      setFieldErrors((currentErrors) => ({
        ...currentErrors,
        [field]: `${label} must be a whole number.`
      }));
      return;
    }

    if (typeof options.min === "number" && parsedValue < options.min) {
      setFieldErrors((currentErrors) => ({
        ...currentErrors,
        [field]: `${label} must be at least ${options.min}.`
      }));
      return;
    }

    if (typeof options.max === "number" && parsedValue > options.max) {
      setFieldErrors((currentErrors) => ({
        ...currentErrors,
        [field]: `${label} must be at most ${options.max}.`
      }));
      return;
    }

    if (activePersonality[field] === parsedValue) {
      setDraftValue(field, String(parsedValue));
      return;
    }

    setDraftValue(field, String(parsedValue));
    updatePersonalityFields(field, { [field]: parsedValue } as unknown as Partial<PersonalityRecord>);
  }

  function renderTextField(
    field: PersonalityShortTextField,
    label: string,
    options: { mono?: boolean; required?: boolean } = {}
  ) {
    const errorMessage = fieldErrors[field];
    const isSaving = savingField === field;

    return (
      <PersonalityField
        label={label}
        mono={options.mono}
        value={
          <div className="grid gap-1">
            <input
              className={`${textInputClass} min-h-9 !min-w-0 w-full max-w-full py-1 ${isSaving ? "opacity-75" : ""}`}
              disabled={isSaving}
              onBlur={() => {
                commitTextField(field, options.required);
              }}
              onChange={(event) => {
                setDraftValue(field, event.currentTarget.value);
                if (errorMessage) {
                  clearFieldError(field);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitTextField(field, options.required);
                  event.currentTarget.blur();
                }
              }}
              type="text"
              value={drafts[field]}
            />
            {isSaving ? <div className="text-xs theme-text-muted">Saving...</div> : null}
            {!isSaving && errorMessage ? <div className="text-xs text-[#b42318]">{errorMessage}</div> : null}
          </div>
        }
      />
    );
  }

  function renderTextareaField(field: PersonalityTextareaField, label: string) {
    const errorMessage = fieldErrors[field];
    const isSaving = savingField === field;

    return (
      <div className="grid gap-1">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] theme-text-muted">{label}</div>
        <div
          className="grid text-[13px] after:invisible after:min-h-[7rem] after:whitespace-pre-wrap after:border after:border-transparent after:px-3 after:py-2 after:[grid-area:1/1/2/2] after:content-[attr(data-cloned-val)_'_'] [&>textarea]:[grid-area:1/1/2/2]"
          data-cloned-val={drafts[field]}
        >
          <textarea
            className={`${textInputClass} min-h-[7rem] !min-w-0 w-full max-w-full resize-none overflow-hidden ${isSaving ? "opacity-75" : ""}`}
            disabled={isSaving}
            onBlur={() => {
              commitTextField(field);
            }}
            onChange={(event) => {
              setDraftValue(field, event.currentTarget.value);
              if (errorMessage) {
                clearFieldError(field);
              }
            }}
            rows={3}
            value={drafts[field]}
          />
        </div>
        {isSaving ? <div className="text-xs theme-text-muted">Saving...</div> : null}
        {!isSaving && errorMessage ? <div className="text-xs text-[#b42318]">{errorMessage}</div> : null}
      </div>
    );
  }

  function renderNumberField(
    field: PersonalityRequiredNumberField | PersonalityOptionalNumberField,
    label: string,
    options: { allowNull?: boolean; max?: number; min?: number } = {}
  ) {
    const errorMessage = fieldErrors[field];
    const isSaving = savingField === field;

    return (
      <PersonalityField
        label={label}
        value={
          <div className="grid gap-1">
            <input
              className={`${compactTextInputClass} min-h-9 w-24 min-w-0 py-1 ${isSaving ? "opacity-75" : ""}`}
              disabled={isSaving}
              inputMode="numeric"
              max={options.max}
              min={options.min}
              onBlur={() => {
                commitNumberField(field, label, options);
              }}
              onChange={(event) => {
                setDraftValue(field, event.currentTarget.value);
                if (errorMessage) {
                  clearFieldError(field);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitNumberField(field, label, options);
                  event.currentTarget.blur();
                }
              }}
              step={1}
              type="number"
              value={drafts[field]}
            />
            {isSaving ? <div className="text-xs theme-text-muted">Saving...</div> : null}
            {!isSaving && errorMessage ? <div className="text-xs text-[#b42318]">{errorMessage}</div> : null}
          </div>
        }
      />
    );
  }

  function renderRangeField(
    field: PersonalityRequiredNumberField,
    label: string,
    lowLabel: string,
    highLabel: string
  ) {
    const errorMessage = fieldErrors[field];
    const isSaving = savingField === field;
    const fallbackValue = activePersonality?.[field] ?? 50;
    const parsedDraftValue = Number.parseInt(drafts[field], 10);
    const sliderValue =
      Number.isFinite(parsedDraftValue) && parsedDraftValue >= 1 && parsedDraftValue <= 100
        ? parsedDraftValue
        : fallbackValue;

    return (
      <div className="grid gap-2 border theme-border-panel-soft theme-bg-input p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] theme-text-muted">{label}</div>
          <div className={statusChipClass}>{sliderValue}</div>
        </div>
        <input
          className={`personality-range ${isSaving ? "opacity-75" : ""}`}
          disabled={isSaving}
          max={100}
          min={1}
          onBlur={() => {
            commitNumberField(field, label, { max: 100, min: 1 });
          }}
          onChange={(event) => {
            setDraftValue(field, event.currentTarget.value);
            if (errorMessage) {
              clearFieldError(field);
            }
          }}
          onKeyUp={(event) => {
            if (
              event.key === "ArrowLeft" ||
              event.key === "ArrowRight" ||
              event.key === "ArrowUp" ||
              event.key === "ArrowDown" ||
              event.key === "Home" ||
              event.key === "End" ||
              event.key === "PageUp" ||
              event.key === "PageDown"
            ) {
              commitNumberField(field, label, { max: 100, min: 1 });
            }
          }}
          onMouseUp={() => {
            commitNumberField(field, label, { max: 100, min: 1 });
          }}
          onTouchEnd={() => {
            commitNumberField(field, label, { max: 100, min: 1 });
          }}
          step={1}
          type="range"
          value={sliderValue}
        />
        <div className="flex items-center justify-between gap-3 text-[11px] theme-text-muted">
          <span className="min-w-0">{lowLabel}</span>
          <span className="min-w-0 text-right">{highLabel}</span>
        </div>
        {isSaving ? <div className="text-xs theme-text-muted">Saving...</div> : null}
        {!isSaving && errorMessage ? <div className="text-xs text-[#b42318]">{errorMessage}</div> : null}
      </div>
    );
  }

  function renderGenderField() {
    const field = "gender" as const;
    const errorMessage = fieldErrors[field];
    const isSaving = savingField === field;
    const normalizedValue = drafts.gender || "NB";

    return (
      <PersonalityField
        label="Gender"
        value={
          <div className="grid gap-1">
            <div className="flex flex-wrap gap-2">
              {([
                { label: "M", value: "M" },
                { label: "F", value: "F" },
                { label: "NB", value: "NB" }
              ] as const).map((option) => (
                <button
                  className={visibilityOptionButtonClass(normalizedValue === option.value)}
                  disabled={isSaving}
                  key={option.value}
                  onClick={() => {
                    if (!activePersonality || normalizedValue === option.value) {
                      return;
                    }

                    setDraftValue(field, option.value);
                    updatePersonalityFields(field, { gender: option.value });
                  }}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            {isSaving ? <div className="text-xs theme-text-muted">Saving...</div> : null}
            {!isSaving && errorMessage ? <div className="text-xs text-[#b42318]">{errorMessage}</div> : null}
          </div>
        }
      />
    );
  }

  return (
    <div className="min-h-0">
      <div className="grid min-h-0 gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="min-h-0 xl:h-[calc(100vh-7rem)]">
          <Panel
            actions={
              <button
                className={actionButtonClass}
                onClick={() => {
                  setCreatePersonalityDialogOpen(true);
                  setCreatePersonalityStatus("");
                  setCreatePersonalityName("");
                }}
                type="button"
              >
                Create
              </button>
            }
            className="h-full"
            description={
              personalities.length
                ? `Browse ${personalities.length} personality record${personalities.length === 1 ? "" : "s"}.`
                : "No personality records are available yet."
            }
            title="Personalities"
          >
            <input
              autoComplete="off"
              className={`${textInputClass} !min-w-0 w-full max-w-full flex-none`}
              onChange={(event) => {
                setPersonalityQuery(event.currentTarget.value);
              }}
              placeholder="Filter personalities"
              value={personalityQuery}
            />

            <div className={scrollableAssetListClass}>
              {filteredPersonalities.map((personality) => (
                <button
                  className={assetListRowClass(personality.character_slug === activePersonalitySlug)}
                  key={personality.character_slug}
                  onClick={() => {
                    setActivePersonalitySlug(personality.character_slug);
                  }}
                  type="button"
                >
                  <div className={assetListMetaClass}>
                    <strong className={assetListTitleClass}>{personality.name}</strong>
                    <span className={assetListEyebrowClass}>{personality.character_slug}</span>
                  </div>
                </button>
              ))}
            </div>

            {!filteredPersonalities.length ? (
              <div className="text-sm theme-text-muted">No personalities match that filter.</div>
            ) : null}
          </Panel>
        </div>

        <Panel
          className="xl:h-[calc(100vh-7rem)]"
          description={
            activePersonality
              ? `${activePersonality.name}, ${activePersonality.role ?? "unassigned role"}`
              : "Select a personality from the list to inspect and edit its fields."
          }
          footer={
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className={statusChipClass}>
                  {activePersonality ? `Editing ${activePersonality.character_slug}` : "No personality selected"}
                </div>
                {activePersonality ? <div className={statusChipClass}>Gender: {activePersonality.gender}</div> : null}
                {activePersonality?.role ? <div className={statusChipClass}>Role: {activePersonality.role}</div> : null}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className={actionButtonClass}
                  disabled={!activePersonality || isPreparingRandomizePrompt || isSubmittingRandomizePrompt}
                  onClick={handleOpenRandomizeDialog}
                  type="button"
                >
                  {isPreparingRandomizePrompt
                    ? "Preparing OpenRouter Prompt..."
                    : isSubmittingRandomizePrompt
                      ? "Randomizing..."
                      : "Randomize through OpenRouter"}
                </button>
                <button
                  className={secondaryButtonClass}
                  disabled={!activePersonality}
                  onClick={() => {
                    window.location.hash = "#/personality-events";
                  }}
                  type="button"
                >
                  View / Edit LLM Chat Tools
                </button>
                <button
                  className={secondaryButtonClass}
                  disabled={!activePersonality}
                  onClick={() => {
                    window.location.hash = "#/character-events";
                  }}
                  type="button"
                >
                  View / Edit Events
                </button>
                {randomizeStatus ? <div className="text-sm text-[#b42318]">{randomizeStatus}</div> : null}
              </div>
            </div>
          }
          title={activePersonality ? activePersonality.name : "Personality Editor"}
        >
          {activePersonality ? (
            <div className="min-h-0 overflow-y-auto pr-1">
              <PersonalitySectionTitle>Profile</PersonalitySectionTitle>
              <div className="grid gap-3">
                <FileDropTarget
                  activeLabel="Drop image to replace profile picture"
                  className="w-fit"
                  disabled={isUploadingProfileImage}
                  idleLabel="Drop image to upload profile picture"
                  onClick={() => {
                    profileUploadInputRef.current?.click();
                  }}
                  onFileSelected={(file) => {
                    handleProfileImageUpload(file);
                  }}
                >
                  <CheckerboardFrame className="h-64 w-64 border theme-border-panel theme-bg-input" size="md">
                    {activePersonality.custom_profile_pic ? (
                      <img
                        alt={`${activePersonality.name} profile`}
                        className="h-full w-full object-cover"
                        src={activePersonality.custom_profile_pic}
                      />
                    ) : (
                      <div className={`${emptyStateCardClass} flex h-full w-full items-center justify-center p-4`}>
                        <div>Drop or click to upload a 256x256 profile image.</div>
                      </div>
                    )}
                  </CheckerboardFrame>
                </FileDropTarget>
                <input
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    handleProfileImageUpload(event.currentTarget.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                  ref={profileUploadInputRef}
                  type="file"
                />
                {isUploadingProfileImage ? (
                  <div className="text-sm theme-text-muted">Uploading profile image...</div>
                ) : null}
                {!isUploadingProfileImage && profileImageStatus ? (
                  <div className={profileImageStatus.endsWith("uploaded.") ? "text-sm theme-text-muted" : "text-sm text-[#b42318]"}>
                    {profileImageStatus}
                  </div>
                ) : null}
              </div>

              <PersonalitySectionTitle>Identity</PersonalitySectionTitle>
              <div className="grid gap-3 lg:grid-cols-2">
                {renderTextField("name", "Name", { required: true })}
                {renderTextField("voice_id", "Voice ID")}
                {renderTextField("chat_provider", "Chat Provider")}
                {renderTextField("chat_model", "Chat Model")}
                {renderTextField("role", "Role")}
                {renderTextField("titles", "Titles")}
                {renderGenderField()}
                {renderNumberField("age", "Age", { allowNull: true, min: 0 })}
                <PersonalityField label="Slug" mono value={activePersonality.character_slug} />
              </div>

              <PersonalitySectionTitle>Core Stats</PersonalitySectionTitle>
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {renderNumberField("base_hp", "Base HP", { min: 1 })}
                {renderNumberField("gold", "Gold", { min: 0 })}
              </div>

              <PersonalitySectionTitle>Behavior</PersonalitySectionTitle>
              <div className="grid gap-3 lg:grid-cols-2">
                {renderTextField("temperament", "Temperament")}
                {renderTextField("emotional_range", "Emotional Range")}
                {renderTextField("speech_pattern", "Speech Pattern")}
                {renderTextField("accent", "Accent")}
              </div>
              <div className="mt-[10px] grid gap-3 lg:grid-cols-2">
                {PERSONALITY_RANGE_FIELDS.map((rangeField) =>
                  (
                    <div key={rangeField.field}>
                      {renderRangeField(rangeField.field, rangeField.label, rangeField.low, rangeField.high)}
                    </div>
                  )
                )}
              </div>

              <PersonalitySectionTitle>Motivation</PersonalitySectionTitle>
              <div className="grid gap-3">
                {renderTextareaField("summary", "Summary")}
                {renderTextareaField("goals", "Goals")}
                {renderTextareaField("backstory", "Backstory")}
                {renderTextareaField("hidden_desires", "Hidden Desires")}
                {renderTextareaField("fears", "Fears")}
                {renderTextareaField("family_description", "Family Description")}
                {renderTextareaField("areas_of_expertise", "Areas of Expertise")}
                {renderTextareaField("specialties", "Specialties")}
              </div>

              <PersonalitySectionTitle>Personal Information</PersonalitySectionTitle>
              <div className="grid gap-3">
                {renderTextareaField("secrets_you_know", "Secrets You Know")}
                {renderTextareaField("things_you_can_share", "Things You Can Share")}
                {renderTextareaField("smalltalk_topics_enjoyed", "Smalltalk Topics Enjoyed")}
                {renderTextareaField("other_world_knowledge", "Other World Knowledge")}
              </div>

              <PersonalitySectionTitle>Presentation</PersonalitySectionTitle>
              <div className="grid gap-3">
                {renderTextareaField("physical_description", "Physical Description")}
                {renderTextareaField("distinguishing_feature", "Distinguishing Feature")}
                {renderTextareaField("speech_style", "Speech Style")}
                {renderTextareaField("mannerisms", "Mannerisms")}
                {renderTextareaField("clothing_style", "Clothing Style")}
              </div>

              <PersonalitySectionTitle>System</PersonalitySectionTitle>
              <div className="grid gap-3">
                <PersonalityField label="Inserted" value={formatTimestampValue(activePersonality.inserted_at)} />
                <PersonalityField label="Updated" value={formatTimestampValue(activePersonality.updated_at)} />
                <div className="grid gap-1">
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] theme-text-muted">
                    LLM Prompt Base
                  </div>
                  <textarea
                    className={`${textInputClass} ${readOnlyInputClass} min-h-[9rem] !min-w-0 w-full max-w-full`}
                    readOnly
                    value={activePersonality.llm_prompt_base ?? ""}
                  />
                  {!activePersonality.llm_prompt_base?.trim() ? (
                    <div className="text-xs theme-text-muted">No generated prompt has been stored yet.</div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[20rem] items-center justify-center text-sm theme-text-muted">
              Select a personality to start editing.
            </div>
          )}
        </Panel>
      </div>

      {isCreatePersonalityDialogOpen ? (
        <ConfirmationDialog
          actions={
            <>
              <button
                className={secondaryButtonClass}
                disabled={isCreatingPersonality}
                onClick={() => {
                  if (isCreatingPersonality) {
                    return;
                  }

                  setCreatePersonalityDialogOpen(false);
                  setCreatePersonalityStatus("");
                  setCreatePersonalityName("");
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className={actionButtonClass}
                disabled={isCreatingPersonality}
                onClick={handleCreatePersonality}
                type="button"
              >
                {isCreatingPersonality ? "Creating..." : "Create"}
              </button>
            </>
          }
          description="Enter the personality name. A unique URL-safe slug will be generated automatically."
          title="Create Personality"
        >
          <div className="grid gap-3">
            <input
              autoComplete="off"
              className={`${textInputClass} !min-w-0 w-full max-w-full`}
              disabled={isCreatingPersonality}
              onChange={(event) => {
                setCreatePersonalityName(event.currentTarget.value);
                if (createPersonalityStatus) {
                  setCreatePersonalityStatus("");
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleCreatePersonality();
                }
              }}
              placeholder="Captain Rowan"
              type="text"
              value={createPersonalityName}
            />
            {createPersonalityStatus ? (
              <div className="text-sm text-[#b42318]">{createPersonalityStatus}</div>
            ) : null}
          </div>
        </ConfirmationDialog>
      ) : null}

      {isRandomizeDialogOpen ? (
        <ConfirmationDialog
          actions={
            <>
              <button
                className={secondaryButtonClass}
                disabled={isSubmittingRandomizePrompt}
                onClick={() => {
                  if (isSubmittingRandomizePrompt) {
                    return;
                  }

                  setRandomizeDialogOpen(false);
                  setRandomizeModelOptions([]);
                  setRandomizeStatus("");
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className={actionButtonClass}
                disabled={isSubmittingRandomizePrompt}
                onClick={handleSubmitRandomizePrompt}
                type="button"
              >
                {isSubmittingRandomizePrompt ? "Submitting..." : "Submit to OpenRouter"}
              </button>
            </>
          }
          className="!max-w-[min(96vw,112rem)]"
          description="Review or edit the generated prompt before sending it to OpenRouter. The response will be parsed back into the personality fields when possible."
          title="Randomize Personality Prompt"
        >
          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] theme-text-muted">Model</span>
              <select
                className={`${textInputClass} !min-w-0 w-full max-w-full`}
                disabled={isSubmittingRandomizePrompt}
                onChange={(event) => {
                  setSelectedRandomizeModel(event.currentTarget.value);
                  if (randomizeStatus) {
                    setRandomizeStatus("");
                  }
                }}
                value={selectedRandomizeModel}
              >
                {randomizeModelOptions.map((modelOption) => (
                  <option key={modelOption} value={modelOption}>
                    {modelOption}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              className={`${textInputClass} min-h-[24rem] !min-w-0 w-full max-w-full font-mono text-xs leading-6`}
              disabled={isSubmittingRandomizePrompt}
              onChange={(event) => {
                setRandomizePromptDraft(event.currentTarget.value);
                if (randomizeStatus) {
                  setRandomizeStatus("");
                }
              }}
              value={randomizePromptDraft}
            />
            {randomizeStatus ? <div className="text-sm text-[#b42318]">{randomizeStatus}</div> : null}
          </div>
        </ConfirmationDialog>
      ) : null}
    </div>
  );
}
