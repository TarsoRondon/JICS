-- Admins table (matricula + senha + role + ultimo_login + criado_em + criado_por)

CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  matricula VARCHAR(20) NOT NULL,
  senha_hash CHAR(64) NOT NULL,
  role ENUM('SUPER_ADMIN','ADMIN') NOT NULL DEFAULT 'ADMIN',
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_login DATETIME NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por INT NULL,
  UNIQUE KEY uq_admins_matricula (matricula),
  KEY idx_admins_role (role),
  KEY idx_admins_ativo (ativo),
  KEY idx_admins_criado_em (criado_em),
  CONSTRAINT fk_admins_criado_por FOREIGN KEY (criado_por) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
