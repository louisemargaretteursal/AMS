const isNp = (p) => {
  const s = String(p || '').toLowerCase();
  return s.includes('non') || s.includes('np') || s.includes('special') || s.includes('sp');
};

let pendingDelete = null;
let pieChart;
let barChart;
let groupedBarChart;
let aoStageChart;
let aoPayerChart;
let aoEncodingChart;
const authScreen = document.getElementById('authScreen');
const dashboardShell = document.getElementById('dashboardShell');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');
const returnToLogin = document.getElementById('returnToLogin');
const loggedInUser = document.getElementById('loggedInUser');
const logoutButton = document.getElementById('logoutButton');
const databaseNotification = document.getElementById('databaseNotification');
const employerSuccessModal = document.getElementById('employerSuccessModal');
const employerSuccessClose = document.getElementById('employerSuccessClose');
const employerSuccessOk = document.getElementById('employerSuccessOk');
const logoutConfirmModal = document.getElementById('logoutConfirmModal');
const logoutConfirmApprove = document.getElementById('logoutConfirmApprove');
const logoutConfirmCancel = document.getElementById('logoutConfirmCancel');
const logoutConfirmClose = document.getElementById('logoutConfirmClose');
const pageWrapper = document.getElementById('dashboardShell');
let currentUser = null;
const AUTH_TRANSITION_MS = 1000;
let editingEmployerId = null;
let databaseNotificationTimer;

const getOfficerView = (role) => {
  const normalizedRole = String(role || '')
    .replace(/^Assistant Officer ([1-3])$/, 'Account Officer $1')
    .replace(/^Account Assistant ([1-3])$/, 'Account Officer $1');
  return /^Account Officer [1-3]$/.test(normalizedRole)
    ? normalizedRole.replace('Account Officer ', 'AO')
    : '';
};

const getCurrentOfficerCode = () => getOfficerView(currentUser?.role) || null;
const isAdminSideRole = (role) => ['Admin', 'Super Admin'].includes(String(role || '').trim());

const synchronizeOfficerMasterfileView = () => {
  const officerView = getCurrentOfficerCode();
  const masterFileView = document.querySelector('[data-ao-view="MasterFile"]');
  if (!masterFileView) return;

  const branchSelector = masterFileView.querySelector('[data-filter-branch]');
  if (branchSelector && officerView) {
    const branchSelectorLabel = branchSelector.closest('label');
    if (branchSelectorLabel) branchSelectorLabel.remove();
  }

  const badge = masterFileView.querySelector('.ao-title-badge');
  const title = masterFileView.querySelector('.ao-title-text');
  const bannerText = masterFileView.querySelector('.ao-banner-text');

  if (officerView) {
    if (badge) badge.textContent = officerView;
    if (title) title.textContent = `${officerView}'S RECORDS`;
    if (bannerText) {
      bannerText.innerHTML = `<strong>ACTION REQUIRED:</strong> <span class="ao-banner-count" data-banner-count="MasterFile">0</span> of your account(s) have exceeded their 15-day compliance deadline.`;
    }
  } else {
    if (badge) badge.textContent = 'MASTERFILE';
    if (title) title.textContent = 'SSS TOLEDO ALL BRANCH RECORDS';
    if (bannerText) {
      bannerText.innerHTML = '<strong>ACTION REQUIRED:</strong> <span class="ao-banner-count" data-banner-count="MasterFile">0</span> total branch account(s) have exceeded their 15-day compliance deadline.';
    }
  }
};

const syncOfficerDashboardPanels = () => {
  const officerView = getCurrentOfficerCode();
  const isOfficer = Boolean(officerView);

  document.querySelectorAll('[data-admin-only]').forEach((el) => {
    el.hidden = isOfficer;
  });
  document.querySelectorAll('[data-officer-only]').forEach((el) => {
    el.hidden = !isOfficer;
  });
};

const isOfficerRole = (role) => Boolean(getOfficerView(role));

// Map internal payer type values to display labels (for badge and UI text)
const getPayerTypeDisplayName = (internalPayerType) => {
  const displayMap = {
    'Regular Payer': 'Regularly Paying',
    'Interim Payer': 'Intermittently Paying',
    'Non-Paying': 'Non-Paying',
    'Non Paying': 'Non-Paying',
    'Special Payer': 'Non-Paying',
    'NP': 'Non-Paying',
    'SP': 'Non-Paying',
  };
  return displayMap[internalPayerType] || internalPayerType;
};

const showAuthForm = (formName) => {
  const isRegister = formName === 'register';
  loginForm.hidden = isRegister;
  registerForm.hidden = !isRegister;
};

const syncSidebarProfile = (account) => {
  const nameEl = document.querySelector('.sidebar-user-name');
  const roleEl = document.querySelector('.sidebar-user-role');
  const avatarEl = document.querySelector('.sidebar-avatar');
  if (!nameEl || !roleEl || !avatarEl) return;

  const officerMode = Boolean(getOfficerView(account?.role));

  if (officerMode) {
    const username = account?.username || 'user';
    const role = account?.role || 'User';
    const initial = String(username || role || 'U').trim().charAt(0).toUpperCase() || 'U';
    nameEl.textContent = username;
    roleEl.textContent = role;
    avatarEl.textContent = initial;
    return;
  }

  nameEl.textContent = 'Admin';
  roleEl.textContent = 'Administrator';
  avatarEl.textContent = 'A';
};

const showDashboard = (account, { animate = false, onAnimationEnd } = {}) => {
  currentUser = account;
  const officerViewName = getOfficerView(account.role);
  const officerMode = Boolean(officerViewName);
  const adminSideRole = isAdminSideRole(account.role);
  syncSidebarProfile(account);
  pageWrapper.classList.toggle('officer-mode', officerMode);
  pageWrapper.classList.toggle('dashboard-active', !officerMode);
  pageWrapper.dataset.officerView = officerViewName;

  document.querySelectorAll('.add-record-btn').forEach((button) => {
    const shouldHideAddRecord = adminSideRole;
    button.hidden = shouldHideAddRecord;
    button.style.display = shouldHideAddRecord ? 'none' : '';
  });

  // For AO users, ensure EmployerForm nav item exists (may have been removed for admin-side roles)
  if (officerMode) {
    const masterFileNav = document.querySelector('#mainNav .nav-item[data-nav-view="MasterFile"]');
    const existingEmployerFormNav = document.querySelector('#mainNav .nav-item[data-nav-view="EmployerForm"]');
    if (!existingEmployerFormNav && masterFileNav) {
      const employerFormNav = document.createElement('div');
      employerFormNav.className = 'nav-item';
      employerFormNav.setAttribute('data-nav-view', 'EmployerForm');
      employerFormNav.innerHTML = '<button class="nav-btn" aria-label="Open data form" title="Data form">DATA FORM</button>';
      masterFileNav.insertAdjacentElement('afterend', employerFormNav);
      employerFormNav.querySelector('.nav-btn').addEventListener('click', () => {
        openEmployerModal(getOfficerView(currentUser?.role) || 'AO1');
      });
    }
  }

  const orgChartBtn = document.querySelector('.org-chart-btn');
  if (orgChartBtn) {
    orgChartBtn.hidden = officerMode;
    orgChartBtn.style.display = officerMode ? 'none' : '';
  }

  document.querySelectorAll('#mainNav .nav-item[data-nav-view]').forEach((navItem) => {
    const navView = navItem.dataset.navView;
    // Hide the Data Form and AO views only on admin-side roles; other users retain access.
    if (adminSideRole && navView === 'EmployerForm') {
      navItem.remove();
      return;
    }
    navItem.hidden = (adminSideRole && navView.startsWith('AO'))
      || (officerMode && navView !== officerViewName && navView !== 'EmployerForm' && navView !== 'MasterFile');
  });

  const soaNotification = document.querySelector('.soa-notification-item');
  if (soaNotification) soaNotification.hidden = false;

  // Toggle visibility of admin-only and officer-only dashboard sections
  document.querySelectorAll('[data-admin-only]').forEach((el) => {
    el.hidden = officerMode;
  });
  document.querySelectorAll('[data-officer-only]').forEach((el) => {
    el.hidden = !officerMode;
  });

  // For AO users, initialize personal performance charts
  if (officerMode) {
    setTimeout(() => {
      initializeAoPersonalCharts(officerViewName);
      populateAoActionItems(officerViewName);
    }, 100);
  }

  const defaultView = officerMode ? officerViewName : 'DASHBOARD';
  navigateToView(defaultView);
  loggedInUser.textContent = `${account.username} | ${account.role || 'User'}`;

  if (animate) {
    authScreen.hidden = false;
    authScreen.classList.remove('is-fading-out');
    authScreen.classList.add('is-authenticating');

    const statusEl = document.getElementById('authLoadingStatus');
    if (statusEl) statusEl.textContent = 'Verifying credentials...';

    window.setTimeout(() => {
      if (statusEl) {
        statusEl.style.opacity = '0';
        window.setTimeout(() => {
          statusEl.textContent = 'Preparing your workspace...';
          statusEl.style.opacity = '1';
        }, 70);
      }
    }, Math.round(AUTH_TRANSITION_MS * 0.55));

    window.setTimeout(() => {
      // Begin smooth cross-fade handoff
      authScreen.classList.add('is-fading-out');
      dashboardShell.hidden = false;
      dashboardShell.classList.add('is-entering');
      navigateToView(defaultView);

      window.setTimeout(() => {
        authScreen.classList.remove('is-authenticating', 'is-fading-out');
        authScreen.hidden = true;
        if (statusEl) statusEl.textContent = 'Verifying credentials...';
        if (onAnimationEnd) onAnimationEnd();

        window.setTimeout(() => {
          dashboardShell.classList.remove('is-entering');
        }, 350);
      }, 250);
    }, AUTH_TRANSITION_MS);
    return;
  }

  authScreen.hidden = true;
  dashboardShell.hidden = false;
  navigateToView(defaultView);
};

const signOut = () => {
  currentUser = null;
  syncSidebarProfile({ role: 'Admin', username: 'admin' });
  logoutConfirmModal.hidden = true;
  authScreen.classList.remove('is-authenticating');
  pageWrapper.classList.remove('officer-mode');
  delete pageWrapper.dataset.officerView;
  document.querySelectorAll('#mainNav .nav-item[data-nav-view]').forEach((navItem) => {
    navItem.hidden = false;
  });
  document.querySelector('.org-chart-btn').hidden = false;
  document.getElementById('employerFormView').hidden = true;
  clearAuthSession();
  dashboardShell.hidden = true;
  authScreen.hidden = false;
  loginForm.reset();
  document.getElementById('username').focus();
};

const saveAuthSession = (user) => {
  const data = JSON.stringify(user);
  try {
    sessionStorage.setItem('sssAuthenticatedUser', data);
    localStorage.setItem('sssAuthenticatedUser', data);
  } catch (_e) {}
};

const clearAuthSession = () => {
  try {
    sessionStorage.removeItem('sssAuthenticatedUser');
    localStorage.removeItem('sssAuthenticatedUser');
  } catch (_e) {}
};

const getSavedAuthSession = () => {
  try {
    const data = sessionStorage.getItem('sssAuthenticatedUser') || localStorage.getItem('sssAuthenticatedUser');
    return data ? JSON.parse(data) : null;
  } catch (_e) {
    return null;
  }
};

if (returnToLogin) {
  returnToLogin.addEventListener('click', () => showAuthForm('login'));
}

if (registerForm) {
  registerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const password = registerForm.elements.registrationPassword?.value;
    const confirmPassword = registerForm.elements.confirmPassword?.value;

    if (password !== confirmPassword) {
      if (registerError) {
        registerError.textContent = 'Passwords do not match.';
        registerError.hidden = false;
      }
      registerForm.elements.confirmPassword?.focus();
      return;
    }

    if (registerError) registerError.hidden = true;
    registerForm.reset();
    showAuthForm('login');
    if (loginError) {
      loginError.textContent = 'Registration submitted. An administrator must approve your account before activation.';
      loginError.hidden = false;
    }
  });
}

const togglePasswordBtn = document.getElementById('togglePasswordBtn');
if (togglePasswordBtn) {
  togglePasswordBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const passwordInput = document.getElementById('password');
    if (!passwordInput) return;
    const isCurrentlyPassword = passwordInput.type === 'password';
    passwordInput.type = isCurrentlyPassword ? 'text' : 'password';
    togglePasswordBtn.setAttribute('aria-label', isCurrentlyPassword ? 'Hide password' : 'Show password');
    togglePasswordBtn.innerHTML = isCurrentlyPassword
      ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>`
      : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
          <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" stroke-width="1.8"></line>
        </svg>`;
  });
}

const openLogoutConfirmation = () => {
  logoutConfirmModal.hidden = false;
  logoutConfirmCancel.focus();
};

const closeLogoutConfirmation = () => {
  logoutConfirmModal.hidden = true;
};

logoutButton.addEventListener('click', openLogoutConfirmation);
logoutConfirmApprove.addEventListener('click', signOut);
logoutConfirmCancel.addEventListener('click', closeLogoutConfirmation);
if (logoutConfirmClose) logoutConfirmClose.addEventListener('click', closeLogoutConfirmation);
logoutConfirmModal.addEventListener('click', (event) => {
  if (event.target === logoutConfirmModal) closeLogoutConfirmation();
});

/* Static dashboard data — mirrors screenshot values exactly */

const navButtons = document.querySelectorAll('.nav-btn');
const clearActiveNavButtons = (selectedButton = null) => {
  const buttonsToClear = [
    ...document.querySelectorAll('.nav-btn'),
    calendarOpenButton,
    document.querySelector('.org-chart-btn'),
  ].filter(Boolean);

  buttonsToClear.forEach((button) => {
    if (button !== selectedButton) button.classList.remove('active');
  });
};
const mainNav = document.getElementById('mainNav');
const dashboardView = document.getElementById('dashboardView');
const employerFormView = document.getElementById('employerFormView');
const aoViews = document.querySelectorAll('.ao-view');
const employerForm = document.getElementById('employerForm');
const countryInput = employerForm.elements.addressCountry;
const stateSelect = employerForm.elements.addressState;
const citySelect = employerForm.elements.addressCity;
const postalCodeInput = employerForm.elements.addressPostalCode;
const barangayField = employerForm.querySelector('.barangay-field');
const barangaySelect = employerForm.elements.addressBarangay;
let addressRequestController = null;
let barangayRequestController = null;
const modalTitle = document.getElementById('employerFormTitle');
const tableDashboardModal = document.getElementById('tableDashboardModal');
const tableDashboardTitle = document.getElementById('tableDashboardTitle');
const tableDashboardClose = document.getElementById('tableDashboardClose');
const orgChartModal = document.getElementById('orgChartModal');
const orgChartClose = document.getElementById('orgChartClose');
const deleteConfirmModal = document.getElementById('deleteConfirmModal');
const deleteConfirmError = document.getElementById('deleteConfirmError');
const deleteConfirmApprove = document.getElementById('deleteConfirmApprove');
const deleteConfirmCancel = document.getElementById('deleteConfirmCancel');
const deleteConfirmClose = document.getElementById('deleteConfirmClose');
const calendarOpenButton = document.getElementById('calendarOpenButton');
const calendarModal = document.getElementById('calendarModal');
const calendarClose = document.getElementById('calendarClose');
const calendarPrevious = document.getElementById('calendarPrevious');
const calendarNext = document.getElementById('calendarNext');
const calendarAddEvent = document.getElementById('calendarAddEvent');
const calendarMonthLabel = document.getElementById('calendarMonthLabel');
const calendarGrid = document.getElementById('calendarGrid');
const calendarEventModal = document.getElementById('calendarEventModal');
const calendarEventClose = document.getElementById('calendarEventClose');
const calendarEventForm = document.getElementById('calendarEventForm');
const calendarError = document.getElementById('calendarError');
const calendarSummaryModal = document.getElementById('calendarSummaryModal');
const calendarSummaryClose = document.getElementById('calendarSummaryClose');
const calendarSummary = document.getElementById('calendarSummary');
const calendarEditEvent = document.getElementById('calendarEditEvent');
const calendarDeleteEvent = document.getElementById('calendarDeleteEvent');
const calendarNotificationModal = document.getElementById('calendarNotificationModal');
const calendarNotificationClose = document.getElementById('calendarNotificationClose');
const calendarNotificationOpen = document.getElementById('calendarNotificationOpen');
const calendarNotificationDismiss = document.getElementById('calendarNotificationDismiss');
const calendarNotificationSummary = document.getElementById('calendarNotificationSummary');
let calendarEvents = [];
let branchSummary = null;
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedCalendarDate = null;
let calendarEditingEventId = null;
let activeCalendarSummaryEvent = null;
let calendarReturnView = 'DASHBOARD';
let orgChartReturnView = 'DASHBOARD';
let employerFormReturnView = 'DASHBOARD';
const orgChartGroups = {
  root: document.querySelector('[data-org-chart-group="root"]'),
  admin: document.querySelector('[data-org-chart-group="admin"]'),
  users: document.querySelector('[data-org-chart-group="users"]'),
};
const orgChartContent = document.querySelector('.org-chart-content');

const normalizeCalendarDateString = (value) => {
  if (!value && value !== 0) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const dateOnly = raw.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return dateOnly;
  const isoDate = raw.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoDate) return isoDate[0];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return formatCalendarDate(parsed);
};

const formatCalendarDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
selectedCalendarDate = formatCalendarDate(new Date());

const openCalendarEventModalForDate = (date, event = null) => {
  selectedCalendarDate = date || formatCalendarDate(new Date());
  if (!calendarEventForm) return;
  calendarEventForm.reset();
  if (calendarError) calendarError.hidden = true;
  const submitButton = calendarEventForm.querySelector('button[type="submit"]');
  const titleHeader = document.getElementById('calendarEventTitle');
  if (event) {
    calendarEditingEventId = event.id;
    if (titleHeader) titleHeader.textContent = 'EDIT EVENT';
    calendarEventForm.elements.title.value = event.title || '';
    calendarEventForm.elements.date.value = normalizeCalendarDateString(event.event_date || selectedCalendarDate);
    calendarEventForm.elements.description.value = event.description || '';
    if (submitButton) submitButton.textContent = 'Update event';
  } else {
    calendarEditingEventId = null;
    if (titleHeader) titleHeader.textContent = 'ADD EVENT';
    calendarEventForm.elements.date.value = selectedCalendarDate;
    if (submitButton) submitButton.textContent = 'Save event';
  }
  calendarEventModal.hidden = false;
  calendarEventForm.elements.title.focus();
};

const updateEmployerTotals = () => {
  if (!employerForm) return;
  const principal = parseAmount(employerForm.elements.principal?.value);
  const penalty = parseAmount(employerForm.elements.penalty?.value);
  const interest = parseAmount(employerForm.elements.interest?.value);
  if (employerForm.elements.totalAmount) {
    employerForm.elements.totalAmount.value = formatAmount(principal + penalty + interest);
  }
  const paymentPrincipal = parseAmount(employerForm.elements.paymentPrincipal?.value);
  const paymentInterest = parseAmount(employerForm.elements.paymentInterest?.value);
  const paymentPenalty = parseAmount(employerForm.elements.paymentPenalty?.value);
  if (employerForm.elements.paymentTotal) {
    employerForm.elements.paymentTotal.value = formatAmount(paymentPrincipal + paymentInterest + paymentPenalty);
  }
  const soa2Principal = parseAmount(employerForm.elements.soa2Principal?.value);
  const soa2Penalty = parseAmount(employerForm.elements.soa2Penalty?.value);
  const soa2Interest = parseAmount(employerForm.elements.soa2Interest?.value);
  if (employerForm.elements.soa2Total) {
    employerForm.elements.soa2Total.value = formatAmount(soa2Principal + soa2Penalty + soa2Interest);
  }
  const soa3Principal = parseAmount(employerForm.elements.soa3Principal?.value);
  const soa3Penalty = parseAmount(employerForm.elements.soa3Penalty?.value);
  const soa3Interest = parseAmount(employerForm.elements.soa3Interest?.value);
  if (employerForm.elements.soa3Total) {
    employerForm.elements.soa3Total.value = formatAmount(soa3Principal + soa3Penalty + soa3Interest);
  }
};

