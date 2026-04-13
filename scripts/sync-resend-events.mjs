import crypto from 'node:crypto';

const env = process.env;

const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'RESEND_API_KEY',
  'GOOGLE_SHEET_ID',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
];

function requireEnv(name) {
  const value = env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function extractDomain(emailOrDomain) {
  const value = normalizeEmail(emailOrDomain);
  if (!value) return null;
  if (!value.includes('@')) return value;
  return value.split('@').pop() || null;
}

function isUnsubscribeIntent(text) {
  const haystack = normalizeText(text);
  return ['unsubscribe', 'remove me', 'stop', 'opt out', 'opt-out'].some((phrase) =>
    haystack.includes(phrase),
  );
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseServiceAccount() {
  const raw = requireEnv('GOOGLE_SERVICE_ACCOUNT_JSON');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must contain valid JSON');
  }
}

async function googleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key);
  const jwt = `${unsigned}.${base64url(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  return json.access_token;
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function supabaseFetch(path, options = {}) {
  const baseUrl = requireEnv('SUPABASE_URL').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: requireEnv('SUPABASE_SECRET_KEY'),
      authorization: `Bearer ${requireEnv('SUPABASE_SECRET_KEY')}`,
      'content-type': 'application/json',
      ...options.headers,
    },
  });
  return response;
}

async function resendFetch(path) {
  const response = await fetch(`https://api.resend.com${path}`, {
    headers: {
      authorization: `Bearer ${requireEnv('RESEND_API_KEY')}`,
      'user-agent': 'services-lead-automation/1.0',
    },
  });
  return response;
}

async function getLatestRunStartedAt() {
  const response = await supabaseFetch(
    'event_sync_runs?select=run_started_at&order=run_started_at.desc&limit=1',
  );
  if (!response.ok) return null;
  const rows = await response.json();
  return rows[0]?.run_started_at || null;
}

let cachedContacts = null;
let cachedBusinesses = null;
let cachedOutreach = null;

async function loadContacts() {
  if (cachedContacts) return cachedContacts;
  const response = await supabaseFetch('contacts?select=id,email,business_id');
  if (!response.ok) throw new Error(`Failed to load contacts: ${response.status} ${await response.text()}`);
  const rows = await response.json();
  cachedContacts = rows;
  return rows;
}

async function loadBusinesses() {
  if (cachedBusinesses) return cachedBusinesses;
  const response = await supabaseFetch('businesses?select=id,domain');
  if (!response.ok) throw new Error(`Failed to load businesses: ${response.status} ${await response.text()}`);
  const rows = await response.json();
  cachedBusinesses = rows;
  return rows;
}

async function loadOutreach() {
  if (cachedOutreach) return cachedOutreach;
  const response = await supabaseFetch(
    'outreach?select=id,business_id,contact_id,status,provider_message_id,sent_at,delivered_at,opened_at,replied_at,bounced_at,unsubscribed_at,last_event_at,campaign_name',
  );
  if (!response.ok) throw new Error(`Failed to load outreach: ${response.status} ${await response.text()}`);
  const rows = await response.json();
  cachedOutreach = rows;
  return rows;
}

async function listResendEmails() {
  const emails = [];
  let after = null;
  for (;;) {
    const query = new URLSearchParams({ limit: '100' });
    if (after) query.set('after', after);
    const response = await resendFetch(`/emails?${query.toString()}`);
    if (!response.ok) {
      throw new Error(`Resend email list failed: ${response.status} ${await response.text()}`);
    }
    const page = await response.json();
    const data = page.data || [];
    emails.push(...data);
    if (!page.has_more || data.length === 0) break;
    after = data[data.length - 1].id;
  }
  return emails;
}

async function findOutreachByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];
  const [outreach, contacts, businesses] = await Promise.all([
    loadOutreach(),
    loadContacts(),
    loadBusinesses(),
  ]);
  const contactsById = new Map(contacts.map((row) => [row.id, row]));
  const businessesById = new Map(businesses.map((row) => [row.id, row]));
  const domain = extractDomain(normalized);
  return outreach.filter((row) => {
    const contactEmail = normalizeEmail(contactsById.get(row.contact_id)?.email);
    const businessDomain = normalizeEmail(businessesById.get(row.business_id)?.domain);
    return contactEmail === normalized || (domain && businessDomain === domain);
  });
}

async function insertSuppression(record) {
  const response = await supabaseFetch('suppression_list', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify(record),
  });
  if (!response.ok) {
    throw new Error(`Suppression insert failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function updateOutreachRow(id, values) {
  const response = await supabaseFetch(`outreach?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(values),
  });
  if (!response.ok) {
    throw new Error(`Outreach update failed for ${id}: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function writeRunSummary(summary) {
  const response = await supabaseFetch('event_sync_runs', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(summary),
  });
  if (!response.ok) {
    throw new Error(`Run summary insert failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function appendSheetRow(accessToken, row) {
  const sheetId = requireEnv('GOOGLE_SHEET_ID');
  const range = encodeURIComponent('Sync Log!A1');
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ values: [row] }),
    },
  );
  if (!response.ok) {
    throw new Error(`Google Sheets append failed: ${response.status} ${await response.text()}`);
  }
}

