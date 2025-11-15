// app.js - DB-based authentication version (no Firebase Auth required)

// ---------------- CONFIG ----------------
const SYMPOSIUM_DATE = new Date('2026-02-26T10:00:00'); // adjust as needed
// NOTE: COLLEGE_DOMAIN is kept for optional checks, but DB-based login does not enforce it
const COLLEGE_DOMAIN = '@cit.edu.in';

// ---------------- STATE ----------------
let currentUser = null; // { uid: dbKey, name, email, role, teamId }
let currentPage = 'dashboard';
let notifications = [];

let dbData = {
  users: {},
  teams: {},
  tasks: {},
  events: {},
  sponsors: {},
  logistics: {}
};

// ----------------- UTIL HELPERS -----------------
function getObjectValues(obj = {}) {
  try {
    return Object.values(obj);
  } catch (e) {
    return [];
  }
}

function getUserById(uid) {
  return dbData.users[uid] || { name: 'Unknown', email: '', role: 'volunteer', teamId: null };
}

function getUserByEmail(email) {
  const users = getObjectValues(dbData.users);
  return users.find(u => u.email && u.email.toLowerCase() === (email || '').toLowerCase());
}

function getTeamById(id) {
  return dbData.teams[id] || { id, name: 'Unknown', icon: '❓' };
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString();
}

function isUrgent(dueDate) {
  if (!dueDate) return false;
  const diff = new Date(dueDate) - new Date();
  return diff <= 1000 * 60 * 60 * 24 * 3; // within 3 days
}

function calculateProgress(tasks) {
  if (!tasks || tasks.length === 0) return 0;
  const done = tasks.filter(t => t.status === 'Done').length;
  return Math.round((done / tasks.length) * 100);
}

function calculateTeamProgress(teamId) {
  const tasks = getObjectValues(dbData.tasks).filter(t => t.teamId === teamId);
  if (tasks.length === 0) return 0;
  const done = tasks.filter(t => t.status === 'Done').length;
  return Math.round((done / tasks.length) * 100);
}

// ---------------- DB-BASED AUTH (MAIN) ----------------

// Show login UI (default)
function showLoginPage() {
  currentUser = null;
  db.ref().off(); // detach listeners
  document.getElementById('mainDashboard').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
}

// Show dashboard after successful DB login
function showDashboardAfterLogin() {
  initializeRealTimeListeners();
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('mainDashboard').style.display = 'flex';
  updateUserProfileUI();
  startCountdown();
  navigateToPage('dashboard');
}

