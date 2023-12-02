const express = require('express');
const session = require('express-session');
const flash = require('express-flash');
const mysql = require('mysql');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv').config();
const bcrypt = require('bcrypt');
const { check, validationResult } = require('express-validator');
const Recaptcha = require('express-recaptcha').RecaptchaV2;
const path = require('path');
const axios = require('axios');
const multer = require('multer');

const app = express();
const recaptcha = new Recaptcha(
  '6Le25nIoAAAAAFyEkChVXQoMoIR_bT9MRfl1CND6',
  '6Le25nIoAAAAAGCFxyqsZDxktD1yLRsCRXjaJG9D'
);

app.use(flash());
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(__dirname));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const secretKey = process.env.MY_APP_SECRET_KEY;

const con = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

con.connect(function (err) {
  if (err) throw err;
  console.log('Connected to the database!');
});

app.use(
  session({
    secret: secretKey,
    resave: false,
    saveUninitialized: true,
  })
);

app.post('/register.html', [
  recaptcha.middleware.verify,
  check('username').notEmpty(),
  check('email').isEmail(),
  check('password').isLength({ min: 6 }),
], async (req, res) => {
  if (!req.recaptcha.error) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash('error', 'Validation error. Please check your input.');
      return res.redirect('/register.html');
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const postData = {
      username: req.body.username,
      password: hashedPassword,
      email: req.body.email,
    };

    con.query('INSERT INTO users SET ?', postData, function (error, results, fields) {
      if (error) {
        console.log('SQL Error: ', error);
        req.flash('error', 'Error occurred during registration.');
        return res.redirect('/register.html');
      } else {
        res.redirect('/login.html');
      }
    });
  } else {
    req.flash('error', 'CAPTCHA verification failed.');
    return res.redirect('/register.html');
  }
});

