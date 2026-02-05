-- Ajustes para core esportivo (jogos / sorteio_meta)

ALTER TABLE jogos
  ADD COLUMN organization_id INT NOT NULL AFTER id,
  ADD COLUMN evento_id INT NOT NULL AFTER organization_id,
  ADD COLUMN chave VARCHAR(10) NULL,
  ADD COLUMN status ENUM('NAO_INICIADO','EM_ANDAMENTO','FINALIZADO') NOT NULL DEFAULT 'NAO_INICIADO',
  ADD COLUMN placar_a INT NULL,
  ADD COLUMN placar_b INT NULL,
  ADD COLUMN atualizado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE jogos
  ADD INDEX idx_jogos_org_evento (organization_id, evento_id),
  ADD INDEX idx_jogos_org_evento_modalidade (organization_id, evento_id, modalidade_id),
  ADD INDEX idx_jogos_status (status),
  ADD INDEX idx_jogos_chave (chave);

ALTER TABLE sorteio_meta
  ADD COLUMN organization_id INT NOT NULL,
  ADD COLUMN evento_id INT NOT NULL,
  ADD COLUMN local_jogos VARCHAR(120) NULL,
  ADD COLUMN modo VARCHAR(20) NULL,
  ADD COLUMN hora_inicio VARCHAR(10) NULL,
  ADD COLUMN intervalo_min INT NULL,
  ADD COLUMN chaves_qtd INT NULL;

ALTER TABLE sorteio_meta
  ADD UNIQUE KEY uq_sorteio_meta (organization_id, evento_id, modalidade_id, sexo),
  ADD INDEX idx_sorteio_meta_org_evento (organization_id, evento_id);

