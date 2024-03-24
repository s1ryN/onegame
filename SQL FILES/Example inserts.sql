INSERT INTO michalpisarik.users (username, password, email) VALUES
('user1', 'password1', 'user1@example.com'),
('user2', 'password2', 'user2@example.com'),
('user3', 'password3', 'user3@example.com'),
('user4', 'password4', 'user4@example.com'),
('user5', 'password5', 'user5@example.com'),
('user6', 'password6', 'user6@example.com'),
('user7', 'password7', 'user7@example.com'),
('user8', 'password8', 'user8@example.com'),
('user9', 'password9', 'user9@example.com'),
('user10', 'password10', 'user10@example.com');

INSERT INTO michalpisarik.posts (user_id, content) VALUES
(1, 'Post content by user 1'),
(2, 'Post content by user 2'),
(3, 'Post content by user 3'),
(4, 'Post content by user 4'),
(5, 'Post content by user 5'),
(6, 'Post content by user 6'),
(7, 'Post content by user 7'),
(8, 'Post content by user 8'),
(9, 'Post content by user 9'),
(10, 'Post content by user 10');

INSERT INTO michalpisarik.comments (post_id, user_id, comment_text) VALUES
(1, 2, 'Comment by user 2 on post 1'),
(2, 3, 'Comment by user 3 on post 2'),
(3, 4, 'Comment by user 4 on post 3'),
(4, 5, 'Comment by user 5 on post 4'),
(5, 6, 'Comment by user 6 on post 5'),
(6, 7, 'Comment by user 7 on post 6'),
(7, 8, 'Comment by user 8 on post 7'),
(8, 9, 'Comment by user 9 on post 8'),
(9, 10, 'Comment by user 10 on post 9'),
(10, 1, 'Comment by user 1 on post 10');

INSERT INTO michalpisarik.media (media_url) VALUES
('https://example.com/media1.jpg'),
('https://example.com/media2.jpg'),
('https://example.com/media3.jpg'),
('https://example.com/media4.jpg'),
('https://example.com/media5.jpg'),
('https://example.com/media6.jpg'),
('https://example.com/media7.jpg'),
('https://example.com/media8.jpg'),
('https://example.com/media9.jpg'),
('https://example.com/media10.jpg');

INSERT INTO michalpisarik.post_media (post_id, media_id) VALUES
(1, 1),
(2, 2),
(3, 3),
(4, 4),
(5, 5),
(6, 6),
(7, 7),
(8, 8),
(9, 9),
(10, 10);

INSERT INTO michalpisarik.reactions (post_id, user_id) VALUES
(1, 10),
(2, 9),
(3, 8),
(4, 7),
(5, 6),
(6, 5),
(7, 4),
(8, 3),
(9, 2),
(10, 1);