const amountFieldNames = [
  'principal',
  'penalty',
  'interest',
  'totalAmount',
  'paymentPrincipal',
  'paymentInterest',
  'paymentPenalty',
  'paymentTotal',
  'soa2Principal',
  'soa2Penalty',
  'soa2Interest',
  'soa2Total',
  'soa3Principal',
  'soa3Penalty',
  'soa3Interest',
  'soa3Total',
];

amountFieldNames.forEach((fieldName) => {
  const el = employerForm?.elements[fieldName];
  if (!el) return;
  el.addEventListener('focus', (event) => {
    event.target.value = event.target.value.replace(/,/g, '');
  });
  el.addEventListener('blur', (event) => {
    event.target.value = formatAmount(event.target.value);
  });
});

['principal', 'penalty', 'interest', 'paymentPrincipal', 'paymentInterest', 'paymentPenalty', 'soa2Principal', 'soa2Penalty', 'soa2Interest', 'soa3Principal', 'soa3Penalty', 'soa3Interest'].forEach((fieldName) => {
  employerForm?.elements[fieldName]?.addEventListener('input', updateEmployerTotals);
});

const showCurrentDateNotification = () => {
  const today = formatCalendarDate(new Date());
  const todaysEvents = calendarEvents.filter((event) => event.event_date === today);
  if (!todaysEvents.length) return;
  calendarNotificationSummary.replaceChildren();
  todaysEvents.forEach((event) => {
    const eventSummary = document.createElement('article');
    eventSummary.className = 'calendar-notification-event';
    eventSummary.innerHTML = `<h3>${event.title}</h3><p>${event.description || 'No description provided.'}</p>`;
    calendarNotificationSummary.appendChild(eventSummary);
  });
  calendarNotificationModal.hidden = false;
  calendarNotificationClose.focus();
};

const getDynamicCalendarEvents = (year, month, daysInMonth) => {
  const dynamicEvents = [];
  const officerView = getOfficerView(currentUser?.role);
  const employers = getDashboardEmployers(officerView || "MasterFile");
  employers.forEach((emp) => {
    const status = (emp.status || "").toLowerCase();
    if (status.includes("settled") || status.includes("legal")) return;
    const servedDateStr = emp.soa3_date || emp.soa2_date || emp.soa_date || emp.billing_date;
    if (!servedDateStr) return;
    const cleanDate = String(servedDateStr).split("T")[0];
    const served = new Date(cleanDate);
    if (isNaN(served.getTime())) return;
    const dueDateObj = new Date(served.getTime() + 15 * 24 * 60 * 60 * 1000);
    const dueStr = formatCalendarDate(dueDateObj);
    dynamicEvents.push({
      id: "soa-due-" + emp.id,
      isDynamic: true,
      type: "soa-due",
      event_date: dueStr,
      title: "15-Day Due: " + (emp.employer_name || "Employer"),
      description: "15-Day SOA compliance period expires. Current Status: " + (emp.status || "1st SOA Served") + ". Assigned: " + (emp.assigned_view || "AO1"),
      employer: emp
    });
  });
  employers.forEach((emp) => {
    if (!emp.case_date) return;
    const cleanDate = String(emp.case_date).split("T")[0];
    dynamicEvents.push({
      id: "legal-" + emp.id,
      isDynamic: true,
      type: "legal-case",
      event_date: cleanDate,
      title: "Legal Hearing: " + (emp.employer_name || "Employer"),
      description: "Scheduled legal action / court hearing. Handling Lawyer: " + (emp.handling_lawyer || "Branch Legal") + ". Docket #: " + (emp.docket_number || "N/A"),
      employer: emp
    });
  });
  const mStr = String(month + 1).padStart(2, "0");
  dynamicEvents.push({
    id: "stat-10-" + year + "-" + month,
    isDynamic: true,
    type: "statutory",
    event_date: year + "-" + mStr + "-10",
    title: "SSS Regular Contribution Remittance Deadline",
    description: "Official SSS monthly contribution remittance deadline for regular registered employers."
  });
  dynamicEvents.push({
    id: "stat-end-" + year + "-" + month,
    isDynamic: true,
    type: "statutory",
    event_date: year + "-" + mStr + "-" + String(daysInMonth).padStart(2, "0"),
    title: "SSS Voluntary & Special Remittance Cut-off",
    description: "End-of-month contribution and loan amortization remittance cut-off date."
  });
  return dynamicEvents;
};
window.openCalendarEmployerRecord = (employerId) => {
  if (calendarSummaryModal) calendarSummaryModal.hidden = true;
  if (calendarModal) calendarModal.hidden = true;
  const matchingRow = document.querySelector("tr[data-employer-id=\"" + employerId + "\"]");
  if (matchingRow) {
    const assignedView = matchingRow.dataset.assignedView || "MasterFile";
    navigateToView(assignedView);
    matchingRow.scrollIntoView({ behavior: "smooth", block: "center" });
    matchingRow.classList.add("is-selected");
    openEmployerEdit(matchingRow);
  }
};

const renderCalendar = () => {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  calendarMonthLabel.textContent = calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  calendarGrid.replaceChildren();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dynamicEvents = getDynamicCalendarEvents(year, month, daysInMonth);
  const allEvents = [...calendarEvents, ...dynamicEvents];
  for (let index = 0; index < firstDay + daysInMonth; index += 1) {
    const dayCell = document.createElement("div");
    dayCell.className = "calendar-day";
    if (index < firstDay) {
      dayCell.classList.add("calendar-day-empty");
    } else {
      const day = index - firstDay + 1;
      const date = formatCalendarDate(new Date(year, month, day));
      if (date === formatCalendarDate(new Date())) dayCell.classList.add('is-today');
      dayCell.innerHTML = `<span class="calendar-day-number">${day}</span>`;
      dayCell.addEventListener('click', () => {
        openCalendarEventModalForDate(date);
      });
      calendarEvents.filter((event) => normalizeCalendarDateString(event.event_date) === date).forEach((event) => {
        const eventButton = document.createElement('button');
        eventButton.className = 'calendar-event';
        eventButton.type = 'button';
        eventButton.textContent = event.title;
        eventButton.addEventListener('click', (eventClick) => {
          eventClick.stopPropagation();
          activeCalendarSummaryEvent = event;
          if (calendarEditEvent) calendarEditEvent.dataset.eventId = String(event.id);
          if (calendarDeleteEvent) calendarDeleteEvent.dataset.eventId = String(event.id);
          calendarSummary.innerHTML = `<h3>${event.title}</h3><p>${normalizeCalendarDateString(event.event_date)}</p><p>${event.description || 'No description provided.'}</p>`;
          calendarSummaryModal.hidden = false;
          calendarSummaryClose.focus();
        });
        dayCell.appendChild(eventButton);
      });
    }
    calendarGrid.appendChild(dayCell);
  }
};

const loadCalendarEvents = async ({ showNotification = true } = {}) => {
  if (!currentUser) return;
  const response = await fetch('/api/calendar-events', { headers: { Authorization: `Bearer ${currentUser.accessToken}` } });
  if (!response.ok) throw new Error('Unable to load calendar events.');
  calendarEvents = (await response.json()).map((event) => ({
    ...event,
    event_date: normalizeCalendarDateString(event.event_date),
  }));
  renderCalendar();
  if (showNotification) window.setTimeout(showCurrentDateNotification, 500);
};

const showCalendarPage = () => {
  calendarReturnView = mainNav.dataset.activeView || 'DASHBOARD';
  pageWrapper.classList.remove('dashboard-active');
  orgChartModal.hidden = true;
  dashboardView.hidden = true;
  employerFormView.hidden = true;
  aoViews.forEach((view) => { view.hidden = true; });
  document.querySelector('.ao-views').classList.remove('is-active');
  clearActiveNavButtons(calendarOpenButton);
  calendarModal.hidden = false;
  calendarOpenButton.classList.add('active');
  document.querySelector('.dashboard-nav-item .org-chart-btn').classList.remove('active');
  renderCalendar();
  if (calendarClose) calendarClose.focus();
};

const closeCalendar = () => {
  calendarModal.hidden = true;
  calendarOpenButton.classList.remove('active');
  navigateToView(calendarReturnView);
};
const closeCalendarEvent = () => {
  calendarEditingEventId = null;
  if (calendarEventForm) {
    const submitButton = calendarEventForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.textContent = 'Save event';
    const titleHeader = document.getElementById('calendarEventTitle');
    if (titleHeader) titleHeader.textContent = 'ADD EVENT';
  }
  calendarEventModal.hidden = true;
};
const closeCalendarSummary = () => {
  activeCalendarSummaryEvent = null;
  if (calendarEditEvent) calendarEditEvent.removeAttribute('data-event-id');
  if (calendarDeleteEvent) calendarDeleteEvent.removeAttribute('data-event-id');
  calendarSummaryModal.hidden = true;
};
const closeCalendarNotification = () => { calendarNotificationModal.hidden = true; };

const resolveActiveCalendarEvent = () => {
  const eventId = (calendarEditEvent?.dataset?.eventId || calendarDeleteEvent?.dataset?.eventId || activeCalendarSummaryEvent?.id);
  if (eventId == null || eventId === '') {
    return activeCalendarSummaryEvent || null;
  }
  const foundEvent = calendarEvents.find((event) => String(event.id) === String(eventId));
  if (foundEvent) {
    activeCalendarSummaryEvent = foundEvent;
    if (calendarEditEvent) calendarEditEvent.dataset.eventId = String(foundEvent.id);
    if (calendarDeleteEvent) calendarDeleteEvent.dataset.eventId = String(foundEvent.id);
  }
  return foundEvent || activeCalendarSummaryEvent || null;
};

if (calendarOpenButton) calendarOpenButton.addEventListener('click', () => {
  showCalendarPage();
});
if (calendarClose) calendarClose.addEventListener('click', closeCalendar);
if (calendarPrevious) calendarPrevious.addEventListener('click', () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  renderCalendar();
});
if (calendarNext) calendarNext.addEventListener('click', () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  renderCalendar();
});
if (calendarAddEvent) calendarAddEvent.addEventListener('click', () => {
  openCalendarEventModalForDate(selectedCalendarDate || formatCalendarDate(new Date()));
});
if (calendarEventClose) calendarEventClose.addEventListener('click', closeCalendarEvent);
if (calendarSummaryClose) calendarSummaryClose.addEventListener('click', closeCalendarSummary);
if (calendarEditEvent) calendarEditEvent.addEventListener('click', () => {
  const selectedEvent = resolveActiveCalendarEvent();
  if (!selectedEvent) return;
  closeCalendarSummary();
  openCalendarEventModalForDate(selectedEvent.event_date, selectedEvent);
});
if (calendarDeleteEvent) calendarDeleteEvent.addEventListener('click', async () => {
  const selectedEvent = resolveActiveCalendarEvent();
  if (!selectedEvent) return;
  const confirmed = window.confirm(`Delete the event "${selectedEvent.title || 'Untitled event'}"?`);
  if (!confirmed) return;

  try {
    const response = await fetch(`/api/calendar-events/${selectedEvent.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${currentUser.accessToken}` },
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || 'Unable to delete calendar event.');
    }
    calendarEvents = calendarEvents.filter((event) => String(event.id) !== String(selectedEvent.id));
    closeCalendarSummary();
    renderCalendar();
  } catch (error) {
    window.alert(error.message);
  }
});
if (calendarNotificationClose) calendarNotificationClose.addEventListener('click', closeCalendarNotification);
if (calendarNotificationDismiss) calendarNotificationDismiss.addEventListener('click', closeCalendarNotification);
if (calendarNotificationOpen) calendarNotificationOpen.addEventListener('click', () => {
  closeCalendarNotification();
  showCalendarPage();
});

calendarEventForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  calendarError.hidden = true;
  const formData = new FormData(calendarEventForm);

  const submitButton = calendarEventForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const isEditing = Boolean(calendarEditingEventId);
    const response = await fetch(isEditing ? `/api/calendar-events/${calendarEditingEventId}` : '/api/calendar-events', {
      method: isEditing ? 'PUT' : 'POST',
      headers: { Authorization: `Bearer ${currentUser.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: formData.get('title'),
        date: formData.get('date'),
        description: formData.get('description'),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to save calendar event.');
    const normalizedResult = {
      ...result,
      event_date: normalizeCalendarDateString(result.event_date),
    };

    if (isEditing) {
      calendarEvents = calendarEvents.map((entry) => (String(entry.id) === String(normalizedResult.id) ? normalizedResult : entry));
    } else {
      calendarEvents.push(normalizedResult);
    }

    calendarEditingEventId = null;
    closeCalendarEvent();
    renderCalendar();
    if (normalizedResult.event_date === formatCalendarDate(new Date())) showCurrentDateNotification();
  } catch (error) {
    calendarError.textContent = error.message;
    calendarError.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
});

calendarEventModal.addEventListener('click', (event) => {
  if (event.target === calendarEventModal) closeCalendarEvent();
});
calendarSummaryModal.addEventListener('click', (event) => {
  if (event.target === calendarSummaryModal) closeCalendarSummary();
});
calendarNotificationModal.addEventListener('click', (event) => {
  if (event.target === calendarNotificationModal) closeCalendarNotification();
});

const employerFields = [
  'employer_number',
  'employer_name',
  'payer_type',
  'address',
  'employee_count',
  'principal',
  'interest',
  'penalty',
  'total_amount',
  'payment_principal',
  'payment_interest',
  'payment_penalty',
  'payment_total',
  'soa_date',
  'person_received',
  'soa2_date',
  'soa2_person_received',
  'soa3_date',
  'soa3_person_received',
  'billing_date',
  'billing_person_received',
  'coverage_date',
  'legal_referral_date',
  'demand_letter_date',
  'demand_letter_received_date',
  'demand_person_received',
  'handling_lawyer',
  'docket_number',
  'case_date',
  'status',
];
const amountFieldIndexes = [5, 6, 7, 8, 9, 10, 11, 12];
const dateFieldIndexes = [13, 15, 17, 19, 21, 22, 23, 24, 28];
const formatSssEmployerNumber = (val) => {
  if (!val) return '';
  const digits = String(val).replace(/\D/g, '').slice(0, 10);
  if (digits.length > 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 9)}-${digits.slice(9)}`;
  }
  if (digits.length > 2) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }
  return digits;
};

const employerToRow = (employer) => [
  formatSssEmployerNumber(employer.employer_number),
  employer.employer_name || '',
  employer.payer_type || 'Interim Payer',
  employer.address || '',
  employer.employee_count ?? 0,
  employer.principal ?? 0,
  employer.interest ?? 0,
  employer.penalty ?? 0,
  employer.total_amount ?? 0,
  employer.payment_principal ?? 0,
  employer.payment_interest ?? 0,
  employer.payment_penalty ?? 0,
  employer.payment_total ?? 0,
  employer.soa_date || '',
  employer.person_received || '',
  employer.soa2_date || '',
  employer.soa2_person_received || '',
  employer.soa3_date || '',
  employer.soa3_person_received || '',
  employer.billing_date || '',
  employer.billing_person_received || '',
  employer.coverage_date || '',
  employer.legal_referral_date || '',
  employer.demand_letter_date || '',
  employer.demand_letter_received_date || '',
  employer.demand_person_received || '',
  employer.handling_lawyer || '',
  employer.docket_number || '',
  employer.case_date || '',
  employer.status || '1st SOA Served',
];

const formatDisplayDate = (val) => {
  if (!val) return '';
  const str = String(val).split('T')[0].trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const parts = str.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[parseInt(parts[1], 10) - 1] || parts[1];
    return `${parts[2]}-${month}-${parts[0]}`;
  }
  return str;
};

const getTableEmployers = (viewName) => [...document.querySelectorAll(`[data-ao-view="${viewName}"] .ao-table tbody tr[data-employer-id]`)]
  .map((row) => [...row.cells].map((cell) => cell.textContent.trim()));

const normalizeStatus = (status) => status.trim().toLowerCase().replace('registed', 'registered');
const parseAmount = (value) => Number(String(value ?? '').replace(/,/g, '')) || 0;
const formatAmount = (value) => {
  const amount = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(amount)
    ? amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';
};
const isAmountMetric = (name) => ['billed', 'paid', 'settledAmount', 'unsettledAmount', 'target'].includes(name);
const SOA_COMPLIANCE_DAYS = 15;

const getEmployerSoaInfo = (employer) => {
  const status = String(employer?.status || '').trim();
  if (['settled'].includes(status.toLowerCase())) {
    return { stage: 'Settled', isDue: false, isLapsed: false, isForwarded: false, daysRemaining: null, nextAction: 'None' };
  }
  if (['referred to legal', 'legal'].includes(status.toLowerCase())) {
    return { stage: 'Referred to Legal', isDue: false, isLapsed: false, isForwarded: false, daysRemaining: null, nextAction: 'Legal Case in Progress' };
  }

  let activeStage = '1st SOA';
  let servedDate = employer?.soa_date || employer?.billing_date;
  let nextAction = 'Forward records & Serve 2nd SOA';
  let nextStageCode = '2nd SOA';
  let targetField = 'soa2Date';

  if (employer?.soa3_date) {
    activeStage = '3rd SOA';
    servedDate = employer.soa3_date;
    nextAction = 'Forward to Legal / Atty.';
    nextStageCode = 'Legal';
    targetField = 'legalReferralDate';
  } else if (employer?.soa2_date) {
    activeStage = '2nd SOA';
    servedDate = employer.soa2_date;
    nextAction = 'Forward records & Serve 3rd SOA';
    nextStageCode = '3rd SOA';
    targetField = 'soa3Date';
  } else if (employer?.soa_date) {
    activeStage = '1st SOA';
    servedDate = employer.soa_date;
    nextAction = 'Forward records & Serve 2nd SOA';
    nextStageCode = '2nd SOA';
    targetField = 'soa2Date';
  } else if (employer?.billing_date) {
    activeStage = 'Billing';
    servedDate = employer.billing_date;
    nextAction = 'Serve 1st SOA';
    nextStageCode = '1st SOA';
    targetField = 'soaDate';
  }

  if (!servedDate) {
    return { stage: status || 'Not Yet Served', isDue: false, isLapsed: false, isForwarded: false, daysRemaining: null, nextAction: 'Serve 1st SOA', targetField };
  }

  const dateOnly = String(servedDate || '').split('T')[0].trim();
  if (!dateOnly || !/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return { stage: activeStage, isDue: false, isLapsed: false, isForwarded: false, daysRemaining: null, nextAction, targetField };
  }

  const served = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(served.getTime())) {
    return { stage: activeStage, isDue: false, isLapsed: false, isForwarded: false, daysRemaining: null, nextAction, targetField };
  }

  const dueDate = new Date(served);
  dueDate.setDate(dueDate.getDate() + SOA_COMPLIANCE_DAYS);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const isLapsed = diffDays <= 0;
  const isDueSoon = diffDays >= 0 && diffDays <= 1; // 24 hours notice or due today

  // Check if tagged as Forwarded for this active stage
  const isForwarded = Boolean(employer?.forwarded_stage && employer.forwarded_stage.includes(activeStage));
  const isDue = (isLapsed || isDueSoon) && !isForwarded;

  return {
    stage: `${activeStage} Served`,
    activeStage,
    servedDate,
    dueDate: dueDate.toISOString().split('T')[0],
    daysRemaining: diffDays,
    isLapsed,
    isDueSoon,
    isForwarded,
    forwardedDate: employer?.forwarded_date,
    isDue,
    nextAction,
    nextStageCode,
    targetField,
  };
};

