const {Pool} = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    sl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false} : false
});

pool.on('connect', () => {
    console.log(" pg connected");
})
pool.on('error', () => {
    console.error('pg error', err);
    process.exit(-1);
})

module.exports = pool;