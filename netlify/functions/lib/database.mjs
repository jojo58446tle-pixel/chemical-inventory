const JSON_HEADERS = { 'content-type': 'application/json' };

function config(env = process.env) {
  const rawUrl = String(env.DATABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
  const key = String(env.DATABASE_KEY || '').trim();

  if (!rawUrl || !key) {
    throw new Error('DATABASE_URL or DATABASE_KEY is missing');
  }

  let url;

  try {
    url = new URL(rawUrl).origin;
  } catch {
    throw new Error('DATABASE_URL must be a valid Supabase Project URL');
  }

  return {
    url,
    key,
    legacyJwtKey: key.split('.').length === 3
  };
}

async function request(
  path,
  { method = 'GET', body, prefer, env = process.env } = {}
) {
  const { url, key, legacyJwtKey } = config(env);
  const endpoint = `${url}/rest/v1/${path}`;

  const response = await fetch(endpoint, {
    method,
    headers: {
      ...JSON_HEADERS,
      apikey: key,
      ...(legacyJwtKey
        ? { authorization: `Bearer ${key}` }
        : {}),
      ...(prefer ? { prefer } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();

  if (!response.ok) {
    const safePath = new URL(endpoint).pathname;

    throw new Error(
      `Database ${method} failed (${response.status}) at ${safePath}: ${text.slice(0, 400)}`
    );
  }

  return text ? JSON.parse(text) : null;
}

function queryString(params = {}) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, String(value));
    }
  });

  return search.toString();
}

export async function selectRows(table, params = {}, env) {
  const query = queryString({ select: '*', ...params });
  return request(`${table}?${query}`, { env });
}

export async function insertRow(table, row, env) {
  const rows = await request(table, {
    method: 'POST',
    body: row,
    prefer: 'return=representation',
    env
  });

  return rows?.[0];
}

export async function updateRows(table, filters, patch, env) {
  const rows = await request(
    `${table}?${queryString(filters)}`,
    {
      method: 'PATCH',
      body: patch,
      prefer: 'return=representation',
      env
    }
  );

  return rows || [];
}

export async function deleteRows(table, filters, env) {
  return request(
    `${table}?${queryString(filters)}`,
    {
      method: 'DELETE',
      prefer: 'return=representation',
      env
    }
  );
}

export async function upsertRow(
  table,
  row,
  conflictColumn,
  env
) {
  const path =
    `${table}?${queryString({
      on_conflict: conflictColumn
    })}`;

  const rows = await request(path, {
    method: 'POST',
    body: row,
    prefer:
      'resolution=merge-duplicates,return=representation',
    env
  });

  return rows?.[0];
}

export async function upsertRows(
  table,
  rows,
  conflictColumn,
  env
) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const path = `${table}?${queryString({ on_conflict: conflictColumn })}`;
  return request(path, {
    method: 'POST',
    body: rows,
    prefer: 'resolution=merge-duplicates,return=representation',
    env
  }) || [];
}

export async function listNgRecords(
  {
    materialCode,
    source,
    limit = 500,
    fromDate,
    toDate
  } = {},
  env
) {
  return selectRows(
    'ng_records',
    {
      material_code: materialCode
        ? `eq.${materialCode}`
        : undefined,
      source: source ? `eq.${source}` : undefined,
      occurrence_date: fromDate
        ? `gte.${fromDate}`
        : undefined,
      and: toDate
        ? `(occurrence_date.lte.${toDate})`
        : undefined,
      order: 'occurrence_date.desc,created_at.desc',
      limit
    },
    env
  );
}

export async function getNgRecord(id, env) {
  const rows = await selectRows(
    'ng_records',
    { id: `eq.${id}`, limit: 1 },
    env
  );

  return rows[0] || null;
}

export async function getRiskEventByRecord(id, env) {
  const rows = await selectRows(
    'risk_events',
    {
      ng_record_id: `eq.${id}`,
      limit: 1
    },
    env
  );

  return rows[0] || null;
}

export async function listRiskEvents(
  {
    materialCode,
    normalizedDefect,
    limit = 500
  } = {},
  env
) {
  return selectRows(
    'risk_events',
    {
      material_code: materialCode
        ? `eq.${materialCode}`
        : undefined,
      normalized_defect: normalizedDefect
        ? `eq.${normalizedDefect}`
        : undefined,
      order: 'created_at.desc',
      limit
    },
    env
  );
}

export async function getRecommendationForRisk(
  riskEventId,
  env
) {
  const rows = await selectRows(
    'ai_recommendations',
    {
      risk_event_id: `eq.${riskEventId}`,
      order: 'created_at.desc',
      limit: 1
    },
    env
  );

  return rows[0] || null;
}

export async function getSuccessfulAlert(
  fingerprint,
  env
) {
  const rows = await selectRows(
    'alert_history',
    {
      alert_fingerprint: `eq.${fingerprint}`,
      status: 'eq.SUCCESS',
      limit: 1
    },
    env
  );

  return rows[0] || null;
}