const configureStatusDropdown = (employer = null) => {
  const statusSelect = employerForm.elements.status;
  if (!statusSelect) return;

  const statusList = [
    { value: '1st SOA Served', label: '1st SOA Served' },
    { value: '2nd SOA Served', label: '2nd SOA Served' },
    { value: '3rd SOA Served', label: '3rd SOA Served' },
    { value: 'Referred to Legal', label: 'Referred to Legal' },
    { value: 'Settled', label: 'Settled' },
  ];

  const currentStatus = employer?.status || (employerForm.elements.payerType?.value === 'Regular Payer' ? 'Settled' : '1st SOA Served');

  if (!employer) {
    // Registration mode
    const isRegular = employerForm.elements.payerType?.value === 'Regular Payer';
    const regStatus = isRegular ? 'Settled' : '1st SOA Served';
    statusSelect.innerHTML = statusList.map((opt) => `
      <option value="${opt.value}" ${opt.value === regStatus ? 'selected' : ''}>${opt.label}</option>
    `).join('');
    statusSelect.disabled = true;
    return;
  }

  // Edit mode
  statusSelect.disabled = false;
  statusSelect.innerHTML = statusList.map((opt) => `
    <option value="${opt.value}" ${opt.value === currentStatus ? 'selected' : ''}>${opt.label}</option>
  `).join('');
};

const markEmployerAsForwarded = async (employerId, activeStage) => {
  const matchingRow = document.querySelector(`tr[data-employer-id="${employerId}"]`);
  const employer = JSON.parse(matchingRow?.dataset.employer || '{}');
  if (!employer.id) return;

  const today = new Date().toISOString().split('T')[0];
  const updatedEmployer = {
    ...employer,
    forwarded_stage: `${activeStage} Forwarded`,
    forwarded_date: today,
  };

  const response = await fetch('/api/employers', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${currentUser?.accessToken || ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: employerId, employer: updatedEmployer }),
  });

  if (!response.ok) {
    alert('Unable to mark record as forwarded.');
    return;
  }

  const saved = await response.json();
  document.querySelectorAll(`tr[data-employer-id="${saved.id}"]`).forEach((row) => {
    row.dataset.employer = JSON.stringify(saved);
  });
  addEmployerToTable(saved.assigned_view, employerToRow(saved), saved.id, saved.assigned_view, saved);
  addEmployerToTable('MasterFile', employerToRow(saved), saved.id, saved.assigned_view, saved);
  updateSoaReminders();
};

const isBillingDue = (billingDate, today = new Date()) => {
  if (!billingDate) return false;
  const dateOnly = String(billingDate || '').split('T')[0].trim();
  if (!dateOnly || !/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return false;
  const dueDate = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(dueDate.getTime())) return false;
  dueDate.setDate(dueDate.getDate() + SOA_COMPLIANCE_DAYS);
  const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return currentDate >= dueDate;
};

const updateSoaReminders = () => {
  const badge = document.getElementById('soaBadgeCount');
  const reminderList = document.getElementById('soaReminderList');
  const bellBtn = document.getElementById('soaNotificationBell');

  const officerView = getOfficerView(currentUser?.role);
  const selector = officerView
    ? `[data-ao-view="${officerView}"] .ao-table tbody tr[data-employer-id]`
    : '.ao-table tbody tr[data-employer-id]';

  const rows = [...document.querySelectorAll(selector)];
  const seenIds = new Set();
  const dueEmployers = [];

  rows.forEach((row) => {
    const employer = JSON.parse(row.dataset.employer || '{}');
    if (!employer.id || seenIds.has(employer.id)) return;
    seenIds.add(employer.id);

    const soaInfo = getEmployerSoaInfo(employer);
    if (soaInfo.isDue) {
      dueEmployers.push({ employer, soaInfo, row });
    }
  });

  if (badge) {
    badge.textContent = dueEmployers.length;
    badge.hidden = dueEmployers.length === 0;
  }

  if (bellBtn) {
    bellBtn.classList.toggle('soa-bell-pulse', dueEmployers.length > 0);
  }

  if (reminderList) {
    if (dueEmployers.length === 0) {
      reminderList.innerHTML = '<div class="soa-empty-message">All SOA compliance periods are up to date or marked as forwarded. No pending follow-ups required.</div>';
    } else {
      reminderList.innerHTML = dueEmployers.map(({ employer, soaInfo }) => `
        <div class="soa-reminder-item ${soaInfo.isDueSoon && !soaInfo.isLapsed ? 'warning' : ''}">
          <div class="soa-reminder-info">
            <div class="soa-reminder-header">
              <span class="soa-reminder-name">${employer.employer_name}</span>
              <span class="soa-reminder-number">${employer.employer_number}</span>
              <span class="payer-badge payer-badge-ip">${employer.assigned_view || 'AO'}</span>
            </div>
            <div class="soa-reminder-stage">
              <strong>${soaInfo.stage}</strong> on ${soaInfo.servedDate || 'N/A'} (15-day deadline: ${soaInfo.dueDate || 'N/A'})
            </div>
            <div class="soa-reminder-days ${soaInfo.isDueSoon && !soaInfo.isLapsed ? 'warning' : ''}">
              ${soaInfo.isLapsed ? `15-day period lapsed by ${Math.abs(soaInfo.daysRemaining)} days!` : '24 Hours Notice: 15-day deadline is today!'}
              &bull; <em>Action required: ${soaInfo.nextAction}</em>
            </div>
          </div>
          <div class="soa-reminder-actions">
            <button class="soa-reminder-view-btn" type="button" data-soa-view-masterfile-id="${employer.id}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:2px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              View in MasterFile &rarr;
            </button>
          </div>
        </div>
      `).join('');

      reminderList.querySelectorAll('[data-soa-view-masterfile-id]').forEach((button) => {
        button.addEventListener('click', () => {
          const empId = button.dataset.soaViewMasterfileId;
          const modal = document.getElementById('soaReminderModal');
          if (modal) modal.hidden = true;
          
          navigateToView('MasterFile');
          
          // Clear active filter in MasterFile to ensure the target row is visible
          const masterFileView = document.querySelector('[data-ao-view="MasterFile"]');
          if (masterFileView) {
            const allTab = masterFileView.querySelector('.ao-sheet-tab[data-sheet="ALL"]');
            if (allTab && !allTab.classList.contains('active')) {
              masterFileView.querySelectorAll('.ao-sheet-tab').forEach((t) => t.classList.remove('active'));
              allTab.classList.add('active');
            }
            const statusFilter = masterFileView.querySelector('[data-filter-status]');
            if (statusFilter && statusFilter.value) statusFilter.value = '';
            const searchInput = masterFileView.querySelector('.ao-table-search input');
            if (searchInput && searchInput.value) searchInput.value = '';
            filterAoTable('MasterFile');
          }

          setTimeout(() => {
            const masterFileRow = document.querySelector(`[data-ao-view="MasterFile"] tr[data-employer-id="${empId}"]`);
            if (masterFileRow) {
              masterFileRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
              masterFileRow.classList.add('row-highlight-pulse');
              setTimeout(() => { masterFileRow.classList.remove('row-highlight-pulse'); }, 2500);
            }
          }, 150);
        });
      });
    }
  }
};

const showDatabaseDueNotification = (viewName) => {
  const view = document.querySelector(`[data-ao-view="${viewName}"]`);
  if (!view || !databaseNotification) return;

  const dueCount = [...view.querySelectorAll('tbody tr[data-employer-id]')]
    .filter((row) => {
      const emp = JSON.parse(row.dataset.employer || '{}');
      return getEmployerSoaInfo(emp).isDue;
    }).length;
  databaseNotification.textContent = `${dueCount} SOA follow-up ${dueCount === 1 ? 'record' : 'records'} require attention.`;
  databaseNotification.hidden = false;
  clearTimeout(databaseNotificationTimer);
  databaseNotificationTimer = window.setTimeout(() => {
    databaseNotification.hidden = true;
  }, 3000);
};

const filterAoTable = (viewName) => {
  const view = document.querySelector(`[data-ao-view="${viewName}"]`);
  const filters = view?.querySelector('.ao-table-filters');
  if (!filters) return;

  const officerView = getCurrentOfficerCode();
  const query = filters.querySelector('input[type="search"]').value.trim().toLowerCase();
  const selectedDate = filters.querySelector('[data-filter-date]').value;
  const selectedStatus = normalizeStatus(filters.querySelector('[data-filter-status]').value);
  const selectedAddress = (filters.querySelector('[data-filter-address]')?.value || '').trim().toLowerCase();
  const selectedViewInput = filters.querySelector('[data-filter-branch], [data-filter-view]');
  const selectedView = officerView ? '' : (selectedViewInput?.value || '').trim();
  const activeSheet = view.querySelector('.ao-sheet-tab.active')?.dataset.sheet || 'ALL';
  const rows = [...view.querySelectorAll('tbody tr[data-employer-id]')];

  let rpCount = 0;
  let ipCount = 0;
  let npCount = 0;
  let dueCount = 0;

  rows.forEach((row) => {
    const employer = JSON.parse(row.dataset.employer || '{}');
    const payerType = row.dataset.payerType || employer.payer_type || 'Interim Payer';
    const isNonPaying = payerType === 'Non-Paying' || payerType === 'Non Paying' || payerType === 'Special Payer' || payerType === 'NP' || payerType === 'SP';
    if (payerType === 'Regular Payer' || payerType === 'RP') rpCount += 1;
    else if (isNonPaying) npCount += 1;
    else ipCount += 1;

    const soaInfo = getEmployerSoaInfo(employer);
    if (soaInfo.isDue) dueCount += 1;

    const matchesQuery = !query || row.textContent.toLowerCase().includes(query);
    const matchesDate = !selectedDate || row.cells[13]?.dataset.date === selectedDate;
    
    let matchesStatus = true;
    if (selectedStatus) {
      if (selectedStatus === 'due date' || selectedStatus === 'due for 2nd soa') {
        matchesStatus = soaInfo.isDue;
      } else {
        matchesStatus = normalizeStatus(row.cells[29]?.textContent || employer.status || '') === selectedStatus
          || normalizeStatus(soaInfo.stage).includes(selectedStatus);
      }
    }

    const empAddress = [employer.address, employer.address_city, employer.address_barangay, employer.address_state, employer.address_line1, row.cells[3]?.textContent].filter(Boolean).join(' ').toLowerCase();
    const matchesAddress = !selectedAddress || empAddress.includes(selectedAddress);

    const rowAssignedView = (row.dataset.assignedView || employer.assigned_view || '').trim();
    const matchesView = !selectedView || rowAssignedView === selectedView;

    let matchesSheet = true;
    if (activeSheet === 'RP') matchesSheet = payerType === 'Regular Payer' || payerType === 'RP';
    else if (activeSheet === 'IP') matchesSheet = payerType === 'Interim Payer' || payerType === 'IP';
    else if (activeSheet === 'NP' || activeSheet === 'SP') matchesSheet = isNonPaying;
    else if (activeSheet === 'DUE') matchesSheet = soaInfo.isDue;

    const isVisible = matchesQuery && matchesDate && matchesStatus && matchesAddress && matchesView && matchesSheet;
    row.hidden = !isVisible;
  });

  const countAll = view.querySelector('[data-sheet-count="ALL"]');
  const countRP = view.querySelector('[data-sheet-count="RP"]');
  const countIP = view.querySelector('[data-sheet-count="IP"]');
  const countSP = view.querySelector('[data-sheet-count="SP"]');
  const countNP = view.querySelector('[data-sheet-count="NP"]');
  const countDUE = view.querySelector('[data-sheet-count="DUE"]');
  if (countAll) countAll.textContent = rows.length;
  if (countRP) countRP.textContent = rpCount;
  if (countIP) countIP.textContent = ipCount;
  if (countSP) countSP.textContent = npCount;
  if (countNP) countNP.textContent = npCount;
  if (countDUE) countDUE.textContent = dueCount;

  // Urgent Action Notification Banner in this AO view
  const banner = view.querySelector('.ao-urgent-banner');
  if (banner) {
    const bannerCount = banner.querySelector('[data-banner-count]');
    if (bannerCount) bannerCount.textContent = dueCount;
    banner.hidden = dueCount === 0;
  }

  updateSoaReminders();
};

const getDashboardEmployers = (viewName) => {
  const officerView = getCurrentOfficerCode();
  const selector = (!viewName || viewName === 'MasterFile')
    ? '.ao-view[data-ao-view="MasterFile"] .ao-table tbody tr[data-employer-id]'
    : `.ao-view[data-ao-view="${viewName}"] .ao-table tbody tr[data-employer-id]`;

  return [...document.querySelectorAll(selector)].map((row) => {
    try {
      return JSON.parse(row.dataset.employer || '{}');
    } catch {
      return {};
    }
  }).filter((emp) => emp.id && (!officerView || String(emp.assigned_view || '').trim() === String(officerView)));
};

const getDashboardMetrics = (employersOrRows, customTarget = null) => {
  let employers = [];
  if (Array.isArray(employersOrRows)) {
    if (employersOrRows.length > 0 && typeof employersOrRows[0] === 'object' && !Array.isArray(employersOrRows[0])) {
      employers = employersOrRows;
    } else {
      employers = employersOrRows.map((row) => ({
        id: true,
        employer_number: row[0],
        payer_type: row[2],
        principal: parseAmount(row[5]),
        total_amount: parseAmount(row[8]),
        payment_total: parseAmount(row[12]),
        soa_date: row[13],
        status: row[29] || row[24],
      }));
    }
  }

  const total = employers.length;
  const settled = employers.filter((e) => getEmployerSoaInfo(e).stage === 'Settled' || (e.status || '').toLowerCase() === 'settled').length;
  const unsettled = total - settled;
  const soa1Count = employers.filter((e) => (e.status || '').toLowerCase().includes('1st soa')).length;
  const soa2Count = employers.filter((e) => (e.status || '').toLowerCase().includes('2nd soa')).length;
  const soa3Count = employers.filter((e) => (e.status || '').toLowerCase().includes('3rd soa')).length;
  const legalCount = employers.filter((e) => (e.status || '').toLowerCase().includes('legal')).length;

  let dueCount = 0;
  employers.forEach((emp) => {
    if (getEmployerSoaInfo(emp).isDue) dueCount += 1;
  });

  const pendingSoa = employers.filter((e) => !e.soa_date && getEmployerSoaInfo(e).stage !== 'Settled' && (e.status || '').toLowerCase() !== 'settled').length;

  const missingAmount = employers.filter((e) => {
    const isRegular = (e.payer_type || '').toLowerCase().includes('regular') || (e.payer_type || '').includes('RP');
    const principal = Number(e.principal || 0);
    const totalAmount = Number(e.total_amount || 0);
    return !isRegular && (principal === 0 && totalAmount === 0);
  }).length;

  const empNumbers = employers.map((e) => (e.employer_number || '').trim()).filter(Boolean);
  const duplicatesSet = new Set();
  const seenEmp = new Set();
  empNumbers.forEach((num) => {
    if (seenEmp.has(num)) duplicatesSet.add(num);
    else seenEmp.add(num);
  });
  const duplicateCount = duplicatesSet.size;

  const rp = employers.filter((e) => (e.payer_type || '').toLowerCase().includes('regular') || (e.payer_type || '').includes('RP')).length;
  const sp = employers.filter((e) => {
    const pt = (e.payer_type || '').toLowerCase();
    return pt.includes('non') || pt.includes('special') || (e.payer_type || '').includes('NP') || (e.payer_type || '').includes('SP');
  }).length;
  const ip = total - rp - sp;
  const ipSp = ip + sp;

  const billed = employers.reduce((sum, e) => sum + Number(e.soa3_total || e.soa2_total || e.total_amount || 0), 0);
  const paid = employers.reduce((sum, e) => sum + Number(e.payment_total || 0), 0);
  const settledAmount = employers.filter((e) => getEmployerSoaInfo(e).stage === 'Settled' || (e.status || '').toLowerCase() === 'settled')
    .reduce((sum, e) => sum + Number(e.soa3_total || e.soa2_total || e.total_amount || 0), 0);
  const unsettledAmount = Math.max(0, billed - paid);

  const targetAmount = customTarget ?? 15000000;
  const targetPercent = targetAmount ? ((paid / targetAmount) * 100).toFixed(2) : '0.00';
  const accomplishmentPercent = billed > 0 ? ((paid / billed) * 100).toFixed(2) : '0.00';

  return {
    total,
    settled,
    unsettled,
    soa1Count,
    soa2Count,
    soa3Count,
    legalCount,
    dueCount,
    pendingSoa,
    missingAmount,
    duplicateCount,
    rp,
    ip,
    sp,
    ipSp,
    billedVal: billed,
    paidVal: paid,
    unsettledVal: unsettledAmount,
    completion: `${total ? ((settled / total) * 100).toFixed(2) : '0.00'}%`,
    billed: `₱${formatAmount(billed)}`,
    paid: `₱${formatAmount(paid)}`,
    settledAmount: `₱${formatAmount(settledAmount)}`,
    unsettledAmount: `₱${formatAmount(unsettledAmount)}`,
    accomplishmentRate: `${accomplishmentPercent}%`,
  };
};

let allowAdminEmployerForm = false;

const navigateToView = (viewName) => {
  if (viewName === 'EmployerForm' && isAdminSideRole(currentUser?.role) && !allowAdminEmployerForm) {
    viewName = 'DASHBOARD';
  }
  const isDashboard = viewName === 'DASHBOARD';
  const isEmployerForm = viewName === 'EmployerForm';
  calendarModal.hidden = true;
  orgChartModal.hidden = true;
  const selectedNavButton = [...navButtons].find((button) => {
    const buttonView = button.textContent.trim() === 'MASTERFILE' ? 'MasterFile' : button.textContent.trim();
    return buttonView === viewName;
  });
  clearActiveNavButtons(selectedNavButton);
  if (selectedNavButton) selectedNavButton.classList.add('active');
  calendarOpenButton.classList.remove('active');
  pageWrapper.classList.toggle('dashboard-active', isDashboard);
  dashboardView.hidden = !isDashboard;
  employerFormView.hidden = !isEmployerForm;
  aoViews.forEach((view) => {
    view.hidden = isDashboard || isEmployerForm || view.dataset.aoView !== viewName;
  });
  document.querySelector('.ao-views').classList.toggle('is-active', !isDashboard && !isEmployerForm);
  mainNav.dataset.activeView = viewName;

  if (['AO1', 'AO2', 'AO3', 'MasterFile'].includes(viewName)) {
    filterAoTable(viewName);
  }
  updateSoaReminders();
};

