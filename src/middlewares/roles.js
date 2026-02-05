export function requireRole(allowed = []) {
  const allowedSet = new Set(allowed);
  return (req, res, next) => {
    const role = req.admin?.role;
    if (!role || !allowedSet.has(role)) {
      return res.status(403).json({ sucesso: false, erro: { mensagem: 'Permissao negada.' } });
    }
    return next();
  };
}

