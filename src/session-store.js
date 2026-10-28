const { Store } = require('express-session');

class MysqlSessionStore extends Store {
  constructor(pool) {
    super();
    this.pool = pool;
  }

  get(sid, callback) {
    this.pool.query('SELECT data FROM admin_sessions WHERE sid = ? AND expires_at > ?', [sid, Date.now()])
      .then(([rows]) => callback(null, rows.length ? JSON.parse(rows[0].data) : null))
      .catch(callback);
  }

  set(sid, data, callback = () => {}) {
    const expires = new Date(data.cookie.expires).getTime();
    this.pool.query(
      'INSERT INTO admin_sessions (sid, data, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), expires_at = VALUES(expires_at)',
      [sid, JSON.stringify(data), expires]
    ).then(() => callback()).catch(callback);
  }

  destroy(sid, callback = () => {}) {
    this.pool.query('DELETE FROM admin_sessions WHERE sid = ?', [sid])
      .then(() => callback()).catch(callback);
  }

  touch(sid, data, callback = () => {}) {
    const vencimiento = new Date(data.cookie.expires).getTime();
    this.pool.query(
      'UPDATE admin_sessions SET expires_at = ? WHERE sid = ? AND expires_at > ?',
      [vencimiento, sid, Date.now()]
    ).then(() => callback()).catch(callback);
  }
}

module.exports = MysqlSessionStore;
