# SSS Toledo Branch - Account Management System (AMS)

![SSS Toledo Branch AMS](logo.png)

A comprehensive, full-stack Operations Dashboard, Employer Billing, Delinquency Tracking, and Settlement Monitoring System designed for the **Social Security System (SSS) Toledo City Branch**.

---

## 📌 Overview

The **SSS Toledo Account Management System (AMS)** streamlines and automates the tracking of delinquent employer accounts, Statement of Account (SOA) lifecycles, legal referrals, and collectible settlements. It provides real-time role-based operational oversight for Branch Administrators and Account Officers (AOs) across their assigned jurisdictions.

---

## 🚀 Key Features

### 1. Role-Based Access Control (RBAC) & Authentication
- **Roles**:
  - **Branch Administrator (`admin`)**: Branch-wide oversight, MasterFile management (with protected edit-only mode to prevent accidental deletions), officer profile & jurisdiction configuration, and branch analytics.
  - **Account Officer 1 (`ao1`)**: Toledo City (Urban & Commercial Districts).
  - **Account Officer 2 (`ao2`)**: Balamban & Asturias.
  - **Account Officer 3 (`ao3`)**: Pinamungajan, Aloguinsan, & Tuburan.
  - **Super Administrator (`superadmin`)**: System administration and diagnostics.
- **HMAC-SHA256 Token Session Engine**: Dual-storage persistence (`localStorage` & `sessionStorage`) with seamless session rehydration on page refresh.

### 2. Employer Delinquency & SOA Lifecycle Tracking
- **Granular Employer Profiles**: Employer ID, Registered Business Name, Classification (`Regular Payer (RP)`, `Interim Payer (IP)`, `Non-Paying (NP)`), employee counts, and full Philippine cascading address selector (Region $\rightarrow$ Province $\rightarrow$ City/Municipality $\rightarrow$ Barangay $\rightarrow$ Postal Code).
- **SOA Milestone & Recipient Audit**: Complete lifecycle auditing with served dates and signed recipient names for:
  - 1st Statement of Account (SOA)
  - 2nd Statement of Account (SOA)
  - 3rd Statement of Account (SOA)
  - Date of Billing
  - Demand Letter serving & receipt
  - Legal Department Referral (Lawyer, Docket #, Filing Date)
  - Full Settlement status
- **Automated 15-Day Compliance Countdown**: Visual alert badges and a dynamic notification counter for accounts due or lapsed for subsequent action.

### 3. Financial Engine & Settlement Analytics
- Real-time calculation of Principal, Penalties, and Accrued Interest.
- Payment tracking (Principal, Penalty, Interest paid) with live collectible balance computations.
- Monthly branch targets (₱5,000,000 per AO / ₱15,000,000 branch total) with live progress and accomplishment percentage tracking.
- Interactive **Chart.js** visualizations for settlement ratios and employer distributions.

### 4. Interactive Organization Chart
- Live visual hierarchy showing Branch Administrator and subordinate Account Officers with dynamic SVG connectors.
- In-place editing modal to update officer titles, contact details, profile avatars, and geographic jurisdictions.

### 5. Dual-Mode Database Architecture
- **Production-Ready**: Seamlessly connects to **PostgreSQL** (Supabase, Neon, AWS RDS, Render, etc.).
- **Zero-Config Local Fallback**: Automatically falls back to embedded **SQLite3** (`data/sss_local.db`) for immediate offline development without requiring external database setups.

---

## 🛠️ Technology Stack

- **Frontend**: Vanilla HTML5, Modern CSS (Glassmorphism, CSS Custom Properties, Responsive Layout), Vanilla JavaScript (ES6+), Chart.js.
- **Backend**: Node.js, Express.js.
- **Database**: PostgreSQL (`pg`) with automatic fallback to SQLite3 (`sqlite3`).
- **Security**: HMAC-SHA256 authenticated sessions, SHA-256 password hashing.

---

## 📦 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.x or higher recommended)
- `npm`

### Installation

1. **Clone the repository**:
   ```bash
   git clone <YOUR_GITHUB_REPO_URL>
   cd AMS-main
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables** (Optional for local SQLite):
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` to set your custom `PORT`, `APP_SESSION_SECRET`, or `DATABASE_URL` (PostgreSQL connection string).*

4. **Start the application**:
   ```bash
   npm start
   ```
   *For development with file-watching:*
   ```bash
   npm run dev
   ```

5. **Open in browser**:
   Navigate to `http://localhost:3002` (or your configured port).

---

## 🧪 Testing

Execute the automated RBAC and calendar CRUD test suites:
```bash
node tests/rbac-login.test.js
node tests/calendar-crud.test.js
```

---

## 📂 Directory Structure

```plaintext
AMS-main/
├── api/
│   ├── auth/              # Auth route handlers
│   ├── db.js              # Database abstraction layer (PostgreSQL + SQLite fallback)
│   ├── server.js          # Express API server & routes
│   └── ...
├── data/                  # Local SQLite database storage (git-ignored)
├── tests/                 # Automated validation & test scripts
├── index.html             # Single-page operations portal interface
├── script.js              # Frontend client application logic
├── styles.css             # System styling, themes, and responsive design
├── .env.example           # Example environment configuration template
├── PROJECT_MASTER_DOCUMENTATION.md # Detailed specification reference
└── package.json           # Dependencies and project metadata
```

---

## 📄 License & Privacy Notice

This software is developed for the **Social Security System (SSS) Toledo City Branch**. All data, employer records, and system specifications are confidential and governed by Philippine Data Privacy laws (RA 10173).
