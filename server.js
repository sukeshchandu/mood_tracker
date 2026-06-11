const express = require('express');
require('dotenv').config();
const pool = require('./src/config/db.js');
const Path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session'); 
const saltRounds = 10;
const app = express();

app.use(express.json());
app.use(express.urlencoded({extended: true}));


app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret',
    resave: false,
    saveUninitialized: false
}));

const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

app.get( '/', (req, res) => {
    const filepath = Path.join(__dirname, 'login.html');
    res.sendFile(filepath);
});

app.post('/login', async (req, res)=> {
    const username = req.body.user.trim();
    const password = req.body.password.trim();
    const normalisedusername = username.toLowerCase();

    try {
        // MATCHED DB: using user_name
        const result = await pool.query(
            "SELECT * FROM users WHERE user_name=$1",
            [normalisedusername]
        );
        
        if (result.rows.length > 0){
            const user = result.rows[0];
            
            // MATCHED DB: using pass_word
            const storedhash = user.pass_word; 

            const match = await bcrypt.compare(password, storedhash);
            if (match){
                req.session.userId = user.id;
                // MATCHED DB: using user_name to save to session
                req.session.username = user.user_name;
                res.redirect('/dashboard');
            } else {
                res.send("Login failed: Incorrect password");
            }
        } else {
            res.send("login failed, user not found");
        }
    } catch (err){
        console.error(err);
        res.send("database error");
    }
});

app.get('/register', (req, res)=> {
    res.sendFile(Path.join(__dirname, 'register.html'));
});

app.post('/register', async (req, res) => {
    const register_username = (req.body.register_user).trim().toLowerCase();
    const register_password = (req.body.register_password).trim();
    const confirmPassword = (req.body.confirm_password).trim();

    if(!register_username || !register_password || !confirmPassword){
        return res.send("username and password required");
    }
    if (register_password !== confirmPassword){
        return res.send("Error : passwords do not match, Try again !");
    }
    if (register_password.length < 8){
        return res.send("Error: Password must be 8 characters long");
    }
    if (!/[A-Z]/.test(register_password)){
        return res.send("Error: password must contain atleast one uppercase letter");
    }
    if (!/[!@#$%^&*]/.test(register_password)){
        return res.send("Error: password must contain atleast one special character");
    }
    if (!/[0-9]/.test(register_password)){
        return res.send("Error: password must contain atleast one integer")
    }

    try {
        const hashedPassword = await bcrypt.hash(register_password, saltRounds);
        
        // MATCHED DB: using user_name and pass_word
        await pool.query(
            "INSERT INTO users (user_name, pass_word) VALUES ($1, $2)",
            [register_username, hashedPassword]
        );
        res.redirect("/");
    } catch(err){
        console.error(err);
        res.send('Error: registration failed');
    }
});

app.get('/api/user', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
    res.json({ username: req.session.username });
});

app.get('/dashboard', (req, res)=>{
    if (!req.session.userId) return res.redirect('/');
    res.sendFile(Path.join(__dirname, 'dashboard.html'));
});

app.post('/mood', async(req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const {hour, mood_score} = req.body;
    const user_id = req.session.userId; 
    const currentHour = new Date().getHours();

    if(parseInt(hour) !== currentHour){
        return res.status(400).json({
            success: false,
            message: "time violation: you can only log in the current hour"
        });
    }

    try {
        const check = await pool.query(
            "SELECT id, created_at FROM hourly_moods WHERE user_id=$1 and log_date = CURRENT_DATE AND hour=$2",
            [user_id, hour]
        );
        
        if (check.rows.length === 0){
            await pool.query(
                "INSERT INTO hourly_moods (user_id, hour, mood_score) VALUES ($1, $2, $3)",
                [user_id, hour, mood_score]
            );
            return res.json({success: true, message: "mood logged."});
        } else {
            const entry = check.rows[0];
            const timeDiff = new Date() - new Date(entry.created_at);
            
            if (timeDiff > 30000){
                return res.status(403).json({
                    success: false,
                    message: "locked: you cannot edit this mood anymore."
                });
            } else {
                await pool.query(
                    "UPDATE hourly_moods SET mood_score = $1 WHERE id=$2",
                    [mood_score, entry.id]
                );
                return res.json({success: true, message: "mood updated"});
            }
        }
    } catch(err){
        console.error(err);
        res.status(500).json({success: false, message: "server error"});
    }
});



app.get('/api/moods/today', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const result = await pool.query(
            `SELECT hour, mood_score 
             FROM hourly_moods 
             WHERE user_id = $1 AND log_date = CURRENT_DATE
             ORDER BY hour`,
            [req.session.userId]
        );
        res.json(result.rows); 
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

app.listen(PORT, () =>{
    console.log(`🚀 Server is live on http://localhost:${PORT}`)
});