const refreshMainDashboard = () => {
  syncOfficerDashboardPanels();
  const masterEmployers = getDashboardEmployers('MasterFile');
  const dashboardMetrics = getDashboardMetrics(masterEmployers);

  Object.entries(dashboardMetrics).forEach(([name, value]) => {
    const metric = document.querySelector(`[data-main-metric="${name}"]`);
    if (metric) metric.textContent = value;
  });
  ['settled', 'unsettled', 'dueCount', 'legalCount', 'pendingSoa', 'missingAmount', 'duplicateCount', 'rp', 'ipSp'].forEach((name) => {
    const metric = document.querySelector(`[data-status-metric="${name}"]`);
    if (metric) metric.textContent = dashboardMetrics[name] ?? 0;
  });

  // Branch Segmented Delinquency Recovery Bar Updates
  const totalBilledVal = dashboardMetrics.billedVal || 0;
  const totalPaidVal = dashboardMetrics.paidVal || 0;
  
  const legalAmount = masterEmployers
    .filter((e) => (e.status || '').toLowerCase().includes('legal'))
    .reduce((sum, e) => sum + Number(e.soa3_total || e.soa2_total || e.total_amount || 0), 0);
  const activeDemandAmount = Math.max(0, totalBilledVal - totalPaidVal - legalAmount);

  const paidPct = totalBilledVal > 0 ? ((totalPaidVal / totalBilledVal) * 100) : 0;
  const activePct = totalBilledVal > 0 ? ((activeDemandAmount / totalBilledVal) * 100) : 0;
  const legalPct = totalBilledVal > 0 ? ((legalAmount / totalBilledVal) * 100) : 0;

  const segCollected = document.getElementById('segCollected');
  const segSoa = document.getElementById('segSoa');
  const segLegal = document.getElementById('segLegal');
  if (segCollected) segCollected.style.width = `${paidPct.toFixed(2)}%`;
  if (segSoa) segSoa.style.width = `${activePct.toFixed(2)}%`;
  if (segLegal) segLegal.style.width = `${legalPct.toFixed(2)}%`;

  const legendPaid = document.getElementById('legendPaid');
  const legendPaidPct = document.getElementById('legendPaidPct');
  const legendActive = document.getElementById('legendActive');
  const legendActivePct = document.getElementById('legendActivePct');
  const legendLegal = document.getElementById('legendLegal');
  const legendLegalPct = document.getElementById('legendLegalPct');
  if (legendPaid) legendPaid.textContent = `₱${formatAmount(totalPaidVal)}`;
  if (legendPaidPct) legendPaidPct.textContent = `${paidPct.toFixed(1)}%`;
  if (legendActive) legendActive.textContent = `₱${formatAmount(activeDemandAmount)}`;
  if (legendActivePct) legendActivePct.textContent = `${activePct.toFixed(1)}%`;
  if (legendLegal) legendLegal.textContent = `₱${formatAmount(legalAmount)}`;
  if (legendLegalPct) legendLegalPct.textContent = `${legalPct.toFixed(1)}%`;

  const targetLabel = document.getElementById('targetProgressLabel');
  const targetBadge = document.getElementById('targetProgressBadge');
  if (targetLabel) targetLabel.textContent = `${dashboardMetrics.paid} Collected / ${dashboardMetrics.billed} Total Collectibles`;
  if (targetBadge) targetBadge.textContent = `${dashboardMetrics.accomplishmentRate} RECOVERED`;

  // Branch Performance Table breakdown
  const branchMetrics = ['AO1', 'AO2', 'AO3'].map((viewName) => ({
    viewName,
    metrics: getDashboardMetrics(getDashboardEmployers(viewName)),
  }));

  branchMetrics.forEach(({ viewName, metrics }) => {
    const row = document.querySelector(`[data-branch-row="${viewName}"]`);
    if (!row) return;
    row.querySelector('[data-branch-metric="rp"]').textContent = metrics.rp;
    row.querySelector('[data-branch-metric="ip"]').textContent = metrics.ip;
    const npCell = row.querySelector("[data-branch-metric=\"np\"], [data-branch-metric=\"sp\"]"); if (npCell) npCell.textContent = metrics.np ?? metrics.sp;
    row.querySelector('[data-branch-metric="total"]').textContent = metrics.total;
    row.querySelector('[data-branch-metric="settled"]').textContent = metrics.settled;
    row.querySelector('[data-branch-metric="unsettled"]').textContent = metrics.unsettled;
    row.querySelector('[data-branch-metric="billed"]').textContent = formatAmount(metrics.billedVal);
    row.querySelector('[data-branch-metric="paid"]').textContent = formatAmount(metrics.paidVal);
    const balanceCell = row.querySelector('[data-branch-metric="balance"]');
    if (balanceCell) balanceCell.textContent = formatAmount(metrics.unsettledVal);
    row.querySelector('[data-branch-metric="accomplishment"]').textContent = metrics.accomplishmentRate || '0.00%';
  });

  const branchTotals = ['total', 'settled', 'unsettled', 'rp', 'ip', 'sp'].reduce((totals, name) => {
    totals[name] = branchMetrics.reduce((sum, branch) => sum + (branch.metrics[name] || 0), 0);
    return totals;
  }, {});
  const totalBilled = branchMetrics.reduce((sum, branch) => sum + (branch.metrics.billedVal || 0), 0);
  const totalPaid = branchMetrics.reduce((sum, branch) => sum + (branch.metrics.paidVal || 0), 0);
  const totalBalance = Math.max(0, totalBilled - totalPaid);
  const totalAccomplishment = totalBilled > 0 ? ((totalPaid / totalBilled) * 100).toFixed(2) : '0.00';

  branchTotals.billed = formatAmount(totalBilled);
  branchTotals.paid = formatAmount(totalPaid);
  branchTotals.balance = formatAmount(totalBalance);
  branchTotals.accomplishment = `${totalAccomplishment}%`;

  Object.entries(branchTotals).forEach(([name, value]) => {
    const metric = document.querySelector(`[data-branch-total="${name}"]`);
    if (metric) metric.textContent = value;
  });

  // Dynamic Executive Action Insights
  const leadingBranch = branchMetrics.reduce((leading, branch) => (
    branch.metrics.total > leading.metrics.total ? branch : leading
  ), branchMetrics[0]);

  const insightAlerts = document.querySelector('[data-insight="alerts"]');
  if (insightAlerts) {
    insightAlerts.textContent = dashboardMetrics.dueCount > 0
      ? `${dashboardMetrics.dueCount} accounts have reached the 15-day compliance threshold and require next SOA escalation.`
      : 'All SOA accounts are currently compliant within their 15-day action windows.';
  }

  const insightLead = document.querySelector('[data-insight="leadingBranch"]');
  if (insightLead) {
    insightLead.textContent = `${leadingBranch.viewName} leads with ${leadingBranch.metrics.total} encoded records and ₱${formatAmount(leadingBranch.metrics.paidVal)} collections.`;
  }

  const insightBilling = document.querySelector('[data-insight="billing"]');
  if (insightBilling) {
    insightBilling.textContent = `${dashboardMetrics.paid} collected against ${dashboardMetrics.billed} total delinquency receivables (${dashboardMetrics.accomplishmentRate} recovery).`;
  }

  refreshCharts();
  updateSoaReminders();
};

const refreshCharts = () => {
  if (!pieChart || !barChart || !groupedBarChart) return;

  const branchMetrics = ['AO1', 'AO2', 'AO3'].map((viewName) => getDashboardMetrics(getDashboardEmployers(viewName)));
  const masterMetrics = getDashboardMetrics(getDashboardEmployers('MasterFile'));

  // Pie chart: Distribution by Branch
  pieChart.data.datasets[0].data = branchMetrics.map((b) => b.total);

  // Bar chart: 5-Stage SOA Escalation Pipeline
  barChart.data.datasets[0].data = [
    masterMetrics.soa1Count,
    masterMetrics.soa2Count,
    masterMetrics.soa3Count,
    masterMetrics.legalCount,
    masterMetrics.settled,
  ];

  // Grouped Bar Chart
  groupedBarChart.data.datasets.forEach((dataset, index) => {
    if (index < 3) {
      const b = branchMetrics[index];
      dataset.data = [b.total, b.settled, b.unsettled, b.billedVal / 1000, b.paidVal / 1000];
    } else {
      dataset.data = [masterMetrics.total, masterMetrics.settled, masterMetrics.unsettled, masterMetrics.billedVal / 1000, masterMetrics.paidVal / 1000];
    }
  });

  pieChart.update('none');
  barChart.update('none');
  groupedBarChart.update('none');
};

const updatePayerTypeVisibility = () => {
  const payerType = employerForm.elements.payerType?.value;
  const isRegular = payerType === 'Regular Payer';
  const collectiblesGroup = document.getElementById('collectiblesFieldsGroup');
  if (collectiblesGroup) collectiblesGroup.hidden = isRegular;

  if (isRegular) {
    employerForm.elements.principal.value = '0.00';
    employerForm.elements.penalty.value = '0.00';
    employerForm.elements.interest.value = '0.00';
    employerForm.elements.totalAmount.value = '0.00';
  }

  if (!editingEmployerId) {
    // Registration Mode: Auto-update status lock based on Payer Type (RP -> Settled, IP/NP -> 1st SOA Served)
    configureStatusDropdown(null);
  } else {
    // Edit Mode: Enable full dropdown, but if changed to Regular Payer, suggest Settled
    const currentStatus = employerForm.elements.status.value;
    const updatedStatus = isRegular && currentStatus !== 'Settled' ? 'Settled' : currentStatus;
    configureStatusDropdown({ id: editingEmployerId, status: updatedStatus });
    if (employerForm.elements.status) employerForm.elements.status.value = updatedStatus;
  }
};

employerForm.elements.payerType?.addEventListener('change', updatePayerTypeVisibility);

const formTabButtons = document.querySelectorAll('.form-tab-btn');
const formTabPanes = document.querySelectorAll('.form-tab-pane');
const prevTabBtn = document.getElementById('prevTabBtn');
const nextTabBtn = document.getElementById('nextTabBtn');
const cancelEmployerFormBtn = document.getElementById('cancelEmployerFormBtn');
const tabIds = ['tab-basic', 'tab-soa1', 'tab-soa2', 'tab-soa3', 'tab-legal'];

const setEmployerFormTab = (tabId) => {
  const targetIndex = tabIds.indexOf(tabId);
  if (targetIndex === -1) return;

  formTabButtons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.formTab === tabId);
  });
  formTabPanes.forEach((pane) => {
    pane.classList.toggle('is-active', pane.id === tabId);
  });

  if (prevTabBtn) prevTabBtn.disabled = targetIndex === 0;
  if (nextTabBtn) nextTabBtn.disabled = targetIndex === tabIds.length - 1;
};

formTabButtons.forEach((btn) => {
  btn.addEventListener('click', () => setEmployerFormTab(btn.dataset.formTab));
});

if (prevTabBtn) {
  prevTabBtn.addEventListener('click', () => {
    const currentActive = document.querySelector('.form-tab-pane.is-active');
    const currentIndex = tabIds.indexOf(currentActive?.id || 'tab-basic');
    if (currentIndex > 0) setEmployerFormTab(tabIds[currentIndex - 1]);
  });
}

if (nextTabBtn) {
  nextTabBtn.addEventListener('click', () => {
    const currentActive = document.querySelector('.form-tab-pane.is-active');
    const currentIndex = tabIds.indexOf(currentActive?.id || 'tab-basic');
    if (currentIndex < tabIds.length - 1) setEmployerFormTab(tabIds[currentIndex + 1]);
  });
}

if (cancelEmployerFormBtn) {
  cancelEmployerFormBtn.addEventListener('click', () => closeEmployerModal());
}

const employerModal = document.querySelector('.employer-modal');
const employerModalSubtitle = document.querySelector('.modal-header-subtitle');

const openEmployerModal = (viewName) => {
  const currentNav = mainNav.dataset.activeView || 'DASHBOARD';
  employerFormReturnView = currentNav === 'EmployerForm' ? 'DASHBOARD' : currentNav;
  if (isAdminSideRole(currentUser?.role)) {
    navigateToView('DASHBOARD');
    return;
  }
  editingEmployerId = null;
  employerForm.reset();
  setEmployerFormTab('tab-basic');
  configureStatusDropdown(null);

  const basicInputs = document.querySelectorAll('#tab-basic input:not([type="hidden"]), #tab-basic select');
  basicInputs.forEach((el) => {
    if (el.tagName === 'SELECT') el.disabled = false;
    else el.readOnly = false;
    el.classList.remove('admin-locked-input');
  });
  const adminBanner = document.getElementById('adminRestrictedBanner');
  if (adminBanner) adminBanner.hidden = true;

  if (employerForm.elements.payerType) employerForm.elements.payerType.value = 'Interim Payer';
  updatePayerTypeVisibility();
  updatePostalCode();
  loadAddressLocations({ useDefaults: true });
  employerForm.elements.assignedView.value = getOfficerView(currentUser?.role) || viewName;
  employerForm.classList.remove('is-editing');
  if (employerModal) employerModal.classList.remove('is-editing');
  updateEmployerTotals();
  modalTitle.textContent = isOfficerRole(currentUser?.role)
    ? "Employer Registration Form"
    : `Employer Registration Form - ${employerForm.elements.assignedView.value}`;
  if (employerModalSubtitle) employerModalSubtitle.textContent = "Register a new employer account and encode initial 1st SOA billing assessment";
  employerForm.querySelector('.employer-submit-btn').textContent = 'REGISTER EMPLOYER';
  navigateToView('EmployerForm');
  employerForm.elements.employerNumber.focus();
};

const openEmployerEdit = async (row) => {
  const currentNav = mainNav.dataset.activeView || (isAdminSideRole(currentUser?.role) ? 'MasterFile' : 'DASHBOARD');
  employerFormReturnView = currentNav === 'EmployerForm'
    ? (isAdminSideRole(currentUser?.role) ? 'MasterFile' : 'DASHBOARD')
    : currentNav;
  const employer = JSON.parse(row.dataset.employer || '{}');
  if (!employer.id) return;
  allowAdminEmployerForm = isAdminSideRole(currentUser?.role);
  editingEmployerId = employer.id;
  employerForm.reset();
  setEmployerFormTab('tab-basic');
  configureStatusDropdown(employer);
  employerForm.elements.addressCountry.value = employer.address_country || '';
  Object.entries({
    employerId: employer.id,
    assignedView: employer.assigned_view,
    employerNumber: employer.employer_number,
    employerName: employer.employer_name,
    payerType: employer.payer_type || 'Interim Payer',
    address: employer.address,
    addressLine1: employer.address_line1,
    addressPostalCode: employer.address_postal_code,
    employeeCount: employer.employee_count,
    principal: employer.principal,
    penalty: employer.penalty,
    interest: employer.interest,
    totalAmount: employer.total_amount,
    paymentPrincipal: employer.payment_principal,
    paymentInterest: employer.payment_interest,
    paymentPenalty: employer.payment_penalty,
    paymentTotal: employer.payment_total,
    billingDate: employer.billing_date,
    soaDate: employer.soa_date,
    personReceived: employer.person_received,
    soa2Date: employer.soa2_date,
    soa2PersonReceived: employer.soa2_person_received,
    soa2Principal: employer.soa2_principal,
    soa2Penalty: employer.soa2_penalty,
    soa2Interest: employer.soa2_interest,
    soa2Total: employer.soa2_total,
    soa3Date: employer.soa3_date,
    soa3PersonReceived: employer.soa3_person_received,
    soa3Principal: employer.soa3_principal,
    soa3Penalty: employer.soa3_penalty,
    soa3Interest: employer.soa3_interest,
    soa3Total: employer.soa3_total,
    billingDate: employer.billing_date,
    billingPersonReceived: employer.billing_person_received,
    coverageDate: employer.coverage_date,
    legalReferralDate: employer.legal_referral_date,
    demandLetterDate: employer.demand_letter_date,
    demandLetterReceivedDate: employer.demand_letter_received_date,
    demandPersonReceived: employer.demand_person_received || employer.person_received,
    handlingLawyer: employer.handling_lawyer,
    docketNumber: employer.docket_number,
    caseDate: employer.case_date,
    status: employer.status,
  }).forEach(([field, value]) => {
    if (employerForm.elements[field]) employerForm.elements[field].value = value ?? '';
  });
  updatePayerTypeVisibility();
  amountFieldNames.forEach((fieldName) => {
    if (employerForm.elements[fieldName]) employerForm.elements[fieldName].value = formatAmount(employerForm.elements[fieldName].value);
  });
  updateBarangayVisibility();
  await loadAddressLocations();
  if (employer.address_state) {
    stateSelect.value = employer.address_state;
    await loadCitiesForAddress();
  }
  if (employer.address_city) {
    citySelect.value = employer.address_city;
    await loadBarangaysForAddress();
  }
  if (employer.address_barangay) barangaySelect.value = employer.address_barangay;
  postalCodeInput.value = employer.address_postal_code || postalCodeInput.value;
  postalCodeInput.readOnly = Boolean(postalCodeInput.value);

  const isRestrictedAdmin = isAdminSideRole(currentUser?.role);
  const basicInputs = document.querySelectorAll('#tab-basic input:not([type="hidden"]), #tab-basic select');
  basicInputs.forEach((el) => {
    if (isRestrictedAdmin) {
      if (el.tagName === 'SELECT') {
        el.disabled = true;
      } else {
        el.readOnly = true;
      }
      el.classList.add('admin-locked-input');
    } else {
      if (el.tagName === 'SELECT') {
        el.disabled = false;
      } else {
        el.readOnly = false;
      }
      el.classList.remove('admin-locked-input');
    }
  });

  const adminBanner = document.getElementById('adminRestrictedBanner');
  if (adminBanner) adminBanner.hidden = !isRestrictedAdmin;

  if (isRestrictedAdmin) {
    modalTitle.textContent = "Edit Employer Billing Assessments & Payments";
    if (employerModalSubtitle) employerModalSubtitle.textContent = "Admin Mode: Modify billing statements, delinquent collectibles, and payment records";
    setEmployerFormTab('tab-soa1');
  } else {
    modalTitle.textContent = "Edit Employer Record & Escalation";
    if (employerModalSubtitle) employerModalSubtitle.textContent = "Update account details, assess next SOA stages, and record settlements";
    setEmployerFormTab('tab-basic');
  }

  employerForm.querySelector('.employer-submit-btn').textContent = 'SAVE CHANGES';
  employerForm.classList.add('is-editing');
  if (employerModal) employerModal.classList.add('is-editing');
  updateEmployerTotals();
  navigateToView('EmployerForm');
  if (isRestrictedAdmin) {
    employerForm.elements.principal?.focus();
  } else {
    employerForm.elements.employerNumber?.focus();
  }
  allowAdminEmployerForm = false;
};

const closeEmployerModal = () => {
  allowAdminEmployerForm = false;
  const targetView = (employerFormReturnView && employerFormReturnView !== 'EmployerForm')
    ? employerFormReturnView
    : (isAdminSideRole(currentUser?.role) ? 'MasterFile' : 'DASHBOARD');
  navigateToView(targetView);
};

const closeEmployerSuccessModal = () => {
  employerSuccessModal.hidden = true;
  closeEmployerModal();
};

const syncOfficerFormLayout = () => {
  const officerViewName = getOfficerView(currentUser?.role);
  employerForm.elements.assignedView.value = officerViewName || employerForm.elements.assignedView.value;
  modalTitle.id = 'employerFormTitle';
};

