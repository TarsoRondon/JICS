import bcrypt from 'bcrypt';
import { dbQuery } from '../db/conn.js';

const SALT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

export async function findAdminByEmail(orgId, email) {
  const rows = await dbQuery(
    `SELECT id, organization_id, nome, email, senha_hash, role, ativo, criado_em
     FROM admins
     WHERE organization_id = :orgId AND LOWER(email) = LOWER(:email)
     LIMIT 1`,
    { orgId, email }
  );
  return rows[0] || null;
}

export async function findAdminByEmailGlobal(email) {
  return dbQuery(
    `SELECT id, organization_id, nome, email, senha_hash, role, ativo, criado_em
     FROM admins
     WHERE LOWER(email) = LOWER(:email)`,
    { email }
  );
}

export async function getAdminById(id) {
  const rows = await dbQuery(
    `SELECT id, organization_id, nome, email, role, ativo, criado_em
     FROM admins
     WHERE id = :id
     LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

export async function getAdminWithHashById(id) {
  const rows = await dbQuery(
    `SELECT id, organization_id, nome, email, senha_hash, role, ativo, criado_em
     FROM admins
     WHERE id = :id
     LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

export async function listAdmins(orgId) {
  return dbQuery(
    `SELECT id, organization_id, nome, email, role, ativo, criado_em
     FROM admins
     WHERE organization_id = :orgId
     ORDER BY criado_em DESC`,
    { orgId }
  );
}

export async function createAdmin({ organization_id, nome, email, senha, role }) {
  const senha_hash = await bcrypt.hash(senha, SALT_ROUNDS);
  const result = await dbQuery(
    `INSERT INTO admins (organization_id, nome, email, senha_hash, role)
     VALUES (:organization_id, :nome, :email, :senha_hash, :role)`,
    { organization_id, nome, email, senha_hash, role }
  );
  return result.insertId;
}

export async function updateAdmin(id, updates) {
  const fields = [];
  const params = { id };

  if (updates.nome !== undefined) { fields.push('nome = :nome'); params.nome = updates.nome; }
  if (updates.email !== undefined) { fields.push('email = :email'); params.email = updates.email; }
  if (updates.role !== undefined) { fields.push('role = :role'); params.role = updates.role; }
  if (updates.senha !== undefined) {
    params.senha_hash = await bcrypt.hash(updates.senha, SALT_ROUNDS);
    fields.push('senha_hash = :senha_hash');
  }

  if (fields.length === 0) return 0;

  const result = await dbQuery(
    `UPDATE admins SET ${fields.join(', ')} WHERE id = :id`,
    params
  );
  return result.affectedRows || 0;
}

export async function setAdminActive(id, ativo) {
  const result = await dbQuery(
    `UPDATE admins SET ativo = :ativo WHERE id = :id`,
    { id, ativo: ativo ? 1 : 0 }
  );
  return result.affectedRows || 0;
}

export async function deleteAdmin(id) {
  const result = await dbQuery('DELETE FROM admins WHERE id = :id', { id });
  return result.affectedRows || 0;
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

