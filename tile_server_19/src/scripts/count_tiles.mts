import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_P0FkXwfHyc6M@ep-raspy-bird-a8uxoxqg.eastus2.azure.neon.tech/neondb?sslmode=require');
const tiles = await sql`SELECT COUNT(*) as c FROM map_tiles WHERE asset_kind = 'tile'`;
const sprites = await sql`SELECT COUNT(*) as c FROM map_tiles WHERE asset_kind = 'sprite'`;
const tileSlotCount = await sql`
  SELECT SUM(json_array_length(slots::json)) as total_slots
  FROM map_tiles 
  WHERE asset_kind = 'tile' AND slots IS NOT NULL
`;
console.log('tiles:', tiles[0].c);
console.log('sprites:', sprites[0].c);
console.log('total tile slots (json):', tileSlotCount[0].total_slots);