const openTableDashboard = (viewName) => {
  const metrics = getDashboardMetrics(getTableEmployers(viewName));
  tableDashboardTitle.textContent = `${viewName.toUpperCase()} DASHBOARD`;
  Object.entries(metrics).forEach(([name, value]) => {
    tableDashboardModal.querySelector(`[data-dashboard-metric="${name}"]`).textContent = isAmountMetric(name)
      ? formatAmount(value)
      : value;
  });
  tableDashboardModal.hidden = false;
  tableDashboardClose.focus();
};

const closeTableDashboard = () => {
  tableDashboardModal.hidden = true;
};

const normalizeOrgChartRole = (role) => String(role || '')
  .replace(/^Assistant Officer ([1-3])$/, 'Account Officer $1')
  .replace(/^Account Assistant ([1-3])$/, 'Account Officer $1');

const createOrgChartNode = (user, isRoot = false) => {
  const node = document.createElement('article');
  node.className = `org-node${isRoot ? ' org-node-root' : ''}`;
  node.dataset.orgRole = normalizeOrgChartRole(user.role);

  const role = normalizeOrgChartRole(user.role);
  const roleLabel = document.createElement('span');
  roleLabel.className = 'org-role';
  roleLabel.textContent = isRoot || role === 'Admin' ? 'BRANCH ADMINISTRATOR' : role.toUpperCase();
  node.appendChild(roleLabel);

  const avatarWrap = document.createElement('div');
  avatarWrap.className = 'org-avatar-wrap';
  avatarWrap.title = 'Click card to edit officer profile & assigned jurisdiction';

  const avatarImg = document.createElement('img');
  avatarImg.className = 'org-avatar-img';
  const initialLetter = (user.full_name || user.username || 'U')[0].toUpperCase();

  if (user.avatar_url) {
    avatarImg.src = user.avatar_url;
    avatarWrap.appendChild(avatarImg);
  } else {
    const fallback = document.createElement('span');
    fallback.className = 'org-avatar-fallback';
    fallback.textContent = initialLetter;
    avatarWrap.appendChild(fallback);
  }

  node.appendChild(avatarWrap);

  const name = document.createElement('h3');
  name.textContent = user.full_name || user.username || user.email;
  node.appendChild(name);

  const username = document.createElement('p');
  username.className = 'org-username';
  username.textContent = user.username || user.email;
  node.appendChild(username);

  const email = document.createElement('p');
  email.textContent = user.email;
  node.appendChild(email);

  const userRole = document.createElement('p');
  userRole.textContent = isRoot || role === 'Admin' ? 'Branch Head / Administrator' : role;
  node.appendChild(userRole);

  const jurisdictionBox = document.createElement('div');
  jurisdictionBox.className = 'org-jurisdiction-box';
  const jurisdictionLabel = document.createElement('span');
  jurisdictionLabel.className = 'org-jurisdiction-label';
  jurisdictionLabel.textContent = 'ASSIGNED JURISDICTION:';
  const jurisdictionText = document.createElement('span');
  jurisdictionText.className = 'org-jurisdiction-text';

  let defaultArea = 'Toledo Coverage Area';
  if (isRoot || role === 'Admin') defaultArea = 'SSS Toledo Branch (Overall Supervision)';
  else if (role.includes('1')) defaultArea = 'Toledo City (Urban & Commercial Districts)';
  else if (role.includes('2')) defaultArea = 'Balamban & Asturias';
  else if (role.includes('3')) defaultArea = 'Pinamungajan, Aloguinsan, & Tuburan';

  jurisdictionText.textContent = user.assigned_places || defaultArea;
  jurisdictionBox.appendChild(jurisdictionLabel);
  jurisdictionBox.appendChild(jurisdictionText);
  node.appendChild(jurisdictionBox);

  node.addEventListener('click', () => {
    openEditOfficerModal(user);
  });

  return node;
};

const drawOrgChartLines = () => {
  orgChartContent.querySelector('.org-chart-lines')?.remove();
  const rootNode = orgChartGroups.root.querySelector('.org-node');
  const aoNodes = [...orgChartGroups.users.querySelectorAll('.org-node')];
  if (!rootNode || !aoNodes.length) return;

  const contentBounds = orgChartContent.getBoundingClientRect();
  const rootBounds = rootNode.getBoundingClientRect();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('org-chart-lines');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', `0 0 ${contentBounds.width} ${contentBounds.height}`);

  aoNodes.forEach((aoNode) => {
    const aoBounds = aoNode.getBoundingClientRect();
    const startX = rootBounds.left + rootBounds.width / 2 - contentBounds.left;
    const startY = rootBounds.bottom - contentBounds.top;
    const endX = aoBounds.left + aoBounds.width / 2 - contentBounds.left;
    const endY = aoBounds.top - contentBounds.top;
    const controlY = startY + (endY - startY) * 0.55;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', `M ${startX} ${startY} C ${startX} ${controlY}, ${endX} ${controlY}, ${endX} ${endY}`);
    line.classList.add('org-chart-line');
    svg.appendChild(line);
  });

  orgChartContent.prepend(svg);
};

const renderOrgChartUsers = (users) => {
  Object.values(orgChartGroups).forEach((group) => group.replaceChildren());
  users.filter((user) => user.is_active !== false && user.role !== 'Super Admin').forEach((user) => {
    const role = normalizeOrgChartRole(user.role);
    const isRoot = role === 'Admin';
    const groupName = isRoot ? 'root' : 'users';
    orgChartGroups[groupName].appendChild(createOrgChartNode(user, isRoot));
  });
  window.requestAnimationFrame(drawOrgChartLines);
};

