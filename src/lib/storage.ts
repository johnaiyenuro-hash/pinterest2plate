import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_BOARDS, SEED_RECIPES } from './seedRecipes';
import { BoardSchema, RecipeSchema, type Board, type Recipe } from './types';

interface LocalDbShape {
  boards: Board[];
  recipes: Recipe[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const LOCAL_DB_PATH = path.join(DATA_DIR, 'db.json');

let memoryFallback: LocalDbShape | null = null;
let pgPoolPromise: Promise<import('pg').Pool | null> | null = null;
let pgMigrated = false;

async function getPgPool(): Promise<import('pg').Pool | null> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  if (!pgPoolPromise) {
    pgPoolPromise = (async () => {
      try {
        const { Pool } = await import('pg');
        const pool = new Pool({
          connectionString,
          max: 5,
          ssl: connectionString.includes('localhost') ? undefined : { rejectUnauthorized: false },
        });
        return pool;
      } catch (err) {
        console.error('[storage] Postgres init failed, falling back to local storage:', err);
        return null;
      }
    })();
  }
  const pool = await pgPoolPromise;
  if (pool && !pgMigrated) {
    await ensurePgSchema(pool);
    pgMigrated = true;
  }
  return pool;
}

async function ensurePgSchema(pool: import('pg').Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS p2p_boards (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS p2p_recipes (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      status TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_p2p_recipes_board ON p2p_recipes(board_id);
  `);

  const existing = await pool.query('SELECT COUNT(*)::int AS count FROM p2p_recipes');
  if ((existing.rows[0]?.count ?? 0) === 0) {
    for (const board of DEFAULT_BOARDS) {
      await pool.query(
        'INSERT INTO p2p_boards (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [board.id, JSON.stringify(board)],
      );
    }
    for (const recipe of SEED_RECIPES) {
      await pool.query(
        'INSERT INTO p2p_recipes (id, board_id, status, data) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
        [recipe.id, recipe.boardId, recipe.status, JSON.stringify(recipe)],
      );
    }
  }
}

function readLocalDb(): LocalDbShape {
  if (memoryFallback) return memoryFallback;

  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf-8')) as Partial<LocalDbShape>;
      const boards = (parsed.boards || DEFAULT_BOARDS).map((b) => BoardSchema.parse(b));
      const recipes = (parsed.recipes || SEED_RECIPES).map((r) => RecipeSchema.parse(r));
      memoryFallback = { boards, recipes };
      return memoryFallback;
    }
  } catch (err) {
    console.warn('[storage] Failed reading local db.json, seeding defaults:', err);
  }

  memoryFallback = {
    boards: DEFAULT_BOARDS.map((b) => ({ ...b })),
    recipes: SEED_RECIPES.map((r) => ({ ...r })),
  };
  writeLocalDb(memoryFallback);
  return memoryFallback;
}

function writeLocalDb(db: LocalDbShape): void {
  memoryFallback = db;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  } catch {
    // Read-only filesystem (e.g. Vercel without DATABASE_URL): keep in memory gracefully
  }
}

export async function getAllBoards(): Promise<Board[]> {
  const pool = await getPgPool();
  if (pool) {
    const res = await pool.query('SELECT data FROM p2p_boards ORDER BY updated_at DESC');
    return res.rows.map((row) => BoardSchema.parse(row.data));
  }
  return readLocalDb().boards;
}

export async function upsertBoard(board: Board): Promise<Board> {
  const valid = BoardSchema.parse(board);
  const pool = await getPgPool();
  if (pool) {
    await pool.query(
      `INSERT INTO p2p_boards (id, data, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [valid.id, JSON.stringify(valid)],
    );
    return valid;
  }

  const db = readLocalDb();
  const idx = db.boards.findIndex((b) => b.id === valid.id);
  if (idx >= 0) db.boards[idx] = valid;
  else db.boards.unshift(valid);
  writeLocalDb(db);
  return valid;
}

export async function getAllRecipes(boardId?: string): Promise<Recipe[]> {
  const pool = await getPgPool();
  if (pool) {
    const res = boardId && boardId !== 'all'
      ? await pool.query('SELECT data FROM p2p_recipes WHERE board_id = $1 ORDER BY updated_at DESC', [boardId])
      : await pool.query('SELECT data FROM p2p_recipes ORDER BY updated_at DESC');
    return res.rows.map((row) => RecipeSchema.parse(row.data));
  }

  const all = readLocalDb().recipes;
  if (boardId && boardId !== 'all') {
    return all.filter((r) => r.boardId === boardId);
  }
  return all;
}

export async function getRecipeById(id: string): Promise<Recipe | null> {
  const pool = await getPgPool();
  if (pool) {
    const res = await pool.query('SELECT data FROM p2p_recipes WHERE id = $1 LIMIT 1', [id]);
    return res.rows[0] ? RecipeSchema.parse(res.rows[0].data) : null;
  }
  return readLocalDb().recipes.find((r) => r.id === id) ?? null;
}

export async function upsertRecipe(recipe: Recipe): Promise<Recipe> {
  const valid = RecipeSchema.parse(recipe);
  const pool = await getPgPool();
  if (pool) {
    await pool.query(
      `INSERT INTO p2p_recipes (id, board_id, status, data, updated_at) VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET board_id = EXCLUDED.board_id, status = EXCLUDED.status, data = EXCLUDED.data, updated_at = NOW()`,
      [valid.id, valid.boardId, valid.status, JSON.stringify(valid)],
    );
    return valid;
  }

  const db = readLocalDb();
  const idx = db.recipes.findIndex((r) => r.id === valid.id);
  if (idx >= 0) db.recipes[idx] = valid;
  else db.recipes.unshift(valid);
  writeLocalDb(db);
  return valid;
}

export async function deleteRecipe(id: string): Promise<boolean> {
  const pool = await getPgPool();
  if (pool) {
    const res = await pool.query('DELETE FROM p2p_recipes WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  const db = readLocalDb();
  const before = db.recipes.length;
  db.recipes = db.recipes.filter((r) => r.id !== id);
  if (db.recipes.length !== before) {
    writeLocalDb(db);
    return true;
  }
  return false;
}

export function getStorageMode(): 'postgres' | 'local-json' {
  return process.env.DATABASE_URL ? 'postgres' : 'local-json';
}
