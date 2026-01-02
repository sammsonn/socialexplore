BEGIN;

-- Build temp list of fake users
CREATE TEMP TABLE tmp_fake_users AS
SELECT id FROM users WHERE email LIKE '%__FAKE__%';

SELECT COUNT(*) AS fake_users FROM tmp_fake_users;

-- 1) Read notifications (can reference users, activities, friend_requests)
DELETE FROM read_notifications
WHERE user_id IN (SELECT id FROM tmp_fake_users)
                OR activity_id IN (SELECT id FROM activities
                                    WHERE creator_id IN (SELECT id FROM tmp_fake_users))
                OR friend_request_id IN (SELECT id FROM friend_requests
                                            WHERE from_user_id IN (SELECT id FROM tmp_fake_users)
                                                                OR to_user_id   IN (SELECT id FROM tmp_fake_users));

-- 2) Messages (references activities + sender user)
DELETE FROM messages
WHERE sender_id IN (SELECT id FROM tmp_fake_users)
                OR activity_id IN (SELECT id FROM activities
                                    WHERE creator_id IN (SELECT id FROM tmp_fake_users));

-- 3) Participations (references user + activity)
DELETE FROM participations
WHERE user_id IN (SELECT id FROM tmp_fake_users)
                OR activity_id IN (SELECT id FROM activities
                                    WHERE creator_id IN (SELECT id FROM tmp_fake_users));

-- 4) Friend requests (references users)
DELETE FROM friend_requests
WHERE from_user_id IN (SELECT id FROM tmp_fake_users)
                    OR to_user_id IN (SELECT id FROM tmp_fake_users);

-- 5) Activities created by fake users
DELETE FROM activities
WHERE creator_id IN (SELECT id FROM tmp_fake_users);

-- 6) Finally delete fake users
DELETE FROM users
WHERE id IN (SELECT id FROM tmp_fake_users);

COMMIT;

-- 7) Output
SELECT COUNT(*) FROM users WHERE email LIKE '%__FAKE__%';
SELECT COUNT(*) FROM users;
