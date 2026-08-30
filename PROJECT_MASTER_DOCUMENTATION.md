# SSS Toledo Branch - Account Management System (AMS)
## Master System Specification & Architecture Reference

This document serves as the permanent reference and memory record for all features, design constraints, business logic, and database schemas established for the SSS Toledo Operations Dashboard & Database System.

---

### 1. User Roles, Access & Permissions
| Role | Access Scope | Landing Page | Org Chart Visible? |
| :--- | :--- | :--- | :--- |
| **Branch Administrator (`admin`)** | Full System Access (Dashboard, MasterFile, All AO Databases, Employer Form, Calendar, Org Chart) | `DASHBOARD` | **Yes (Root / Top Node)** |
| **Account Officer 1 (`ao1` / `AO1`)** | Assigned AO1 Database, Main Dashboard, Employer Form, 15-Day Reminders | `AO1` View | **No** (Hidden for AOs) |
| **Account Officer 2 (`ao2` / `AO2`)** | Assigned AO2 Database, Main Dashboard, Employer Form, 15-Day Reminders | `AO2` View | **No** (Hidden for AOs) |
| **Account Officer 3 (`ao3` / `AO3`)** | Assigned AO3 Database, Main Dashboard, Employer Form, 15-Day Reminders | `AO3` View | **No** (Hidden for AOs) |
| **Super Administrator (`superadmin`)** | Technical Maintenance User | `DASHBOARD` | **No** (Excluded from Org Chart) |

---

### 2. Organizational Chart Structure
- **Hierarchy**:
  - **Top / Root Node**: **Branch Administrator (`admin`)**
  - **Direct Subordinates**: **Account Officer 1 (Toledo)**, **Account Officer 2 (Toledo)**, **Account Officer 3 (Toledo)** connected with dynamic SVG curved lines.
- **Card Contents**:
  - Role Badge (`BRANCH ADMINISTRATOR`, `ACCOUNT OFFICER 1`, etc.)
  - Photo Avatar / Initials Circle
  - Officer Full Name, `@username`, and Email
  - **📍 ASSIGNED JURISDICTION / Location Area** Box:
    - *Admin*: SSS Toledo Branch (Overall Supervision)
    - *AO1*: Toledo City (Urban & Commercial Districts)
    - *AO2*: Balamban & Asturias
    - *AO3*: Pinamungajan, Aloguinsan, & Tuburan
- **Officer Profile & Assigned Area Modal**:
  - Clicking any officer card opens the edit modal allowing immediate modification of **Full Name / Title**, **Profile Photo URL / Device File Upload**, and **Assigned Jurisdiction**.
  - Updates persist directly to PostgreSQL via `PATCH /api/users/:id`.

---

### 3. Employer Data Form & Field Specifications
When encoding or editing employers, all fields remain visible and accessible:
1. **Basic Info**: Employer Number, Employer Name, Payer Type (`Regular Payer (RP)`, `Interim Payer (IP)`, `Special Payer (SP)`).
2. **Cascading Address**: Region $\rightarrow$ Province $\rightarrow$ Municipality/City $\rightarrow$ Barangay $\rightarrow$ Postal Code auto-fill $\rightarrow$ Address Line 1.
3. **Employee Count**: No. of Employees (EEs).
4. **Established Collectibles**: Principal, Penalty, Interest, and auto-calculated Total Collectibles.
5. **Payments**: Payment Principal, Payment Penalty, Payment Interest, and auto-calculated Payment Total.
6. **SOA Lifecycle & Dedicated Recipient Tracking**:
   - **1st SOA**: Date 1st SOA (Served) + **Person Received (1st SOA)**
   - **2nd SOA**: Date 2nd SOA (Served) + **Person Received (2nd SOA)**
   - **3rd SOA**: Date 3rd SOA (Served) + **Person Received (3rd SOA)**
   - **Billing**: Date of Billing (Served) + **Person Received (Billing)**
   - **Coverage**: Date of Coverage
   - **Demand Letter**: Demand Letter Date + Demand Letter Received Date + **Person Received (Demand Letter)**
   - **Legal Referral**: Date Referred to Legal, Handling Lawyer, Docket #, Case Date.