// Handle login form submission (DB-based)
async function handleLogin(event) {
  if (event && event.preventDefault) event.preventDefault();

  const emailEl = document.getElementById('emailInput');
  const passwordEl = document.getElementById('passwordInput');
  const loginButton = document.getElementById('loginButton');
  const loginErrorMsg = document.getElementById('loginErrorMessage');

  const email = emailEl ? emailEl.value.trim() : '';
  const password = passwordEl ? passwordEl.value : '';

  loginErrorMsg.textContent = '';
  loginErrorMsg.classList.remove('show');

  if (!email) {
    loginErrorMsg.textContent = 'Please enter your email.';
    loginErrorMsg.classList.add('show');
    return;
  }
  if (!password) {
    loginErrorMsg.textContent = 'Please enter your password.';
    loginErrorMsg.classList.add('show');
    return;
  }

  loginButton.textContent = 'Signing In...';
  loginButton.disabled = true;

  try {
    // Query DB for the user (by email)
    const usersRef = db.ref('/users');
    const query = usersRef.orderByChild('email').equalTo(email);
    const snapshot = await query.once('value');

    if (!snapshot.exists()) {
      loginErrorMsg.textContent = 'User not found. Contact admin to create account.';
      loginErrorMsg.classList.add('show');
      loginButton.textContent = 'Sign In';
      loginButton.disabled = false;
      return;
    }

    const matches = snapshot.val();
    const dbUid = Object.keys(matches)[0];
    const profile = matches[dbUid];

    // If password doesn't exist in DB, create a temporary password and save it
    // (developer convenience) - you may remove this behavior if undesired
    if (!profile.password) {
      const tempPwd = Math.random().toString(36).slice(2, 10);
      await usersRef.child(dbUid).update({ password: tempPwd });
      profile.password = tempPwd;
      console.warn(`No password present for ${email}. Created temp password.`);
    }

    if (profile.password !== password) {
      loginErrorMsg.textContent = 'Incorrect password.';
      loginErrorMsg.classList.add('show');
      loginButton.textContent = 'Sign In';
      loginButton.disabled = false;
      return;
    }

    // Build currentUser from DB profile (use DB key as uid)
    currentUser = {
      uid: dbUid,
      email: profile.email,
      name: profile.name || (profile.email ? profile.email.split('@')[0] : 'User'),
      role: profile.role || 'volunteer',
      teamId: profile.teamId || null
    };

    console.log(`DB login success: ${currentUser.name} (${currentUser.role})`);
    showDashboardAfterLogin();

  } catch (err) {
    console.error('DB login error:', err);
    loginErrorMsg.textContent = 'An error occurred during login. See console.';
    loginErrorMsg.classList.add('show');
  } finally {
    loginButton.textContent = 'Sign In';
    loginButton.disabled = false;
  }
}

// Logout for DB auth
function handleLogout() {
  currentUser = null;
  db.ref().off();
  document.getElementById('mainDashboard').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
  const form = document.getElementById('loginForm');
  if (form) form.reset();
  console.log('Logged out (DB auth)');
}

// Hook the login form
document.addEventListener('DOMContentLoaded', () => {
  const loginFormEl = document.getElementById('loginForm');
  if (loginFormEl) {
    try {
      loginFormEl.removeEventListener('submit', handleLogin);
    } catch (e) {}
    loginFormEl.addEventListener('submit', handleLogin);
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.removeEventListener('click', handleLogout);
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Ensure we start on login page
  showLoginPage();

  // Wire nav clicks (single delegate)
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (ev) => {
      ev.preventDefault();
      const page = item.dataset.page;
      if (page) navigateToPage(page);
    });
  });
});

// ----------------- REAL-TIME DATA SYNC -----------------
function initializeRealTimeListeners() {
  const nodes = ['users', 'teams', 'tasks', 'events', 'sponsors', 'logistics'];

  nodes.forEach(node => {
    db.ref(node).on('value', (snapshot) => {
      dbData[node] = snapshot.val() || {};
      // Update UI if user is logged in
      if (currentUser) refreshCurrentPage();
    });
  });
}

function refreshCurrentPage() {
  navigateToPage(currentPage, true);
}

// ----------------- PERMISSIONS / RBAC -----------------
const Permissions = {
  canManageTask: (task) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    if (!task && currentUser.role === 'team_lead') return true;
    if (task && currentUser.role === 'team_lead' && task.teamId === currentUser.teamId) return true;
    return false;
  },

  canUpdateTaskStatus: (task) => {
    if (!currentUser) return false;
    if (Permissions.canManageTask(task)) return true;
    if (currentUser.role === 'volunteer' && task.assigneeId === currentUser.uid) return true;
    return false;
  },

  canManageTeams: () => currentUser && currentUser.role === 'admin',

  canManageSponsors: () => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    const team = dbData.teams[currentUser.teamId] || {};
    if (currentUser.role === 'team_lead' && team.name === 'Sponsorship Team') return true;
    return false;
  },

  canManageLogistics: () => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    if (currentUser.role === 'team_lead') return true;
    return false;
  },

  canManageEvents: () => currentUser && currentUser.role === 'admin',

  canViewPage: (page) => {
    if (!currentUser) return false;
    if (page === 'analytics' && currentUser.role === 'volunteer') return false;
    return true;
  }
};

