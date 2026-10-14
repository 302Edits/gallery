const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

function openDatabase(filename, backupDir) {
  const db = new Database(filename);
  const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='photos'").get();
  if (existing && !db.prepare('PRAGMA table_info(photos)').all().some(column => column.name === 'sha256') && backupDir) {
    fs.mkdirSync(backupDir, { recursive: true });
    const target = path.join(backupDir, `pre-migration-${randomUUID()}.sqlite`);
    db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  }
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS galleries (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    createdAt TEXT, themeColor TEXT DEFAULT '#a74425'
  );
  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY, galleryId TEXT REFERENCES galleries(id), filePath TEXT NOT NULL,
    fileName TEXT NOT NULL, mimeType TEXT, width INTEGER, height INTEGER, dateTaken TEXT,
    sport TEXT, location TEXT, capturedAt TEXT, exifRaw TEXT
  );`);
  const extensions = {
    galleries: { sport: "TEXT DEFAULT ''", location: "TEXT DEFAULT ''", eventDate: "TEXT DEFAULT ''",
      themePreset: "TEXT DEFAULT 'editorial'", coverPhotoId: 'TEXT', externalUrl: "TEXT DEFAULT ''",
      publishedAt: 'TEXT', publishedPhotoIds: "TEXT DEFAULT '[]'" },
    photos: { thumbnailPath: 'TEXT', previewPath: 'TEXT', sizeBytes: 'INTEGER', sha256: 'TEXT',
      hasGps: 'INTEGER DEFAULT 0', metadataSource: 'TEXT', uploadKey: 'TEXT' },
  };
  db.transaction(() => {
    for (const [table, columns] of Object.entries(extensions)) {
      const known = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name));
      for (const [name, definition] of Object.entries(columns)) {
        if (!known.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
      }
    }
    db.exec('CREATE INDEX IF NOT EXISTS photos_album_date ON photos(galleryId,dateTaken,id); CREATE UNIQUE INDEX IF NOT EXISTS photos_upload_key ON photos(uploadKey) WHERE uploadKey IS NOT NULL;');
  })();
  return db;
}
module.exports = { openDatabase };
