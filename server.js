//připojení knihoven použitých v projektu (např. express = framework, bcrypt = šifrování hesel)
const express = require('express');
const session = require('express-session');
const flash = require('express-flash');
const RateLimit = require('express-rate-limit');
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
//TODO - security tool co chce req.session při redirectu
//const csrf = require('lusca').csrf; 

//procesování dat pro konektor a nastavení frameworku na express + recaptcha klíč
const app = express();
const secretKey = process.env.MY_APP_SECRET_KEY;
const recaptcha = new Recaptcha(
  '6Le25nIoAAAAAFyEkChVXQoMoIR_bT9MRfl1CND6',
  '6Le25nIoAAAAAGCFxyqsZDxktD1yLRsCRXjaJG9D'
);

//omezení requestů 
const limiter = RateLimit({
  windowMs: 1 * 60 * 1000, //čas na maximální počet requestů (default 1 minuta)
  max: 100, //maximální počet requestů na čas
});

//použití některých prvků knihoven
app.use(limiter);
app.use(flash());
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(__dirname));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/uploads', express.static('uploads'));
//reference nahoře - security tool
//app.use(csrf());  

//konektor, který procesuje data pro připojení z .env souboru
const con = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

//error kdyby nefungoval konektor
  con.connect(function (err) {
    if (err) throw err;
    console.log('Connected to the database!');
  });

  //nastavení session
  app.use(
    session({
      secret: secretKey,
      resave: false,
      saveUninitialized: true,
    })
  );
  
  //registrace
  app.post('/register', [
    recaptcha.middleware.verify,
    check('username').notEmpty(),
    check('email').isEmail(),
    check('password').isLength({ min: 6 }),
  ], async (req, res) => {
    if (!req.recaptcha.error) {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        req.flash('error', 'Validation error. Please check your input.');
        return res.redirect('/register');
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
          return res.redirect('/register');
        } else {
          req.flash('success', 'Registered successfully. Please log in.');
          res.redirect('/login');
        }
      });
    } else {
      req.flash('error', 'CAPTCHA verification failed.');
      return res.redirect('/register');
    }
  });

  //login
  app.post('/login', [recaptcha.middleware.verify], async (req, res) => {
    con.query('SELECT * FROM users WHERE username = ?', [req.body.username], async function (error, results, fields) {
      if (error) {
        console.log('error', 'Error occurred during login');
        req.flash('error', 'Error occurred during login');
        return res.redirect('/login');
      } else {
        if (results.length > 0) {
          const user = results[0];
          const comparison = await bcrypt.compare(req.body.password, user.password);
          if (comparison) {
            req.flash('success', 'Logged in successfully');
            const lastLoginTime = new Date();
            con.query('UPDATE users SET lastlogintime = ? WHERE id = ?', [lastLoginTime, user.id], function (error, updateResults, fields) {
              if (error) {
                console.error('Error updating last login time:', error);
                req.flash('error', 'Error updating last login time');
                return res.redirect('/login');
              }
              return res.redirect('/homepage');
            });
          } else {
            req.flash('error', 'Username and password do not match');
            return res.redirect('/login');
          }
        } else {
          req.flash('error', 'Username does not exist');
          return res.redirect('/login');
        }
      }
    });
  });

  //nastavení místa, kam se ukládají obrázky
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    },
  });

  //nastavení proměnné pro nahravání s uložení
const uploadWithStorage = multer({ storage: storage });

//funkce pro detekci youtube linku
function isYouTubeLink(text) {
  const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = text.match(youtubeRegex);
  return match ? match[0] : null;
}