// ----------------- DATA FILTERS -----------------
function getVisibleTasks() {
  const allTasks = getObjectValues(dbData.tasks);

  if (!currentUser) return [];
  if (currentUser.role === 'admin') return allTasks;
  if (currentUser.role === 'team_lead') return allTasks.filter(task => task.teamId === currentUser.teamId);
  if (currentUser.role === 'volunteer') return allTasks.filter(task => task.assigneeId === currentUser.uid);
  return [];
}

// ----------------- NAV & RENDER -----------------
function navigateToPage(page, isRefresh = false) {
  if (!currentUser) {
    showLoginPage();
    return;
  }

  if (!isRefresh && !Permissions.canViewPage(page)) {
    alert("You do not have permission to view this page.");
    return;
  }

  if (!isRefresh) currentPage = page;

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  const pageContent = document.getElementById('pageContent');
  if (!isRefresh) {
    pageContent.innerHTML = `<p>Loading ${page}...</p>`;
  } else {
    pageContent.style.opacity = '0.5';
  }

  setTimeout(() => {
    switch (page) {
      case 'dashboard': renderDashboard(pageContent); break;
      case 'teams': renderTeams(pageContent); break;
      case 'events': renderEvents(pageContent); break;
      case 'tasks': renderTasks(pageContent); break;
      case 'sponsors': renderSponsors(pageContent); break;
      case 'logistics': renderLogistics(pageContent); break;
      case 'communication': renderCommunication(pageContent); break;
      case 'analytics': renderAnalytics(pageContent); break;
      default:
        pageContent.innerHTML = `<h2>Page not found: ${page}</h2>`;
    }
    pageContent.style.opacity = '1';
  }, 50);
}

// ---------- RENDER: Dashboard ----------
function renderDashboard(container) {
  const tasks = getVisibleTasks();
  const progress = calculateProgress(tasks);
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'Done').length;
  const activeEvents = Object.keys(dbData.events).length;
  const totalMembers = Object.keys(dbData.users).length;

  const urgentTasks = tasks
    .filter(t => t.status !== 'Done' && isUrgent(t.dueDate))
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 5);

  container.innerHTML = `
    <div class="welcome-banner">
      <div class="welcome-content">
        <h1 class="welcome-title">Welcome back, ${currentUser.name}!</h1>
        <span class="role-badge">${currentUser.role.replace('_', ' ')}</span>
        <p>Let's make NEXERA2k25 a huge success!</p>
        <div class="quick-actions">
          ${Permissions.canManageTask(null) ? `<button class="btn" onclick="openTaskModal()">+ Create Task</button>` : ''}
          ${Permissions.canManageEvents() ? `<button class="btn" onclick="openEventModal()">+ Add Event</button>` : ''}
          <button class="btn" onclick="navigateToPage('tasks')">View All My Tasks</button>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon bg-1">✓</div>
        <div class="stat-info">
          <div class="stat-label">Your/Team Tasks</div>
          <div class="stat-value">${totalTasks}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon bg-2">📊</div>
        <div class="stat-info">
          <div class="stat-label">Completed</div>
          <div class="stat-value">${completedTasks}</div>
          <div class="stat-change">${progress}% complete</div>
        </div>
      </div>
      ${currentUser.role !== 'volunteer' ? `
      <div class="stat-card">
        <div class="stat-icon bg-3">📅</div>
        <div class="stat-info">
          <div class="stat-label">Active Events</div>
          <div class="stat-value">${activeEvents}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon bg-4">👥</div>
        <div class="stat-info">
          <div class="stat-label">Total Members</div>
          <div class="stat-value">${totalMembers}</div>
        </div>
      </div>
      ` : ''}
    </div>

    <div class="grid-2">
      <div class="tasks-section">
        <div class="section-header">
          <h3 class="section-title">Your Urgent Tasks</h3>
          <button class="btn btn--sm" onclick="navigateToPage('tasks')">View All</button>
        </div>
        <div class="task-list">
          ${urgentTasks.length === 0 ? '<p style="text-align:center;color:var(--color-text-secondary);padding:var(--space-24);">No urgent tasks</p>' : urgentTasks.map(task => `
            <div class="task-item" onclick="openTaskDetailModal('${task.id}')">
              <div class="task-priority ${task.priority ? task.priority.toLowerCase() : ''}"></div>
              <div class="task-details">
                <div class="task-title">${task.title}</div>
                <div class="task-meta">
                  <span class="task-assignee">👤 ${getUserById(task.assigneeId).name}</span>
                  <span class="status status--info">⚡ ${getTeamById(task.teamId).icon} ${getTeamById(task.teamId).name}</span>
                  <span class="task-due-date ${isUrgent(task.dueDate) ? 'urgent' : ''}">📅 ${formatDate(task.dueDate)}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      ${currentUser.role !== 'volunteer' ? `
      <div class="progress-section">
        <div class="section-header"><h3 class="section-title">Team Progress</h3></div>
        <div class="team-progress-list">
          ${getObjectValues(dbData.teams).map((team, index) => {
            const teamProgress = calculateTeamProgress(team.id);
            return `
              <div class="team-progress-item">
                <div class="team-info">
                  <span class="team-icon">${team.icon}</span>
                  <span class="team-name">${team.name}</span>
                </div>
                <div class="progress-bar-container">
                  <div class="progress-bar color-${(index % 5) + 1}" style="width: ${teamProgress}%"></div>
                </div>
                <div class="progress-percentage-text">${teamProgress}%</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      ` : `
      <div class="progress-section">
        <h3 class="section-title">NEXERA2k25</h3>
        <p>Welcome to the team! Your assigned tasks will appear here and on the 'Tasks' page.</p>
        <p>Thank you for volunteering!</p>
      </div>
      `}
    </div>
  `;
}

