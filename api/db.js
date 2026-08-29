const { Pool } = require('pg');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config();

const hashPassword = (password) => crypto.createHash('sha256').update(String(password)).digest('hex');

const databaseUrl = process.env.DATABASE_URL
  || process.env.POSTGRES_URL
  || process.env.PG_URL;

let isPg = Boolean(databaseUrl);
let pool = null;
let sqliteDb = null;

if (isPg) {
  const isLocalhost = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: isLocalhost ? false : { rejectUnauthorized: false },
  });
  console.log('Configured PostgreSQL database client.');
} else {
  console.log('DATABASE_URL not set; using local SQLite engine for development.');
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'sss_local.db');
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  sqliteDb = new sqlite3.Database(dbPath);
}

// Universal query runner supporting PostgreSQL ($1, $2) and SQLite (?, ?)
const executeQuery = async (text, params = []) => {
  if (isPg) {
    const result = await pool.query(text, params);
    return {
      rows: result.rows || [],
      rowCount: result.rowCount || 0,
    };
  }

  // Convert $1, $2 parameter placeholders and expand params accordingly for SQLite
  const matchedParams = [];
  const sqliteQuery = text.replace(/\$(\d+)/g, (_, num) => {
    const idx = parseInt(num, 10) - 1;
    matchedParams.push(params[idx]);
    return '?';
  });

  return new Promise((resolve, reject) => {
    if (/^\s*(SELECT|PRAGMA)/i.test(sqliteQuery)) {
      sqliteDb.all(sqliteQuery, matchedParams, (err, rows) => {
        if (err) reject(err);
        else resolve({ rows: rows || [], rowCount: (rows || []).length });
      });
    } else {
      sqliteDb.run(sqliteQuery, matchedParams, function (err) {
        if (err) reject(err);
        else resolve({ rows: [], rowCount: this.changes, lastID: this.lastID });
      });
    }
  });
};

const get = async (sql, params = []) => {
  const result = await executeQuery(sql, params);
  return result.rows[0] || null;
};

const all = async (sql, params = []) => {
  const result = await executeQuery(sql, params);
  return result.rows || [];
};

const run = async (sql, params = []) => {
  const result = await executeQuery(sql, params);
  return result;
};

