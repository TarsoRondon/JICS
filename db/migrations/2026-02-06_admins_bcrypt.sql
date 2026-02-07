-- Ajuste para bcrypt (hash longo)
ALTER TABLE admins MODIFY senha_hash VARCHAR(255) NOT NULL;
