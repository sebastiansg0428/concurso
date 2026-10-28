CREATE DATABASE IF NOT EXISTS concurso_cafes CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE concurso_cafes;

CREATE TABLE IF NOT EXISTS cafes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  establecimiento VARCHAR(120) NOT NULL,
  descripcion TEXT,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS votantes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  correo VARCHAR(160) NOT NULL UNIQUE,
  correo_canonico VARCHAR(160) NOT NULL,
  telefono VARCHAR(30) NOT NULL,
  ciudad VARCHAR(80) NOT NULL,
  ip VARCHAR(64),
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_votantes_correo_canonico (correo_canonico)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS votos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  votante_id INT NOT NULL UNIQUE,
  cafe_id INT NOT NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_voto_votante FOREIGN KEY (votante_id) REFERENCES votantes(id) ON DELETE CASCADE,
  CONSTRAINT fk_voto_cafe FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario VARCHAR(60) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

INSERT INTO cafes (id, nombre, establecimiento, descripcion)
SELECT * FROM (
  SELECT 1, 'Cold Brew de lulo.', 'Café Espíritu de Paz', 'Una experiencia que conecta origen, cultura y comunidad.' UNION ALL
  SELECT 2, 'Brisa Mirandeña', 'Cafelado', 'El frescor de nuestra tierra, con alma de café.' UNION ALL
  SELECT 3, 'Café Paramo', 'Esmikafé', 'El equilibrio del café con un toque del dulzor natural de los frutos rojos y la sedosidad de la leche, la convierte en una bebida única, diferente, refrescante y muy deliciosa.' UNION ALL
  SELECT 4, 'MOMI, Mocaccino Mirandeño', 'Raíces de Miranda', 'Un sorbo de nuestra tierra, una experiencia para el alma.'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM cafes);

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