const loadOrgChartUsers = async () => {
  Object.values(orgChartGroups).forEach((group) => {
    group.replaceChildren();
    const status = document.createElement('p');
    status.className = 'org-chart-status';
    status.textContent = 'Loading users...';
    group.appendChild(status);
  });

  try {
    const response = await fetch('/api/users', { headers: { Authorization: `Bearer ${currentUser.accessToken}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to load users.');
    renderOrgChartUsers(result);
  } catch (error) {
    Object.values(orgChartGroups).forEach((group) => {
      group.replaceChildren();
      const status = document.createElement('p');
      status.className = 'org-chart-status';
      status.textContent = error.message;
      group.appendChild(status);
    });
  }
};

const openOrgChart = () => {
  orgChartReturnView = mainNav.dataset.activeView || 'DASHBOARD';
  pageWrapper.classList.remove('dashboard-active');
  calendarModal.hidden = true;
  dashboardView.hidden = true;
  employerFormView.hidden = true;
  aoViews.forEach((view) => { view.hidden = true; });
  document.querySelector('.ao-views').classList.remove('is-active');
  const orgChartButton = document.querySelector('.org-chart-btn');
  clearActiveNavButtons(orgChartButton);
  orgChartModal.hidden = false;
  loadOrgChartUsers();
  orgChartButton.classList.add('active');
  if (orgChartClose) orgChartClose.focus();
};

const closeOrgChart = () => {
  orgChartModal.hidden = true;
  navigateToView(orgChartReturnView);
};

const editOfficerModal = document.getElementById('editOfficerModal');
const editOfficerForm = document.getElementById('editOfficerForm');
const editOfficerClose = document.getElementById('editOfficerClose');
const editOfficerCancel = document.getElementById('editOfficerCancel');
const editOfficerError = document.getElementById('editOfficerError');
const officerPreviewImg = document.getElementById('officerPreviewImg');
const officerPreviewFallback = document.getElementById('officerPreviewFallback');
const officerPreviewName = document.getElementById('officerPreviewName');
const officerPreviewUsername = document.getElementById('officerPreviewUsername');
const officerPhotoUrlInput = document.getElementById('officerPhotoUrlInput');
const officerPhotoFileInput = document.getElementById('officerPhotoFileInput');

let currentEditingUser = null;

const openEditOfficerModal = (user) => {
  currentEditingUser = user;
  if (!editOfficerForm) return;
  editOfficerForm.reset();
  if (editOfficerError) editOfficerError.hidden = true;
  editOfficerForm.elements.officerId.value = user.id;
  editOfficerForm.elements.officerFullName.value = user.full_name || '';
  editOfficerForm.elements.officerPhotoUrl.value = user.avatar_url || '';
  editOfficerForm.elements.officerAssignedPlaces.value = user.assigned_places || '';

  if (officerPreviewName) officerPreviewName.textContent = user.full_name || user.username || user.email;
  if (officerPreviewUsername) officerPreviewUsername.textContent = `@${user.username || 'user'}`;

  const initial = (user.full_name || user.username || 'U')[0].toUpperCase();
  if (officerPreviewFallback) officerPreviewFallback.textContent = initial;

  if (user.avatar_url && officerPreviewImg && officerPreviewFallback) {
    officerPreviewImg.src = user.avatar_url;
    officerPreviewImg.hidden = false;
    officerPreviewFallback.hidden = true;
  } else if (officerPreviewImg && officerPreviewFallback) {
    officerPreviewImg.hidden = true;
    officerPreviewFallback.hidden = false;
  }

  if (editOfficerModal) {
    editOfficerModal.hidden = false;
    editOfficerForm.elements.officerFullName.focus();
  }
};

const closeEditOfficerModal = () => {
  if (editOfficerModal) editOfficerModal.hidden = true;
  currentEditingUser = null;
};

if (editOfficerClose) editOfficerClose.addEventListener('click', closeEditOfficerModal);
if (editOfficerCancel) editOfficerCancel.addEventListener('click', closeEditOfficerModal);
if (editOfficerModal) {
  editOfficerModal.addEventListener('click', (e) => {
    if (e.target === editOfficerModal) closeEditOfficerModal();
  });
}

if (officerPhotoFileInput) {
  officerPhotoFileInput.addEventListener('change', () => {
    const file = officerPhotoFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (officerPhotoUrlInput) officerPhotoUrlInput.value = e.target.result;
      if (officerPreviewImg && officerPreviewFallback) {
        officerPreviewImg.src = e.target.result;
        officerPreviewImg.hidden = false;
        officerPreviewFallback.hidden = true;
      }
    };
    reader.readAsDataURL(file);
  });
}

if (officerPhotoUrlInput) {
  officerPhotoUrlInput.addEventListener('input', () => {
    const url = officerPhotoUrlInput.value.trim();
    if (url && officerPreviewImg && officerPreviewFallback) {
      officerPreviewImg.src = url;
      officerPreviewImg.hidden = false;
      officerPreviewFallback.hidden = true;
    } else if (officerPreviewImg && officerPreviewFallback) {
      officerPreviewImg.hidden = true;
      officerPreviewFallback.hidden = false;
    }
  });
}

if (editOfficerForm) {
  editOfficerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentEditingUser) return;

    const full_name = editOfficerForm.elements.officerFullName.value.trim();
    const avatar_url = editOfficerForm.elements.officerPhotoUrl.value.trim() || null;
    const assigned_places = editOfficerForm.elements.officerAssignedPlaces.value.trim();

    try {
      const response = await fetch(`/api/users/${currentEditingUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentUser?.accessToken || ''}`,
        },
        body: JSON.stringify({ full_name, avatar_url, assigned_places }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to update officer.');

      closeEditOfficerModal();
      loadOrgChartUsers();
    } catch (err) {
      if (editOfficerError) {
        editOfficerError.textContent = err.message;
        editOfficerError.hidden = false;
      }
    }
  });
}

window.addEventListener('resize', () => {
  if (!orgChartModal.hidden) drawOrgChartLines();
});

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const selectedView = button.textContent.trim();
    const viewName = selectedView === 'MASTERFILE' ? 'MasterFile' : selectedView === 'DATA FORM' ? 'EmployerForm' : selectedView;
    if (viewName !== 'DASHBOARD' && !viewName.startsWith('AO') && viewName !== 'MasterFile' && viewName !== 'EmployerForm') return;
    if (viewName === 'EmployerForm') {
      if (isAdminSideRole(currentUser?.role)) {
        navigateToView('DASHBOARD');
        return;
      }
      openEmployerModal(getOfficerView(currentUser?.role) || 'AO1');
      return;
    }
    navigateToView(viewName);
    if (['AO1', 'AO2', 'AO3', 'MasterFile'].includes(viewName)) {
      showDatabaseDueNotification(viewName);
    }
  });
});

document.querySelectorAll('.add-record-btn').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (isAdminSideRole(currentUser?.role)) {
      navigateToView('DASHBOARD');
      return;
    }
    openEmployerModal(button.dataset.formView);
  });
});

document.querySelector('.org-chart-btn').addEventListener('click', (event) => {
  event.stopPropagation();
  openOrgChart();
});

syncOfficerFormLayout();

const employerFormCloseBtn = document.getElementById('employerFormCloseBtn');
if (employerFormCloseBtn) {
  employerFormCloseBtn.addEventListener('click', (event) => {
    event.preventDefault();
    closeEmployerModal();
  });
}
document.querySelectorAll('#employerFormView .modal-close-btn').forEach((btn) => {
  btn.addEventListener('click', (event) => {
    event.preventDefault();
    closeEmployerModal();
  });
});

document.addEventListener('click', (event) => {
  const closeBtn = event.target.closest('#employerFormCloseBtn, #employerFormView .modal-close-btn');
  if (closeBtn) {
    event.preventDefault();
    event.stopPropagation();
    closeEmployerModal();
  }
});
employerSuccessClose.addEventListener('click', closeEmployerSuccessModal);
employerSuccessOk.addEventListener('click', closeEmployerSuccessModal);
employerSuccessModal.addEventListener('click', (event) => {
  if (event.target === employerSuccessModal) closeEmployerSuccessModal();
});

if (tableDashboardClose) tableDashboardClose.addEventListener('click', closeTableDashboard);
if (orgChartClose) orgChartClose.addEventListener('click', closeOrgChart);

tableDashboardModal.addEventListener('click', (event) => {
  if (event.target === tableDashboardModal) closeTableDashboard();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !employerFormView.hidden) closeEmployerModal();
  if (event.key === 'Escape' && !tableDashboardModal.hidden) closeTableDashboard();
  if (event.key === 'Escape' && !deleteConfirmModal.hidden) closeDeleteConfirmation();
  if (event.key === 'Escape' && !logoutConfirmModal.hidden) closeLogoutConfirmation();
  if (event.key === 'Escape' && !calendarNotificationModal.hidden) closeCalendarNotification();
  if (event.key === 'Escape' && !employerSuccessModal.hidden) closeEmployerSuccessModal();
});

const addEmployerToTable = (viewName, rowValues, employerId, assignedView = viewName, employer = null) => {
  const targetBody = document.querySelector(`[data-ao-view="${viewName}"] .ao-table tbody`);
  if (!targetBody) return false;

  let targetRow = targetBody.querySelector(`tr[data-employer-id="${employerId}"]`);
  if (!targetRow) {
    targetRow = targetBody.querySelector('tr:not(:has(td:not(:empty)))') || document.createElement('tr');
    if (!targetRow.parentElement) targetBody.appendChild(targetRow);
  }

  const payerType = (employer?.payer_type || rowValues[2] || 'Interim Payer').trim();
  const isNonPayingPayer = payerType === 'Non-Paying' || payerType === 'Non Paying' || payerType === 'Special Payer' || payerType === 'NP' || payerType === 'SP';
  const badgeClass = (payerType === 'Regular Payer' || payerType === 'RP') ? 'payer-badge-rp' : isNonPayingPayer ? 'payer-badge-np' : 'payer-badge-ip';
  const badgeCode = (payerType === 'Regular Payer' || payerType === 'RP') ? 'RP' : isNonPayingPayer ? 'NP' : 'IP';

  const empData = employer || {
    id: employerId,
    assigned_view: assignedView,
    employer_number: rowValues[0],
    employer_name: rowValues[1],
    payer_type: payerType,
    soa_date: rowValues[13],
    person_received: rowValues[14],
    soa2_date: rowValues[15],
    soa2_person_received: rowValues[16],
    soa3_date: rowValues[17],
    soa3_person_received: rowValues[18],
    billing_date: rowValues[19],
    billing_person_received: rowValues[20],
    status: rowValues[29],
  };

  const soaInfo = getEmployerSoaInfo(empData);

  targetRow.replaceChildren(...rowValues.map((value, cellIndex) => {
    const cell = document.createElement('td');
    if (cellIndex === 0) {
      cell.textContent = formatSssEmployerNumber(value);
      cell.className = 'td-employer-number';
    } else if (cellIndex === 2) {
      const payerDisplayName = getPayerTypeDisplayName(payerType);
      cell.innerHTML = `<span class="payer-badge ${badgeClass}" title="${payerType}">[${badgeCode}] ${payerDisplayName}</span>`;
    } else if (cellIndex === 29) {
      cell.className = 'td-status';
      if (soaInfo.stage === 'Settled') {
        cell.innerHTML = '<span class="status-badge status-badge-settled">Settled</span>';
      } else if (soaInfo.stage === 'Referred to Legal') {
        cell.innerHTML = '<span class="status-badge status-badge-legal">Referred to Legal</span>';
      } else if (soaInfo.isForwarded) {
        cell.innerHTML = `<span class="status-badge status-badge-forwarded" title="Forwarded on ${soaInfo.forwardedDate || 'N/A'} &bull; Awaiting ${soaInfo.nextStageCode}">${soaInfo.stage} (Forwarded)</span>`;
      } else if (soaInfo.isLapsed) {
        cell.innerHTML = `<span class="status-badge status-badge-lapsed" title="${soaInfo.nextAction}">${soaInfo.stage} (${Math.abs(soaInfo.daysRemaining)}d lapsed)</span>`;
      } else if (soaInfo.isDueSoon) {
        cell.innerHTML = `<span class="status-badge status-badge-2nd-soa" title="${soaInfo.nextAction}">${soaInfo.stage} (Due in 24h)</span>`;
      } else if (soaInfo.daysRemaining !== null) {
        cell.innerHTML = `<span class="status-badge status-badge-1st-soa">${soaInfo.stage} (${soaInfo.daysRemaining}d left)</span>`;
      } else {
        cell.innerHTML = `<span class="status-badge status-badge-pending">${value || '1st SOA Served'}</span>`;
      }
    } else {
      if ([14, 16, 18, 20, 25].includes(cellIndex)) cell.className = 'td-person';
      if (cellIndex === 8) cell.classList.add('td-amount-clickable');
      if (amountFieldIndexes.includes(cellIndex) && value !== '') {
        cell.textContent = formatAmount(value);
      } else if (dateFieldIndexes.includes(cellIndex) && value) {
        cell.textContent = formatDisplayDate(value);
      } else {
        cell.textContent = value || '';
      }
    }
    return cell;
  }));

  targetRow.dataset.employerId = String(employerId);
  targetRow.dataset.assignedView = assignedView;
  targetRow.dataset.payerType = payerType;
  const soaDateCell = targetRow.cells[13];
  if (soaDateCell) soaDateCell.dataset.date = rowValues[13] || '';
  if (employer) targetRow.dataset.employer = JSON.stringify(employer);
  targetRow.classList.toggle('is-due-date', soaInfo.isDue);

  // Per-row action cell: Edit only for Admin/MasterFile; Edit & Delete (Settled-only) for AO views
  let actionCell = targetRow.querySelector('.td-row-actions');
  if (!actionCell) {
    actionCell = document.createElement('td');
    actionCell.className = 'td-row-actions';
    targetRow.appendChild(actionCell);
  }

  const isAdmin = isAdminSideRole(currentUser?.role);
  const isSettled = soaInfo.stage === 'Settled' || String(empData.status || '').trim().toLowerCase() === 'settled';

  if (isAdmin || viewName === 'MasterFile') {
    actionCell.innerHTML = `<button class="row-edit-btn" type="button" title="Edit this employer">Edit</button>`;
    const editBtn = actionCell.querySelector('.row-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEmployerEdit(targetRow);
      });
    }
  } else if (isSettled) {
    actionCell.innerHTML = `
      <div class="row-actions-group">
        <button class="row-edit-btn" type="button" title="Edit this employer">Edit</button>
        <button class="row-delete-btn" type="button" data-employer-id="${employerId}" title="Delete this settled employer record">Delete</button>
      </div>
    `;
    const editBtn = actionCell.querySelector('.row-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEmployerEdit(targetRow);
      });
    }
    const deleteBtn = actionCell.querySelector('.row-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const empName = employer?.employer_name || rowValues[1] || 'this employer';
        openDeleteConfirmationForSingleEmployer(employerId, empName, viewName);
      });
    }
  } else {
    actionCell.innerHTML = `<button class="row-edit-btn" type="button" title="Edit this employer">Edit</button>`;
    const editBtn = actionCell.querySelector('.row-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEmployerEdit(targetRow);
      });
    }
  }

  filterAoTable(viewName);

  return true;
};

const setTableEditMode = (viewName, isEditing) => {
  const view = document.querySelector(`[data-ao-view="${viewName}"]`);
  if (!view) return;

  const isAdmin = isAdminSideRole(currentUser?.role);
  view.classList.toggle('is-editing', isEditing);
  const editBtn = view.querySelector('.table-edit-btn');
  if (editBtn) editBtn.textContent = isEditing ? 'Cancel edit' : 'Edit mode';
  const editDataBtn = view.querySelector('.table-edit-data-btn');
  if (editDataBtn) editDataBtn.hidden = !isEditing;
  const deleteBtn = view.querySelector('.table-delete-btn');
  if (deleteBtn) {
    deleteBtn.hidden = !isEditing || isAdmin || viewName === 'MasterFile';
  }
  view.querySelectorAll('tbody tr').forEach((row) => row.classList.remove('is-selected'));
};

const editSelectedEmployer = (viewName) => {
  const view = document.querySelector(`[data-ao-view="${viewName}"]`);
  const selectedRows = [...view.querySelectorAll('tbody tr.is-selected[data-employer-id]')];
  if (selectedRows.length !== 1) return;
  openEmployerEdit(selectedRows[0]);
};

const openDeleteConfirmation = (viewName) => {
  const view = document.querySelector(`[data-ao-view="${viewName}"]`);
  const selectedRows = [...view.querySelectorAll('tbody tr.is-selected[data-employer-id]')];
  if (!selectedRows.length) return;

  pendingDelete = {
    viewName,
    employerIds: selectedRows.map((row) => row.dataset.employerId),
  };
  deleteConfirmError.hidden = true;
  deleteConfirmApprove.disabled = false;
  deleteConfirmModal.hidden = false;
  deleteConfirmApprove.focus();
};

const openDeleteConfirmationForSingleEmployer = (employerId, employerName, viewName = 'MasterFile') => {
  pendingDelete = {
    viewName,
    employerIds: [String(employerId)],
  };
  const titleEl = document.getElementById('deleteConfirmTitle');
  const descEl = deleteConfirmModal.querySelector('p:not(.delete-confirm-error)');
  if (titleEl) titleEl.textContent = 'Delete Employer Record?';
  if (descEl) descEl.textContent = `Are you sure you want to delete employer "${employerName}"? This record will be permanently removed.`;
  deleteConfirmError.hidden = true;
  deleteConfirmApprove.disabled = false;
  deleteConfirmModal.hidden = false;
  deleteConfirmApprove.focus();
};

const closeDeleteConfirmation = () => {
  pendingDelete = null;
  deleteConfirmModal.hidden = true;
  deleteConfirmError.hidden = true;
  deleteConfirmError.textContent = '';
  deleteConfirmApprove.disabled = false;
  deleteConfirmApprove.textContent = "Yes, I'm sure";
  const titleEl = document.getElementById('deleteConfirmTitle');
  const descEl = deleteConfirmModal.querySelector('p:not(.delete-confirm-error)');
  if (titleEl) titleEl.textContent = 'Delete selected data?';
  if (descEl) descEl.textContent = 'Are you sure you want to delete the selected data?';
};

const deleteSelectedRows = async () => {
  if (!pendingDelete) return;

  const { employerIds, viewName } = pendingDelete;
  deleteConfirmApprove.disabled = true;
  deleteConfirmApprove.textContent = 'Deleting...';
  deleteConfirmError.hidden = true;
  deleteConfirmError.textContent = '';

  try {
    const response = await fetch('/api/employers', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentUser?.accessToken || ''}`,
      },
      body: JSON.stringify({ ids: employerIds }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      deleteConfirmError.textContent = error?.error || `Unable to delete employer(s) (HTTP ${response.status}).`;
      deleteConfirmError.hidden = false;
      return;
    }

    const deletedIds = new Set(employerIds.map(String));
    document.querySelectorAll('.ao-table tbody tr[data-employer-id]').forEach((row) => {
      if (deletedIds.has(String(row.dataset.employerId))) row.remove();
    });

    setTableEditMode(viewName, false);
    refreshMainDashboard();
    loadEmployerSummary().then(refreshMainDashboard).catch((error) => console.error(error));
    updateSoaReminders();
    closeDeleteConfirmation();
  } catch (error) {
    console.error('Delete employer failed:', error);
    deleteConfirmError.textContent = error?.message || 'Network error: Unable to connect to server to delete record.';
    deleteConfirmError.hidden = false;
  } finally {
    if (!deleteConfirmModal.hidden) {
      deleteConfirmApprove.disabled = false;
      deleteConfirmApprove.textContent = "Yes, I'm sure";
    }
  }
};

const loadEmployers = async () => {
  if (!currentUser?.accessToken) return;

  const response = await fetch('/api/employers', {
    headers: { Authorization: `Bearer ${currentUser.accessToken}` },
  });
  if (!response.ok) throw new Error('Unable to load employers.');

  const employers = await response.json();
  const officerView = getCurrentOfficerCode();
  employers.forEach((employer) => {
    if (officerView) {
      const employerMatchesOfficer = String(employer.assigned_view || '').trim() === String(officerView);
      if (!employerMatchesOfficer) return;
    }

    addEmployerToTable(employer.assigned_view, employerToRow(employer), employer.id, employer.assigned_view, employer);
    addEmployerToTable('MasterFile', employerToRow(employer), employer.id, employer.assigned_view, employer);
  });
  synchronizeOfficerMasterfileView();
  syncOfficerDashboardPanels();
  updateSoaReminders();
};

const loadEmployerSummary = async () => {
  if (!currentUser?.accessToken) return;

  const response = await fetch('/api/employer-summary', {
    headers: { Authorization: `Bearer ${currentUser.accessToken}` },
  });
  if (!response.ok) throw new Error('Unable to load employer summary.');
  branchSummary = await response.json();
};

const updateBarangayVisibility = () => {
  const isPhilippines = countryInput.value.trim().toLowerCase() === 'philippines';
  barangayField.hidden = !isPhilippines;
  if (!isPhilippines) setAddressOptions(barangaySelect, [], 'Select city first');
};

const countryNames = `Afghanistan|Albania|Algeria|Andorra|Angola|Antigua and Barbuda|Argentina|Armenia|Australia|Austria|Azerbaijan|Bahamas|Bahrain|Bangladesh|Barbados|Belarus|Belgium|Belize|Benin|Bhutan|Bolivia|Bosnia and Herzegovina|Botswana|Brazil|Brunei|Bulgaria|Burkina Faso|Burundi|Cabo Verde|Cambodia|Cameroon|Canada|Central African Republic|Chad|Chile|China|Colombia|Comoros|Congo|Costa Rica|Croatia|Cuba|Cyprus|Czechia|Democratic Republic of the Congo|Denmark|Djibouti|Dominica|Dominican Republic|Ecuador|Egypt|El Salvador|Equatorial Guinea|Eritrea|Estonia|Eswatini|Ethiopia|Fiji|Finland|France|Gabon|Gambia|Georgia|Germany|Ghana|Greece|Grenada|Guatemala|Guinea|Guyana|Haiti|Honduras|Hungary|Iceland|India|Indonesia|Iran|Iraq|Ireland|Israel|Italy|Jamaica|Japan|Jordan|Kazakhstan|Kenya|Kiribati|Kuwait|Kyrgyzstan|Laos|Latvia|Lebanon|Lesotho|Liberia|Libya|Liechtenstein|Lithuania|Luxembourg|Madagascar|Malawi|Malaysia|Maldives|Mali|Malta|Marshall Islands|Mauritania|Mauritius|Mexico|Micronesia|Moldova|Monaco|Mongolia|Montenegro|Morocco|Mozambique|Myanmar|Namibia|Nauru|Nepal|Netherlands|New Zealand|Nicaragua|Niger|Nigeria|North Korea|North Macedonia|Norway|Oman|Pakistan|Palau|Palestine|Panama|Papua New Guinea|Paraguay|Peru|Philippines|Poland|Portugal|Qatar|Romania|Russia|Rwanda|Saint Kitts and Nevis|Saint Lucia|Saint Vincent and the Grenadines|Samoa|San Marino|Saudi Arabia|Senegal|Serbia|Seychelles|Sierra Leone|Singapore|Slovakia|Slovenia|Solomon Islands|Somalia|South Africa|South Korea|South Sudan|Spain|Sri Lanka|Sudan|Suriname|Sweden|Switzerland|Syria|Taiwan|Tajikistan|Tanzania|Thailand|Timor-Leste|Togo|Tonga|Trinidad and Tobago|Tunisia|Turkey|Turkmenistan|Tuvalu|Uganda|Ukraine|United Arab Emirates|United Kingdom|United States|Uruguay|Uzbekistan|Vanuatu|Vatican City|Venezuela|Vietnam|Yemen|Zambia|Zimbabwe`.split('|');
countryNames.filter((country) => country !== 'Philippines').forEach((country) => countryInput.add(new Option(country, country)));

const setAddressOptions = (select, values, placeholder) => {
  select.replaceChildren(new Option(placeholder, ''));
  values.forEach((value) => select.add(new Option(value, value)));
  select.disabled = values.length === 0;
};

const fallbackCitiesByProvince = {
  Cebu: [
    'Bogo City',
    'Carcar City',
    'Cebu City',
    'Danao City',
    'Lapu-Lapu City',
    'Mandaue City',
    'Naga City',
    'Talisay City',
    'Toledo City',
  ],
};

const postalCodesByLocation = {
  Philippines: {
    Cebu: {
      'Bogo City': '6010',
      Alcantara: '6049',
      Alcoy: '6023',
      Alegria: '6030',
      Aloguinsan: '6040',
      Argao: '6021',
      Asturias: '6042',
      Badian: '6031',
      Balamban: '6041',
      Bantayan: '6052',
      Barili: '6036',
      Boljoon: '6024',
      Borbon: '6008',
      'Carcar City': '6019',
      Carmen: '6005',
      Catmon: '6006',
      Compostela: '6003',
      Consolacion: '6001',
      Cordova: '6017',
      Daanbantayan: '6013',
      Dalaguete: '6022',
      'Cebu City': '6000',
      'Danao City': '6004',
      Dumanjug: '6035',
      Ginatilan: '6029',
      'Lapu-Lapu City': '6015',
      Liloan: '6002',
      Madridejos: '6053',
      Malabuyoc: '6029',
      'Mandaue City': '6014',
      Medellin: '6012',
      Minglanilla: '6046',
      Moalboal: '6032',
      'Naga City': '6037',
      Oslob: '6025',
      Pilar: '6048',
      Pinamungajan: '6039',
      Poro: '6048',
      Ronda: '6034',
      Samboan: '6027',
      'San Fernando': '6018',
      'San Francisco': '6050',
      'San Remigio': '6011',
      'Santa Fe': '6047',
      Santander: '6026',
      Sibonga: '6020',
      Sogod: '6007',
      Tabogon: '6009',
      Tabuelan: '6044',
      'Talisay City': '6045',
      'Toledo City': '6038',
      Tuburan: '6043',
    },
  },
};

const defaultAddress = {
  country: 'Philippines',
  province: 'Cebu',
  city: 'Toledo City',
};

const normalizeLocationName = (name) => String(name || '')
  .toLowerCase()
  .replace(/^city of /, '')
  .replace(/ city$/, '')
  .trim();

const loadPhilippineCitiesAndMunicipalities = async (province) => {
  const provincesResponse = await fetch('https://psgc.gitlab.io/api/provinces/');
  if (!provincesResponse.ok) throw new Error('Unable to load province codes.');
  const provinces = await provincesResponse.json();
  const provinceRecord = provinces.find((item) => normalizeLocationName(item.name) === normalizeLocationName(province));
  if (!provinceRecord) throw new Error('Province not found.');

  const locationsResponse = await fetch(`https://psgc.gitlab.io/api/provinces/${provinceRecord.code}/cities-municipalities/`);
  if (!locationsResponse.ok) throw new Error('Unable to load city and municipality codes.');
  const locations = await locationsResponse.json();
  return locations.map((location) => location.name).filter(Boolean).sort();
};

const loadBarangaysForAddress = async () => {
  const country = countryInput.value;
  const province = stateSelect.value;
  const city = citySelect.value;
  barangayRequestController?.abort();
  setAddressOptions(barangaySelect, [], city ? 'Loading barangays...' : 'Select city first');
  if (country.trim().toLowerCase() !== 'philippines' || !province || !city) return;

  const requestController = new AbortController();
  barangayRequestController = requestController;
  try {
    const provincesResponse = await fetch('https://psgc.gitlab.io/api/provinces/', {
      signal: requestController.signal,
    });
    if (!provincesResponse.ok) throw new Error('Unable to load province codes.');
    const provinces = await provincesResponse.json();
    const provinceRecord = provinces.find((item) => normalizeLocationName(item.name) === normalizeLocationName(province));
    if (!provinceRecord) throw new Error('Province not found.');

    const citiesResponse = await fetch(`https://psgc.gitlab.io/api/provinces/${provinceRecord.code}/cities-municipalities/`, {
      signal: requestController.signal,
    });
    if (!citiesResponse.ok) throw new Error('Unable to load city codes.');
    const cities = await citiesResponse.json();
    const cityRecord = cities.find((item) => normalizeLocationName(item.name) === normalizeLocationName(city));
    if (!cityRecord) throw new Error('City not found.');

    const barangaysResponse = await fetch(`https://psgc.gitlab.io/api/cities-municipalities/${cityRecord.code}/barangays/`, {
      signal: requestController.signal,
    });
    if (!barangaysResponse.ok) throw new Error('Unable to load barangays.');
    const barangays = await barangaysResponse.json();
    const barangayNames = barangays.map((barangay) => barangay.name).filter(Boolean).sort();
    setAddressOptions(barangaySelect, barangayNames, barangayNames.length ? 'Select barangay' : 'No barangays found');
  } catch (error) {
    if (error.name !== 'AbortError') setAddressOptions(barangaySelect, [], 'Unable to load barangays');
  } finally {
    if (barangayRequestController === requestController) barangayRequestController = null;
  }
};

const updatePostalCode = () => {
  const postalCodesByCity = postalCodesByLocation[countryInput.value]?.[stateSelect.value] || {};
  const cityKey = Object.keys(postalCodesByCity).find((key) => normalizeLocationName(key) === normalizeLocationName(citySelect.value));
  const postalCode = cityKey ? postalCodesByCity[cityKey] : '';
  postalCodeInput.value = postalCode;
  postalCodeInput.readOnly = Boolean(postalCode);
};

const loadAddressLocations = async ({ useDefaults = false } = {}) => {
  const country = countryInput.value;
  addressRequestController?.abort();
  setAddressOptions(stateSelect, [], country ? 'Loading provinces...' : 'Select country first');
  setAddressOptions(citySelect, [], 'Select province first');
  setAddressOptions(barangaySelect, [], 'Select city first');
  updatePostalCode();
  if (!country) return;

  const requestController = new AbortController();
  addressRequestController = requestController;
  try {
    const response = await fetch('https://countriesnow.space/api/v0.1/countries/states', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country }),
      signal: requestController.signal,
    });
    if (!response.ok) throw new Error('Unable to load provinces.');
    const result = await response.json();
    const provinces = (result.data?.states || []).map((province) => province.name).filter(Boolean).sort();
    setAddressOptions(stateSelect, provinces, provinces.length ? 'Select province' : 'No provinces found');
    if (useDefaults && country === defaultAddress.country && provinces.includes(defaultAddress.province)) {
      stateSelect.value = defaultAddress.province;
      await loadCitiesForAddress();
      if ([...citySelect.options].some((option) => option.value === defaultAddress.city)) {
        citySelect.value = defaultAddress.city;
        updatePostalCode();
        await loadBarangaysForAddress();
      }
    }
  } catch (error) {
    if (error.name !== 'AbortError') setAddressOptions(stateSelect, [], 'Unable to load provinces');
  } finally {
    if (addressRequestController === requestController) addressRequestController = null;
  }
};

const loadCitiesForAddress = async () => {
  const country = countryInput.value;
  const province = stateSelect.value;
  if (!country || !province) {
    setAddressOptions(citySelect, [], province ? 'Select city' : 'Select province first');
    setAddressOptions(barangaySelect, [], 'Select city first');
    updatePostalCode();
    return;
  }
  try {
    let cities;
    if (country.trim().toLowerCase() === 'philippines') {
      cities = await loadPhilippineCitiesAndMunicipalities(province);
    } else {
      const response = await fetch('https://countriesnow.space/api/v0.1/countries/state/cities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country, state: province }),
      });
      const result = await response.json();
      cities = Array.isArray(result.data) && result.data.length
        ? [...new Set(result.data)].sort()
        : (fallbackCitiesByProvince[province] || []);
    }
    setAddressOptions(citySelect, cities, cities.length ? 'Select city' : 'No cities found');
    updatePostalCode();
    await loadBarangaysForAddress();
  } catch (_error) {
    setAddressOptions(citySelect, [], 'Unable to load cities');
    updatePostalCode();
    await loadBarangaysForAddress();
  }
};

countryInput.addEventListener('input', updateBarangayVisibility);
countryInput.addEventListener('change', updateBarangayVisibility);
updateBarangayVisibility();
countryInput.addEventListener('change', loadAddressLocations);
stateSelect.addEventListener('change', loadCitiesForAddress);
citySelect.addEventListener('change', () => {
  updatePostalCode();
  loadBarangaysForAddress();
});
loadAddressLocations({ useDefaults: true });

employerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(employerForm);
  const payerType = formData.get('payerType') || 'Interim Payer';
  const isRegular = payerType === 'Regular Payer';

  const status = formData.get('status');
  const soaDate = formData.get('soaDate');
  const soa2Date = formData.get('soa2Date');
  const soa3Date = formData.get('soa3Date');
  const billingDate = formData.get('billingDate');
  const legalReferralDate = formData.get('legalReferralDate');

  // SSS Delinquency Lifecycle Flow Validation
  if (status === '2nd SOA Served' || (soa2Date && status !== 'Settled')) {
    if (!soaDate) {
      alert('Validation Error: 1st SOA Date must be filled out before advancing to 2nd SOA Served.');
      setEmployerFormTab('tab-soa1');
      employerForm.elements.soaDate?.focus();
      return;
    }
  }

  if (status === '3rd SOA Served' || (soa3Date && status !== 'Settled' && status !== 'Referred to Legal')) {
    if (!soaDate) {
      alert('Validation Error: 1st SOA Date must be filled out before serving 3rd SOA.');
      setEmployerFormTab('tab-soa1');
      employerForm.elements.soaDate?.focus();
      return;
    }
    if (!soa2Date) {
      alert('Validation Error: 2nd SOA Date must be filled out before advancing to 3rd SOA Served.');
      setEmployerFormTab('tab-soa2');
      employerForm.elements.soa2Date?.focus();
      return;
    }
  }

  if (status === 'Referred to Legal') {
    if (!soaDate) {
      alert('Validation Error: 1st SOA Date must be filled out before Referral to Legal.');
      setEmployerFormTab('tab-soa1');
      employerForm.elements.soaDate?.focus();
      return;
    }
    if (!soa2Date) {
      alert('Validation Error: 2nd SOA Date must be filled out before Referral to Legal.');
      setEmployerFormTab('tab-soa2');
      employerForm.elements.soa2Date?.focus();
      return;
    }
    if (!soa3Date) {
      alert('Validation Error: 3rd SOA Date must be filled out before Referral to Legal.');
      setEmployerFormTab('tab-soa3');
      employerForm.elements.soa3Date?.focus();
      return;
    }
    if (!billingDate) {
      alert('Validation Error: Final Billing Notice Date must be served before Referral to Legal.');
      setEmployerFormTab('tab-legal');
      employerForm.elements.billingDate?.focus();
      return;
    }
    if (!legalReferralDate) {
      alert('Validation Error: Date Referred to Legal is required when status is Referred to Legal.');
      setEmployerFormTab('tab-legal');
      employerForm.elements.legalReferralDate?.focus();
      return;
    }
  }

  const principal = isRegular ? 0 : parseAmount(formData.get('principal'));
  const penalty = isRegular ? 0 : parseAmount(formData.get('penalty'));
  const interest = isRegular ? 0 : parseAmount(formData.get('interest'));
  const totalAmount = Number((principal + penalty + interest).toFixed(2));

  const employerNumber = formData.get('employerNumber') || employerForm.elements.employerNumber?.value;
  const employerName = formData.get('employerName') || employerForm.elements.employerName?.value;
  const addressLine1 = formData.get('addressLine1') || employerForm.elements.addressLine1?.value || '';
  const addressCountry = formData.get('addressCountry') || employerForm.elements.addressCountry?.value || '';
  const addressState = formData.get('addressState') || employerForm.elements.addressState?.value || '';
  const addressCity = formData.get('addressCity') || employerForm.elements.addressCity?.value || '';
  const addressBarangay = formData.get('addressBarangay') || employerForm.elements.addressBarangay?.value || '';
  const addressPostalCode = formData.get('addressPostalCode') || employerForm.elements.addressPostalCode?.value || '';
  const employeeCount = Number(formData.get('employeeCount') || employerForm.elements.employeeCount?.value || 0);

  const employer = {
    assigned_view: formData.get('assignedView') || employerForm.elements.assignedView?.value,
    employer_number: employerNumber,
    employer_name: employerName,
    payer_type: payerType,
    address: [
      addressLine1,
      addressCity,
      addressState,
      addressCountry,
    ].map((value) => String(value || '').trim()).filter(Boolean).join(', '),
    address_line1: addressLine1,
    address_country: addressCountry,
    address_state: addressState,
    address_city: addressCity,
    address_barangay: addressBarangay,
    address_postal_code: addressPostalCode,
    employee_count: employeeCount,
    principal,
    penalty,
    interest,
    total_amount: totalAmount,
    payment_principal: parseAmount(formData.get('paymentPrincipal')),
    payment_interest: parseAmount(formData.get('paymentInterest')),
    payment_penalty: parseAmount(formData.get('paymentPenalty')),
    payment_total: Number((
      parseAmount(formData.get('paymentPrincipal'))
      + parseAmount(formData.get('paymentInterest'))
      + parseAmount(formData.get('paymentPenalty'))
    ).toFixed(2)),
    billing_date: formData.get('billingDate') || null,
    billing_person_received: formData.get('billingDate') ? (formData.get('billingPersonReceived') || '') : '',
    coverage_date: formData.get('coverageDate') || null,
    soa_date: formData.get('soaDate') || null,
    person_received: formData.get('soaDate') ? (formData.get('personReceived') || '') : '',
    soa2_date: formData.get('soa2Date') || null,
    soa2_person_received: formData.get('soa2Date') ? (formData.get('soa2PersonReceived') || '') : '',
    soa2_principal: parseAmount(formData.get('soa2Principal')),
    soa2_penalty: parseAmount(formData.get('soa2Penalty')),
    soa2_interest: parseAmount(formData.get('soa2Interest')),
    soa2_total: parseAmount(formData.get('soa2Total')),
    soa3_date: formData.get('soa3Date') || null,
    soa3_person_received: formData.get('soa3Date') ? (formData.get('soa3PersonReceived') || '') : '',
    soa3_principal: parseAmount(formData.get('soa3Principal')),
    soa3_penalty: parseAmount(formData.get('soa3Penalty')),
    soa3_interest: parseAmount(formData.get('soa3Interest')),
    soa3_total: parseAmount(formData.get('soa3Total')),
    legal_referral_date: formData.get('legalReferralDate') || null,
    demand_letter_date: formData.get('demandLetterDate') || null,
    demand_letter_received_date: formData.get('demandLetterReceivedDate') || null,
    demand_person_received: formData.get('demandLetterDate') ? (formData.get('demandPersonReceived') || '') : '',
    handling_lawyer: formData.get('handlingLawyer') || '',
    docket_number: formData.get('docketNumber') || '',
    case_date: formData.get('caseDate') || null,
    status: formData.get('status'),
  };

  const response = await fetch('/api/employers', {
    method: editingEmployerId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${currentUser?.accessToken || ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(editingEmployerId ? { id: editingEmployerId, employer } : employer),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    alert(error?.error || `Unable to save employer (HTTP ${response.status}).`);
    return;
  }

  const savedEmployer = await response.json();
  document.querySelectorAll(`tr[data-employer-id="${savedEmployer.id}"]`).forEach((row) => {
    row.dataset.employer = JSON.stringify(savedEmployer);
    row.dataset.payerType = savedEmployer.payer_type || 'Interim Payer';
  });
  addEmployerToTable(savedEmployer.assigned_view, employerToRow(savedEmployer), savedEmployer.id, savedEmployer.assigned_view, savedEmployer);
  addEmployerToTable('MasterFile', employerToRow(savedEmployer), savedEmployer.id, savedEmployer.assigned_view, savedEmployer);
  refreshMainDashboard();
  loadEmployerSummary().then(refreshMainDashboard).catch((error) => console.error(error));
  editingEmployerId = null;
  employerSuccessModal.hidden = false;
  employerSuccessOk.focus();
});

document.querySelectorAll('.ao-sheet-tab').forEach((tabButton) => {
  tabButton.addEventListener('click', () => {
    const sheetTabs = tabButton.closest('.ao-sheet-tabs');
    sheetTabs?.querySelectorAll('.ao-sheet-tab').forEach((t) => t.classList.remove('active'));
    tabButton.classList.add('active');
    const viewSection = tabButton.closest('.ao-view');
    const viewName = viewSection?.dataset.aoView;
    if (viewName) filterAoTable(viewName);
  });
});

// AO Urgent Action Banner Button Listeners
document.querySelectorAll('.ao-banner-filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const viewSection = btn.closest('.ao-view');
    const viewName = viewSection?.dataset.aoView;
    const dueTab = viewSection?.querySelector('.ao-sheet-tab[data-sheet="DUE"]');
    if (dueTab) {
      viewSection.querySelectorAll('.ao-sheet-tab').forEach((t) => t.classList.remove('active'));
      dueTab.classList.add('active');
      if (viewName) filterAoTable(viewName);
    }
  });
});

document.querySelectorAll('.ao-banner-review-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    updateSoaReminders();
    if (soaReminderModal) soaReminderModal.hidden = false;
  });
});

document.querySelectorAll('.ao-table tbody').forEach((body) => {
  body.innerHTML = '<tr>'.concat('<td></td>'.repeat(26), '</tr>').repeat(21);
});

// SOA Reminders Bell and Modal Listeners
const soaReminderModal = document.getElementById('soaReminderModal');
const soaNotificationBell = document.getElementById('soaNotificationBell');
const soaReminderClose = document.getElementById('soaReminderClose');

if (soaNotificationBell) {
  soaNotificationBell.addEventListener('click', () => {
    updateSoaReminders();
    if (soaReminderModal) soaReminderModal.hidden = false;
  });
}

if (soaReminderClose) {
  soaReminderClose.addEventListener('click', () => {
    if (soaReminderModal) soaReminderModal.hidden = true;
  });
}

if (soaReminderModal) {
  soaReminderModal.addEventListener('click', (event) => {
    if (event.target === soaReminderModal) soaReminderModal.hidden = true;
  });
}

// Dashboard Quality Monitor interactive row clicks
document.querySelectorAll('[data-monitor-action]').forEach((row) => {
  row.addEventListener('click', () => {
    const action = row.dataset.monitorAction;
    if (action === 'dueCount') {
      updateSoaReminders();
      if (soaReminderModal) soaReminderModal.hidden = false;
      return;
    }

    const targetView = isAdminSideRole(currentUser?.role) ? 'MasterFile' : (getOfficerView(currentUser?.role) || 'MasterFile');
    navigateToView(targetView);

    const view = document.querySelector(`[data-ao-view="${targetView}"]`);
    if (!view) return;

    if (action === 'settled') {
      const statusFilter = view.querySelector('[data-filter-status]');
      if (statusFilter) statusFilter.value = 'Settled';
    } else if (action === 'unsettled') {
      const statusFilter = view.querySelector('[data-filter-status]');
      if (statusFilter) statusFilter.value = 'Unsettled';
    } else if (action === 'legalCount') {
      const statusFilter = view.querySelector('[data-filter-status]');
      if (statusFilter) statusFilter.value = 'Referred to Legal';
    } else if (action === 'rp') {
      const allTabs = view.querySelectorAll('.ao-sheet-tab');
      allTabs.forEach((t) => t.classList.remove('active'));
      const rpTab = view.querySelector('.ao-sheet-tab[data-sheet="RP"]');
      if (rpTab) rpTab.classList.add('active');
    } else if (action === 'ipSp') {
      const allTabs = view.querySelectorAll('.ao-sheet-tab');
      allTabs.forEach((t) => t.classList.remove('active'));
      const ipTab = view.querySelector('.ao-sheet-tab[data-sheet="IP"]');
      if (ipTab) ipTab.classList.add('active');
    }

    filterAoTable(targetView);
  });
});

// Auto-format SSS Employer Number to XX-XXXXXXX-X
const employerNumberInput = employerForm?.elements?.employerNumber;
if (employerNumberInput) {
  employerNumberInput.addEventListener('input', (e) => {
    let val = e.target.value.replace(/\D/g, '').slice(0, 10);
    if (val.length > 9) {
      val = `${val.slice(0, 2)}-${val.slice(2, 9)}-${val.slice(9)}`;
    } else if (val.length > 2) {
      val = `${val.slice(0, 2)}`;
    }
    e.target.value = val;
  });
}

// Auto-advance Status dropdown safely when dates are entered (Never downgrade Settled accounts)
employerForm.elements.soaDate?.addEventListener('change', () => {
  const currentStatus = employerForm.elements.status.value;
  if (employerForm.elements.soaDate.value && (!currentStatus || currentStatus === '1st SOA Served')) {
    employerForm.elements.status.value = '1st SOA Served';
  }
});

employerForm.elements.soa2Date?.addEventListener('change', () => {
  const currentStatus = employerForm.elements.status.value;
  if (employerForm.elements.soa2Date.value && (currentStatus === '1st SOA Served' || !currentStatus)) {
    employerForm.elements.status.value = '2nd SOA Served';
  }
});

employerForm.elements.soa3Date?.addEventListener('change', () => {
  const currentStatus = employerForm.elements.status.value;
  if (employerForm.elements.soa3Date.value && (currentStatus === '1st SOA Served' || currentStatus === '2nd SOA Served' || !currentStatus)) {
    employerForm.elements.status.value = '3rd SOA Served';
  }
});

employerForm.elements.legalReferralDate?.addEventListener('change', () => {
  const currentStatus = employerForm.elements.status.value;
  if (employerForm.elements.legalReferralDate.value && currentStatus !== 'Settled') {
    employerForm.elements.status.value = 'Referred to Legal';
  }
});

const exportTableToCsv = (viewName) => {
  const table = document.querySelector(`[data-ao-view="${viewName}"] .ao-table`);
  if (!table) return;

  const rows = [];
  const headerCells = [...table.querySelectorAll('thead tr:last-child th')].map((th) => `"${th.innerText.replace(/\n/g, ' ').trim().replace(/"/g, '""')}"`);
  rows.push(headerCells.join(','));

  table.querySelectorAll('tbody tr[data-employer-id]').forEach((tr) => {
    if (tr.hidden || tr.style.display === 'none') return;
    const cells = [...tr.cells].map((td) => `"${td.innerText.replace(/\n/g, ' ').trim().replace(/"/g, '""')}"`);
    rows.push(cells.join(','));
  });

  const csvContent = '\uFEFF' + rows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${viewName}_Employers_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

document.querySelectorAll('[data-table-dashboard]').forEach((button) => {
  button.addEventListener('click', () => openTableDashboard(button.dataset.tableDashboard));
});

document.querySelectorAll('[data-table-export]').forEach((button) => {
  button.addEventListener('click', () => exportTableToCsv(button.dataset.tableExport));
});

document.querySelectorAll('[data-table-edit]').forEach((button) => {
  button.addEventListener('click', () => {
    const view = document.querySelector(`[data-ao-view="${button.dataset.tableEdit}"]`);
    setTableEditMode(button.dataset.tableEdit, !view.classList.contains('is-editing'));
  });
});

document.querySelectorAll('[data-table-delete]').forEach((button) => {
  button.addEventListener('click', () => openDeleteConfirmation(button.dataset.tableDelete));
});

document.querySelectorAll('[data-table-edit-data]').forEach((button) => {
  button.addEventListener('click', () => editSelectedEmployer(button.dataset.tableEditData));
});

document.querySelectorAll('.ao-table-filters input, .ao-table-filters select').forEach((control) => {
  const viewName = control.closest('.ao-view')?.dataset?.aoView;
  if (!viewName) return;
  control.addEventListener('input', () => filterAoTable(viewName));
  control.addEventListener('change', () => filterAoTable(viewName));
});

deleteConfirmApprove.addEventListener('click', deleteSelectedRows);
deleteConfirmCancel.addEventListener('click', closeDeleteConfirmation);
deleteConfirmClose.addEventListener('click', closeDeleteConfirmation);
deleteConfirmModal.addEventListener('click', (event) => {
  if (event.target === deleteConfirmModal) closeDeleteConfirmation();
});

document.addEventListener('click', (event) => {
  const row = event.target.closest('.ao-table tbody tr');
  if (!row || !row.closest('.ao-view.is-editing') || !row.dataset.employerId) return;
  row.classList.toggle('is-selected');
});

document.addEventListener('dblclick', (event) => {
  const row = event.target.closest('.ao-table tbody tr');
  if (!row || !row.dataset.employerId) return;
  openEmployerEdit(row);
});

/* ── Billing History / Statement of Account Modal ── */
const billingHistoryModal = document.getElementById('billingHistoryModal');
const billingHistoryBody = document.getElementById('billingHistoryBody');
const billingHistoryClose = document.getElementById('billingHistoryClose');
const billingHistoryDismissBtn = document.getElementById('billingHistoryDismissBtn');
const billingHistoryEditBtn = document.getElementById('billingHistoryEditBtn');
let billingHistoryTargetRow = null;

const fmt = (val) => `₱${formatAmount(val ?? 0)}`;

const openBillingHistoryModal = (row) => {
  const employer = JSON.parse(row?.dataset.employer || '{}');
  if (!employer.id) return;
  billingHistoryTargetRow = row;

  const soaInfo = getEmployerSoaInfo(employer);
  const status = employer.status || '1st SOA Served';

  const stage1Active = status.includes('1st SOA') || status.includes('2nd') || status.includes('3rd') || status.includes('Legal') || status.includes('Settled');
  const stage2Active = status.includes('2nd SOA') || status.includes('3rd') || status.includes('Legal') || status.includes('Settled');
  const stage3Active = status.includes('3rd SOA') || status.includes('Legal') || status.includes('Settled');

  const stageCard = (label, date, person, principal, penalty, interest, total, isActive) => {
    if (!date && !principal) return '';
    return `
      <div class="billing-stage-card${isActive ? ' is-active' : ''}">
        <div class="billing-stage-title">
          <span>${label}</span>
          <span>${date ? `Served: ${formatDisplayDate(date)}` : '—'}</span>
        </div>
        <div class="billing-stage-grid">
          <div><div class="item-label">Principal</div><div class="item-value">${fmt(principal)}</div></div>
          <div><div class="item-label">Penalty</div><div class="item-value">${fmt(penalty)}</div></div>
          <div><div class="item-label">Interest</div><div class="item-value">${fmt(interest)}</div></div>
          <div><div class="item-label">Total</div><div class="item-value" style="color:#1d4ed8">${fmt(total)}</div></div>
        </div>
        ${person ? `<div style="font-size:11px;color:#475569;margin-top:6px">Received by: <strong>${person}</strong></div>` : ''}
      </div>`;
  };

  const paidTotal = Number(employer.payment_total || 0);
  const latestTotal = Number(employer.soa3_total || employer.soa2_total || employer.total_amount || 0);
  const balance = Math.max(0, latestTotal - paidTotal);

  billingHistoryBody.innerHTML = `
    <div class="billing-emp-header">
      <div class="billing-emp-title">
        <h3>${employer.employer_name || '—'}</h3>
        <p>${formatSssEmployerNumber(employer.employer_number)} &bull; ${employer.payer_type || 'Interim Payer'} &bull; ${employer.assigned_view || ''}</p>
      </div>
      <span class="status-badge ${soaInfo.stage === 'Settled' ? 'status-badge-settled' : soaInfo.stage === 'Referred to Legal' ? 'status-badge-legal' : 'status-badge-1st-soa'}">${status}</span>
    </div>
    ${stage1Active ? stageCard('1st SOA Billing', employer.soa_date, employer.person_received, employer.principal, employer.penalty, employer.interest, employer.total_amount, !stage2Active) : ''}
    ${stage2Active ? stageCard('2nd SOA Billing', employer.soa2_date, employer.soa2_person_received, employer.soa2_principal, employer.soa2_penalty, employer.soa2_interest, employer.soa2_total, !stage3Active) : ''}
    ${stage3Active ? stageCard('3rd SOA Billing', employer.soa3_date, employer.soa3_person_received, employer.soa3_principal, employer.soa3_penalty, employer.soa3_interest, employer.soa3_total, true) : ''}
    <div class="billing-summary-footer">
      <span>Total Collectibles: <strong>${fmt(latestTotal)}</strong></span>
      <span>Total Collected: <strong>${fmt(paidTotal)}</strong></span>
      <span>Remaining Balance: <strong style="color:#fbbf24">${fmt(balance)}</strong></span>
    </div>`;

  billingHistoryModal.hidden = false;
};

const closeBillingHistoryModal = () => {
  billingHistoryModal.hidden = true;
  billingHistoryTargetRow = null;
};

if (billingHistoryClose) billingHistoryClose.addEventListener('click', closeBillingHistoryModal);
if (billingHistoryDismissBtn) billingHistoryDismissBtn.addEventListener('click', closeBillingHistoryModal);
if (billingHistoryModal) billingHistoryModal.addEventListener('click', (e) => { if (e.target === billingHistoryModal) closeBillingHistoryModal(); });
if (billingHistoryEditBtn) billingHistoryEditBtn.addEventListener('click', () => {
  if (billingHistoryTargetRow) { closeBillingHistoryModal(); openEmployerEdit(billingHistoryTargetRow); }
});

// Click on amount column (Total Amount = col index 8) to open billing history
document.addEventListener('click', (event) => {
  const cell = event.target.closest('td.td-amount-clickable');
  if (!cell) return;
  const row = cell.closest('tr[data-employer-id]');
  if (row) openBillingHistoryModal(row);
});

Promise.all([loadEmployers(), loadEmployerSummary()])
  .then(() => refreshMainDashboard())
  .catch((error) => console.error(error));
loadCalendarEvents().catch((error) => console.error(error));

document.addEventListener('click', (event) => {
  if (!event.target.closest('.ao-table') && !event.target.closest('.table-edit-btn')) {
    document.querySelectorAll('.ao-table tbody tr.is-selected').forEach((selectedRow) => {
      selectedRow.classList.remove('is-selected');
    });
  }
});

const COLORS = {
  ao1: '#1565c0',
  ao2: '#2e7d32',
  ao3: '#e65100',
  total: '#29b6f6',
  navy: '#1a3a5c',
};

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        font: { size: 9, family: 'Arial' },
        boxWidth: 10,
        padding: 6,
      },
    },
  },
};

