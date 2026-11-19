Query log

```sql
SELECT u.id, u.email, COUNT(o.id) AS orders_0, SUM(o.total_cents) / 100.0 AS revenue
FROM users u LEFT JOIN orders o ON o.user_id = u.id AND o.created_at >= NOW() - INTERVAL '1 days'
WHERE u.plan IN ('pro', 'team') GROUP BY u.id, u.email HAVING COUNT(o.id) > 0 ORDER BY revenue DESC LIMIT 50;

SELECT u.id, u.email, COUNT(o.id) AS orders_1, SUM(o.total_cents) / 100.0 AS revenue
FROM users u LEFT JOIN orders o ON o.user_id = u.id AND o.created_at >= NOW() - INTERVAL '2 days'
WHERE u.plan IN ('pro', 'team') GROUP BY u.id, u.email HAVING COUNT(o.id) > 1 ORDER BY revenue DESC LIMIT 50;

SELECT u.id, u.email, COUNT(o.id) AS orders_2, SUM(o.total_cents) / 100.0 AS revenue
FROM users u LEFT JOIN orders o ON o.user_id = u.id AND o.created_at >= NOW() - INTERVAL '3 days'
WHERE u.plan IN ('pro', 'team') GROUP BY u.id, u.email HAVING COUNT(o.id) > 2 ORDER BY revenue DESC LIMIT 50;

SELECT u.id, u.email, COUNT(o.id) AS orders_3, SUM(o.total_cents) / 100.0 AS revenue
FROM users u LEFT JOIN orders o ON o.user_id = u.id AND o.created_at >= NOW() - INTERVAL '4 days'
WHERE u.plan IN ('pro', 'team') GROUP BY u.id, u.email HAVING COUNT(o.id) > 3 ORDER BY revenue DESC LIMIT 50;

SELECT u.id, u.email, COUNT(o.id) AS orders_4, SUM(o.total_cents) / 100.0 AS revenue
FROM users u LEFT JOIN orders o ON o.user_id = u.id AND o.created_at >= NOW() - INTERVAL '5 days'
WHERE u.plan IN ('pro', 'team') GROUP BY u.id, u.email HAVING COUNT(o.id) > 4 ORDER BY revenue DESC LIMIT 50;

SELECT u.id, u.email, COUNT(o.id) AS orders_5, SUM(o.total_cents) / 100.0 AS revenue
FROM users u LEFT JOIN orders o ON o.user_id = u.id AND o.created_at >= NOW() - INTERVAL '6 days'
WHERE u.plan IN ('pro', 'team') GROUP BY u.id, u.email HAVING COUNT(o.id) > 5 ORDER BY revenue DESC LIMIT 50;

SELECT u.id, u.email, COUNT(o.id) AS orders_6, SUM(o.total_cents) / 100.0 AS revenue
FROM users u LEFT JOIN orders o ON o.user_id = u.id AND o.created_at >= NOW() - INTERVAL '7 days'
WHERE u.plan IN ('pro', 'team') GROUP BY u.id, u.email HAVING COUNT(o.id) > 6 ORDER BY revenue DESC LIMIT 50;

SELECT u.id, u.email, COUNT(o.id) AS orders_7, SUM(o.total_cents) / 100.0 AS revenue
FROM users u LEFT JOIN orders o ON o.user_id = u.id AND o.created_at >= NOW() - INTERVAL '8 days'
WHERE u.plan IN ('pro', 'team') GROUP BY u.id, u.email HAVING COUNT(o.id) > 7 ORDER BY revenue DESC LIMIT 50;

SELECT u.id, u.email, COUNT(o.id) AS orders_8, SUM(o.total_cents) / 100.0 AS revenue
FROM users u LEFT JOIN orders o ON o.user_id = u.id AND o.created_at >= NOW() - INTERVAL '9 days'
WHERE u.plan IN ('pro', 'team') GROUP BY u.id, u.email HAVING COUNT(o.id) > 8 ORDER BY revenue DESC LIMIT 50;
```
