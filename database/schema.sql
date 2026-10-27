CREATE DATABASE IF NOT EXISTS concurso_cafes CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE concurso_cafes;

CREATE TABLE IF NOT EXISTS cafes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS votantes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  correo VARCHAR(160) NOT NULL UNIQUE,
  telefono VARCHAR(30) NOT NULL,
  ciudad VARCHAR(80) NOT NULL,
  ip VARCHAR(64),
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

INSERT INTO cafes (nombre, descripcion)
SELECT * FROM (
  SELECT 'Café Montaña', 'Notas a chocolate y panela, cuerpo medio.' UNION ALL
  SELECT 'Café Volcán', 'Acidez brillante con notas cítricas y florales.' UNION ALL
  SELECT 'Café Valle', 'Dulce, notas a caramelo y frutos rojos.' UNION ALL
  SELECT 'Café Nevado', 'Suave y balanceado, final achocolatado.'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM cafes);