/* ── Pie Chart: Employers Encoded by Branch ── */
pieChart = new Chart(document.getElementById('pieChart'), {
  type: 'pie',
  data: {
    labels: ['AO1', 'AO2', 'AO3'],
    datasets: [{
      data: [4, 5, 3],
      backgroundColor: [COLORS.ao1, COLORS.ao2, COLORS.ao3],
      borderColor: '#fff',
      borderWidth: 1,
    }],
  },
  options: {
    ...chartDefaults,
    plugins: {
      ...chartDefaults.plugins,
      legend: {
        ...chartDefaults.plugins.legend,
        position: 'right',
      },
    },
  },
});

/* ── Bar Chart: SOA Escalation Pipeline ── */
barChart = new Chart(document.getElementById('barChart'), {
  type: 'bar',
  data: {
    labels: ['1st SOA', '2nd SOA', '3rd SOA', 'Legal', 'Settled'],
    datasets: [{
      data: [0, 0, 0, 0, 0],
      backgroundColor: ['#0284c7', '#f59e0b', '#f43f5e', '#dc2626', '#10b981'],
      borderRadius: 4,
      barPercentage: 0.65,
    }],
  },
  options: {
    ...chartDefaults,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.raw} account${ctx.raw === 1 ? '' : 's'}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { font: { size: 9, weight: 'bold' } },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          font: { size: 9 },
        },
        grid: { color: '#e2e8f0' },
      },
    },
  },
});

// Clickable Monitor Rows
document.querySelectorAll('.status-row-clickable').forEach((row) => {
  row.addEventListener('click', () => {
    const action = row.dataset.monitorAction;
    if (action === 'dueCount') {
      if (soaReminderModal) soaReminderModal.hidden = false;
      updateSoaReminders();
    } else if (action === 'settled') {
      navigateToView('MasterFile');
      const filter = document.querySelector('[data-ao-view="MasterFile"] [data-filter-status]');
      if (filter) { filter.value = 'Settled'; const activeView = getOfficerView(currentUser?.role) || 'MasterFile';
    filterAoTable(activeView); }
    } else if (action === 'unsettled') {
      navigateToView('MasterFile');
      const filter = document.querySelector('[data-ao-view="MasterFile"] [data-filter-status]');
      if (filter) { filter.value = ''; filterAoTable('MasterFile'); }
    } else if (action === 'legalCount') {
      navigateToView('MasterFile');
      const filter = document.querySelector('[data-ao-view="MasterFile"] [data-filter-status]');
      if (filter) { filter.value = 'Referred to Legal'; filterAoTable('MasterFile'); }
    } else if (action === 'pendingSoa') {
      navigateToView('MasterFile');
    } else if (action === 'rp') {
      navigateToView('MasterFile');
      const tab = document.querySelector('[data-ao-view="MasterFile"] [data-sheet="RP"]');
      if (tab) tab.click();
    } else if (action === 'ipSp') {
      navigateToView('MasterFile');
      const tab = document.querySelector('[data-ao-view="MasterFile"] [data-sheet="IP"]');
      if (tab) tab.click();
    }
  });
});

// Interactive Metric Cards Click Handler
document.querySelectorAll('.metric-card-interactive').forEach((card) => {
  card.addEventListener('click', () => {
    const action = card.dataset.cardAction;
    if (!action) return;
    if (action === 'dueCount') {
      updateSoaReminders();
      if (soaReminderModal) soaReminderModal.hidden = false;
      return;
    }
    navigateToView('MasterFile');
    const statusSelect = document.querySelector('[data-ao-view="MasterFile"] [data-filter-status]');
    if (action === 'paid') {
      if (statusSelect) statusSelect.value = 'Settled';
    } else if (action === 'soa1Count') {
      if (statusSelect) statusSelect.value = '1st SOA Served';
    } else if (action === 'soa2Count') {
      if (statusSelect) statusSelect.value = '2nd SOA Served';
    } else if (action === 'soa3Count') {
      if (statusSelect) statusSelect.value = '3rd SOA Served';
    } else if (action === 'legalCount') {
      if (statusSelect) statusSelect.value = 'Referred to Legal';
    } else {
      if (statusSelect) statusSelect.value = '';
    }
    filterAoTable('MasterFile');
  });
});

// Clickable Branch Performance Table Rows
document.querySelectorAll('tr.branch-row-clickable').forEach((row) => {
  row.addEventListener('click', () => {
    const branch = row.dataset.branchRow;
    if (branch) navigateToView(branch);
  });
});

/* ── Grouped Bar Chart: Overall Performance ── */
groupedBarChart = new Chart(document.getElementById('groupedBarChart'), {
  type: 'bar',
  data: {
    labels: ['Records', 'Settled', 'Unsettled', 'Billed Amount', 'Unsettled Amount'],
    datasets: [
      {
        label: 'AO1',
        data: [4, 4, 0, 3.5, 0],
        backgroundColor: COLORS.ao1,
        barPercentage: 0.85,
      },
      {
        label: 'AO2',
        data: [5, 4, 1, 6.3, 2.2],
        backgroundColor: COLORS.ao2,
        barPercentage: 0.85,
      },
      {
        label: 'AO3',
        data: [3, 2, 1, 9.4, 3],
        backgroundColor: COLORS.ao3,
        barPercentage: 0.85,
      },
      {
        label: 'TOTAL',
        data: [12, 10, 2, 19.2, 5.2],
        backgroundColor: COLORS.total,
        barPercentage: 0.85,
      },
    ],
  },
  options: {
    ...chartDefaults,
    plugins: {
      legend: {
        ...chartDefaults.plugins.legend,
        position: 'bottom',
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const val = ctx.raw;
            if (ctx.dataIndex >= 3) {
              return `${ctx.dataset.label}: ₱${formatAmount(val * 1000)}`;
            }
            return `${ctx.dataset.label}: ${val} accounts`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          font: { size: 8 },
          maxRotation: 0,
        },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: { font: { size: 9 } },
        grid: { color: '#e0e0e0' },
      },
    },
  },
});

refreshCharts();

// Initialize AO personal performance charts
const initializeAoPersonalCharts = (aoViewName) => {
  const aoEmployers = [...document.querySelectorAll(`[data-ao-view="${aoViewName}"] tbody tr[data-employer-id]`)].map((row) => {
    try {
      return JSON.parse(row.dataset.employer || '{}');
    } catch {
      return {};
    }
  });

  // Collect stage and payer type data
  const stageCounts = { '1st SOA': 0, '2nd SOA': 0, '3rd SOA': 0, 'Legal': 0, 'Settled': 0 };
  const payerCounts = { 'RP': 0, 'IP': 0, 'NP': 0 };
  const encodingByMonth = {};

  aoEmployers.forEach((emp) => {
    // Count by stage
    const status = (emp.status || '').toLowerCase();
    if (status.includes('1st soa')) stageCounts['1st SOA']++;
    else if (status.includes('2nd soa')) stageCounts['2nd SOA']++;
    else if (status.includes('3rd soa')) stageCounts['3rd SOA']++;
    else if (status.includes('legal')) stageCounts['Legal']++;
    else if (status === 'settled' || status.includes('settled') && !status.includes('unsettled')) stageCounts['Settled']++;

    // Count by payer type
    const payerType = emp.payer_type || 'IP';
    const isNonPayingType = payerType === 'Non-Paying' || payerType === 'Non Paying' || payerType === 'Special Payer' || payerType === 'NP' || payerType === 'SP';
    if (payerType === 'Regular Payer' || payerType === 'RP') payerCounts['RP']++;
    else if (payerType === 'Interim Payer' || payerType === 'IP') payerCounts['IP']++;
    else if (isNonPayingType) payerCounts['NP']++;

    // Count by encoding month
    if (emp.created_at) {
      const date = new Date(emp.created_at);
      const monthKey = date.toLocaleString('default', { month: 'short', year: '2-digit' });
      encodingByMonth[monthKey] = (encodingByMonth[monthKey] || 0) + 1;
    }
  });

  // Initialize Stage Chart
  if (document.getElementById('aoStageChart')) {
    if (aoStageChart) aoStageChart.destroy();
    aoStageChart = new Chart(document.getElementById('aoStageChart'), {
      type: 'bar',
      data: {
        labels: Object.keys(stageCounts),
        datasets: [{
          label: 'Accounts',
          data: Object.values(stageCounts),
          backgroundColor: ['#3b82f6', '#f59e0b', '#ef4444', '#dc2626', '#10b981'],
          borderRadius: 6,
        }],
      },
      options: {
        ...chartDefaults,
        indexAxis: 'y',
        scales: {
          x: { beginAtZero: true, ticks: { font: { size: 9 } } },
          y: { ticks: { font: { size: 10 } } },
        },
      },
    });
  }

  // Initialize Payer Type Chart
  if (document.getElementById('aoPayerChart')) {
    if (aoPayerChart) aoPayerChart.destroy();
    aoPayerChart = new Chart(document.getElementById('aoPayerChart'), {
      type: 'doughnut',
      data: {
        labels: ['RP - Regularly Paying', 'IP - Intermittently Paying', 'NP - Non-Paying'],
        datasets: [{
          data: [payerCounts['RP'], payerCounts['IP'], payerCounts['NP']],
          backgroundColor: ['#10b981', '#3b82f6', '#ef4444'],
          borderColor: '#ffffff',
          borderWidth: 2,
        }],
      },
      options: {
        ...chartDefaults,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 } } },
        },
      },
    });
  }

  // Initialize Encoding Activity Chart
  if (document.getElementById('aoEncodingChart')) {
    if (aoEncodingChart) aoEncodingChart.destroy();
    const months = Object.keys(encodingByMonth).slice(-12);
    const values = months.map((m) => encodingByMonth[m]);
    aoEncodingChart = new Chart(document.getElementById('aoEncodingChart'), {
      type: 'bar',
      data: {
        labels: months,
        datasets: [{
          label: 'Employers Encoded',
          data: values,
          backgroundColor: '#3b82f6',
          borderRadius: 6,
        }],
      },
      options: {
        ...chartDefaults,
        scales: {
          y: { beginAtZero: true, ticks: { font: { size: 9 } } },
          x: { ticks: { font: { size: 8 }, maxRotation: 45 } },
        },
      },
    });
  }
};

// Populate AO action items
const populateAoActionItems = (aoViewName) => {
  const container = document.getElementById('aoActionItemsContainer');
  if (!container) return;
  container.innerHTML = '';

  const aoEmployers = [...document.querySelectorAll(`[data-ao-view="${aoViewName}"] tbody tr[data-employer-id]`)].map((row) => {
    try {
      return JSON.parse(row.dataset.employer || '{}');
    } catch {
      return {};
    }
  });

  let soa1Count = 0, soa2Count = 0, soa3Count = 0, legalCount = 0, settledCount = 0, dueCount = 0;

  aoEmployers.forEach((emp) => {
    const status = (emp.status || '').toLowerCase();
    const soaInfo = getEmployerSoaInfo(emp);
    if (soaInfo.isDue) dueCount++;
    if (status.includes('1st soa')) soa1Count++;
    else if (status.includes('2nd soa')) soa2Count++;
    else if (status.includes('3rd soa')) soa3Count++;
    else if (status.includes('legal')) legalCount++;
    else if (status.includes('settled')) settledCount++;
  });

  const actionItems = [];

  if (dueCount > 0) {
    actionItems.push({
      cardType: 'card-danger',
      badgeClass: 'badge-warning',
      badge: 'Immediate Action',
      icon: '🔔',
      headline: `${dueCount} Overdue 15-Day Account${dueCount === 1 ? '' : 's'}`,
      subtext: '15-day compliance cycle lapsed. Review & escalate in MasterFile.',
      onClick: () => {
        if (soaReminderModal) soaReminderModal.hidden = false;
        updateSoaReminders();
      },
    });
  }

  if (soa1Count > 0) {
    actionItems.push({
      cardType: 'card-info',
      badgeClass: 'badge-info',
      badge: 'Active 1st SOA',
      icon: '📋',
      headline: `${soa1Count} Initial Assessment${soa1Count === 1 ? '' : 's'}`,
      subtext: 'Awaiting 15-day compliance verification or voluntary settlement.',
      onClick: () => {
        navigateToView(aoViewName);
        const filter = document.querySelector(`[data-ao-view="${aoViewName}"] [data-filter-status]`);
        if (filter) { filter.value = '1st SOA Served'; filterAoTable(aoViewName); }
      },
    });
  }

  if (soa2Count + soa3Count > 0) {
    actionItems.push({
      cardType: 'card-alert',
      badgeClass: 'badge-warning',
      badge: 'Demand Escalation',
      icon: '⚠️',
      headline: `${soa2Count + soa3Count} Escalated Notice${soa2Count + soa3Count === 1 ? '' : 's'}`,
      subtext: `${soa2Count} on 2nd SOA & ${soa3Count} on 3rd SOA final demand stage.`,
      onClick: () => {
        navigateToView(aoViewName);
        const filter = document.querySelector(`[data-ao-view="${aoViewName}"] [data-filter-status]`);
        if (filter) { filter.value = soa2Count > 0 ? '2nd SOA Served' : '3rd SOA Served'; filterAoTable(aoViewName); }
      },
    });
  }

  if (legalCount > 0) {
    actionItems.push({
      cardType: 'card-danger',
      badgeClass: 'badge-warning',
      badge: 'Legal Endorsement',
      icon: '⚖️',
      headline: `${legalCount} Referred to Legal`,
      subtext: 'Active court litigation, lawyer handling & docket follow-ups.',
      onClick: () => {
        navigateToView(aoViewName);
        const filter = document.querySelector(`[data-ao-view="${aoViewName}"] [data-filter-status]`);
        if (filter) { filter.value = 'Referred to Legal'; filterAoTable(aoViewName); }
      },
    });
  }

  if (settledCount > 0) {
    actionItems.push({
      cardType: 'card-success',
      badgeClass: 'badge-success',
      badge: 'Settled',
      icon: '✓',
      headline: `${settledCount} Fully Settled Record${settledCount === 1 ? '' : 's'}`,
      subtext: 'Delinquency resolved with 100% payment realization.',
      onClick: () => {
        navigateToView(aoViewName);
        const filter = document.querySelector(`[data-ao-view="${aoViewName}"] [data-filter-status]`);
        if (filter) { filter.value = 'Settled'; filterAoTable(aoViewName); }
      },
    });
  }

  if (actionItems.length === 0) {
    const noItems = document.createElement('div');
    noItems.style.cssText = 'grid-column: 1 / -1; padding: 24px; text-align: center; color: #64748b; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;';
    noItems.innerHTML = '<p style="margin: 0; font-weight: 600; color: #059669;">✓ All accounts in your jurisdiction are compliant and up to date.</p>';
    container.appendChild(noItems);
    return;
  }

  actionItems.forEach((item) => {
    const card = document.createElement('div');
    card.className = `insight-card ${item.cardType || ''}`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('title', 'Click to filter these accounts');
    card.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
        <span class="insight-badge ${item.badgeClass}">${item.badge}</span>
        <span style="font-size: 15px;">${item.icon}</span>
      </div>
      <p class="insight-text" style="font-size: 12px; font-weight: 700; color: #0f294a; margin: 0 0 2px;">${item.headline}</p>
      <p class="insight-text" style="font-size: 11px; color: #64748b; margin: 0; line-height: 1.35;">${item.subtext}</p>
    `;
    if (item.onClick) {
      card.addEventListener('click', item.onClick);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          item.onClick();
        }
      });
    }
    container.appendChild(card);
  });
};

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = loginForm.elements.username.value.trim();
    const password = loginForm.elements.password.value;
    const submitButton = loginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.classList.add('is-loading');
    submitButton.setAttribute('aria-label', 'Signing in');
    loginError.hidden = true;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to sign in.');

      saveAuthSession(result.user);
      currentUser = result.user;
      const defaultView = getOfficerView(result.user.role) || 'DASHBOARD';
      showDashboard(result.user, {
        animate: true,
        onAnimationEnd: () => {
          navigateToView(defaultView);
        },
      });
      if (typeof syncOfficerFormLayout === 'function') syncOfficerFormLayout();
      if (typeof loadEmployers === 'function') loadEmployers().then(refreshMainDashboard).catch((error) => console.error(error));
      if (typeof loadEmployerSummary === 'function') loadEmployerSummary().then(refreshMainDashboard).catch((error) => console.error(error));
      if (typeof loadCalendarEvents === 'function') loadCalendarEvents({ showNotification: false }).catch((error) => console.error(error));
    } catch (error) {
      loginError.textContent = error.message;
      loginError.hidden = false;
      loginForm.elements.password.focus();
    } finally {
      submitButton.disabled = false;
      submitButton.classList.remove('is-loading');
      submitButton.removeAttribute('aria-label');
    }
  });
}

const restoreSessionOnLoad = () => {
  const savedAccount = getSavedAuthSession();
  if (savedAccount && (savedAccount.accessToken || savedAccount.role)) {
    currentUser = savedAccount;
    const defaultView = getOfficerView(savedAccount.role) || 'DASHBOARD';
    showDashboard(savedAccount);
    navigateToView(defaultView);
    if (typeof syncOfficerFormLayout === 'function') syncOfficerFormLayout();
    if (typeof loadEmployers === 'function') loadEmployers().then(refreshMainDashboard).catch((error) => console.error(error));
    if (typeof loadEmployerSummary === 'function') loadEmployerSummary().then(refreshMainDashboard).catch((error) => console.error(error));
    if (typeof loadCalendarEvents === 'function') loadCalendarEvents({ showNotification: false }).catch((error) => console.error(error));
  } else {
    dashboardShell.hidden = true;
    authScreen.hidden = false;
  }
};

restoreSessionOnLoad();
