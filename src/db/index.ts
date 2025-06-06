import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export interface StoredPayout {
  id: string;
  account: string;
  data: any;
  savedAt: Date;
}

export class DataStore {
  private db: Database.Database;

  constructor(private dbPath: string = './data/itrader.sqlite') {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(this.dbPath);
    this.prepare();
  }

  private prepare() {
    this.db.prepare(
      `CREATE TABLE IF NOT EXISTS payouts (
        id TEXT PRIMARY KEY,
        account TEXT,
        data TEXT,
        saved_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    ).run();
  }

  savePayout(id: string, account: string, data: any) {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO payouts (id, account, data) VALUES (?, ?, ?)`
    );
    stmt.run(id, account, JSON.stringify(data));
  }
}
