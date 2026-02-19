import { pool, dbQuery } from '../db/conn.js';
import { shuffle } from '../utils/shuffle.util.js';

let cachedGroupTeamsColumns = null;

async function getGroupTeamsColumns() {
  if (cachedGroupTeamsColumns) return cachedGroupTeamsColumns;
  const rows = await dbQuery(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'group_teams'`
  );
  cachedGroupTeamsColumns = new Set(rows.map(r => r.COLUMN_NAME));
  return cachedGroupTeamsColumns;
}

function getLabelColumn(cols) {
  if (cols.has('equipe_nome')) return 'equipe_nome';
  return 'team_label';
}

export async function createGroups(stageId, names) {
  const groups = [];
  for (const name of names) {
    const [result] = await pool.query(
      'INSERT INTO groups (stage_id, nome) VALUES (?, ?)',
      [stageId, name]
    );
    groups.push({ id: result.insertId, stage_id: stageId, nome: name });
  }
  return groups;
}

export async function assignTeamsToGroups(groups, teams, sizes) {
  const cols = await getGroupTeamsColumns();
  const labelCol = getLabelColumn(cols);
  const hasSeed = cols.has('seed');
  const hasId = cols.has('id');
  const shuffled = shuffle(teams);
  let cursor = 0;
  const assignments = [];
  for (let i = 0; i < groups.length; i += 1) {
    const size = sizes[i];
    const groupTeams = shuffled.slice(cursor, cursor + size);
    cursor += size;
    for (const team of groupTeams) {
      const fields = ['group_id', labelCol];
      const values = [groups[i].id, team.label];
      if (hasSeed) {
        fields.push('seed');
        values.push(team.seed || null);
      }
      const [result] = await pool.query(
        `INSERT INTO group_teams (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
        values
      );
      assignments.push({
        ...(hasId ? { id: result.insertId } : {}),
        group_id: groups[i].id,
        team_label: team.label,
        seed: team.seed || null,
      });
    }
  }
  return assignments;
}

export async function listGroupsByStageIds(stageIds) {
  if (!stageIds.length) return [];
  return dbQuery(
    `SELECT * FROM groups WHERE stage_id IN (${stageIds.map(() => '?').join(',')}) ORDER BY id ASC`,
    stageIds
  );
}

export async function listGroupTeamsByGroupIds(groupIds) {
  if (!groupIds.length) return [];
  const cols = await getGroupTeamsColumns();
  const orderCol = cols.has('id') ? 'id' : getLabelColumn(cols);
  return dbQuery(
    `SELECT * FROM group_teams WHERE group_id IN (${groupIds.map(() => '?').join(',')}) ORDER BY ${orderCol} ASC`,
    groupIds
  );
}
