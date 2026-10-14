const path = require('node:path');
const { openDatabase } = require('./database');
const { exportSite } = require('./export-site');
const root = path.resolve(__dirname, '..');
const db = openDatabase(path.join(__dirname, 'gallery.db'), path.join(__dirname, 'data', 'backups'));
exportSite({ db, projectRoot: root, outputPath: path.join(root, 'site-output') })
  .then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => db.close());
