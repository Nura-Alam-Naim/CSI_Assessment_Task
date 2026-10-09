const fs = require('fs');
let code = fs.readFileSync('src/modules/state/routes.js', 'utf8');
code = code.replace("router.get('/', async (req, res, next) => {", "router.get('/', async (req, res, next) => {\n  console.log('GET /api/state', req.query);");
fs.writeFileSync('src/modules/state/routes.js', code);
