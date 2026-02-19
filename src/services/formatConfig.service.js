import { dbQuery, pool } from '../db/conn.js';
import { resolveFormatByModalidadeName } from '../utils/tournamentFormat.util.js';

let cachedFormatTable = null;

async function resolveFormatTable() {
  if (cachedFormatTable) return cachedFormatTable;
  const rows = await dbQuery(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('format_config', 'tournament_format_config')`
  );
  const names = new Set(rows.map(r => r.TABLE_NAME));
  if (names.has('format_config')) {
    cachedFormatTable = 'format_config';
    return cachedFormatTable;
  }
  cachedFormatTable = 'tournament_format_config';
  return cachedFormatTable;
}

async function getModalidadeNome(modalidade_id) {
  const rows = await dbQuery(
    'SELECT COALESCE(titulo, nome) AS nome_modalidade FROM modalidades WHERE id = :id LIMIT 1',
    { id: modalidade_id }
  );
  return rows[0]?.nome_modalidade || '';
}

function mapLegacyConfig(row) {
  const rules = row?.rules_json ? JSON.parse(row.rules_json) : {};
  return {
    ...row,
    format: row.format_code,
    format_code: row.format_code,
    auto_grouping: 1,
    group_sizes_json: null,
    final_stage_mode: rules.finalStageMode || 'SEMIS_FINAL',
    sort_on_knockout_entry: rules.shuffleOnKnockout === false ? 0 : 1,
    rules_json: row.rules_json || JSON.stringify(rules),
  };
}

function mapCurrentConfig(row) {
  const rules = {
    finalStageMode: row.final_stage_mode || 'SEMIS_FINAL',
    shuffleOnKnockout: row.sort_on_knockout_entry !== 0,
    groupSizes: row.group_sizes_json || null,
  };
  return {
    ...row,
    format_code: row.format,
    rules_json: JSON.stringify(rules),
  };
}

export async function getOrCreateFormatConfig({ organization_id, evento_id, modalidade_id, sexo }) {
  const sexoSafe = String(sexo || 'X').toUpperCase();
  const table = await resolveFormatTable();

  if (table === 'format_config') {
    const rows = await dbQuery(
      `SELECT *
       FROM format_config
       WHERE modalidade_id = :mod
         AND sexo = :sexo
       LIMIT 1`,
      { mod: modalidade_id, sexo: sexoSafe }
    );
    if (rows.length) return mapCurrentConfig(rows[0]);

    const modalidadeNome = await getModalidadeNome(modalidade_id);
    const format = resolveFormatByModalidadeName(modalidadeNome);
    const [result] = await pool.query(
      `INSERT INTO format_config
        (modalidade_id, sexo, format, auto_grouping, group_sizes_json, final_stage_mode, sort_on_knockout_entry)
       VALUES (?,?,?,?,?,?,?)`,
      [modalidade_id, sexoSafe, format, 1, null, 'SEMIS_FINAL', 1]
    );

    return {
      id: result.insertId,
      modalidade_id,
      sexo: sexoSafe,
      format,
      format_code: format,
      auto_grouping: 1,
      group_sizes_json: null,
      final_stage_mode: 'SEMIS_FINAL',
      sort_on_knockout_entry: 1,
      rules_json: JSON.stringify({ finalStageMode: 'SEMIS_FINAL', shuffleOnKnockout: true }),
    };
  }

  const rows = await dbQuery(
    `SELECT *
     FROM tournament_format_config
     WHERE organization_id = :org
       AND evento_id = :evento
       AND modalidade_id = :mod
     LIMIT 1`,
    { org: organization_id, evento: evento_id, mod: modalidade_id }
  );
  if (rows.length) return mapLegacyConfig(rows[0]);

  const modalidadeNome = await getModalidadeNome(modalidade_id);
  const format = resolveFormatByModalidadeName(modalidadeNome);
  const rules = {
    finalStageMode: 'SEMIS_FINAL',
    shuffleOnKnockout: true,
  };
  const [result] = await pool.query(
    `INSERT INTO tournament_format_config
      (organization_id, evento_id, modalidade_id, format_code, rules_json)
     VALUES (?,?,?,?,?)`,
    [organization_id, evento_id, modalidade_id, format, JSON.stringify(rules)]
  );

  return mapLegacyConfig({
    id: result.insertId,
    organization_id,
    evento_id,
    modalidade_id,
    format_code: format,
    rules_json: JSON.stringify(rules),
  });
}
