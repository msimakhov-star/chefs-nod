import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import type { Dish, Order, OrderEvent, Restaurant } from "./types";
import { SEED_RESTAURANT, SEED_DISHES } from "./seed";

// ponytail: one SQLite file, rows hold JSON blobs. Fine for one restaurant demo; move to Postgres for multi-tenant.
const g = globalThis as unknown as { __db?: DatabaseSync };

function open(): DatabaseSync {
  // In development the file lives outside the project: SQLite touches its WAL files on every read,
  // and the dev server would treat that as a code change and reload the page.
  const file =
    process.env.DB_PATH || (process.env.NODE_ENV === "production" ? path.join(process.cwd(), "data", "chefsnod.db") : path.join(os.homedir(), ".chefs-nod", "dev.db"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS restaurants (id TEXT PRIMARY KEY, slug TEXT UNIQUE, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS dishes (id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL, position INTEGER, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL, status TEXT, paypal_order_id TEXT, created_at TEXT, json TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS orders_pp ON orders(paypal_order_id);
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT, type TEXT, message TEXT, data TEXT, at TEXT);
    CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
  `);
  const count = db.prepare("SELECT COUNT(*) AS n FROM restaurants").get() as { n: number };
  if (count.n === 0) seed(db);
  return db;
}

function seed(db: DatabaseSync) {
  db.prepare("INSERT INTO restaurants (id, slug, json) VALUES (?, ?, ?)").run(
    SEED_RESTAURANT.id,
    SEED_RESTAURANT.slug,
    JSON.stringify(SEED_RESTAURANT),
  );
  SEED_DISHES.forEach((d, i) =>
    db.prepare("INSERT INTO dishes (id, restaurant_id, position, json) VALUES (?, ?, ?, ?)").run(d.id, d.restaurantId, i, JSON.stringify(d)),
  );
}

export function db(): DatabaseSync {
  if (!g.__db) g.__db = open();
  return g.__db;
}

const parse = <T>(row: unknown) => (row ? (JSON.parse((row as { json: string }).json) as T) : null);

export const restaurants = {
  bySlug: (slug: string) => parse<Restaurant>(db().prepare("SELECT json FROM restaurants WHERE slug = ?").get(slug)),
  byId: (id: string) => parse<Restaurant>(db().prepare("SELECT json FROM restaurants WHERE id = ?").get(id)),
  first: () => parse<Restaurant>(db().prepare("SELECT json FROM restaurants LIMIT 1").get()),
  save: (r: Restaurant) => db().prepare("UPDATE restaurants SET json = ? WHERE id = ?").run(JSON.stringify(r), r.id),
};

export const dishes = {
  list: (restaurantId: string) =>
    (db().prepare("SELECT json FROM dishes WHERE restaurant_id = ? ORDER BY position").all(restaurantId) as { json: string }[]).map(
      (r) => JSON.parse(r.json) as Dish,
    ),
  get: (id: string) => parse<Dish>(db().prepare("SELECT json FROM dishes WHERE id = ?").get(id)),
  save: (d: Dish) => {
    const exists = db().prepare("SELECT 1 FROM dishes WHERE id = ?").get(d.id);
    if (exists) db().prepare("UPDATE dishes SET json = ? WHERE id = ?").run(JSON.stringify(d), d.id);
    else {
      const pos = db().prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM dishes WHERE restaurant_id = ?").get(d.restaurantId) as { p: number };
      db().prepare("INSERT INTO dishes (id, restaurant_id, position, json) VALUES (?, ?, ?, ?)").run(d.id, d.restaurantId, pos.p, JSON.stringify(d));
    }
  },
  remove: (id: string) => db().prepare("DELETE FROM dishes WHERE id = ?").run(id),
  replaceAll: (restaurantId: string, list: Dish[]) => {
    db().prepare("DELETE FROM dishes WHERE restaurant_id = ?").run(restaurantId);
    list.forEach((d, i) =>
      db().prepare("INSERT INTO dishes (id, restaurant_id, position, json) VALUES (?, ?, ?, ?)").run(d.id, restaurantId, i, JSON.stringify(d)),
    );
  },
};

export const orders = {
  get: (id: string) => parse<Order>(db().prepare("SELECT json FROM orders WHERE id = ?").get(id)),
  byPaypalId: (ppId: string) => parse<Order>(db().prepare("SELECT json FROM orders WHERE paypal_order_id = ?").get(ppId)),
  list: (restaurantId: string, limit = 200) =>
    (db().prepare("SELECT json FROM orders WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT ?").all(restaurantId, limit) as { json: string }[]).map(
      (r) => JSON.parse(r.json) as Order,
    ),
  save: (o: Order) => {
    o.updatedAt = new Date().toISOString();
    db()
      .prepare(
        `INSERT INTO orders (id, restaurant_id, status, paypal_order_id, created_at, json) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, paypal_order_id = excluded.paypal_order_id, json = excluded.json`,
      )
      .run(o.id, o.restaurantId, o.status, o.paypalOrderId, o.createdAt, JSON.stringify(o));
    return o;
  },
};

export const events = {
  add: (orderId: string, type: string, message: string, data: unknown = null): OrderEvent => {
    const at = new Date().toISOString();
    const res = db().prepare("INSERT INTO events (order_id, type, message, data, at) VALUES (?, ?, ?, ?, ?)").run(orderId, type, message, JSON.stringify(data), at);
    return { id: Number(res.lastInsertRowid), orderId, type, message, data, at };
  },
  forOrder: (orderId: string) =>
    (db().prepare("SELECT * FROM events WHERE order_id = ? ORDER BY id").all(orderId) as Record<string, string>[]).map((r) => ({
      id: Number(r.id),
      orderId: r.order_id,
      type: r.type,
      message: r.message,
      data: JSON.parse(r.data),
      at: r.at,
    })) as OrderEvent[],
};

export const kv = {
  get: (k: string) => (db().prepare("SELECT v FROM kv WHERE k = ?").get(k) as { v: string } | undefined)?.v ?? null,
  set: (k: string, v: string) => db().prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(k, v),
};

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