7. **Status Options**:
   - `1st SOA Served`
   - `2nd SOA Served`
   - `3rd SOA Served`
   - `Referred to Legal`
   - `Settled`

---

### 4. Table Views & MasterFile Layout (`AO1`, `AO2`, `AO3`, `MasterFile`)
- **26-Column Layout**:
  - `Employer#` | `Employer Name` | `Payer Type` | `Address` | `No. of EEs` | `Principal` | `Established Collectibles (Interest, Penalty, Total)` | `Payment (Principal, Interest, Penalty)` | `Total` | `Date of Billing (Served)` (in later section) | `Date 1st SOA` | `Date 2nd SOA` | `Date 3rd SOA` | `Date of Coverage` | `Date Referred to Legal` | `Demand Letter (Date, Date Received)` | `Case Details (Handling Lawyer, Docket #, Date)` | `Status` | `Person Received`.
- **Date Formatting**: Rendered in clean readable format `DD-MMM-YYYY`.
- **Sheet Tabs**: Instant segmentation by `All Records`, `Regular Payer (RP)`, `Interim Payer (IP)`, and `Special Payer (SP)`.
- **Filter Toolbar**:
  - Search Input (by SSS Number, Name, or Queue)
  - Date Filter
  - **Address / Location Dropdown**: Filter by Toledo City, Balamban, Pinamungajan, Aloguinsan, Asturias, Tuburan.
  - MasterFile AO Filter (`All AO`, `AO1`, `AO2`, `AO3`)
  - Status Filter (`1st SOA Served`, `2nd SOA Served`, `3rd SOA Served`, `Due for Next Action (15-Day Lapsed)`, `Referred to Legal`).
- **Action Toolbar**:
  - `Summary` (Quick Table Dashboard Modal)
  - `Export CSV` (Excel-compatible UTF-8 BOM download)
  - `Edit mode` & `Edit data` (or double-click row)
  - `Delete selected`

---

### 5. 15-Day Compliance Cycle & Reminders
- Each employer's compliance period is calculated as 15 calendar days from their latest served SOA date.
- Lapsed or due accounts (>14 days or within 24 hours) trigger warning badges in the table and count in the navigation rail **🔔 REMINDERS** counter.
- **1-Click Forwarded Tagging**: Officers can mark accounts as forwarded for next action, recording the dispatch timestamp and dismissing the overdue alert.

---

### 6. Main Dashboard & Branch Performance Analytics
- **Metric Cards Row 1**: `TOTAL RECORDS`, `SETTLED`, `UNSETTLED`, `COMPLETION %`, `TOTAL BILLED`.
- **Metric Cards Row 2 (SOA Lifecycle)**: `1ST SOA SERVED`, `2ND SOA SERVED`, `3RD SOA SERVED`, `REFERRED TO LEGAL`, `SETTLED ACCOUNTS`.
- **Branch Performance Table**:
  - Columns: `Officer`, `RP`, `IP`, `SP`, `Total Records`, `Settled`, `Unsettled`, `Collectibles (Billed)`, `Collections (Paid)`, `Accomplishment %`.
  - Monthly targets (₱5M per AO, ₱15M Total) with accomplishment tracking.
- **Visual Analytics**: Interactive Chart.js graphs for branch employer volume, settlement ratio, and cumulative performance.

---

### 7. Dual Authentication & Session Resilience
- User authentication tokens and session payloads are stored in both `localStorage` and `sessionStorage`.
- `restoreSessionOnLoad()` rehydrates user state on page refresh (`F5` or `Ctrl + F5`) and reconnects to PostgreSQL without logging out.
- Sessions are only cleared upon explicit **Sign out**.
