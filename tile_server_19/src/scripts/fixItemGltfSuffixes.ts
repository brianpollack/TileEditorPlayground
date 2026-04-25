import { getDatabase } from "../lib/database";

interface ItemRow {
  id: number;
  name: string;
  slug: string;
}

interface PlannedUpdate extends ItemRow {
  nextName: string;
  nextSlug: string;
}

const ITEM_OVERRIDES = new Map<number, { name: string; slug: string }>([
  [410, { name: "Orc Raider Axe", slug: "orc-raider-axe" }],
  [453, { name: "Survivalist Shotgun", slug: "survivalist-shotgun" }],
  [458, { name: "Survivor Shotgun", slug: "survivor-shotgun" }]
]);

function usage() {
  console.log("Usage: node --import tsx src/scripts/fixItemGltfSuffixes.ts [--apply]");
  console.log("");
  console.log("Defaults to dry-run mode and prints the planned updates.");
  console.log("Pass --apply to update the database.");
}

function stripGltfSuffix(value: string) {
  return value.replace(/\.gltf$/iu, "").replace(/-gltf$/iu, "");
}

function isApplyMode(argv: string[]) {
  if (argv.includes("--help") || argv.includes("-h")) {
    usage();
    process.exit(0);
  }

  return argv.includes("--apply");
}

function buildPlannedUpdates(rows: ItemRow[]) {
  return rows
    .map((row) => {
      const override = ITEM_OVERRIDES.get(row.id);
      const nextName = override?.name ?? stripGltfSuffix(row.name);
      const nextSlug = override?.slug ?? stripGltfSuffix(row.slug);

      return {
        ...row,
        nextName,
        nextSlug
      };
    })
    .filter((row) => row.name !== row.nextName || row.slug !== row.nextSlug);
}

function findInternalConflicts(rows: PlannedUpdate[]) {
  const conflicts: string[] = [];
  const nameOwnerByValue = new Map<string, number>();
  const slugOwnerByValue = new Map<string, number>();

  for (const row of rows) {
    const existingNameOwner = nameOwnerByValue.get(row.nextName);

    if (existingNameOwner && existingNameOwner !== row.id) {
      conflicts.push(`Name conflict inside update set: "${row.nextName}" (${existingNameOwner} and ${row.id})`);
    } else {
      nameOwnerByValue.set(row.nextName, row.id);
    }

    const existingSlugOwner = slugOwnerByValue.get(row.nextSlug);

    if (existingSlugOwner && existingSlugOwner !== row.id) {
      conflicts.push(`Slug conflict inside update set: "${row.nextSlug}" (${existingSlugOwner} and ${row.id})`);
    } else {
      slugOwnerByValue.set(row.nextSlug, row.id);
    }
  }

  return conflicts;
}

async function findDatabaseConflicts(rows: PlannedUpdate[]) {
  if (!rows.length) {
    return [] as string[];
  }

  const db = await getDatabase();
  const ids = rows.map((row) => row.id);
  const nextNames = rows.map((row) => row.nextName);
  const nextSlugs = rows.map((row) => row.nextSlug);
  const conflicts: string[] = [];
  const [nameRows, slugRows] = await Promise.all([
    db<ItemRow>("items").select("id", "name", "slug").whereIn("name", nextNames).whereNotIn("id", ids),
    db<ItemRow>("items").select("id", "name", "slug").whereIn("slug", nextSlugs).whereNotIn("id", ids)
  ]);

  for (const row of nameRows) {
    conflicts.push(`Name conflict in database: "${row.name}" already exists on item ${row.id}`);
  }

  for (const row of slugRows) {
    conflicts.push(`Slug conflict in database: "${row.slug}" already exists on item ${row.id}`);
  }

  return conflicts;
}

async function main() {
  const applyMode = isApplyMode(process.argv.slice(2));
  const db = await getDatabase();

  try {
    const matchingRows = await db<ItemRow>("items")
      .select("id", "name", "slug")
      .where((queryBuilder) => {
        queryBuilder
          .where("name", "ilike", "%.gltf")
          .orWhere("slug", "ilike", "%-gltf");

        if (ITEM_OVERRIDES.size > 0) {
          queryBuilder.orWhereIn("id", Array.from(ITEM_OVERRIDES.keys()));
        }
      })
      .orderBy("id", "asc");
    const plannedUpdates = buildPlannedUpdates(matchingRows);
    const conflicts = [
      ...findInternalConflicts(plannedUpdates),
      ...(await findDatabaseConflicts(plannedUpdates))
    ];

    console.log(
      JSON.stringify(
        {
          applyMode,
          conflicts,
          preview: plannedUpdates.slice(0, 20),
          totalMatches: matchingRows.length,
          totalUpdates: plannedUpdates.length
        },
        null,
        2
      )
    );

    if (conflicts.length) {
      throw new Error("Aborting because cleaned names or slugs would collide.");
    }

    if (!applyMode) {
      console.log("");
      console.log("Dry run only. Re-run with --apply to update the database.");
      return;
    }

    await db.transaction(async (transaction) => {
      for (const row of plannedUpdates) {
        await transaction("items").where({ id: row.id }).update({
          name: row.nextName,
          slug: row.nextSlug,
          updated_at: transaction.fn.now()
        });
      }
    });

    console.log("");
    console.log(`Updated ${plannedUpdates.length} item row(s).`);
  } finally {
    await db.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
