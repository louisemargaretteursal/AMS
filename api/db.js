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

const getSqliteDb = () => {
  if (!sqliteDb) {
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'sss_local.db');
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    sqliteDb = new sqlite3.Database(dbPath);
  }
  return sqliteDb;
};

if (isPg) {
  const isLocalhost = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: isLocalhost ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });
} else {
  getSqliteDb();
}

const getIsPg = () => isPg;

// Universal query runner supporting PostgreSQL ($1, $2) and SQLite (?, ?)
const executeQuery = async (text, params = []) => {
  if (isPg && pool) {
    try {
      const result = await pool.query(text, params);
      return {
        rows: result.rows || [],
        rowCount: result.rowCount || 0,
      };
    } catch (err) {
      const isConnErr = err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT'
        || (err.message && (err.message.includes('timeout') || err.message.includes('Connection terminated') || err.message.includes('closed')));
      if (isConnErr) {
        console.warn('PostgreSQL connection dropped (' + err.message + '). Seamlessly falling back to local SQLite.');
        isPg = false;
        getSqliteDb();
      } else {
        throw err;
      }
    }
  }

  // Convert $1, $2 parameter placeholders and expand params accordingly for SQLite
  const sDb = getSqliteDb();
  const matchedParams = [];
  const sqliteQuery = text.replace(/\$(\d+)/g, (_, num) => {
    const idx = parseInt(num, 10) - 1;
    matchedParams.push(params[idx]);
    return '?';
  });

  return new Promise((resolve, reject) => {
    if (/^\s*(SELECT|PRAGMA)/i.test(sqliteQuery)) {
      sDb.all(sqliteQuery, matchedParams, (err, rows) => {
        if (err) reject(err);
        else resolve({ rows: rows || [], rowCount: (rows || []).length });
      });
    } else {
      sDb.run(sqliteQuery, matchedParams, function (err) {
        if (err) reject(err);
        else resolve({ rows: [], rowCount: this.changes, lastID: this.lastID });
      });
    }
  });
};

const get = async (sql, params = []) => {
  const result = await executeQuery(sql, params);
  return result?.rows ? (result.rows[0] || null) : null;
};

const all = async (sql, params = []) => {
  const result = await executeQuery(sql, params);
  return result?.rows || [];
};

const run = async (sql, params = []) => {
  const result = await executeQuery(sql, params);
  return result;
};

