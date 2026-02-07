export async function api(path, options = {}) {
  const res = await fetch(path, { credentials: 'include', ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.mensagem || data?.erro || 'Falha na requisicao';
    throw new Error(msg);
  }
  return data;
}
