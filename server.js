const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv1 = require('dotenv').config();
const bcrypt = require('bcrypt'); 
const app = express();

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(__dirname));

const con = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

con.connect(function(err) {
    if (err) throw err;
    console.log("Connected to the database!");
});

app.post('/register', async (req, res) => { 
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const postData  = {
      username: req.body.username,
      password: hashedPassword, 
      email: req.body.email,
      verification: 0
    };

    con.query('INSERT INTO users SET ?', postData, function (error, results, fields) {
      if (error) {
        console.log("SQL Error: ", error);
        res.status(400).json({
          "code": 400,
          "failed": "error occurred",
          "error_detail": error.sqlMessage
        });
      } else {
        res.redirect('/verify');
      }
    });
});

app.post('/login', (req, res) => {    
    con.query('SELECT * FROM users WHERE username = ?', [req.body.username], async function(error, results, fields) {
        if (error) {
            res.status(400).json({
                "code": 400,
                "failed": "Error occurred",
                "error_detail": error.sqlMessage
            });
        } else {
            if (results.length > 0) {
                const comparison = await bcrypt.compare(req.body.password, results[0].password);
                if(comparison) {
                    res.status(200).json({
                        "code": 200,
                        "success": "Logged in successfully"
                    });
                } else {
                    res.status(204).json({
                        "code": 204,
                        "success": "Username and password do not match"
                    });
                }
            } else {
                res.status(206).json({
                    "code": 206,
                    "success": "Username does not exist"
                });
            }
        }
    });
});

app.listen(3000, () => {
    console.log('Server started on port 3000');
});

app.get('/verify', (req, res) => {
    res.sendFile(__dirname + '/verification.html');
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/register', (req, res) => {
    res.sendFile(__dirname + '/register.html');
});

app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/login.html');
});