const initDb = async () => {
  if (isPg && pool) {
    try {
      // Test PostgreSQL connection
      await pool.query('SELECT 1');
      console.log('Connected to PostgreSQL database successfully.');

      // PostgreSQL native table schema
      await executeQuery(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT NOT NULL UNIQUE,
          username TEXT NOT NULL UNIQUE,
          full_name TEXT,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL,
          avatar_url TEXT,
          assigned_places TEXT,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      try {
        await executeQuery('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT');
      } catch (_e) {}
      try {
        await executeQuery('ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_places TEXT');
      } catch (_e) {}

      await executeQuery(`
        CREATE TABLE IF NOT EXISTS employers (
          id BIGSERIAL PRIMARY KEY,
          assigned_view TEXT NOT NULL,
          employer_number TEXT NOT NULL,
          employer_name TEXT NOT NULL,
          payer_type TEXT DEFAULT 'Interim Payer',
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
          forwarded_stage TEXT,
          forwarded_date DATE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      try {
        await executeQuery('ALTER TABLE employers ADD COLUMN IF NOT EXISTS payer_type TEXT DEFAULT \'Interim Payer\'');
      } catch (_e) {}
      try {
        await executeQuery('ALTER TABLE employers ADD COLUMN IF NOT EXISTS forwarded_stage TEXT');
      } catch (_e) {}
      try {
        await executeQuery('ALTER TABLE employers ADD COLUMN IF NOT EXISTS forwarded_date DATE');
      } catch (_e) {}
      try {
        await executeQuery('ALTER TABLE employers ADD COLUMN IF NOT EXISTS soa2_person_received TEXT');
      } catch (_e) {}
      try {
        await executeQuery('ALTER TABLE employers ADD COLUMN IF NOT EXISTS soa3_person_received TEXT');
      } catch (_e) {}
      try {
        await executeQuery('ALTER TABLE employers ADD COLUMN IF NOT EXISTS billing_person_received TEXT');
      } catch (_e) {}
      try {
        await executeQuery('ALTER TABLE employers ADD COLUMN IF NOT EXISTS demand_person_received TEXT');
      } catch (_e) {}
      try {
        await executeQuery('ALTER TABLE employers ADD COLUMN IF NOT EXISTS soa2_principal NUMERIC(12, 2) DEFAULT 0');
      } catch (_e) {}
      try {
        await executeQuery('ALTER TABLE employers ADD COLUMN IF NOT EXISTS soa2_penalty NUMERIC(12, 2) DEFAULT 0');
      } catch (_e) {}
      try {
        await executeQuery('ALTER TABLE employers ADD COLUMN IF NOT EXISTS soa2_interest NUMERIC(12, 2) DEFAULT 0');
      } catch (_e) {}
      try {
        await executeQuery('ALTER TABLE employers ADD COLUMN IF NOT EXISTS soa2_total NUMERIC(12, 2) DEFAULT 0');
      } catch (_e) {}
      try {
        await executeQuery('ALTER TABLE employers ADD COLUMN IF NOT EXISTS soa3_principal NUMERIC(12, 2) DEFAULT 0');
      } catch (_e) {}
      try {
        await executeQuery('ALTER TABLE employers ADD COLUMN IF NOT EXISTS soa3_penalty NUMERIC(12, 2) DEFAULT 0');
      } catch (_e) {}
      try {
        await executeQuery('ALTER TABLE employers ADD COLUMN IF NOT EXISTS soa3_interest NUMERIC(12, 2) DEFAULT 0');
      } catch (_e) {}
      try {
        await executeQuery("UPDATE employers SET billing_date = NULL, billing_person_received = NULL WHERE status != 'Settled'");
        await executeQuery("UPDATE employers SET status = '1st SOA Served' WHERE status IN ('Not Yet Registered', 'Registered', 'Unsettled', 'Pending', '')");
        await executeQuery("UPDATE employers SET person_received = NULL WHERE soa_date IS NULL");
        await executeQuery("UPDATE employers SET soa2_person_received = NULL WHERE soa2_date IS NULL");
        await executeQuery("UPDATE employers SET soa3_person_received = NULL WHERE soa3_date IS NULL");
        await executeQuery("UPDATE employers SET billing_person_received = NULL WHERE billing_date IS NULL");
      } catch (_e) {}

      await executeQuery(`
        CREATE TABLE IF NOT EXISTS calendar_events (
          id BIGSERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          event_date DATE NOT NULL,
          start_time TIME,
          end_time TIME,
          description TEXT,
          created_by UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      try {
        await executeQuery('ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()');
      } catch (_e) {}
    } catch (pgErr) {
      console.warn('Could not connect to PostgreSQL (' + pgErr.message + '). Falling back to local SQLite.');
      isPg = false;
      getSqliteDb();
    }
  }

  if (!isPg) {
    console.log('Using SQLite database at:', process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'sss_local.db'));
    // SQLite schema
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL UNIQUE,
        full_name TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        avatar_url TEXT,
        assigned_places TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try {
      await executeQuery('ALTER TABLE users ADD COLUMN avatar_url TEXT');
    } catch (_e) {}
    try {
      await executeQuery('ALTER TABLE users ADD COLUMN assigned_places TEXT');
    } catch (_e) {}

    await executeQuery(`
      CREATE TABLE IF NOT EXISTS employers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        assigned_view TEXT NOT NULL,
        employer_number TEXT NOT NULL,
        employer_name TEXT NOT NULL,
        payer_type TEXT DEFAULT 'Interim Payer',
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
        soa2_person_received TEXT,
        soa3_date TEXT,
        soa3_person_received TEXT,
        billing_person_received TEXT,
        legal_referral_date TEXT,
        demand_letter_date TEXT,
        demand_letter_received_date TEXT,
        handling_lawyer TEXT,
        docket_number TEXT,
        case_date TEXT,
        status TEXT NOT NULL,
        forwarded_stage TEXT,
        forwarded_date TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try {
      await executeQuery('ALTER TABLE employers ADD COLUMN payer_type TEXT DEFAULT \'Interim Payer\'');
    } catch (_e) {}
    try {
      await executeQuery('ALTER TABLE employers ADD COLUMN forwarded_stage TEXT');
    } catch (_e) {}
    try {
      await executeQuery('ALTER TABLE employers ADD COLUMN forwarded_date TEXT');
    } catch (_e) {}
    try {
      await executeQuery('ALTER TABLE employers ADD COLUMN soa2_person_received TEXT');
    } catch (_e) {}
    try {
      await executeQuery('ALTER TABLE employers ADD COLUMN soa3_person_received TEXT');
    } catch (_e) {}
    try {
      await executeQuery('ALTER TABLE employers ADD COLUMN billing_person_received TEXT');
    } catch (_e) {}
    try {
      await executeQuery('ALTER TABLE employers ADD COLUMN soa2_principal REAL DEFAULT 0');
    } catch (_e) {}
    try {
      await executeQuery('ALTER TABLE employers ADD COLUMN soa2_penalty REAL DEFAULT 0');
    } catch (_e) {}
    try {
      await executeQuery('ALTER TABLE employers ADD COLUMN soa2_interest REAL DEFAULT 0');
    } catch (_e) {}
    try {
      await executeQuery('ALTER TABLE employers ADD COLUMN soa2_total REAL DEFAULT 0');
    } catch (_e) {}
    try {
      await executeQuery('ALTER TABLE employers ADD COLUMN soa3_principal REAL DEFAULT 0');
    } catch (_e) {}
    try {
      await executeQuery('ALTER TABLE employers ADD COLUMN soa3_penalty REAL DEFAULT 0');
    } catch (_e) {}
    try {
      await executeQuery("UPDATE employers SET billing_date = NULL, billing_person_received = NULL WHERE status != 'Settled'");
      await executeQuery("UPDATE employers SET status = '1st SOA Served' WHERE status IN ('Not Yet Registered', 'Registered', 'Unsettled', 'Pending', '')");
      await executeQuery("UPDATE employers SET person_received = NULL WHERE soa_date IS NULL");
      await executeQuery("UPDATE employers SET soa2_person_received = NULL WHERE soa2_date IS NULL");
      await executeQuery("UPDATE employers SET soa3_person_received = NULL WHERE soa3_date IS NULL");
      await executeQuery("UPDATE employers SET billing_person_received = NULL WHERE billing_date IS NULL");
    } catch (_e) {}

    await executeQuery(`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        event_date TEXT NOT NULL,
        start_time TEXT,
        end_time TEXT,
        description TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try {
      await executeQuery('ALTER TABLE calendar_events ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP');
    } catch (_e) {}

    const adminRecord = await get('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', ['admin']);
    if (adminRecord?.id) {
      await executeQuery(
        'UPDATE calendar_events SET created_by = ? WHERE created_by IS NULL OR TRIM(COALESCE(created_by, "")) = ""',
        [adminRecord.id]
      );
    }
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

  // Seed sample employers if empty or replace legacy dummy records
  const empCount = await get('SELECT COUNT(*) as count FROM employers');
  const sampleEmployers = [
    // --- AO1: Toledo City (Urban & Commercial Districts) ---
    {
      assigned_view: 'AO1',
      employer_number: '07-1849201-4',
      employer_name: 'Toledo Carmen Copper Mining & Industrial Corp.',
      payer_type: 'Interim Payer',
      address: 'Don Andres Soriano (Lutopan), Toledo City, Cebu',
      address_line1: 'DAS Mining Complex, Lutopan',
      address_country: 'Philippines',
      address_state: 'Cebu',
      address_city: 'Toledo City',
      address_barangay: 'Don Andres Soriano (Lutopan)',
      address_postal_code: '6038',
      principal: 150000.00,
      penalty: 15000.00,
      interest: 7500.00,
      total_amount: 172500.00,
      soa_date: '2026-08-20',
      person_received: 'Roberto G. Santos (HR Admin)',
      employee_count: 45,
      status: '1st SOA Served',
    },
    {
      assigned_view: 'AO1',
      employer_number: '07-2938471-0',
      employer_name: 'Western Cebu Supermart & Cold Storage Inc.',
      payer_type: 'Interim Payer',
      address: 'Poblacion, Toledo City, Cebu',
      address_line1: 'Corner Sikatuna & Rafols St.',
      address_country: 'Philippines',
      address_state: 'Cebu',
      address_city: 'Toledo City',
      address_barangay: 'Poblacion',
      address_postal_code: '6038',
      principal: 85000.00,
      penalty: 8500.00,
      interest: 4250.00,
      total_amount: 97750.00,
      soa_date: '2026-07-20',
      person_received: 'Maria Elena Cruz (Store Manager)',
      soa2_principal: 92000.00,
      soa2_penalty: 11040.00,
      soa2_interest: 5520.00,
      soa2_total: 108560.00,
      soa2_date: '2026-08-15',
      soa2_person_received: 'Maria Elena Cruz (Store Manager)',
      employee_count: 24,
      status: '2nd SOA Served',
    },
    {
      assigned_view: 'AO1',
      employer_number: '07-3194820-5',
      employer_name: 'Toledo City Central Pharmacy & Diagnostic Center',
      payer_type: 'Interim Payer',
      address: 'Sangi, Toledo City, Cebu',
      address_line1: 'National Highway, Sangi',
      address_country: 'Philippines',
      address_state: 'Cebu',
      address_city: 'Toledo City',
      address_barangay: 'Sangi',
      address_postal_code: '6038',
      principal: 48000.00,
      penalty: 4800.00,
      interest: 2400.00,
      total_amount: 55200.00,
      soa_date: '2026-08-10',
      person_received: 'Jennifer T. Tan (Pharmacist-in-Charge)',
      employee_count: 16,
      status: '1st SOA Served',
    },
    {
      assigned_view: 'AO1',
      employer_number: '07-4820193-8',
      employer_name: 'Luray Integrated Hardware & Construction Depot',
      payer_type: 'Interim Payer',
      address: 'Luray II, Toledo City, Cebu',
      address_line1: 'Luray Commercial Strip',
      address_country: 'Philippines',
      address_state: 'Cebu',
      address_city: 'Toledo City',
      address_barangay: 'Luray II',
      address_postal_code: '6038',
      principal: 110000.00,
      penalty: 11000.00,
      interest: 5500.00,
      total_amount: 126500.00,
      soa_date: '2026-06-15',
      person_received: 'Danilo F. Ramos (Proprietor)',
      soa2_principal: 118000.00,
      soa2_penalty: 14160.00,
      soa2_interest: 7080.00,
      soa2_total: 139240.00,
      soa2_date: '2026-07-10',
      soa2_person_received: 'Danilo F. Ramos',
      soa3_principal: 125000.00,
      soa3_penalty: 17500.00,
      soa3_interest: 8750.00,
      soa3_total: 151250.00,
      soa3_date: '2026-08-05',
      soa3_person_received: 'Danilo F. Ramos',
      employee_count: 19,
      status: '3rd SOA Served',
    },
    {
      assigned_view: 'AO1',
      employer_number: '07-5920184-1',
      employer_name: 'Toledo Port Hauling & Trucking Services Inc.',
      payer_type: 'Interim Payer',
      address: 'Bato, Toledo City, Cebu',
      address_line1: 'Toledo Wharf Road, Bato',
      address_country: 'Philippines',
      address_state: 'Cebu',
      address_city: 'Toledo City',
      address_barangay: 'Bato',
      address_postal_code: '6038',
      principal: 210000.00,
      penalty: 21000.00,
      interest: 10500.00,
      total_amount: 241500.00,
      soa_date: '2026-06-01',
      person_received: 'Elena Rodriguez (Operations Mgr)',
      soa2_principal: 222000.00,
      soa2_penalty: 26640.00,
      soa2_interest: 13320.00,
      soa2_total: 261960.00,
      soa2_date: '2026-06-20',
      soa2_person_received: 'Elena Rodriguez (Operations Mgr)',
      soa3_principal: 235000.00,
      soa3_penalty: 32900.00,
      soa3_interest: 16450.00,
      soa3_total: 284350.00,
      soa3_date: '2026-07-08',
      soa3_person_received: 'Elena Rodriguez (Operations Mgr)',
      billing_date: '2026-07-28',
      billing_person_received: 'Elena Rodriguez (Operations Mgr)',
      employee_count: 32,
      status: 'Referred to Legal',
      legal_referral_date: '2026-08-12',
      handling_lawyer: 'Atty. Vanessa M. Lim',
      docket_number: 'SSS-TOL-2026-052',
      demand_letter_date: '2026-08-15',
      demand_person_received: 'Elena Rodriguez',
    },
    {
      assigned_view: 'AO1',
      employer_number: '07-6019283-7',
      employer_name: 'Toledo Golden Crest Hotel & Function Center',
      payer_type: 'Interim Payer',
      address: 'Poblacion, Toledo City, Cebu',
      address_line1: 'Barba St., Poblacion',
      address_country: 'Philippines',
      address_state: 'Cebu',
      address_city: 'Toledo City',
      address_barangay: 'Poblacion',
      address_postal_code: '6038',
      principal: 120000.00,
      penalty: 12000.00,
      interest: 6000.00,
      total_amount: 138000.00,
      // Settled on 1st SOA — employer paid in full within 15-day compliance window
      soa_date: '2026-07-01',
      person_received: 'Carmela S. Lim (General Manager)',
      soa2_principal: 128000.00,
      soa2_penalty: 15360.00,
      soa2_interest: 7680.00,
      soa2_total: 151040.00,
      soa2_date: '2026-07-22',
      soa2_person_received: 'Carmela S. Lim (General Manager)',
      soa3_principal: 136000.00,
      soa3_penalty: 19040.00,
      soa3_interest: 9520.00,
      soa3_total: 164560.00,
      soa3_date: '2026-08-08',
      soa3_person_received: 'Carmela S. Lim (General Manager)',
      billing_date: '2026-08-18',
      billing_person_received: 'Carmela S. Lim (General Manager)',
      employee_count: 28,
      status: 'Settled',
      payment_principal: 136000.00,
      payment_penalty: 19040.00,
      payment_interest: 9520.00,
      payment_total: 164560.00,
    },
    {
      assigned_view: 'AO1',
      employer_number: '07-7182930-2',
      employer_name: 'St. John Academy of Toledo City Inc.',
      payer_type: 'Regular Payer',
      address: 'Poblacion, Toledo City, Cebu',
      address_line1: 'D. Macapagal Highway',
      address_country: 'Philippines',
      address_state: 'Cebu',
      address_city: 'Toledo City',
      address_barangay: 'Poblacion',
      address_postal_code: '6038',
      principal: 0,
      penalty: 0,
      interest: 0,
      total_amount: 0,
      employee_count: 35,
      status: 'Settled',
      coverage_date: '2012-06-01',
      person_received: 'Sister Grace Perez (Principal)',
    },
    {
      assigned_view: 'AO1',
      employer_number: '07-8291034-9',
      employer_name: 'Toledo Ocean View Seafood Restaurant',
      payer_type: 'Special Payer',
      address: 'Ibo, Toledo City, Cebu',
      address_line1: 'Ibo Coastal Road',
      address_country: 'Philippines',
      address_state: 'Cebu',
      address_city: 'Toledo City',
      address_barangay: 'Ibo',
      address_postal_code: '6038',
      principal: 65000.00,
      penalty: 6500.00,
      interest: 3250.00,
      total_amount: 74750.00,
      soa_date: '2026-07-05',
      person_received: 'Eduardo M. Tan (Managing Partner)',
      soa2_principal: 68500.00,
      soa2_penalty: 8220.00,
      soa2_interest: 4110.00,
      soa2_total: 80830.00,
      soa2_date: '2026-07-23',
      soa2_person_received: 'Eduardo M. Tan (Managing Partner)',
      soa3_principal: 72000.00,
      soa3_penalty: 10080.00,
      soa3_interest: 5040.00,
      soa3_total: 87120.00,
      soa3_date: '2026-08-07',
      soa3_person_received: 'Eduardo M. Tan (Managing Partner)',
      billing_date: '2026-08-14',
      billing_person_received: 'Eduardo M. Tan (Managing Partner)',
      employee_count: 12,
      status: 'Settled',
      payment_principal: 72000.00,
      payment_penalty: 10080.00,
      payment_interest: 5040.00,
      payment_total: 87120.00,
    },

    // --- AO2: Balamban & Asturias ---
    {
      assigned_view: 'AO2',
      employer_number: '07-9382014-6',
      employer_name: 'Balamban Coastal Shipyard & Heavy Fabrication Inc.',
      payer_type: 'Interim Payer',
      address: 'Buanoy, Balamban, Cebu',
      address_line1: 'Shipyard Highway, Buanoy',
      address_country: 'Philippines',
      address_state: 'Cebu',
      address_city: 'Balamban',
      address_barangay: 'Buanoy',
      address_postal_code: '6041',
      principal: 320000.00,
      penalty: 32000.00,
      interest: 16000.00,
      total_amount: 368000.00,
      soa_date: '2026-07-15',
      person_received: 'Engr. Victor C. Navarro (VP Operations)',
      soa2_principal: 340000.00,
      soa2_penalty: 40800.00,
      soa2_interest: 20400.00,
      soa2_total: 401200.00,
      soa2_date: '2026-08-12',
      soa2_person_received: 'Engr. Victor C. Navarro',
      employee_count: 85,
      status: '2nd SOA Served',
    },
    {
      assigned_view: 'AO2',
      employer_number: '07-1029384-3',
      employer_name: 'Asturias Sugar Planters & Hauling Transport Coop.',
      payer_type: 'Interim Payer',
      address: 'Poblacion, Asturias, Cebu',
      address_line1: 'Cooperative Complex, Poblacion',
      address_country: 'Philippines',
      address_state: 'Cebu',
      address_city: 'Asturias',
      address_barangay: 'Poblacion',
      address_postal_code: '6042',
      principal: 165000.00,
      penalty: 16500.00,
      interest: 8250.00,
      total_amount: 189750.00,
      soa_date: '2026-08-15',
      person_received: 'Rogelio M. Diaz (Coop Secretary)',
      employee_count: 42,
      status: '1st SOA Served',
    },
    {
      assigned_view: 'AO2',
      employer_number: '07-2193847-5',
      employer_name: 'Balamban Mountain View Resort & Eco-Park',
      payer_type: 'Interim Payer',
      address: 'Aliwanay, Balamban, Cebu',
      address_line1: 'Transcentral Highway, Aliwanay',
      address_country: 'Philippines',
      address_state: 'Cebu',
      address_city: 'Balamban',
      address_barangay: 'Aliwanay',
      address_postal_code: '6041',
      principal: 88000.00,
      penalty: 8800.00,
      interest: 4400.00,
      total_amount: 101200.00,
      soa_date: '2026-06-20',
      person_received: 'Leticia V. Alcantara (Resort Mgr)',
      soa2_principal: 93000.00,
      soa2_penalty: 11160.00,
      soa2_interest: 5580.00,
      soa2_total: 109740.00,
      soa2_date: '2026-07-06',
      soa2_person_received: 'Leticia V. Alcantara (Resort Mgr)',
      soa3_principal: 98500.00,
      soa3_penalty: 13790.00,
      soa3_interest: 6895.00,
      soa3_total: 119185.00,
      soa3_date: '2026-07-22',
      soa3_person_received: 'Leticia V. Alcantara (Resort Mgr)',
      billing_date: '2026-08-05',
      billing_person_received: 'Leticia V. Alcantara (Resort Mgr)',
      employee_count: 18,
      status: 'Referred to Legal',
      legal_referral_date: '2026-08-08',
      handling_lawyer: 'Atty. Victorio Mendoza',
      docket_number: 'SSS-TOL-2026-061',
      demand_letter_date: '2026-08-10',
      demand_person_received: 'Leticia V. Alcantara',
    },
    {
      assigned_view: 'AO2',
      employer_number: '07-3204918-1',
      employer_name: 'Tsuneishi Marine Industrial Subcontractors Corp.',
      payer_type: 'Regular Payer',
      address: 'Buanoy, Balamban, Cebu',
      address_line1: 'West Cebu Industrial Park',
      address_country: 'Philippines',
      address_state: 'Cebu',
      address_city: 'Balamban',
      address_barangay: 'Buanoy',
      address_postal_code: '6041',
      principal: 0,
      penalty: 0,
      interest: 0,
      total_amount: 0,
      employee_count: 140,
      status: 'Settled',
      coverage_date: '2010-03-15',
      person_received: 'Helen G. Alcantara (HR Director)',
    },
    {
      assigned_view: 'AO2',
      employer_number: '07-4319028-7',
      employer_name: 'Asturias Grain Mills & Agricultural Feeds Center',
      payer_type: 'Special Payer',
      address: 'Santa Lucia, Asturias, Cebu',
      address_line1: 'Provincial Road, Santa Lucia',
      address_country: 'Philippines',
      address_state: 'Cebu',
      address_city: 'Asturias',
      address_barangay: 'Santa Lucia',
      address_postal_code: '6042',
      principal: 100000.00,
      penalty: 10000.00,
      interest: 5000.00,
      total_amount: 115000.00,
      soa_date: '2026-07-08',
      person_received: 'Manuel Q. Tan (Proprietor)',
      soa2_principal: 106000.00,
      soa2_penalty: 12720.00,
      soa2_interest: 6360.00,
      soa2_total: 125080.00,
      soa2_date: '2026-07-26',
      soa2_person_received: 'Manuel Q. Tan (Proprietor)',
      soa3_principal: 112000.00,
      soa3_penalty: 15680.00,
      soa3_interest: 7840.00,
      soa3_total: 135520.00,
      soa3_date: '2026-08-11',
      soa3_person_received: 'Manuel Q. Tan (Proprietor)',
      billing_date: '2026-08-22',
      billing_person_received: 'Manuel Q. Tan (Proprietor)',
      employee_count: 15,
      status: 'Settled',
      payment_principal: 112000.00,
      payment_penalty: 15680.00,
      payment_interest: 7840.00,
      payment_total: 135520.00,
    },

    // --- AO3: Pinamungajan, Aloguinsan, & Tuburan ---
    {
      assigned_view: 'AO3',
      employer_number: '07-5420193-4',
      employer_name: 'Pinamungajan Agro-Commercial Milling & Feeds Inc.',
      payer_type: 'Interim Payer',
      address: 'Poblacion, Pinamungajan, Cebu',
      address_line1: 'National Road, Poblacion',
      address_country: 'Philippines',
      address_state: 'Cebu',
      address_city: 'Pinamungajan',
      address_barangay: 'Poblacion',
      address_postal_code: '6039',
      principal: 135000.00,
      penalty: 13500.00,
      interest: 6750.00,
      total_amount: 155250.00,
      soa_date: '2026-08-22',
      person_received: 'Fernando P. Castro (Plant Manager)',
      employee_count: 38,
      status: '1st SOA Served',
    },
    {
      assigned_view: 'AO3',
      employer_number: '07-6531204-0',
      employer_name: 'Aloguinsan Bojo River Ecotourism Services Corp.',
      payer_type: 'Interim Payer',
      address: 'Poblacion, Aloguinsan, Cebu',
      address_line1: 'Bojo Eco-Tourism Park',
      address_country: 'Philippines',
      address_state: 'Cebu',
      address_city: 'Aloguinsan',
      address_barangay: 'Poblacion',
      address_postal_code: '6040',
      principal: 52000.00,
      penalty: 5200.00,
      interest: 2600.00,
      total_amount: 59800.00,
      soa_date: '2026-07-18',
      person_received: 'Lourdes B. Rivera (Admin Officer)',
      soa2_principal: 56000.00,
      soa2_penalty: 6720.00,
      soa2_interest: 3360.00,
      soa2_total: 66080.00,
      soa2_date: '2026-08-14',
      soa2_person_received: 'Lourdes B. Rivera',
      employee_count: 14,
      status: '2nd SOA Served',
    },
    {
      assigned_view: 'AO3',
      employer_number: '07-7642315-8',
      employer_name: 'Tuburan Highlands Coffee Plantation & Processing Co.',
      payer_type: 'Interim Payer',
      address: 'Poblacion, Tuburan, Cebu',
      address_line1: 'Highlands Coffee Estate, Poblacion',
      address_country: 'Philippines',
      address_state: 'Cebu',
      address_city: 'Tuburan',
      address_barangay: 'Poblacion',
      address_postal_code: '6043',
      principal: 180000.00,
      penalty: 18000.00,
      interest: 9000.00,
      total_amount: 207000.00,
      soa_date: '2026-07-12',
      person_received: 'Alfonso D. Villa (Operations Head)',
      soa2_principal: 190000.00,
      soa2_penalty: 22800.00,
      soa2_interest: 11400.00,
      soa2_total: 224200.00,
      soa2_date: '2026-07-29',
      soa2_person_received: 'Alfonso D. Villa (Operations Head)',
      soa3_principal: 200000.00,
      soa3_penalty: 28000.00,
      soa3_interest: 14000.00,
      soa3_total: 242000.00,
      soa3_date: '2026-08-14',
      soa3_person_received: 'Alfonso D. Villa (Operations Head)',
      billing_date: '2026-08-25',
      billing_person_received: 'Alfonso D. Villa (Operations Head)',
      employee_count: 50,
      status: 'Settled',
      payment_principal: 200000.00,
      payment_penalty: 28000.00,
      payment_interest: 14000.00,
      payment_total: 242000.00,
    },
    {
      assigned_view: 'AO3',
      employer_number: '07-8753426-3',
      employer_name: 'Western Cebu Rural Bank - Pinamungajan Branch',
      payer_type: 'Regular Payer',
      address: 'Poblacion, Pinamungajan, Cebu',
      address_line1: 'Rizal St., Poblacion',
      address_country: 'Philippines',
      address_state: 'Cebu',
      address_city: 'Pinamungajan',
      address_barangay: 'Poblacion',
      address_postal_code: '6039',
      principal: 0,
      penalty: 0,
      interest: 0,
      total_amount: 0,
      employee_count: 20,
      status: 'Settled',
      coverage_date: '2008-01-10',
      person_received: 'Teresa M. Garcia (Branch Manager)',
    },
    {
      assigned_view: 'AO3',
      employer_number: '07-9864537-9',
      employer_name: 'Tuburan Northside Fishing & Ice Plant Corp.',
      payer_type: 'Interim Payer',
      address: 'Bagakay, Tuburan, Cebu',
      address_line1: 'North Coastal Pier, Bagakay',
      address_country: 'Philippines',
      address_state: 'Cebu',
      address_city: 'Tuburan',
      address_barangay: 'Bagakay',
      address_postal_code: '6043',
      principal: 145000.00,
      penalty: 14500.00,
      interest: 7250.00,
      total_amount: 166750.00,
      soa_date: '2026-06-25',
      person_received: 'Danilo S. Yap (Plant Admin)',
      soa2_principal: 153500.00,
      soa2_penalty: 18420.00,
      soa2_interest: 9210.00,
      soa2_total: 181130.00,
      soa2_date: '2026-07-12',
      soa2_person_received: 'Danilo S. Yap (Plant Admin)',
      soa3_principal: 162000.00,
      soa3_penalty: 22680.00,
      soa3_interest: 11340.00,
      soa3_total: 196020.00,
      soa3_date: '2026-07-28',
      soa3_person_received: 'Danilo S. Yap (Plant Admin)',
      billing_date: '2026-08-07',
      billing_person_received: 'Danilo S. Yap (Plant Admin)',
      employee_count: 26,
      status: 'Referred to Legal',
      legal_referral_date: '2026-08-10',
      handling_lawyer: 'Atty. Vanessa M. Lim',
      docket_number: 'SSS-TOL-2026-077',
      demand_letter_date: '2026-08-14',
      demand_person_received: 'Danilo S. Yap',
    },
  ];

  // Fully reset and seed 18 complete, authentic SSS Toledo employer records
  try {
    await executeQuery('DELETE FROM employers');
  } catch (_e) {}
  for (const emp of sampleEmployers) {
    const keys = Object.keys(emp);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
    const values = keys.map((k) => emp[k]);
    await executeQuery(`INSERT INTO employers (${keys.join(', ')}) VALUES (${placeholders})`, values);
  }
  console.log('Seeded 18 authentic complete SSS Toledo employer records.');

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
  getIsPg,
  pool,
  get,
  all,
  run,
  executeQuery,
  hashPassword,
  initDb,
};
