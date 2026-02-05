-- Admin pipeline & auditoria

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NULL,
  entidade VARCHAR(40) NOT NULL,
  entidade_id BIGINT NULL,
  acao VARCHAR(30) NOT NULL,
  payload JSON NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS noticia_versions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  noticia_id BIGINT NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  capa_url VARCHAR(500),
  user_id BIGINT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (noticia_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS equipes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  turma VARCHAR(100),
  contato VARCHAR(150),
  modalidade_id BIGINT NULL,
  sexo CHAR(1) NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (modalidade_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS jogos (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  modalidade_id BIGINT NOT NULL,
  sexo CHAR(1) NOT NULL,
  chave VARCHAR(5),
  jogo_label VARCHAR(30),
  ordem INT NOT NULL,
  hora_oficial VARCHAR(30),
  local VARCHAR(120),
  equipe_a VARCHAR(150) NOT NULL,
  equipe_b VARCHAR(150) NOT NULL,
  placar_a INT DEFAULT 0,
  placar_b INT DEFAULT 0,
  status ENUM('agendado','em_andamento','finalizado') DEFAULT 'agendado',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (modalidade_id),
  INDEX (sexo),
  INDEX (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sumulas (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  jogo_id BIGINT NULL,
  modalidade_id BIGINT NULL,
  sexo CHAR(1) NULL,
  fase VARCHAR(100),
  etapa VARCHAR(100),
  data DATE NULL,
  arbitro VARCHAR(150),
  mesarios VARCHAR(150),
  inicio VARCHAR(20),
  fim VARCHAR(20),
  equipe_a VARCHAR(150),
  equipe_b VARCHAR(150),
  placar_a INT DEFAULT 0,
  placar_b INT DEFAULT 0,
  cartoes TEXT,
  user_id BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (jogo_id),
  INDEX (modalidade_id)
) ENGINE=InnoDB;

ALTER TABLE modalidades ADD COLUMN capacidade INT NULL;
ALTER TABLE inscricoes
  ADD COLUMN status_pagamento ENUM('pendente','pago','isento') DEFAULT 'pendente',
  ADD COLUMN confirmado TINYINT(1) DEFAULT 0;
