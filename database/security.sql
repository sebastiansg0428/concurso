CREATE TABLE IF NOT EXISTS email_challenges (
  id CHAR(64) PRIMARY KEY,
  correo VARCHAR(160) NOT NULL UNIQUE,
  code_hash CHAR(64) NOT NULL,
  expires_at BIGINT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  next_send_at BIGINT NOT NULL,
  consumed TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_sessions (
  sid VARCHAR(128) PRIMARY KEY,
  data MEDIUMTEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  INDEX session_expiry (expires_at)
) ENGINE=InnoDB;