//přidávání příspěvků
  app.post('/post', uploadWithStorage.single('media_url'), async (req, res) => {
    if (!req.session.userId) {
      req.flash('error', 'Please log in to post.');
      return res.redirect('/login.html');
    }

    const userId = req.session.userId;

    let postData = {
      user_id: userId,
      content: req.body.content,
    };
  
    const insertPostAndMedia = (mediaUrl = null) => {
      con.query('INSERT INTO posts SET ?', postData, (postError, postResults) => {
        if (postError) {
          console.error('SQL Error (Post): ', postError);
          req.flash('error', 'Error occurred during post submission.');
          return res.redirect('/homepage.html');
        }
  
        if (mediaUrl) {
          con.query('INSERT INTO media SET ?', { media_url: mediaUrl }, (mediaError, mediaResults) => {
            if (mediaError) {
              console.error('SQL Error (Media): ', mediaError);
              req.flash('error', 'Error occurred during media insertion.');
              return res.redirect('/homepage.html');
            }
  
            const postMediaData = {
              post_id: postResults.insertId,
              media_id: mediaResults.insertId,
            };
            con.query('INSERT INTO post_media SET ?', postMediaData, (linkError) => {
              if (linkError) {
                console.error('SQL Error (Link): ', linkError);
                req.flash('error', 'Error occurred during media-linking.');
              }
  
              return res.redirect('/homepage.html');
            });
          });
        } else {
          return res.redirect('/homepage.html');
        }
      });
    };
  
    //detekce youtube linku pomocí předem definované funkce
    const youtubeLink = isYouTubeLink(req.body.content);
    if (youtubeLink) {
      insertPostAndMedia(youtubeLink);
    } else if (req.file) {
      const mediaUrl = `${req.file.filename}`; 
      insertPostAndMedia(mediaUrl);
    } else {
      insertPostAndMedia();
    }
  });

  //načítaní homepage s příspěvky
  app.get('/homepage', async (req, res) => {
    try {
      const posts = await getPostsFromDatabaseWithLikeStatus();

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

      res.send(htmlContent);
    } catch (error) {
      console.error('Error fetching posts:', error);
      res.status(500).send('Error occurred while fetching posts.');
    }
  });


  //získávání postů z db pro jejich načtení
  app.get('/api/posts', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const userId = req.session.userId;

    if (!userId) {
        return res.status(403).json({ message: "User not logged in" });
    }

    try {
        const posts = await getPostsFromDatabaseWithLikeStatus(userId, page);
        res.json(posts);
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

//získávání komentářů z db pro jejich načtení
  app.get('/api/comments', async (req, res) => {
    const postId = req.query.postId;

    try {
      const comments = await getCommentsFromDatabase(postId);
      res.json(comments);
    } catch (error) {
      console.error('Error fetching comments:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  //funkce pro vybrání komentářů z db
  async function getCommentsFromDatabase(postId) {
    return new Promise((resolve, reject) => {
      con.query('SELECT comments.*, users.username FROM comments JOIN users ON comments.user_id = users.id WHERE comments.post_id = ? ORDER BY comment_time', [postId], (error, results) => {
        if (error) {
          reject(error);
        } else {
          resolve(results);
        }
      });
    });
  }

  let isLiking = {};

  //funkce pro přidání like na příspěvek
  app.post('/like', (req, res) => {
    if (!req.session.userId) {
        return res.status(403).json({ success: false, message: 'Not logged in' });
    }

    const { postId } = req.body;
    const userId = req.session.userId;

    if (isLiking[`${userId}-${postId}`]) {
        return res.status(400).json({ success: false, message: 'Already processing like' });
    }

    isLiking[`${userId}-${postId}`] = true;

    con.query('SELECT * FROM reactions WHERE post_id = ? AND user_id = ?', [postId, userId], (error, results) => {
        if (error || results.length > 0) {
            delete isLiking[`${userId}-${postId}`];
            return res.status(400).json({ success: false, message: 'Already liked or database error' });
        }

        con.query('UPDATE posts SET like_count = like_count + 1 WHERE id = ?', [postId], (updateError) => {
            if (updateError) {
                delete isLiking[`${userId}-${postId}`];
                return res.status(500).json({ success: false, message: 'Error updating like count' });
            }

            con.query('INSERT INTO reactions (post_id, user_id) VALUES (?, ?)', [postId, userId], (insertError) => {
                delete isLiking[`${userId}-${postId}`];
                if (insertError) {
                    return res.status(500).json({ success: false, message: 'Error recording like' });
                }
                res.json({ success: true });
            });
        });
    });
});

  let isUnliking = {};

   //funkce pro odebrání like z příspěvku
  app.post('/unlike', (req, res) => {
    if (!req.session.userId) {
        return res.status(403).json({ success: false, message: 'Not logged in' });
    }

    const { postId } = req.body;
    const userId = req.session.userId;

    if (isUnliking[`${userId}-${postId}`]) {
        return res.status(400).json({ success: false, message: 'Already processing unlike' });
    }

    isUnliking[`${userId}-${postId}`] = true;

    con.query('SELECT * FROM reactions WHERE post_id = ? AND user_id = ?', [postId, userId], (error, results) => {
        if (error || results.length === 0) {
            delete isUnliking[`${userId}-${postId}`];
            return res.status(400).json({ success: false, message: 'Not liked or database error' });
        }

        con.query('UPDATE posts SET like_count = like_count - 1 WHERE id = ?', [postId], (updateError) => {
            if (updateError) {
                delete isUnliking[`${userId}-${postId}`];
                return res.status(500).json({ success: false, message: 'Error updating like count' });
            }

            con.query('DELETE FROM reactions WHERE post_id = ? AND user_id = ?', [postId, userId], (deleteError) => {
                delete isUnliking[`${userId}-${postId}`];
                if (deleteError) {
                    return res.status(500).json({ success: false, message: 'Error removing like' });
                }
                res.json({ success: true });
            });
        });
    });
});

//vložení komentářů do db
  app.post('/comment', async (req, res) => {
    if (!req.session.userId) {
      console.log('Current session user ID:', req.session.userId);
      console.log('POST ERROR INBOUND, USER ID IS INCORRECT');
      return res.redirect('/login.html');
    }
    const userId = req.session.userId;
    const postId = req.body.postId;
    const comment = req.body.comment;

    let postData = {
      user_id: userId,
      post_id: postId,
      comment: comment,
    };

    con.query('INSERT INTO comments SET ?', postData, function (error, results, fields) {
      if (error) {
        console.error('SQL Error: ', error);
        req.flash('error', 'Error occurred during comment submission.');
        return res.redirect('/homepage.html');
      } else {
        req.flash('success', 'Comment submitted successfully');
        return res.redirect('/homepage.html');
      }
    });
  });

//odhlášení
  app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log('Error logging out:', err);
        }
        res.redirect('/login.html'); 
    });
  });

  //další api/comments pro jejich vložení do db
  app.post('/api/comments', async (req, res) => {
    const userId = req.session.userId;
    const { postId, commentText } = req.body;

    if (!userId || !postId || !commentText) {
      return res.status(400).json({ error: 'Invalid request parameters' });
    }

    try {
      const result = await insertCommentIntoDatabase(userId, postId, commentText);
      res.json({ success: true, commentId: result.insertId });
    } catch (error) {
      console.error('Error inserting comment:', error);
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  });
//funkce pro vložení komentářů do db
  async function insertCommentIntoDatabase(userId, postId, commentText) {
    return new Promise((resolve, reject) => {
      con.query('INSERT INTO comments (user_id, post_id, comment_text) VALUES (?, ?, ?)', [userId, postId, commentText], (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  }

  //funkce pro získání postů z db s like statusem
  async function getPostsFromDatabaseWithLikeStatus(userId, page) {
    const perPage = 10; 
    const offset = (page - 1) * perPage;

    return new Promise((resolve, reject) => {
        const query = `
            SELECT posts.*, users.username, media.media_url,
                   IF(reactions.user_id IS NULL, 0, 1) AS liked
            FROM posts
            LEFT JOIN users ON posts.user_id = users.id
            LEFT JOIN post_media ON posts.id = post_media.post_id
            LEFT JOIN media ON post_media.media_id = media.id
            LEFT JOIN reactions ON posts.id = reactions.post_id AND reactions.user_id = ?
            ORDER BY posts.post_time DESC
            LIMIT ? OFFSET ?`;

        con.query(query, [userId, perPage, offset], (error, results) => {
            if (error) {
                reject(error);
            } else {
                resolve(results);
            }
        });
    });
}

//zapnutí web serveru na portu 3000
  app.listen(3000, () => {
    console.log('Server started on port 3000');
  });

  //funkce pro redirecty na stránky
  app.get('/', (req, res) => {
    res.render('pages/index');
  });

  app.get('/register', (req, res) => {
    res.render('pages/register');
  });
  app.get('/login', (req, res) => {
    res.render('pages/login');
  });

  app.get('/homepage', (req, res) => {
    res.render('pages/homepage');
  });