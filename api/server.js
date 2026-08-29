const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
require('dotenv').config();

const { isPg, get, all, run, executeQuery, hashPassword, initDb } = require('./db');

const app = express();
const APP_SESSION_SECRET = process.env.APP_SESSION_SECRET || 'sss-local-dev-secret-change-me';
const RBAC_ALLOWED_ROLES = ['Super Admin', 'Admin', 'Account Officer 1', 'Account Officer 2', 'Account Officer 3'];

const signAppToken = (payload) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'sss-rbac' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', APP_SESSION_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
};

const verifyAppToken = (token) => {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', APP_SESSION_SECRET).update(`${header}.${body}`).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || !payload.userId || !payload.role) return null;
    if (payload.expiresAt && Number(payload.expiresAt) < Date.now()) return null;
    return payload;
  } catch (_error) {
    return null;
  }
};

const normalizeRole = (role) => String(role || '')
  .replace(/^Assistant Officer ([1-3])$/, 'Account Officer $1')
  .replace(/^Account Assistant ([1-3])$/, 'Account Officer $1');

const officerViewForRole = (role) => {
  const normalizedRole = normalizeRole(role);
  return /^Account Officer [1-3]$/.test(normalizedRole)
    ? normalizedRole.replace('Account Officer ', 'AO')
    : null;
};

const validateRbacLogin = (profile, allowedRoles = RBAC_ALLOWED_ROLES) => {
  if (!profile) return { valid: false, code: 'ACCOUNT_NOT_FOUND' };
  if (profile.is_active === false || profile.isActive === false || profile.is_active === 0) {
    return { valid: false, code: 'ACCOUNT_INACTIVE' };
  }

  const role = normalizeRole(profile.role || profile.user_role || null);
  if (!role) return { valid: false, code: 'ROLE_NOT_FOUND' };
  if (!allowedRoles.includes(role)) return { valid: false, code: 'ROLE_NOT_ALLOWED' };

  return { valid: true, role };
};

const findUserByLoginIdentifier = async (loginIdentifier) => {
  const normalized = String(loginIdentifier || '').trim().toLowerCase();
  if (!normalized) return null;
  return get('SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $1', [normalized]);
};

app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// Health check
app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', database: isPg ? 'postgresql' : 'sqlite' });
});

// Authentication / Login
app.post('/api/auth/login', async (request, response) => {
  const loginIdentifier = String(request.body?.email || request.body?.username || '').trim();
  const password = String(request.body?.password || '');
  if (!loginIdentifier || !password) {
    return response.status(400).json({ error: 'Email/username and password are required.' });
  }

  let userRecord;
  try {
    userRecord = await findUserByLoginIdentifier(loginIdentifier);
  } catch (userError) {
    console.error('User lookup error:', userError);
    return response.status(500).json({ error: 'Unable to verify account access.' });
  }

  const isAccountAssistant = /^Account Assistant [1-3]$/.test(String(userRecord?.role || ''));
  const validation = validateRbacLogin(userRecord, RBAC_ALLOWED_ROLES);
  if (!validation.valid) {
    const accountErrors = {
      ACCOUNT_NOT_FOUND: 'No active account was found for that username/email.',
      ACCOUNT_INACTIVE: 'This account is inactive and cannot sign in.',
      ROLE_NOT_FOUND: 'This account does not have a valid access role.',
      ROLE_NOT_ALLOWED: 'This account does not have permission to access this system.',
    };

    return response.status(validation.code === 'ACCOUNT_NOT_FOUND' ? 401 : 403).json({
      error: accountErrors[validation.code] || 'Access denied.',
      code: validation.code,
    });
  }

  userRecord.role = validation.role;

  if (!userRecord.password_hash || hashPassword(password) !== userRecord.password_hash) {
    return response.status(401).json({ error: 'Invalid email or password.' });
  }

  const accessToken = signAppToken({
    userId: userRecord.id,
    email: userRecord.email,
    username: userRecord.username,
    role: userRecord.role,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
  });

  return response.json({
    user: {
      id: userRecord.id,
      email: userRecord.email,
      username: userRecord.username || userRecord.email,
      role: userRecord.role,
      isAccountAssistant,
      accessToken,
    },
  });
});

const requireSuperAdmin = async (request, response) => {
  const authorization = request.headers.authorization || '';
  const accessToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  if (!accessToken) {
    response.status(401).json({ error: 'Authentication is required.' });
    return null;
  }

  const payload = verifyAppToken(accessToken);
  if (!payload || payload.role !== 'Super Admin') {
    response.status(403).json({ error: 'Super Admin access is required.' });
    return null;
  }

  return payload;
};

const requireAuthenticatedUser = async (request, response) => {
  const authorization = request.headers.authorization || '';
  const accessToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  const payload = verifyAppToken(accessToken);
  if (payload && RBAC_ALLOWED_ROLES.includes(normalizeRole(payload.role))) {
    return payload;
  }

  response.status(401).json({ error: 'Authentication is required.' });
  return null;
};