async function processEmailSnapshot(email, counters, failures) {
  const recipients = Array.isArray(email.to) ? email.to : [];
  const primaryRecipient = recipients[0] || null;
  const lastEvent = normalizeText(email.last_event);
  const matchedRows = primaryRecipient ? await findOutreachByEmail(primaryRecipient) : [];
  if (matchedRows.length === 0) return;

  const timestamp = email.last_event_at || email.updated_at || email.created_at || new Date().toISOString();
  for (const row of matchedRows) {
    const next = {};
    if (email.id && !row.provider_message_id) next.provider_message_id = email.id;
    next.last_event_at = timestamp;

    if (lastEvent === 'delivered') {
      next.status = 'delivered';
      next.delivered_at = timestamp;
      counters.deliveries += 1;
    } else if (lastEvent === 'opened') {
      next.status = 'opened';
      next.opened_at = timestamp;
    } else if (lastEvent === 'replied') {
      next.status = 'replied';
      next.replied_at = timestamp;
      counters.replies += 1;
      await insertSuppression({
        email: primaryRecipient,
        domain: extractDomain(primaryRecipient),
        business_id: row.business_id,
        reason: 'replied',
      });
      counters.suppressions += 1;
    } else if (lastEvent === 'bounced') {
      next.status = 'bounced';
      next.bounced_at = timestamp;
      counters.bounces += 1;
      await insertSuppression({
        email: primaryRecipient,
        domain: extractDomain(primaryRecipient),
        business_id: row.business_id,
        reason: 'hard_bounce',
      });
      counters.suppressions += 1;
    } else {
      continue;
    }

    try {
      await updateOutreachRow(row.id, next);
      counters.outreachUpdates += 1;
    } catch (error) {
      failures.push({ outreach_id: row.id, error: String(error.message || error) });
    }
  }
}

async function processReplyContent(event, counters, failures) {
  const body = event.text || event.body || event.raw_text || event.snippet || '';
  const recipients = Array.isArray(event.to) ? event.to : [];
  const sender = normalizeEmail(event.from?.email || event.from || recipients[0] || '');
  const timestamp = event.created_at || new Date().toISOString();

  if (!sender) return;
  const rows = await findOutreachByEmail(sender);
  if (rows.length === 0) return;

  for (const row of rows) {
    const next = {
      status: 'replied',
      replied_at: timestamp,
      last_event_at: timestamp,
    };

    const suppress = isUnsubscribeIntent(body);
    if (suppress) {
      next.status = 'unsubscribed';
      next.unsubscribed_at = timestamp;
      await insertSuppression({
        email: sender,
        domain: extractDomain(sender),
        business_id: row.business_id,
        reason: 'unsubscribed',
      });
      counters.suppressions += 1;
    } else {
      await insertSuppression({
        email: sender,
        domain: extractDomain(sender),
        business_id: row.business_id,
        reason: 'replied',
      });
      counters.suppressions += 1;
    }

    counters.replies += 1;
    try {
      await updateOutreachRow(row.id, next);
      counters.outreachUpdates += 1;
    } catch (error) {
      failures.push({ outreach_id: row.id, error: String(error.message || error) });
    }
  }
}

async function run() {
  for (const name of REQUIRED_ENV) requireEnv(name);

  const startedAt = new Date().toISOString();
  const cutoff = await getLatestRunStartedAt();
  const emails = await listResendEmails();

  const counters = {
    deliveries: 0,
    bounces: 0,
    replies: 0,
    suppressions: 0,
    outreachUpdates: 0,
    sheetUpdates: 0,
  };
  const failures = [];

  for (const email of emails) {
    if (cutoff && email.created_at && new Date(email.created_at) <= new Date(cutoff)) {
      continue;
    }
    await processEmailSnapshot(email, counters, failures);
  }

  const replyEvents = [];
  if (env.RESEND_REPLY_EVENTS_JSON) {
    try {
      replyEvents.push(...JSON.parse(env.RESEND_REPLY_EVENTS_JSON));
    } catch {
      throw new Error('RESEND_REPLY_EVENTS_JSON must be valid JSON array');
    }
  }
  for (const event of replyEvents) {
    await processReplyContent(event, counters, failures);
  }

  const finishedAt = new Date().toISOString();
  const runRow = {
    source: 'resend',
    run_started_at: startedAt,
    run_finished_at: finishedAt,
    delivery_count: counters.deliveries,
    bounce_count: counters.bounces,
    reply_count: counters.replies,
    suppression_count: counters.suppressions,
    outreach_updated_count: counters.outreachUpdates,
    sheet_updated_count: counters.sheetUpdates,
    failed_updates_count: failures.length,
    failure_details: JSON.stringify(failures),
    notes: cutoff ? `Incremental sync after ${cutoff}` : 'Initial sync',
  };

  const serviceAccount = parseServiceAccount();
  const accessToken = await googleAccessToken(serviceAccount);
  await appendSheetRow(accessToken, [
    finishedAt,
    counters.deliveries,
    counters.bounces,
    counters.replies,
    counters.suppressions,
    counters.outreachUpdates,
    failures.length,
  ]);
  counters.sheetUpdates = 1;
  runRow.sheet_updated_count = counters.sheetUpdates;

  await writeRunSummary(runRow);

  console.log(
    JSON.stringify(
      {
        ok: true,
        startedAt,
        finishedAt,
        counters,
        failures: failures.length,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
