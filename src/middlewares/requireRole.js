export function requireRole(roles = []) {
  const allowed = roles.map((role) => String(role || '').toUpperCase());
  return (req, res, next) => {
    const role = String(req.user?.role || '').toUpperCase();
    if (!role || !allowed.includes(role)) {
      return res.status(403).json({ ok: false, code: 'FORBIDDEN', message: 'Sem permissao.' });
    }
    return next();
  };
}