// Users list (Super Admin only)
app.get('/api/users', async (request, response) => {
  if (!(await requireSuperAdmin(request, response))) return;

  try {
    const users = await all(
      'SELECT id, username, email, full_name, role, is_active FROM users ORDER BY role ASC, full_name ASC'
    );
    return response.json(users);
  } catch (error) {
    console.error('Error loading users:', error);
    return response.status(500).json({ error: 'Unable to load user accounts.' });
  }
});

// Calendar Events
app.get('/api/calendar-events', async (request, response) => {
  if (!(await requireAuthenticatedUser(request, response))) return;

  try {
    const events = await all(
      'SELECT id, title, event_date, start_time, end_time, description, created_by, created_at FROM calendar_events ORDER BY event_date ASC, start_time ASC'
    );
    return response.json(events);
  } catch (error) {
    console.error('Error loading calendar events:', error);
    return response.status(500).json({ error: 'Unable to load calendar events.' });
  }
});

app.post('/api/calendar-events', async (request, response) => {
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;

  const submittedEvent = request.body || {};
  const event = {
    title: String(submittedEvent.title || '').trim(),
    event_date: submittedEvent.date,
    start_time: submittedEvent.startTime || null,
    end_time: submittedEvent.endTime || null,
    description: String(submittedEvent.description || '').trim() || null,
    created_by: user.userId,
  };

  if (!event.title || !event.event_date) {
    return response.status(400).json({ error: 'Valid event title and date are required.' });
  }
  if ((event.start_time && !event.end_time) || (!event.start_time && event.end_time)
    || (event.start_time && event.end_time && event.end_time <= event.start_time)) {
    return response.status(400).json({ error: 'Both event times are required when specifying a time range.' });
  }

  try {
    if (isPg) {
      const created = await get(
        `INSERT INTO calendar_events (title, event_date, start_time, end_time, description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [event.title, event.event_date, event.start_time, event.end_time, event.description, event.created_by]
      );
      return response.status(201).json(created);
    } else {
      const result = await run(
        `INSERT INTO calendar_events (title, event_date, start_time, end_time, description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [event.title, event.event_date, event.start_time, event.end_time, event.description, event.created_by]
      );
      const created = await get('SELECT * FROM calendar_events WHERE id = $1', [result.lastID]);
      return response.status(201).json(created);
    }
  } catch (error) {
    console.error('Error saving calendar event:', error);
    return response.status(500).json({ error: 'Unable to save calendar event.' });
  }
});

// Employers List
app.get('/api/employers', async (request, response) => {
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;

  try {
    const officerView = officerViewForRole(user.role);
    let employers;
    if (officerView) {
      employers = await all('SELECT * FROM employers WHERE assigned_view = $1 ORDER BY created_at ASC', [officerView]);
    } else {
      employers = await all('SELECT * FROM employers ORDER BY created_at ASC');
    }
    return response.json(employers);
  } catch (error) {
    console.error('Error loading employers:', error);
    return response.status(500).json({ error: 'Unable to load employers.' });
  }
});

// Employer Summary
app.get('/api/employer-summary', async (request, response) => {
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;

  try {
    const data = await all('SELECT assigned_view, status, total_amount FROM employers');

    const summary = ['AO1', 'AO2', 'AO3'].reduce((result, viewName) => {
      const employers = (data || []).filter((employer) => employer.assigned_view === viewName);
      const settled = employers.filter((employer) => employer.status?.toLowerCase() === 'settled').length;
      const unsettled = employers.filter((employer) => employer.status?.toLowerCase() === 'unsettled').length;
      const registered = employers.filter((employer) => ['registed', 'registered'].includes(employer.status?.toLowerCase())).length;
      const unregistered = employers.filter((employer) => ['not yet registered', 'unregistered'].includes(employer.status?.toLowerCase())).length;
      const billed = employers.reduce((total, employer) => total + Number(employer.total_amount || 0), 0);
      const settledAmount = employers
        .filter((employer) => employer.status?.toLowerCase() === 'settled')
        .reduce((total, employer) => total + Number(employer.total_amount || 0), 0);
      const unsettledAmount = employers
        .filter((employer) => employer.status?.toLowerCase() === 'unsettled')
        .reduce((total, employer) => total + Number(employer.total_amount || 0), 0);

      result[viewName] = {
        total: employers.length,
        settled,
        unsettled,
        completion: `${employers.length ? ((settled / employers.length) * 100).toFixed(2) : '0.00'}%`,
        billed: billed.toFixed(2),
        settledAmount: settledAmount.toFixed(2),
        unsettledAmount: unsettledAmount.toFixed(2),
        registered,
        unregistered,
      };
      return result;
    }, {});

    return response.json(summary);
  } catch (error) {
    console.error('Error loading employer summary:', error);
    return response.status(500).json({ error: 'Unable to load employer summary.' });
  }
});

// Add Employer
app.post('/api/employers', async (request, response) => {
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;

  const employer = { ...request.body };
  const officerView = officerViewForRole(user.role);
  if (officerView && employer.assigned_view !== officerView) {
    return response.status(403).json({ error: `Account Assistant access is limited to ${officerView}.` });
  }
  const requiredFields = ['assigned_view', 'employer_number', 'employer_name', 'status'];

  if (requiredFields.some((field) => !employer[field])) {
    return response.status(400).json({ error: 'Missing required employer fields.' });
  }

  const employerFields = [
    'assigned_view', 'employer_number', 'employer_name', 'address', 'address_line1', 'address_country', 'address_state',
    'address_city', 'address_barangay', 'address_postal_code', 'principal', 'penalty', 'interest', 'total_amount',
    'billing_date', 'coverage_date', 'soa_date', 'employee_count', 'payment_principal', 'payment_interest',
    'payment_penalty', 'payment_total', 'soa2_date', 'soa3_date', 'legal_referral_date', 'demand_letter_date',
    'demand_letter_received_date', 'person_received', 'handling_lawyer', 'docket_number', 'case_date', 'status',
  ];

  const presentFields = employerFields.filter((field) => Object.prototype.hasOwnProperty.call(employer, field));
  const placeholders = presentFields.map((_, index) => `$${index + 1}`).join(', ');
  const values = presentFields.map((field) => employer[field]);

  try {
    if (isPg) {
      const created = await get(
        `INSERT INTO employers (${presentFields.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        values
      );
      return response.status(201).json(created);
    } else {
      const result = await run(
        `INSERT INTO employers (${presentFields.join(', ')}) VALUES (${placeholders})`,
        values
      );
      const created = await get('SELECT * FROM employers WHERE id = $1', [result.lastID]);
      return response.status(201).json(created);
    }
  } catch (error) {
    console.error('Error inserting employer:', error);
    return response.status(500).json({ error: 'Unable to save employer.' });
  }
});

// Update Employer
app.patch('/api/employers', async (request, response) => {
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;

  const id = Number(request.body?.id);
  const submittedEmployer = request.body?.employer;
  if (!Number.isInteger(id) || !submittedEmployer || !submittedEmployer.employer_number || !submittedEmployer.employer_name || !submittedEmployer.status) {
    return response.status(400).json({ error: 'Valid employer data is required.' });
  }

  const officerView = officerViewForRole(user.role);
  const existing = await get('SELECT * FROM employers WHERE id = $1', [id]);
  if (!existing || (officerView && existing.assigned_view !== officerView)) {
    return response.status(404).json({ error: 'Employer was not found in your assigned view.' });
  }

  const employerFields = [
    'employer_number', 'employer_name', 'address', 'address_line1', 'address_country', 'address_state',
    'address_city', 'address_barangay', 'address_postal_code', 'principal', 'penalty', 'interest', 'total_amount',
    'billing_date', 'coverage_date', 'soa_date', 'employee_count', 'payment_principal', 'payment_interest',
    'payment_penalty', 'payment_total', 'soa2_date', 'soa3_date', 'legal_referral_date', 'demand_letter_date',
    'demand_letter_received_date', 'person_received', 'handling_lawyer', 'docket_number', 'case_date', 'status',
  ];

  const updateFields = employerFields.filter((field) => Object.prototype.hasOwnProperty.call(submittedEmployer, field));
  if (updateFields.length === 0) {
    return response.json(existing);
  }

  const setClause = updateFields.map((field, idx) => `${field} = $${idx + 1}`).join(', ');
  const values = [...updateFields.map((field) => submittedEmployer[field]), id];

  try {
    if (isPg) {
      const updated = await get(
        `UPDATE employers SET ${setClause} WHERE id = $${values.length} RETURNING *`,
        values
      );
      return response.json(updated);
    } else {
      await run(`UPDATE employers SET ${setClause} WHERE id = $${values.length}`, values);
      const updated = await get('SELECT * FROM employers WHERE id = $1', [id]);
      return response.json(updated);
    }
  } catch (error) {
    console.error('Error updating employer:', error);
    return response.status(500).json({ error: 'Unable to update employer.' });
  }
});

// Delete Employers
app.delete('/api/employers', async (request, response) => {
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;

  const ids = Array.isArray(request.body?.ids) ? request.body.ids : [];
  if (!ids.length || ids.some((id) => !Number.isInteger(Number(id)))) {
    return response.status(400).json({ error: 'Valid employer IDs are required.' });
  }

  const officerView = officerViewForRole(user.role);
  const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(', ');

  try {
    if (officerView) {
      await run(
        `DELETE FROM employers WHERE id IN (${placeholders}) AND assigned_view = $${ids.length + 1}`,
        [...ids.map(Number), officerView]
      );
    } else {
      await run(`DELETE FROM employers WHERE id IN (${placeholders})`, ids.map(Number));
    }
    return response.status(204).send();
  } catch (error) {
    console.error('Error deleting employers:', error);
    return response.status(500).json({ error: 'Unable to delete employers.' });
  }
});

module.exports = app;
module.exports.validateRbacLogin = validateRbacLogin;

if (require.main === module) {
  const port = Number(process.env.PORT) || 3002;
  initDb().then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`SSS Toledo Operations Dashboard running at http://localhost:${port}`);
    });
  }).catch((err) => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });
}
