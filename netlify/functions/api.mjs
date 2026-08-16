import ExcelJS from 'exceljs';
import { getStore } from '@netlify/blobs';
import { ZodError } from 'zod';
import { clearSessionCookie, createSession, sessionCookie, sessionFromRequest, verifyPassword } from './lib/auth.mjs';
import { getAdminRecords, createNgRecord, deleteNgRecord, getPublicRisk, regenerateRecommendation, updateNgRecord } from './lib/ng-service.mjs';
import { loginSchema, parseNgRecord } from './lib/validation.mjs';
import { RISK_ENGINE_VERSION } from './lib/risk-engine.mjs';

const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()'
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...headers }
  });
}

async function readJson(request, maxBytes = 3_000_000) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new Error('Request body is too large');
  return request.json();
}

function routePath(request) {
  return new URL(request.url).pathname
    .replace(/^\/\.netlify\/functions\/api/, '')
    .replace(/^\/api/, '') || '/';
}

function requireAdmin(request, env) {
  const session = sessionFromRequest(request, env);
  if (!session) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  return session;
}

function parseDataUrl(value) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(value || '');
  if (!match) throw new Error('Only JPEG, PNG, or WEBP images are supported');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 1_500_000) throw new Error('Each image must be 1.5 MB or smaller');
  return { contentType: match[1], bytes };
}

async function uploadImage(body) {
  const { contentType, bytes } = parseDataUrl(body.dataUrl);
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[contentType];
  const key = `${crypto.randomUUID()}.${extension}`;
  const store = getStore('iqc-risk-images');
  await store.set(key, bytes, { metadata: { contentType } });
  return { url: `/api/images/${key}` };
}

async function serveImage(key) {
  if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(key)) return json({ error: 'Invalid image key' }, 400);
  const result = await getStore('iqc-risk-images').getWithMetadata(key, { type: 'arrayBuffer' });
  if (!result) return json({ error: 'Image not found' }, 404);
  return new Response(result.data, {
    headers: {
      'content-type': result.metadata?.contentType || 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
      ...SECURITY_HEADERS
    }
  });
}

async function exportWorkbook(env) {
  const rows = await getAdminRecords(env);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IQC Risk Assessment System';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('NG Risk Export', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Date', key: 'date', width: 13 },
    { header: 'Source', key: 'source', width: 13 },
    { header: 'Material Code', key: 'material', width: 18 },
    { header: 'Supplier', key: 'supplier', width: 32 },
    { header: 'Lot ID', key: 'lot', width: 16 },
    { header: 'PO', key: 'po', width: 16 },
    { header: 'Defect Category', key: 'category', width: 22 },
    { header: 'Defect', key: 'defect', width: 28 },
    { header: 'Detail', key: 'detail', width: 55 },
    { header: 'Level', key: 'level', width: 12 },
    { header: 'NG Qty (PCS)', key: 'qty', width: 14 },
    { header: 'Risk', key: 'risk', width: 12 },
    { header: 'Risk Trigger', key: 'trigger', width: 24 },
    { header: 'Frequency Count (Batch/Occurrence)', key: 'occurrences', width: 30 },
    { header: 'Accum. NG Qty (PCS) - Impact Only', key: 'repeatQty', width: 31 },
    { header: 'Window (Days)', key: 'window', width: 15 },
    { header: 'Risk Reason', key: 'reason', width: 55 },
    { header: 'AI Status', key: 'aiStatus', width: 14 },
    { header: 'Control Areas', key: 'areas', width: 55 },
    { header: 'Recommended Supplier Attention', key: 'recommendation', width: 70 }
  ];
  for (const item of rows) {
    sheet.addRow({
      date: item.record.occurrence_date,
      source: item.record.source,
      material: item.record.material_code,
      supplier: item.record.supplier,
      lot: item.record.lot_id || '',
      po: item.record.po_number || '',
      category: item.record.defect_category,
      defect: item.record.defect_description,
      detail: item.record.detail,
      level: item.record.defect_level,
      qty: item.record.ng_quantity,
      risk: item.risk?.risk_level || '',
      trigger: item.risk?.risk_trigger || '',
      occurrences: item.risk?.repeat_occurrences || '',
      repeatQty: item.risk?.repeat_qty || '',
      window: item.risk?.window_days || '',
      reason: item.risk?.risk_reason || '',
      aiStatus: item.recommendation?.status || '',
      areas: (item.recommendation?.control_areas || []).map((area) => `${area.priority}. ${area.area}`).join('\n'),
      recommendation: (item.recommendation?.supplier_recommendation || []).map((text) => `• ${text}`).join('\n')
    });
  }
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B4A6F' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.autoFilter = { from: 'A1', to: 'T1' };
  sheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: true };
    if (rowNumber > 1 && rowNumber % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F7FA' } };
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="IQC_Risk_Export_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      ...SECURITY_HEADERS
    }
  });
}

export default async (request) => {
  const env = process.env;
  const path = routePath(request);
  const method = request.method.toUpperCase();

  try {
    if (method === 'GET' && path === '/health') return json({ status: 'ok', riskEngine: RISK_ENGINE_VERSION, promptVersion: 'V1' });

    if (method === 'POST' && path === '/auth/login') {
      const input = loginSchema.parse(await readJson(request, 20_000));
      if (!verifyPassword(input.password, env)) return json({ error: 'Invalid password' }, 401);
      const token = createSession(env);
      return json({ authenticated: true, username: 'admin' }, 200, { 'set-cookie': sessionCookie(token, request) });
    }

    if (method === 'POST' && path === '/auth/logout') {
      return json({ authenticated: false }, 200, { 'set-cookie': clearSessionCookie(request) });
    }

    if (method === 'GET' && path === '/auth/me') {
      const session = sessionFromRequest(request, env);
      return session ? json({ authenticated: true, username: session.sub }) : json({ authenticated: false }, 401);
    }

    if (method === 'GET' && path === '/public/risk') {
      const materialCode = (new URL(request.url).searchParams.get('materialCode') || '').trim();
      if (materialCode.length < 2) return json({ error: 'Material Code is required' }, 400);
      const rows = await getPublicRisk(materialCode, env);
      return json({ rows });
    }

    if (method === 'GET' && path.startsWith('/images/')) return serveImage(path.slice('/images/'.length));

    const session = requireAdmin(request, env);

    if (method === 'GET' && path === '/records') return json({ rows: await getAdminRecords(env) });

    if (method === 'POST' && path === '/records') {
      const input = parseNgRecord(await readJson(request));
      return json(await createNgRecord(input, session.sub, env), 201);
    }

    const recordMatch = /^\/records\/([a-f0-9-]+)$/.exec(path);
    if (recordMatch && method === 'PUT') {
      const input = parseNgRecord(await readJson(request));
      return json(await updateNgRecord(recordMatch[1], input, session.sub, env));
    }
    if (recordMatch && method === 'DELETE') return json(await deleteNgRecord(recordMatch[1], session.sub, env));

    const aiMatch = /^\/ai\/([a-f0-9-]+)\/regenerate$/.exec(path);
    if (aiMatch && method === 'POST') return json({ recommendation: await regenerateRecommendation(aiMatch[1], env) });

    if (method === 'POST' && path === '/images') return json(await uploadImage(await readJson(request)), 201);
    if (method === 'GET' && path === '/export.xlsx') return exportWorkbook(env);

    return json({ error: 'Not found' }, 404);
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) return json({ error: 'Validation failed', details: error.issues }, 400);
    const status = error.status || (String(error.message).includes('not found') ? 404 : 500);
    return json({ error: status === 500 ? 'The request could not be completed' : error.message }, status);
  }
};
