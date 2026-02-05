-- SaaS foundations (tenancy + admin auth + audit logs)
-- Does not touch alunos/inscricoes/jogos.

CREATE TABLE IF NOT EXISTS organizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  sigla VARCHAR(20) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_organizations_sigla (sigla)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS eventos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  nome VARCHAR(120) NOT NULL,
  ano INT NOT NULL,
  data_inicio DATE NULL,
  data_fim DATE NULL,
  status ENUM('DRAFT','ATIVO','ENCERRADO') NOT NULL DEFAULT 'DRAFT',
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_eventos_org (organization_id),
  KEY idx_eventos_org_status (organization_id, status),
  KEY idx_eventos_org_ano (organization_id, ano),
  CONSTRAINT fk_eventos_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  role ENUM('SUPER_ADMIN','ADMIN','STAFF') NOT NULL DEFAULT 'STAFF',
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_admins_org_email (organization_id, email),
  KEY idx_admins_org_role (organization_id, role),
  KEY idx_admins_org_ativo (organization_id, ativo),
  CONSTRAINT fk_admins_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  admin_id INT NULL,
  admin_nome VARCHAR(120) NULL,
  acao VARCHAR(80) NOT NULL,
  entidade VARCHAR(80) NOT NULL,
  entidade_id VARCHAR(80) NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_logs_org_criado (organization_id, criado_em),
  KEY idx_logs_org_admin_criado (organization_id, admin_id, criado_em),
  KEY idx_logs_org_acao (organization_id, acao),
  CONSTRAINT fk_logs_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_logs_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

