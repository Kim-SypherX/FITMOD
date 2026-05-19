const pool = require('./db');
pool.query('SELECT * FROM favori').then(([r]) => console.log(r)).catch(console.error).finally(()=>process.exit(0));