const initDb = async () => {
  if (isPg) {
    // PostgreSQL native table schema
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL UNIQUE,
        full_name TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await executeQuery(`
      CREATE TABLE IF NOT EXISTS employers (
        id BIGSERIAL PRIMARY KEY,
        assigned_view TEXT NOT NULL,
        employer_number TEXT NOT NULL,
        employer_name TEXT NOT NULL,
        address TEXT,
        address_line1 TEXT,
        address_country TEXT,
        address_state TEXT,
        address_city TEXT,
        address_barangay TEXT,
        address_postal_code TEXT,
        principal NUMERIC(12, 2) NOT NULL DEFAULT 0,
        penalty NUMERIC(12, 2) NOT NULL DEFAULT 0,
        interest NUMERIC(12, 2) NOT NULL DEFAULT 0,
        total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        billing_date DATE,
        person_received TEXT,
        coverage_date DATE,
        soa_date DATE,
        employee_count INTEGER,
        payment_principal NUMERIC(12, 2),
        payment_interest NUMERIC(12, 2),
        payment_penalty NUMERIC(12, 2),
        payment_total NUMERIC(12, 2),
        soa2_date DATE,
        soa3_date DATE,
        legal_referral_date DATE,
        demand_letter_date DATE,
        demand_letter_received_date DATE,
        handling_lawyer TEXT,
        docket_number TEXT,
        case_date DATE,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await executeQuery(`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        event_date DATE NOT NULL,
        start_time TIME,
        end_time TIME,
        description TEXT,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  } else {
    // SQLite schema
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL UNIQUE,
        full_name TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await executeQuery(`
      CREATE TABLE IF NOT EXISTS employers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        assigned_view TEXT NOT NULL,
        employer_number TEXT NOT NULL,
        employer_name TEXT NOT NULL,
        address TEXT,
        address_line1 TEXT,
        address_country TEXT,
        address_state TEXT,
        address_city TEXT,
        address_barangay TEXT,
        address_postal_code TEXT,
        principal REAL NOT NULL DEFAULT 0,
        penalty REAL NOT NULL DEFAULT 0,
        interest REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL DEFAULT 0,
        billing_date TEXT,
        person_received TEXT,
        coverage_date TEXT,
        soa_date TEXT,
        employee_count INTEGER,
        payment_principal REAL,
        payment_interest REAL,
        payment_penalty REAL,
        payment_total REAL,
        soa2_date TEXT,
        soa3_date TEXT,
        legal_referral_date TEXT,
        demand_letter_date TEXT,
        demand_letter_received_date TEXT,
        handling_lawyer TEXT,
        docket_number TEXT,
        case_date TEXT,
        status TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await executeQuery(`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        event_date TEXT NOT NULL,
        start_time TEXT,
        end_time TEXT,
        description TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  // Seed default users if empty
  const userCount = await get('SELECT COUNT(*) as count FROM users');
  if (Number(userCount?.count || 0) === 0) {
    const seedUsers = [
      {
        id: crypto.randomUUID(),
        email: 'admin@sss.gov.ph',
        username: 'admin',
        full_name: 'Branch Administrator',
        password_hash: hashPassword('admin123'),
        role: 'Admin',
        is_active: isPg ? true : 1,
      },
      {
        id: crypto.randomUUID(),
        email: 'superadmin@sss.gov.ph',
        username: 'superadmin',
        full_name: 'System Super Administrator',
        password_hash: hashPassword('superadmin123'),
        role: 'Super Admin',
        is_active: isPg ? true : 1,
      },
      {
        id: crypto.randomUUID(),
        email: 'ao1@sss.gov.ph',
        username: 'ao1',
        full_name: 'Account Officer 1 (Toledo)',
        password_hash: hashPassword('ao1password'),
        role: 'Account Officer 1',
        is_active: isPg ? true : 1,
      },
      {
        id: crypto.randomUUID(),
        email: 'ao2@sss.gov.ph',
        username: 'ao2',
        full_name: 'Account Officer 2 (Toledo)',
        password_hash: hashPassword('ao2password'),
        role: 'Account Officer 2',
        is_active: isPg ? true : 1,
      },
      {
        id: crypto.randomUUID(),
        email: 'ao3@sss.gov.ph',
        username: 'ao3',
        full_name: 'Account Officer 3 (Toledo)',
        password_hash: hashPassword('ao3password'),
        role: 'Account Officer 3',
        is_active: isPg ? true : 1,
      },
    ];

    for (const u of seedUsers) {
      await executeQuery(
        `INSERT INTO users (id, email, username, full_name, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [u.id, u.email, u.username, u.full_name, u.password_hash, u.role, u.is_active]
      );
    }
    console.log('Seeded default SSS Toledo user accounts.');
  }

  // Seed sample employers if empty
  const empCount = await get('SELECT COUNT(*) as count FROM employers');
  if (Number(empCount?.count || 0) === 0) {
    const sampleEmployers = [
      {
        assigned_view: 'AO1',
        employer_number: '07-1234567-8',
        employer_name: 'Toledo Mining Corporation',
        address: 'Lutopan, Toledo City, Cebu',
        address_line1: 'Lutopan',
        address_country: 'Philippines',
        address_state: 'Cebu',
        address_city: 'Toledo City',
        address_barangay: 'Don Andres Soriano (Lutopan)',
        address_postal_code: '6038',
        principal: 150000.00,
        penalty: 15000.00,
        interest: 7500.00,
        total_amount: 172500.00,
        billing_date: '2026-06-15',
        soa_date: '2026-07-01',
        employee_count: 45,
        status: 'Settled',
        payment_principal: 150000.00,
        payment_interest: 7500.00,
        payment_penalty: 15000.00,
        payment_total: 172500.00,
        person_received: 'John Dela Cruz',
      },
      {
        assigned_view: 'AO1',
        employer_number: '07-2345678-9',
        employer_name: 'Western Cebu Trading Co.',
        address: 'Poblacion, Toledo City, Cebu',
        address_line1: 'Poblacion',
        address_country: 'Philippines',
        address_state: 'Cebu',
        address_city: 'Toledo City',
        address_barangay: 'Poblacion',
        address_postal_code: '6038',
        principal: 85000.00,
        penalty: 8500.00,
        interest: 4250.00,
        total_amount: 97750.00,
        billing_date: '2026-07-10',
        soa_date: '2026-07-25',
        employee_count: 18,
        status: 'Unsettled',
        demand_letter_date: '2026-08-01',
        person_received: 'Maria Santos',
      },
      {
        assigned_view: 'AO2',
        employer_number: '07-3456789-0',
        employer_name: 'Tan & Sons Enterprises',
        address: 'Ibo, Toledo City, Cebu',
        address_line1: 'Ibo',
        address_country: 'Philippines',
        address_state: 'Cebu',
        address_city: 'Toledo City',
        address_barangay: 'Ibo',
        address_postal_code: '6038',
        principal: 120000.00,
        penalty: 12000.00,
        interest: 6000.00,
        total_amount: 138000.00,
        billing_date: '2026-05-20',
        soa_date: '2026-06-05',
        employee_count: 28,
        status: 'Settled',
        payment_principal: 120000.00,
        payment_interest: 6000.00,
        payment_penalty: 12000.00,
        payment_total: 138000.00,
        person_received: 'Robert Tan',
      },
      {
        assigned_view: 'AO2',
        employer_number: '07-4567890-1',
        employer_name: 'Portside Logistics & Cargo',
        address: 'Bato, Toledo City, Cebu',
        address_line1: 'Bato',
        address_country: 'Philippines',
        address_state: 'Cebu',
        address_city: 'Toledo City',
        address_barangay: 'Bato',
        address_postal_code: '6038',
        principal: 210000.00,
        penalty: 21000.00,
        interest: 10500.00,
        total_amount: 241500.00,
        billing_date: '2026-07-02',
        soa_date: '2026-07-18',
        employee_count: 52,
        status: 'Unsettled',
        legal_referral_date: '2026-08-05',
        handling_lawyer: 'Atty. V. Mendoza',
        docket_number: 'SSS-TOL-2026-042',
        person_received: 'Elena Rodriguez',
      },
      {
        assigned_view: 'AO3',
        employer_number: '07-5678901-2',
        employer_name: 'Central Visayas Construction Supply',
        address: 'Matab-ang, Toledo City, Cebu',
        address_line1: 'Matab-ang',
        address_country: 'Philippines',
        address_state: 'Cebu',
        address_city: 'Toledo City',
        address_barangay: 'Matab-ang',
        address_postal_code: '6038',
        principal: 95000.00,
        penalty: 9500.00,
        interest: 4750.00,
        total_amount: 109250.00,
        billing_date: '2026-06-25',
        soa_date: '2026-07-10',
        employee_count: 22,
        status: 'Settled',
        payment_principal: 95000.00,
        payment_interest: 4750.00,
        payment_penalty: 9500.00,
        payment_total: 109250.00,
        person_received: 'Carlos Lim',
      },
      {
        assigned_view: 'AO3',
        employer_number: '07-6789012-3',
        employer_name: 'Toledo Grand Bakeshop',
        address: 'Poblacion, Toledo City, Cebu',
        address_line1: 'Poblacion',
        address_country: 'Philippines',
        address_state: 'Cebu',
        address_city: 'Toledo City',
        address_barangay: 'Poblacion',
        address_postal_code: '6038',
        principal: 42000.00,
        penalty: 4200.00,
        interest: 2100.00,
        total_amount: 48300.00,
        billing_date: '2026-07-15',
        soa_date: '2026-07-30',
        employee_count: 10,
        status: 'Not Yet Registered',
        person_received: 'Anita Gomez',
      },
    ];

    for (const emp of sampleEmployers) {
      const keys = Object.keys(emp);
      const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
      const values = keys.map((k) => emp[k]);
      await executeQuery(`INSERT INTO employers (${keys.join(', ')}) VALUES (${placeholders})`, values);
    }
    console.log('Seeded sample Toledo employers.');
  }

  // Seed sample calendar event if empty
  const calCount = await get('SELECT COUNT(*) as count FROM calendar_events');
  if (Number(calCount?.count || 0) === 0) {
    const today = new Date().toISOString().split('T')[0];
    await executeQuery(
      `INSERT INTO calendar_events (title, event_date, start_time, end_time, description)
       VALUES ($1, $2, $3, $4, $5)`,
      ['Monthly Operations Assessment & Collection Review', today, '09:00', '11:30', 'Review of delinquent employer collectibles and SOA deliveries across AO1, AO2, AO3.']
    );
    console.log('Seeded sample calendar event.');
  }
};

module.exports = {
  isPg,
  pool,
  get,
  all,
  run,
  executeQuery,
  hashPassword,
  initDb,
};
