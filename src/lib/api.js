async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers
    }
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const error = new Error(payload?.error || 'Request failed');
    error.status = response.status;
    error.details = payload?.details;
    throw error;
  }
  return payload;
}

export const api = {
  me: () => request('/auth/me'),
  login: (password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  publicRisk: (materialCode) => request(`/public/risk?materialCode=${encodeURIComponent(materialCode)}`),
  records: () => request('/records'),
  createRecord: (data) => request('/records', { method: 'POST', body: JSON.stringify(data) }),
  updateRecord: (id, data) => request(`/records/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRecord: (id) => request(`/records/${id}`, { method: 'DELETE' }),
  regenerateAI: (riskEventId) => request(`/ai/${riskEventId}/regenerate`, { method: 'POST' }),
  uploadImage: (dataUrl) => request('/images', { method: 'POST', body: JSON.stringify({ dataUrl }) })
};