// ---------- RENDER: Tasks (Kanban) ----------
function renderTasks(container) {
  const tasks = getVisibleTasks();
  const todoTasks = tasks.filter(t => t.status === 'To Do');
  const inProgressTasks = tasks.filter(t => t.status === 'In Progress');
  const doneTasks = tasks.filter(t => t.status === 'Done');

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-24);">
      <h2>Tasks</h2>
      ${Permissions.canManageTask(null) ? `<button class="btn btn--primary" onclick="openTaskModal()">+ Create Task</button>` : ''}
    </div>
    <div class="kanban-board">
      <div class="kanban-column">
        <div class="kanban-header todo"><span class="kanban-title">To Do</span><span class="kanban-count">${todoTasks.length}</span></div>
        <div class="kanban-cards">
          ${todoTasks.length === 0 ? '<p class="kanban-empty">No tasks</p>' : todoTasks.map(task => renderKanbanCard(task)).join('')}
        </div>
      </div>
      <div class="kanban-column">
        <div class="kanban-header inprogress"><span class="kanban-title">In Progress</span><span class="kanban-count">${inProgressTasks.length}</span></div>
        <div class="kanban-cards">
          ${inProgressTasks.length === 0 ? '<p class="kanban-empty">No tasks</p>' : inProgressTasks.map(task => renderKanbanCard(task)).join('')}
        </div>
      </div>
      <div class="kanban-column">
        <div class="kanban-header done"><span class="kanban-title">Done</span><span class="kanban-count">${doneTasks.length}</span></div>
        <div class="kanban-cards">
          ${doneTasks.length === 0 ? '<p class="kanban-empty">No tasks</p>' : doneTasks.map(task => renderKanbanCard(task)).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderKanbanCard(task) {
  const assignee = getUserById(task.assigneeId);
  const team = getTeamById(task.teamId);
  return `
    <div class="kanban-card" onclick="openTaskDetailModal('${task.id}')">
      <div class="kanban-card-title">${task.title}</div>
      <div class="kanban-card-description">${task.description || ''}</div>
      ${currentUser.role === 'admin' ? `<div class="kanban-card-team">${team.icon} ${team.name}</div>` : ''}
      <div class="kanban-card-footer">
        <span class="status status--${(task.priority || 'todo').toLowerCase()}">${task.priority || 'Todo'}</span>
        <span style="font-size:var(--font-size-sm);color:var(--color-text-secondary);">👤 ${assignee.name.split(' ')[0]}</span>
      </div>
      <div style="margin-top:var(--space-8);font-size:var(--font-size-xs);color:var(--color-text-secondary);${isUrgent(task.dueDate) ? 'color:var(--color-error);font-weight:bold;' : ''}">📅 ${formatDate(task.dueDate)}</div>
    </div>
  `;
}

// ---------- RENDER: Teams ----------
function renderTeams(container) {
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-24);">
      <h2>Teams</h2>
      ${Permissions.canManageTeams() ? `<button class="btn btn--primary" onclick="openTeamModal()">+ Manage Teams</button>` : ''}
    </div>
    <div class="grid-3">
      ${getObjectValues(dbData.teams).map(team => {
        const lead = getUserById(team.leadId);
        const teamProgress = calculateTeamProgress(team.id);
        const teamTasks = getObjectValues(dbData.tasks).filter(t => t.teamId === team.id);
        const todoCount = teamTasks.filter(t => t.status === 'To Do').length;
        const doneCount = teamTasks.filter(t => t.status === 'Done').length;

        return `
          <div class="card">
            <div class="card__body">
              <div style="font-size:48px;text-align:center;">${team.icon}</div>
              <h3 style="text-align:center;">${team.name}</h3>
              <p style="text-align:center;color:var(--color-text-secondary);">Lead: ${lead.name}</p>
              <div class="progress-bar-container" style="margin:16px 0;">
                <div class="progress-bar color-1" style="width: ${teamProgress}%"></div>
              </div>
              <div style="display:flex;justify-content:space-between;">
                <span class="status status--todo">${todoCount} To Do</span>
                <span class="status status--done">${doneCount} Done</span>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ---------- RENDER: Events ----------
function renderEvents(container) {
  const events = getObjectValues(dbData.events);
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-24);">
      <h2>Events</h2>
      ${Permissions.canManageEvents() ? `<button class="btn btn--primary" onclick="openEventModal()">+ Add Event</button>` : ''}
    </div>

    ${events.length === 0 ? `
      <div class="card">
        <div class="card__body text-center">
          <p>No events have been added yet.</p>
          ${Permissions.canManageEvents() ? '<p>Click the button above to add the first event.</p>' : '<p>Events will be added by an admin soon.</p>'}
        </div>
      </div>
    ` : `
      <div class="data-table">
        <table>
          <thead>
            <tr>
              <th>Event Name</th>
              <th>Type</th>
              <th>Date</th>
              <th>Venue</th>
              ${Permissions.canManageEvents() ? '<th>Actions</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${events.map(event => `
              <tr>
                <td><strong>${event.name}</strong></td>
                <td><span class="status status--info">${event.type}</span></td>
                <td>${formatDate(event.date)}</td>
                <td>${event.venue || 'TBD'}</td>
                ${Permissions.canManageEvents() ? `
                  <td>
                    <div class="table-actions">
                      <button class="icon-btn" onclick="openEventModal('${event.id}')" title="Edit">✏️</button>
                      <button class="icon-btn" onclick="handleDelete('events', '${event.id}', 'event')" title="Delete">🗑️</button>
                    </div>
                  </td>
                ` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;
}

// ---------- RENDER: Sponsors ----------
function renderSponsors(container) {
  const sponsors = getObjectValues(dbData.sponsors);
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-24);">
      <h2>Sponsors</h2>
      ${Permissions.canManageSponsors() ? `<button class="btn btn--primary" onclick="openSponsorModal()">+ Add Sponsor</button>` : ''}
    </div>
    ${sponsors.length === 0 ? `
      <div class="card"><div class="card__body text-center"><p>No sponsors added yet.</p></div></div>
    ` : `
      <div class="grid-3">
        ${sponsors.map(s => `
          <div class="card">
            <div class="card__body">
              <h3>${s.name}</h3>
              <p>${s.tier || 'General'}</p>
              <div style="margin-top:12px;">
                ${Permissions.canManageSponsors() ? `<button class="btn btn--sm" onclick="handleDelete('sponsors','${s.id}','sponsor')">Delete</button>` : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;
}

// ---------- RENDER: Logistics / Communication / Analytics (simple placeholders) ----------
function renderLogistics(container) {
  const logistics = getObjectValues(dbData.logistics);
  container.innerHTML = `<h2>Logistics</h2>
    ${logistics.length === 0 ? '<p>No logistics items</p>' : '<p>Logistics items loaded</p>'}`;
}

function renderCommunication(container) {
  container.innerHTML = `<h2>Communication</h2><p>Communication panel coming soon.</p>`;
}

function renderAnalytics(container) {
  container.innerHTML = `<h2>Analytics</h2><p>Analytics available to leads and admins.</p>`;
}

// ---------- MISC UI Helpers ----------
function updateUserProfileUI() {
  if (!currentUser) return;
  const sidebarUserName = document.getElementById('sidebarUserName');
  const sidebarUserRole = document.getElementById('sidebarUserRole');
  const sidebarAvatar = document.getElementById('sidebarAvatar');
  const headerAvatar = document.getElementById('headerAvatar');

  if (sidebarUserName) sidebarUserName.textContent = currentUser.name;
  if (sidebarUserRole) sidebarUserRole.textContent = currentUser.role.replace('_', ' ');
  if (sidebarAvatar) sidebarAvatar.textContent = currentUser.name ? currentUser.name[0].toUpperCase() : 'U';
  if (headerAvatar) headerAvatar.textContent = currentUser.name ? currentUser.name[0].toUpperCase() : 'U';
}

function startCountdown() {
  const daysEl = document.getElementById('countdownDays');
  const hoursEl = document.getElementById('countdownHours');
  const minsEl = document.getElementById('countdownMinutes');
  const secsEl = document.getElementById('countdownSeconds');

  function update() {
    const now = new Date();
    const diff = SYMPOSIUM_DATE - now;
    if (diff <= 0) {
      daysEl.textContent = '0';
      hoursEl.textContent = '0';
      minsEl.textContent = '0';
      secsEl.textContent = '0';
      return;
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    daysEl.textContent = days;
    hoursEl.textContent = hours;
    minsEl.textContent = minutes;
    secsEl.textContent = seconds;
  }

  update();
  setInterval(update, 1000);
}

// ---------- CRUD helpers (simple) ----------
function handleDelete(node, id, label) {
  if (!Permissions.canManageEvents() && node === 'events') {
    alert('Insufficient permissions');
    return;
  }
  if (!confirm(`Delete ${label}?`)) return;
  db.ref(`${node}/${id}`).remove().then(() => {
    console.log(`${label} ${id} removed`);
  }).catch(err => console.error('Delete error', err));
}

// Placeholder modals (implement real modals in your app)
function openTaskModal() { alert('Open create/edit task modal (implement UI)'); }
function openEventModal(id = null) { alert('Open event modal (implement UI)'); }
function openTeamModal() { alert('Open team modal (implement UI)'); }
function openSponsorModal() { alert('Open sponsor modal (implement UI)'); }
function openTaskDetailModal(id) { alert(`Open task detail for ${id} (implement UI)`); }

// ----------------- END OF FILE -----------------
