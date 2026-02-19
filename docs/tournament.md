# Chaveamento e Sumula

## Visao geral
Motor de fases com reaproveitamento da tabela `jogos` e painel de sumula com classificacao em tempo real.
Principais tabelas:
- `format_config`
- `stages`
- `groups`
- `group_teams`

## Migrations
Execute as migrations em ordem. A nova migration:
- `db/migrations/2026-02-13_chaveamento_sumula_profissional.sql`
- `db/migrations/2026-02-12_tournament_stages.sql`
- `db/migrations/2026-02-11_jogos_sumula.sql`

## Endpoints
Todas as rotas usam session admin.

### Chaveamento
### 1) Bootstrap (cria fase 1 por modalidade/sexo)
```bash
curl -X POST http://localhost:3000/chaveamento/9/M/bootstrap \
  -H "Content-Type: application/json" \
  -b "auth_token=SEU_COOKIE" \
  -d '{"evento_id":6}'
```

### 2) Overview completo
```bash
curl http://localhost:3000/chaveamento/9/M/overview?evento_id=6 \
  -b "auth_token=SEU_COOKIE"
```

### 3) Encerrar fase atual e gerar proxima
```bash
curl -X POST "http://localhost:3000/chaveamento/9/M/close-stage?evento_id=6&force=1" \
  -H "Content-Type: application/json" \
  -b "auth_token=SEU_COOKIE"
```

### Endpoints legados (sorteio)
```bash
curl -X POST http://localhost:3000/sorteio/6/9/bootstrap \
  -H "Content-Type: application/json" \
  -b "auth_token=SEU_COOKIE" \
  -d '{"sexo":"M"}'
```

### Sumula
### 1) Salvar placar
```bash
curl -X PATCH http://localhost:3000/sumulas/jogos/158 \
  -H "Content-Type: application/json" \
  -b "auth_token=SEU_COOKIE" \
  -d '{"placar_a":2,"placar_b":1,"wo":false,"observacoes":"OK"}'
```

### 2) Empate em mata-mata com vencedor no desempate
```bash
curl -X PATCH http://localhost:3000/sumulas/jogos/222 \
  -H "Content-Type: application/json" \
  -b "auth_token=SEU_COOKIE" \
  -d '{"placar_a":1,"placar_b":1,"winner_side":"A"}'
```

### 3) Classificacao da chave
```bash
curl "http://localhost:3000/sumulas/tabela?modalidade_id=9&sexo=M&chave=CH%20A" \
  -b "auth_token=SEU_COOKIE"
```

## Regras
Formatos:
- A: grupos -> vencedores -> 2 triangulares -> final
- B: grupos -> vencedores -> 2 grupos de 4 -> semi/final
- C: grupos -> vencedores + melhor 2o -> quartas/semis/final

Desempate:
pontos > saldo > pro > confronto direto > sorteio