app.post('/login', [recaptcha.middleware.verify], async (req, res) => {
  con.query('SELECT * FROM users WHERE username = ?', [req.body.username], async function (error, results, fields) {
    if (error) {
      console.log('error', 'Error occurred during login');
      return res.redirect('/login.html');
    } else {
      if (results.length > 0) {
        const user = results[0];
        const comparison = await bcrypt.compare(req.body.password, user.password);
        if (comparison) {
          req.session.userId = user.id;
          console.log('Current session user ID:', user.id);

          req.flash('success', 'Logged in successfully');

          const lastLoginTime = new Date();
          con.query('UPDATE users SET lastlogintime = ? WHERE id = ?', [lastLoginTime, user.id], function (error, updateResults, fields) {
            if (error) {
              console.error('Error updating last login time:', error);
            }

            return res.redirect('/homepage.html');
          });
        } else {
          req.flash('error', 'Username and password do not match');
          return res.redirect('/login.html');
        }
      } else {
        req.flash('error', 'Username does not exist');
        return res.redirect('/login.html');
      }
    }
  });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const uploadWithStorage = multer({ storage: storage });

app.post('/post', uploadWithStorage.single('media_url'), async (req, res) => {
  // Check if the user is logged in
  if (!req.session.userId) {
    console.log('Current session user ID:', req.session.userId);
    console.log('POST ERROR INBOUND, USER ID IS INCORRECT');
    return res.redirect('/login.html');
  }

  function isYouTubeLink(text) {
    const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = text.match(youtubeRegex);
    return match ? match[0] : null;
  }

  // Fetch user information from the session
  const userId = req.session.userId;

  // Create postData object with the correct user_id
  let postData = {
    user_id: userId,
    content: req.body.content,
    media_url: null,
  };

  // Check if the content is a YouTube link
  if (req.body.content && isYouTubeLink(req.body.content)) {
    postData.content = req.body.content;
    postData.media_url = req.body.content; // Save YouTube link directly
  } else if (req.file) {
    postData.media_url = req.file.filename; // Save uploaded file
  }

  // Insert post into the database
  con.query('INSERT INTO posts SET ?', postData, function (error, results, fields) {
    if (error) {
      console.error('SQL Error: ', error);
      req.flash('error', 'Error occurred during post submission.');
      return res.redirect('/homepage.html');
    } else {
      req.flash('success', 'Post submitted successfully');
      return res.redirect('/homepage.html');
    }
  });
});


app.get('/homepage', async (req, res) => {
  try {
    // Fetch posts from the database
    const posts = await getPostsFromDatabase();

    // Build the HTML content
    let htmlContent = '<div id="posts">';

    if (posts && posts.length > 0) {
      posts.forEach(post => {
        htmlContent += `
          <div class="post">
            <p><strong>${post.username}</strong></p>
            <p>${post.content}</p>
            ${post.media_url ? `<img src="${post.media_url}" alt="Post Media">` : ''}
            <p><em>Posted on ${post.post_time}</em></p>
          </div>`;
      });
    } else {
      htmlContent += '<p>No posts available.</p>';
    }

    htmlContent += '</div>';

    // Send the HTML content to the client
    res.send(htmlContent);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).send('Error occurred while fetching posts.');
  }
});

// Function to get posts from the database
function getPostsFromDatabase() {
  return new Promise((resolve, reject) => {
    con.query('SELECT * FROM posts ORDER BY post_time DESC', (error, results, fields) => {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

app.get('/api/posts', async (req, res) => {
  const page = req.query.page || 1; // Get the page parameter from the request query

  try {
    const posts = await getPostsFromDatabase(page);
    res.json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Function to get posts from the database with pagination
async function getPostsFromDatabase(page) {
  const perPage = 10; // Adjust this value based on how many posts you want to fetch per page
  const offset = (page - 1) * perPage;

  return new Promise((resolve, reject) => {
    con.query(
      'SELECT posts.*, users.username FROM posts JOIN users ON posts.user_id = users.id ORDER BY post_time DESC LIMIT ? OFFSET ?',
      [perPage, offset],
      (error, results) => {
        if (error) {
          reject(error);
        } else {
          resolve(results);
        }
      }
    );
  });
}

app.post('/like', (req, res) => {
  const postId = req.body.postId;
  const userId = req.session.userId;

  console.log('postId:', postId);
  console.log('userId:', userId);
  

  // Check if the user has already liked the post
  con.query('SELECT * FROM reactions WHERE post_id = ? AND user_id = ?', [postId, userId], (error, results) => {
    if (error) {
      console.error('Error checking existing like:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    } else {
      if (results.length === 0) {
        // If the user hasn't liked the post yet, proceed to like
        con.query('UPDATE posts SET like_count = like_count + 1 WHERE id = ?', [postId], (updateError) => {
          if (updateError) {
            console.error('Error updating like count:', updateError);
            res.status(500).json({ error: 'Internal Server Error' });
          } else {
            // Insert a record in the reactions table
            con.query('INSERT INTO reactions (post_id, user_id) VALUES (?, ?)', [postId, userId], (insertError) => {
              if (insertError) {
                console.error('Error inserting like record:', insertError);
                res.status(500).json({ error: 'Internal Server Error' });
              } else {
                res.sendStatus(200); // Like successful
              }
            });
          }
        });
      } else {
        // User has already liked the post, you can handle this case as needed
        res.status(400).json({ error: 'User has already liked the post' });
      }
    }
  });
});

// Helper function to get a user's reaction to a post
function getReaction(postId, userId) {
  return new Promise((resolve, reject) => {
    con.query('SELECT * FROM reactions WHERE post_id = ? AND user_id = ?', [postId, userId], (error, results) => {
      if (error) {
        reject(error);
      } else {
        resolve(results[0]);
      }
    });
  });
}

// Start the server
app.listen(3000, () => {
  console.log('Server started on port 3000');
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/register.html', (req, res) => {
  res.sendFile(__dirname + '/register.html');
});
app.get('/login.html', (req, res) => {
  res.sendFile(__dirname + '/login.html');
});

app.get('/homepage.html', (req, res) => {
  res.sendFile(__dirname + '/homepage.html');
});
