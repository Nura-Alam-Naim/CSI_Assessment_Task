const fs = require('fs');
let code = fs.readFileSync('src/modules/state/routes.js', 'utf8');
code = code.replace("console.log('GET /api/state', req.query);", "require('fs').appendFileSync('state_logs.txt', new Date().toISOString() + ' GET /api/state ' + JSON.stringify(req.query) + '\\n');");
fs.writeFileSync('src/modules/state/routes.js', code);
