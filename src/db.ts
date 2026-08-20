import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

export type DbHandle = {
  db: Database.Database;
};

// Хендли кешуються за абсолютним шляхом.
// Раніше openDb() викликався ВСЕРЕДИНІ while(true) у collector.ts і
// polliCollector.ts, а db.close() не викликався ніде: ~144 незакритих
// з'єднання на процес за добу, і schema.sql перечитувався й виконувався
// щоцикл. better-sqlite3 розрахований на довгоживучий хендл.
const handles = new Map<string, DbHandle>();

export function openDb(dbPath: string): DbHandle {
  const abs = path.resolve(process.cwd(), dbPath);
  const cached = handles.get(abs);
  if (cached) return cached;

  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const db = new Database(abs);
  db.pragma("foreign_keys = ON");
  // Кілька процесів пишуть в одну базу; без цього паралельний запис
  // одразу кидає SQLITE_BUSY замість того, щоб зачекати.
  db.pragma("busy_timeout = 15000");

  const schemaPath = path.resolve(__dirname, "../schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  db.exec(schema);

  const handle = { db };
  handles.set(abs, handle);
  return handle;
}


