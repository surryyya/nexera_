// app.js - Firebase Authentication version

// ------// app.js - Firebase Authentication version

// ---------------- CONFIG ----------------
const SYMPOSIUM_DATE = new Date('2027-02-26T10:00:00'); // adjust as needed
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
  announcements: {}
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
  const user = dbData.users[uid];
  if (user) {
    user.uid = uid; // Ensure the uid is part of the object
  }
  return user || { uid: uid, name: 'Unknown', email: '', role: 'volunteer', teamId: null };
}

function getTeamById(id) {
  return dbData.teams[id] || { id, name: 'Unknown', icon: '❓' };
}

function formatDate(dateStr, includeTime = false) {
  if (!dateStr) return 'N/A';
  // Check for YYYY-MM-DD format
  if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  
  const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
    options.hour12 = true;
  }
  return d.toLocaleDateString('en-IN', options);
}

function isUrgent(dueDate) {
  if (!dueDate) return false;
  const diff = new Date(dueDate) - new Date();
  return diff <= 1000 * 60 * 60 * 24 * 3; // within 3 days
}

function calculateProgress(tasks) {
  if (!tasks || tasks.length === 0) return 0;
  // Use the new 'progress' field for a more accurate overall progress
  const totalProgress = tasks.reduce((sum, task) => {
    if (task.status === 'Done') return sum + 100;
    return sum + (task.progress || 0);
  }, 0);
  return Math.round(totalProgress / tasks.length);
}

function calculateTeamProgress(teamId) {
  const tasks = getObjectValues(dbData.tasks).filter(t => t.teamId === teamId);
  return calculateProgress(tasks); // Re-use the main progress function
}

// ---------------- FIREBASE AUTH (MAIN) ----------------

function showLoginPage() {
  currentUser = null;
  db.ref().off(); // detach listeners
  document.getElementById('mainDashboard').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
}

function showDashboardAfterLogin() {
  initializeRealTimeListeners();
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('mainDashboard').style.display = 'flex';
  updateUserProfileUI();
  startCountdown();
  navigateToPage('dashboard');
}

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
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const dbUid = userCredential.user.uid;
    const profileSnapshot = await db.ref('/users/' + dbUid).once('value');
    if (!profileSnapshot.exists()) {
        throw new Error("Auth successful, but no user profile in database.");
    }
    const profile = profileSnapshot.val();
    currentUser = {
      uid: dbUid,
      email: profile.email,
      name: profile.name || (profile.email ? profile.email.split('@')[0] : 'User'),
      role: profile.role || 'volunteer',
      teamId: profile.teamId || null
    };
    console.log(`Firebase Auth login success: ${currentUser.name} (${currentUser.role})`);
    showDashboardAfterLogin();
  } catch (err) {
    console.error('Firebase Auth login error:', err);
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
       loginErrorMsg.textContent = 'Incorrect email or password.';
    } else {
       loginErrorMsg.textContent = 'An error occurred during login.';
    }
    loginErrorMsg.classList.add('show');
  } finally {
    loginButton.textContent = 'Sign In';
    loginButton.disabled = false;
  }
}

function handleLogout() {
  auth.signOut().then(() => {
    currentUser = null;
    db.ref().off();
    document.getElementById('mainDashboard').style.display = 'none';
    document.getElementById('loginPage').style.display = 'flex';
    const form = document.getElementById('loginForm');
    if (form) form.reset();
    console.log('Logged out (Firebase Auth)');
  }).catch((err) => {
    console.error('Logout error:', err);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const loginFormEl = document.getElementById('loginForm');
  if (loginFormEl) {
    loginFormEl.addEventListener('submit', handleLogin);
  }
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      const dbUid = user.uid;
      const profileSnapshot = await db.ref('/users/' + dbUid).once('value');
      if (!profileSnapshot.exists()) {
        console.error("User is logged in, but no profile found in DB. Logging out.");
        auth.signOut();
        return;
      }
      const profile = profileSnapshot.val();
      currentUser = {
        uid: dbUid,
        email: profile.email,
        name: profile.name || (profile.email ? profile.email.split('@')[0] : 'User'),
        role: profile.role || 'volunteer',
        teamId: profile.teamId || null
      };
      console.log(`Auth state change: ${currentUser.name} is logged in.`);
      showDashboardAfterLogin();
    } else {
      console.log('Auth state change: User is logged out.');
      showLoginPage();
    }
  });

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (ev) => {
      ev.preventDefault();
      const page = item.dataset.page;
      if (page) navigateToPage(page);
    });
  });

  // Wire up ALL modal forms
  const taskForm = document.getElementById('taskForm');
  if (taskForm) {
      taskForm.addEventListener('submit', handleTaskFormSubmit);
  }
  const eventForm = document.getElementById('eventForm');
  if (eventForm) {
      eventForm.addEventListener('submit', handleEventFormSubmit);
  }
  const sponsorForm = document.getElementById('sponsorForm');
  if (sponsorForm) {
      sponsorForm.addEventListener('submit', handleSponsorFormSubmit);
  }
  const teamForm = document.getElementById('teamForm');
  if (teamForm) {
      teamForm.addEventListener('submit', handleTeamFormSubmit);
  }
  const announcementForm = document.getElementById('announcementForm');
  if (announcementForm) {
      announcementForm.addEventListener('submit', handleAnnouncementFormSubmit);
  }
});

// ----------------- REAL-TIME DATA SYNC -----------------
function initializeRealTimeListeners() {
  const nodes = ['users', 'teams', 'tasks', 'events', 'sponsors', 'announcements'];

  nodes.forEach(node => {
    db.ref(node).on('value', (snapshot) => {
      const data = snapshot.val() || {};
      
      const dataWithIds = Object.keys(data).reduce((acc, key) => {
        const idKey = (node === 'users') ? 'uid' : 'id';
        acc[key] = { ...data[key], [idKey]: key };
        return acc;
      }, {});
      
      dbData[node] = dataWithIds;
      
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
    // Assuming 'team7' is Sponsorship team from your JSON
    if (currentUser.role === 'team_lead' && currentUser.teamId === 'team7') return true;
    return false;
  },
  canManageEvents: () => currentUser && currentUser.role === 'admin',
  canManageAnnouncements: () => currentUser && currentUser.role === 'admin',
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
      case 'announcements': renderAnnouncements(pageContent); break;
      case 'analytics': renderAnalytics(pageContent); break;
      default:
        pageContent.innerHTML = `<h2>Page not found: ${page}</h2>`;
    }
    pageContent.style.opacity = '1';
  }, 50);
}

// ---------- RENDER: Dashboard (Updated) ----------
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
        <p>Let's make NEXERA2k26 a huge success!</p>
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
                  <span class="status status--info">⚡ ${getTeamById(task.teamId).icon || ''} ${getTeamById(task.teamId).name}</span>
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
                  <span class="team-icon">${team.icon || '❓'}</span>
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
        <h3 class="section-title">NEXERA2k26</h3>
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
          ${todoTasks.length === 0 ? '<p class="kanban-empty" style="text-align:center;color:var(--color-text-secondary);padding:var(--space-16);">No tasks</p>' : todoTasks.map(task => renderKanbanCard(task)).join('')}
        </div>
      </div>
      <div class="kanban-column">
        <div class="kanban-header inprogress"><span class="kanban-title">In Progress</span><span class="kanban-count">${inProgressTasks.length}</span></div>
        <div class="kanban-cards">
          ${inProgressTasks.length === 0 ? '<p class="kanban-empty" style="text-align:center;color:var(--color-text-secondary);padding:var(--space-16);">No tasks</p>' : inProgressTasks.map(task => renderKanbanCard(task)).join('')}
        </div>
      </div>
      <div class="kanban-column">
        <div class="kanban-header done"><span class="kanban-title">Done</span><span class="kanban-count">${doneTasks.length}</span></div>
        <div class="kanban-cards">
          ${doneTasks.length === 0 ? '<p class="kanban-empty" style="text-align:center;color:var(--color-text-secondary);padding:var(--space-16);">No tasks</p>' : doneTasks.map(task => renderKanbanCard(task)).join('')}
        </div>
      </div>
    </div>
  `;
}

// REPLACE your old renderKanbanCard function with this one
function renderKanbanCard(task) {
  const assignee = getUserById(task.assigneeId);
  const team = getTeamById(task.teamId);
  
  // --- NEW: Check for progress bar ---
  const progressBarHtml = (task.status === 'In Progress' && task.progress > 0)
    ? `
      <div class="card-progress-container">
        <div class="card-progress-bar" style="width: ${task.progress}%"></div>
      </div>
    `
    : '';

  return `
    <div class="kanban-card" onclick="openTaskDetailModal('${task.id}')">
      <div class="kanban-card-title">${task.title}</div>
      <div class="kanban-card-description">${task.description || ''}</div>
      ${currentUser.role === 'admin' ? `<div class="kanban-card-team" style="font-size:var(--font-size-sm);color:var(--color-text-secondary);margin-bottom:var(--space-8);">${team.icon || ''} ${team.name}</div>` : ''}
      
      ${progressBarHtml} 

      <div class="kanban-card-footer" style="${progressBarHtml ? 'margin-top: 12px;' : ''}">
        <span class="status status--${(task.priority || 'todo').toLowerCase()}">${task.priority || 'Todo'}</span>
        <span style="font-size:var(--font-size-sm);color:var(--color-text-secondary);">👤 ${assignee.name.split(' ')[0]}</span>
      </div>
      <div style="margin-top:var(--space-8);font-size:var(--font-size-xs);color:var(--color-text-secondary);${isUrgent(task.dueDate) ? 'color:var(--color-error);font-weight:bold;' : ''}">📅 ${formatDate(task.dueDate)}</div>
    </div>
  `;
}

// ---------- RENDER: Teams (Updated) ----------
// REPLACE your old renderTeams function with this one
function renderTeams(container) {
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-24);">
      <h2>Teams</h2>
      ${Permissions.canManageTeams() ? `<button class="btn btn--primary" onclick="openTeamModal()">+ Add Team</button>` : ''}
    </div>
    <div class="grid-3">
      ${getObjectValues(dbData.teams).map(team => {
        const lead = getObjectValues(dbData.users).find(u => u.teamId === team.id && u.role === 'team_lead') || { name: 'N/A' };
        const teamProgress = calculateTeamProgress(team.id);
        const teamTasks = getObjectValues(dbData.tasks).filter(t => t.teamId === team.id);
        const todoCount = teamTasks.filter(t => t.status === 'To Do').length;
        const doneCount = teamTasks.filter(t => t.status === 'Done').length;

        // UPDATED LINE: This now creates a <span> tag instead of just printing the emoji
        const iconHtml = `<span class="material-symbols-outlined">${team.icon || 'group'}</span>`;

        return `
          <div class="card">
            <div class="card__body">
              <div style="font-size:48px;text-align:center; color: var(--color-primary);">${iconHtml}</div>
              <h3 style="text-align:center;">${team.name}</h3>
              <p style="text-align:center;color:var(--color-text-secondary);">Lead: ${lead.name}</p>
              <div class="progress-bar-container" style="margin:16px 0;">
                <div class="progress-bar color-1" style="width: ${teamProgress}%"></div>
              </div>
              <div style="display:flex;justify-content:space-between; margin-bottom: 16px;">
                <span class="status status--todo">${todoCount} To Do</span>
                <span class="status status--done">${doneCount} Done</span>
              </div>
              ${Permissions.canManageTeams() ? `
                <button class="btn btn--sm btn--secondary btn--full-width" onclick="openTeamModal('${team.id}')">Edit Team</button>
              ` : ''}
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
      <div class="card"><div class="card__body text-center"><p>No events have been added yet.</p></div></div>
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

// ---------- RENDER: Sponsors (Updated) ----------
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
              <p class="status status--info" style="margin-bottom: 12px; display: inline-block;">${s.tier || 'General'}</p>
              
              ${s.amount ? `
                <h4 style="font-size: var(--font-size-xl); color: var(--color-success); margin-bottom: 12px; font-weight: 600;">
                  ₹${parseInt(s.amount).toLocaleString('en-IN')}
                </h4>
              ` : ''}
              ${s.description ? `
                <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: 16px; white-space: pre-wrap;">
                  ${s.description}
                </p>
              ` : ''}
              <div style="margin-top:12px; display: flex; gap: 8px;">
                ${Permissions.canManageSponsors() ? `
                  <button class="btn btn--sm btn--secondary" onclick="openSponsorModal('${s.id}')">Edit</button>
                  <button class="btn btn--sm" onclick="handleDelete('sponsors','${s.id}','sponsor')">Delete</button>
                ` : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;
}

// ---------- RENDER: Announcements ----------
function renderAnnouncements(container) {
  const announcements = getObjectValues(dbData.announcements).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Newest first
  
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-24);">
      <h2>Announcements</h2>
      ${Permissions.canManageAnnouncements() ? `<button class="btn btn--primary" onclick="openAnnouncementModal()">+ Add Announcement</button>` : ''}
    </div>
    <div class="announcement-list" style="display: flex; flex-direction: column; gap: 16px;">
      ${announcements.length === 0 ? `
        <div class="card"><div class="card__body text-center"><p>No announcements yet.</p></div></div>
      ` : announcements.map(post => `
        <div class="card">
          <div class="card__body">
            <h3 style="margin-bottom: 8px;">${post.title}</h3>
            <p style="color: var(--color-text-secondary); font-size: var(--font-size-sm); margin-bottom: 16px;">
              Posted by ${getUserById(post.authorId).name} on ${formatDate(post.timestamp, true)}
            </p>
            <p style="white-space: pre-wrap; margin-bottom: 0;">${post.content}</p>
            ${Permissions.canManageAnnouncements() ? `
              <div style="margin-top: 16px; border-top: 1px solid var(--color-border); padding-top: 16px;">
                <button class="btn btn--sm" onclick="handleDelete('announcements','${post.id}','announcement')">Delete</button>
              </div>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ---------- RENDER: Analytics ----------
function renderAnalytics(container) {
  const allTasks = getObjectValues(dbData.tasks);
  const doneTasks = allTasks.filter(t => t.status === 'Done').length;
  const progress = calculateProgress(allTasks);
  const totalEvents = Object.keys(dbData.events).length;
  const totalSponsors = Object.keys(dbData.sponsors).length;
  const totalMembers = Object.keys(dbData.users).length;
  const teams = getObjectValues(dbData.teams);

  container.innerHTML = `
    <div style="margin-bottom:var(--space-24);">
      <h2>Analytics Overview</h2>
    </div>
    <div class="stats-grid" style="margin-bottom: var(--space-32);">
      <div class="stat-card">
        <div class="stat-icon bg-1">✓</div>
        <div class="stat-info">
          <div class="stat-label">Total Tasks</div>
          <div class="stat-value">${allTasks.length}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon bg-2">📊</div>
        <div class="stat-info">
          <div class="stat-label">Overall Progress</div>
          <div class="stat-value">${progress}%</div>
          <div class="stat-change">${doneTasks} / ${allTasks.length} tasks</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon bg-3">📅</div>
        <div class="stat-info">
          <div class="stat-label">Total Events</div>
          <div class="stat-value">${totalEvents}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon bg-5">💰</div>
        <div class="stat-info">
          <div class="stat-label">Total Sponsors</div>
          <div class="stat-value">${totalSponsors}</div>
        </div>
      </div>
    </div>

    <div class="progress-section">
      <div class="section-header"><h3 class="section-title">Tasks per Team</h3></div>
      <div class="team-progress-list">
        ${teams.map((team, index) => {
          const teamTasks = allTasks.filter(t => t.teamId === team.id);
          const teamProgress = calculateTeamProgress(team.id);
          return `
            <div class="team-progress-item">
              <div class="team-info" style="min-width: 200px;">
                <span class="team-icon">${team.icon || '❓'}</span>
                <span class="team-name">${team.name}</span>
              </div>
              <div class="progress-bar-container">
                <div class="progress-bar color-${(index % 5) + 1}" style="width: ${teamProgress}%"></div>
              </div>
              <div class="progress-percentage-text" style="min-width: 80px;">${teamTasks.length} Tasks</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
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
      daysEl.textContent = '0'; hoursEl.textContent = '0'; minsEl.textContent = '0'; secsEl.textContent = '0';
      return;
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);
    daysEl.textContent = days; hoursEl.textContent = hours; minsEl.textContent = minutes; secsEl.textContent = seconds;
  }
  update();
  setInterval(update, 1000);
}

// ---------- CRUD helpers (simple) ----------
function handleDelete(node, id, label) {
  if (!confirm(`Are you sure you want to delete this ${label}?`)) return;
  // Check permissions
  if (node === 'events' && !Permissions.canManageEvents()) { alert('Insufficient permissions'); return; }
  if (node === 'sponsors' && !Permissions.canManageSponsors()) { alert('Insufficient permissions'); return; }
  if (node === 'announcements' && !Permissions.canManageAnnouncements()) { alert('Insufficient permissions'); return; }

  db.ref(`${node}/${id}`).remove().then(() => {
    console.log(`${label} ${id} removed`);
  }).catch(err => console.error('Delete error', err));
}

// ----------------- MODAL & FORM HANDLING -----------------

function closeModal() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.style.display = 'none';
  });
}

function populateSelect(elId, items, selectedValue = null) {
  const selectEl = document.getElementById(elId);
  if (!selectEl) return;
  selectEl.innerHTML = ''; // Clear old options
  items.forEach(item => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    if (item.id === selectedValue) {
      option.selected = true;
    }
    selectEl.appendChild(option);
  });
}

// --- TASK MODAL (Updated) ---
// REPLACE your old openTaskModal function with this one
function openTaskModal(taskId = null) {
  const modalOverlay = document.getElementById('taskModalOverlay');
  const modalTitle = document.getElementById('taskModalTitle');
  const form = document.getElementById('taskForm');
  
  form.reset();
  document.getElementById('taskIdInput').value = '';

  // --- Get progress slider elements ---
  const progressContainer = document.getElementById('taskProgressContainer');
  const progressSlider = document.getElementById('taskProgressInput');
  const progressLabel = document.getElementById('taskProgressLabel');

  // --- Add event listeners for slider and status ---
  progressSlider.oninput = (e) => {
    progressLabel.textContent = e.target.value + '%';
  };
  
  document.getElementById('taskStatusInput').onchange = (e) => {
    if (e.target.value === 'In Progress') {
      progressContainer.style.display = 'block';
    } else {
      progressContainer.style.display = 'none';
    }
  };

  const allTeams = getObjectValues(dbData.teams).map(t => ({ id: t.id, name: `${t.icon || '❓'} ${t.name}` }));
  const allUsers = getObjectValues(dbData.users);
  
  function updateAssignees(teamId, selectedAssigneeId = null) {
    const teamMembers = allUsers
      .filter(u => u.teamId === teamId || (u.role === 'admin' && !u.teamId))
      .map(u => ({ id: u.uid, name: u.name }));
    populateSelect('taskAssigneeInput', teamMembers, selectedAssigneeId);
  }

  document.getElementById('taskTeamInput').onchange = (e) => updateAssignees(e.target.value);
  
  if (taskId && dbData.tasks[taskId]) {
    // EDIT MODE
    const task = dbData.tasks[taskId];
    modalTitle.textContent = 'Edit Task';
    document.getElementById('taskIdInput').value = taskId;
    document.getElementById('taskTitleInput').value = task.title || '';
    document.getElementById('taskDescInput').value = task.description || '';
    document.getElementById('taskStatusInput').value = task.status || 'To Do';
    document.getElementById('taskPriorityInput').value = task.priority || 'Medium';
    document.getElementById('taskDueDateInput').value = task.dueDate || '';
    
    populateSelect('taskTeamInput', allTeams, task.teamId);
    updateAssignees(task.teamId, task.assigneeId);

    // --- NEW: Set slider value and visibility ---
    const currentProgress = task.progress || 0;
    progressSlider.value = currentProgress;
    progressLabel.textContent = currentProgress + '%';
    progressContainer.style.display = (task.status === 'In Progress') ? 'block' : 'none';
    
  } else {
    // CREATE MODE
    modalTitle.textContent = 'Create New Task';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('taskDueDateInput').value = tomorrow.toISOString().split('T')[0];
    let defaultTeamId = currentUser.teamId || allTeams[0]?.id;
    populateSelect('taskTeamInput', allTeams, defaultTeamId);
    updateAssignees(defaultTeamId);
    
    // --- NEW: Reset slider ---
    progressSlider.value = 0;
    progressLabel.textContent = '0%';
    progressContainer.style.display = 'none';
  }
  modalOverlay.style.display = 'flex';
}

// REPLACE your old handleTaskFormSubmit function with this one
async function handleTaskFormSubmit(event) {
  event.preventDefault();
  const saveBtn = document.getElementById('saveTaskBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  
  const taskId = document.getElementById('taskIdInput').value;
  const status = document.getElementById('taskStatusInput').value;

  // 1. Collect all text-based data
  const taskData = {
    title: document.getElementById('taskTitleInput').value,
    description: document.getElementById('taskDescInput').value,
    teamId: document.getElementById('taskTeamInput').value,
    assigneeId: document.getElementById('taskAssigneeInput').value,
    status: status,
    priority: document.getElementById('taskPriorityInput').value,
    dueDate: document.getElementById('taskDueDateInput').value,
  };

  // --- NEW: Add progress based on status ---
  if (status === 'Done') {
    taskData.progress = 100;
  } else if (status === 'In Progress') {
    taskData.progress = parseInt(document.getElementById('taskProgressInput').value, 10);
  } else {
    taskData.progress = 0;
  }

  try {
    // 3. Save the task data to Realtime Database
    if (taskId) {
      console.log(`Updating task ${taskId}`);
      await db.ref(`tasks/${taskId}`).update(taskData);
    } else {
      console.log('Creating new task');
      taskData.createdAt = new Date().toISOString();
      taskData.creatorId = currentUser.uid;
      await db.ref('tasks').push(taskData);
    }
    
    closeModal(); // Close the modal on success
  } catch (err) {
    console.error("Error saving task:", err);
    alert("Error saving task.");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Task';
  }
}

function openTaskDetailModal(id) { 
  openTaskModal(id);
}

// --- EVENT MODAL ---
function openEventModal(eventId = null) {
  const modalOverlay = document.getElementById('eventModalOverlay');
  const modalTitle = document.getElementById('eventModalTitle');
  const form = document.getElementById('eventForm');
  form.reset();
  document.getElementById('eventIdInput').value = '';

  if (eventId && dbData.events[eventId]) {
    // EDIT MODE
    const event = dbData.events[eventId];
    modalTitle.textContent = 'Edit Event';
    document.getElementById('eventIdInput').value = eventId;
    document.getElementById('eventNameInput').value = event.name || '';
    document.getElementById('eventTypeInput').value = event.type || 'Technical';
    document.getElementById('eventDateInput').value = event.date || '';
    document.getElementById('eventVenueInput').value = event.venue || '';
  } else {
    // CREATE MODE
    modalTitle.textContent = 'Add New Event';
  }
  modalOverlay.style.display = 'flex';
}

async function handleEventFormSubmit(event) {
  event.preventDefault();
  const eventId = document.getElementById('eventIdInput').value;
  const eventData = {
    name: document.getElementById('eventNameInput').value,
    type: document.getElementById('eventTypeInput').value,
    date: document.getElementById('eventDateInput').value,
    venue: document.getElementById('eventVenueInput').value,
  };
  try {
    if (eventId) {
      await db.ref(`events/${eventId}`).update(eventData);
    } else {
      await db.ref('events').push(eventData);
    }
    closeModal();
  } catch (err) {
    console.error("Error saving event:", err);
    alert("Error saving event.");
  }
}

// --- SPONSOR MODAL (Updated) ---
// REPLACE your old openSponsorModal function with this one
function openSponsorModal(sponsorId = null) {
  const modalOverlay = document.getElementById('sponsorModalOverlay');
  const modalTitle = document.getElementById('sponsorModalTitle');
  const form = document.getElementById('sponsorForm');

  form.reset();
  document.getElementById('sponsorIdInput').value = '';

  if (sponsorId && dbData.sponsors[sponsorId]) {
    // EDIT MODE
    const sponsor = dbData.sponsors[sponsorId];
    modalTitle.textContent = 'Edit Sponsor';
    document.getElementById('sponsorIdInput').value = sponsorId;
    document.getElementById('sponsorNameInput').value = sponsor.name || '';
    document.getElementById('sponsorTierInput').value = sponsor.tier || 'General';
    document.getElementById('sponsorAmountInput').value = sponsor.amount || ''; // ADDED
    document.getElementById('sponsorDescInput').value = sponsor.description || ''; // ADDED
  } else {
    // CREATE MODE
    modalTitle.textContent = 'Add New Sponsor';
  }

  modalOverlay.style.display = 'flex';
}

// REPLACE your old handleSponsorFormSubmit function with this one
async function handleSponsorFormSubmit(event) {
  event.preventDefault();
  const sponsorId = document.getElementById('sponsorIdInput').value;
  
  const sponsorData = {
    name: document.getElementById('sponsorNameInput').value,
    tier: document.getElementById('sponsorTierInput').value,
    amount: document.getElementById('sponsorAmountInput').value, // ADDED
    description: document.getElementById('sponsorDescInput').value, // ADDED
  };

  try {
    if (sponsorId) {
      console.log(`Updating sponsor ${sponsorId}`);
      await db.ref(`sponsors/${sponsorId}`).update(sponsorData);
    } else {
      console.log('Creating new sponsor');
      await db.ref('sponsors').push(sponsorData);
    }
    closeModal();
  } catch (err) {
    console.error("Error saving sponsor:", err);
    alert("Error saving sponsor.");
  }
}

// --- TEAM MODAL ---
function openTeamModal(teamId = null) {
  const modalOverlay = document.getElementById('teamModalOverlay');
  const modalTitle = document.getElementById('teamModalTitle');
  const form = document.getElementById('teamForm');
  form.reset();
  document.getElementById('teamIdInput').value = '';

  if (teamId && dbData.teams[teamId]) {
    // EDIT MODE
    const team = dbData.teams[teamId];
    modalTitle.textContent = 'Edit Team';
    document.getElementById('teamIdInput').value = teamId;
    document.getElementById('teamNameInput').value = team.name || '';
    document.getElementById('teamIconInput').value = team.icon || '';
  } else {
    // CREATE MODE
     modalTitle.textContent = 'Add New Team';
  }
  modalOverlay.style.display = 'flex';
}

async function handleTeamFormSubmit(event) {
  event.preventDefault();
  const teamId = document.getElementById('teamIdInput').value;
  const teamData = {
    name: document.getElementById('teamNameInput').value,
    icon: document.getElementById('teamIconInput').value,
  };
  try {
    if (teamId) {
      await db.ref(`teams/${teamId}`).update(teamData);
    } else {
      await db.ref('teams').push(teamData);
    }
    closeModal();
  } catch (err) {
    console.error("Error saving team:", err);
    alert("Error saving team.");
  }
}

// --- ANNOUNCEMENT MODAL ---
function openAnnouncementModal() {
  const modalOverlay = document.getElementById('announcementModalOverlay');
  document.getElementById('announcementForm').reset();
  modalOverlay.style.display = 'flex';
}

async function handleAnnouncementFormSubmit(event) {
  event.preventDefault();
  const postData = {
    title: document.getElementById('announcementTitleInput').value,
    content: document.getElementById('announcementContentInput').value,
    authorId: currentUser.uid,
    timestamp: new Date().toISOString()
  };
  try {
    await db.ref('announcements').push(postData);
    closeModal();
  } catch (err) {
    console.error("Error posting announcement:", err);
    alert("Error posting announcement.");
  }
}

// ----------------- END OF FILE --------------------------- CONFIG ----------------
const SYMPOSIUM_DATE = new Date('2026-02-26T10:00:00'); // adjust as needed
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
  announcements: {}
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
  const user = dbData.users[uid];
  if (user) {
    user.uid = uid; // Ensure the uid is part of the object
  }
  return user || { uid: uid, name: 'Unknown', email: '', role: 'volunteer', teamId: null };
}

function getTeamById(id) {
  return dbData.teams[id] || { id, name: 'Unknown', icon: '❓' };
}

function formatDate(dateStr, includeTime = false) {
  if (!dateStr) return 'N/A';
  // Check for YYYY-MM-DD format
  if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  
  const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
    options.hour12 = true;
  }
  return d.toLocaleDateString('en-IN', options);
}

function isUrgent(dueDate) {
  if (!dueDate) return false;
  const diff = new Date(dueDate) - new Date();
  return diff <= 1000 * 60 * 60 * 24 * 3; // within 3 days
}

function calculateProgress(tasks) {
  if (!tasks || tasks.length === 0) return 0;
  // Use the new 'progress' field for a more accurate overall progress
  const totalProgress = tasks.reduce((sum, task) => {
    if (task.status === 'Done') return sum + 100;
    return sum + (task.progress || 0);
  }, 0);
  return Math.round(totalProgress / tasks.length);
}

function calculateTeamProgress(teamId) {
  const tasks = getObjectValues(dbData.tasks).filter(t => t.teamId === teamId);
  return calculateProgress(tasks); // Re-use the main progress function
}

// ---------------- FIREBASE AUTH (MAIN) ----------------

function showLoginPage() {
  currentUser = null;
  db.ref().off(); // detach listeners
  document.getElementById('mainDashboard').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
}

function showDashboardAfterLogin() {
  initializeRealTimeListeners();
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('mainDashboard').style.display = 'flex';
  updateUserProfileUI();
  startCountdown();
  navigateToPage('dashboard');
}

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
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const dbUid = userCredential.user.uid;
    const profileSnapshot = await db.ref('/users/' + dbUid).once('value');
    if (!profileSnapshot.exists()) {
        throw new Error("Auth successful, but no user profile in database.");
    }
    const profile = profileSnapshot.val();
    currentUser = {
      uid: dbUid,
      email: profile.email,
      name: profile.name || (profile.email ? profile.email.split('@')[0] : 'User'),
      role: profile.role || 'volunteer',
      teamId: profile.teamId || null
    };
    console.log(`Firebase Auth login success: ${currentUser.name} (${currentUser.role})`);
    showDashboardAfterLogin();
  } catch (err) {
    console.error('Firebase Auth login error:', err);
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
       loginErrorMsg.textContent = 'Incorrect email or password.';
    } else {
       loginErrorMsg.textContent = 'An error occurred during login.';
    }
    loginErrorMsg.classList.add('show');
  } finally {
    loginButton.textContent = 'Sign In';
    loginButton.disabled = false;
  }
}

function handleLogout() {
  auth.signOut().then(() => {
    currentUser = null;
    db.ref().off();
    document.getElementById('mainDashboard').style.display = 'none';
    document.getElementById('loginPage').style.display = 'flex';
    const form = document.getElementById('loginForm');
    if (form) form.reset();
    console.log('Logged out (Firebase Auth)');
  }).catch((err) => {
    console.error('Logout error:', err);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const loginFormEl = document.getElementById('loginForm');
  if (loginFormEl) {
    loginFormEl.addEventListener('submit', handleLogin);
  }
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      const dbUid = user.uid;
      const profileSnapshot = await db.ref('/users/' + dbUid).once('value');
      if (!profileSnapshot.exists()) {
        console.error("User is logged in, but no profile found in DB. Logging out.");
        auth.signOut();
        return;
      }
      const profile = profileSnapshot.val();
      currentUser = {
        uid: dbUid,
        email: profile.email,
        name: profile.name || (profile.email ? profile.email.split('@')[0] : 'User'),
        role: profile.role || 'volunteer',
        teamId: profile.teamId || null
      };
      console.log(`Auth state change: ${currentUser.name} is logged in.`);
      showDashboardAfterLogin();
    } else {
      console.log('Auth state change: User is logged out.');
      showLoginPage();
    }
  });

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (ev) => {
      ev.preventDefault();
      const page = item.dataset.page;
      if (page) navigateToPage(page);
    });
  });

  // Wire up ALL modal forms
  const taskForm = document.getElementById('taskForm');
  if (taskForm) {
      taskForm.addEventListener('submit', handleTaskFormSubmit);
  }
  const eventForm = document.getElementById('eventForm');
  if (eventForm) {
      eventForm.addEventListener('submit', handleEventFormSubmit);
  }
  const sponsorForm = document.getElementById('sponsorForm');
  if (sponsorForm) {
      sponsorForm.addEventListener('submit', handleSponsorFormSubmit);
  }
  const teamForm = document.getElementById('teamForm');
  if (teamForm) {
      teamForm.addEventListener('submit', handleTeamFormSubmit);
  }
  const announcementForm = document.getElementById('announcementForm');
  if (announcementForm) {
      announcementForm.addEventListener('submit', handleAnnouncementFormSubmit);
  }
});

// ----------------- REAL-TIME DATA SYNC -----------------
function initializeRealTimeListeners() {
  const nodes = ['users', 'teams', 'tasks', 'events', 'sponsors', 'announcements'];

  nodes.forEach(node => {
    db.ref(node).on('value', (snapshot) => {
      const data = snapshot.val() || {};
      
      const dataWithIds = Object.keys(data).reduce((acc, key) => {
        const idKey = (node === 'users') ? 'uid' : 'id';
        acc[key] = { ...data[key], [idKey]: key };
        return acc;
      }, {});
      
      dbData[node] = dataWithIds;
      
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
    // Assuming 'team7' is Sponsorship team from your JSON
    if (currentUser.role === 'team_lead' && currentUser.teamId === 'team7') return true;
    return false;
  },
  canManageEvents: () => currentUser && currentUser.role === 'admin',
  canManageAnnouncements: () => currentUser && currentUser.role === 'admin',
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
      case 'announcements': renderAnnouncements(pageContent); break;
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
                  <span class="status status--info">⚡ ${getTeamById(task.teamId).icon || ''} ${getTeamById(task.teamId).name}</span>
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
                  <span class="team-icon">${team.icon || '❓'}</span>
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
          ${todoTasks.length === 0 ? '<p class="kanban-empty" style="text-align:center;color:var(--color-text-secondary);padding:var(--space-16);">No tasks</p>' : todoTasks.map(task => renderKanbanCard(task)).join('')}
        </div>
      </div>
      <div class="kanban-column">
        <div class="kanban-header inprogress"><span class="kanban-title">In Progress</span><span class="kanban-count">${inProgressTasks.length}</span></div>
        <div class="kanban-cards">
          ${inProgressTasks.length === 0 ? '<p class="kanban-empty" style="text-align:center;color:var(--color-text-secondary);padding:var(--space-16);">No tasks</p>' : inProgressTasks.map(task => renderKanbanCard(task)).join('')}
        </div>
      </div>
      <div class="kanban-column">
        <div class="kanban-header done"><span class="kanban-title">Done</span><span class="kanban-count">${doneTasks.length}</span></div>
        <div class="kanban-cards">
          ${doneTasks.length === 0 ? '<p class="kanban-empty" style="text-align:center;color:var(--color-text-secondary);padding:var(--space-16);">No tasks</p>' : doneTasks.map(task => renderKanbanCard(task)).join('')}
        </div>
      </div>
    </div>
  `;
}

// REPLACE your old renderKanbanCard function with this one
function renderKanbanCard(task) {
  const assignee = getUserById(task.assigneeId);
  const team = getTeamById(task.teamId);
  
  // --- NEW: Check for progress bar ---
  const progressBarHtml = (task.status === 'In Progress' && task.progress > 0)
    ? `
      <div class="card-progress-container">
        <div class="card-progress-bar" style="width: ${task.progress}%"></div>
      </div>
    `
    : '';

  return `
    <div class="kanban-card" onclick="openTaskDetailModal('${task.id}')">
      <div class="kanban-card-title">${task.title}</div>
      <div class="kanban-card-description">${task.description || ''}</div>
      ${currentUser.role === 'admin' ? `<div class="kanban-card-team" style="font-size:var(--font-size-sm);color:var(--color-text-secondary);margin-bottom:var(--space-8);">${team.icon || ''} ${team.name}</div>` : ''}
      
      ${progressBarHtml} 

      <div class="kanban-card-footer" style="${progressBarHtml ? 'margin-top: 12px;' : ''}">
        <span class="status status--${(task.priority || 'todo').toLowerCase()}">${task.priority || 'Todo'}</span>
        <span style="font-size:var(--font-size-sm);color:var(--color-text-secondary);">👤 ${assignee.name.split(' ')[0]}</span>
      </div>
      <div style="margin-top:var(--space-8);font-size:var(--font-size-xs);color:var(--color-text-secondary);${isUrgent(task.dueDate) ? 'color:var(--color-error);font-weight:bold;' : ''}">📅 ${formatDate(task.dueDate)}</div>
    </div>
  `;
}

// ---------- RENDER: Teams (Updated) ----------
// REPLACE your old renderTeams function with this one
function renderTeams(container) {
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-24);">
      <h2>Teams</h2>
      ${Permissions.canManageTeams() ? `<button class="btn btn--primary" onclick="openTeamModal()">+ Add Team</button>` : ''}
    </div>
    <div class="grid-3">
      ${getObjectValues(dbData.teams).map(team => {
        const lead = getObjectValues(dbData.users).find(u => u.teamId === team.id && u.role === 'team_lead') || { name: 'N/A' };
        const teamProgress = calculateTeamProgress(team.id);
        const teamTasks = getObjectValues(dbData.tasks).filter(t => t.teamId === team.id);
        const todoCount = teamTasks.filter(t => t.status === 'To Do').length;
        const doneCount = teamTasks.filter(t => t.status === 'Done').length;

        // UPDATED LINE: This now creates a <span> tag instead of just printing the emoji
        const iconHtml = `<span class="material-symbols-outlined">${team.icon || 'group'}</span>`;

        return `
          <div class="card">
            <div class="card__body">
              <div style="font-size:48px;text-align:center; color: var(--color-primary);">${iconHtml}</div>
              <h3 style="text-align:center;">${team.name}</h3>
              <p style="text-align:center;color:var(--color-text-secondary);">Lead: ${lead.name}</p>
              <div class="progress-bar-container" style="margin:16px 0;">
                <div class="progress-bar color-1" style="width: ${teamProgress}%"></div>
              </div>
              <div style="display:flex;justify-content:space-between; margin-bottom: 16px;">
                <span class="status status--todo">${todoCount} To Do</span>
                <span class="status status--done">${doneCount} Done</span>
              </div>
              ${Permissions.canManageTeams() ? `
                <button class="btn btn--sm btn--secondary btn--full-width" onclick="openTeamModal('${team.id}')">Edit Team</button>
              ` : ''}
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
      <div class="card"><div class="card__body text-center"><p>No events have been added yet.</p></div></div>
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

// ---------- RENDER: Sponsors (Updated) ----------
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
              <p class="status status--info" style="margin-bottom: 12px; display: inline-block;">${s.tier || 'General'}</p>
              
              ${s.amount ? `
                <h4 style="font-size: var(--font-size-xl); color: var(--color-success); margin-bottom: 12px; font-weight: 600;">
                  ₹${parseInt(s.amount).toLocaleString('en-IN')}
                </h4>
              ` : ''}
              ${s.description ? `
                <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: 16px; white-space: pre-wrap;">
                  ${s.description}
                </p>
              ` : ''}
              <div style="margin-top:12px; display: flex; gap: 8px;">
                ${Permissions.canManageSponsors() ? `
                  <button class="btn btn--sm btn--secondary" onclick="openSponsorModal('${s.id}')">Edit</button>
                  <button class="btn btn--sm" onclick="handleDelete('sponsors','${s.id}','sponsor')">Delete</button>
                ` : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;
}

// ---------- RENDER: Announcements ----------
function renderAnnouncements(container) {
  const announcements = getObjectValues(dbData.announcements).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Newest first
  
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-24);">
      <h2>Announcements</h2>
      ${Permissions.canManageAnnouncements() ? `<button class="btn btn--primary" onclick="openAnnouncementModal()">+ Add Announcement</button>` : ''}
    </div>
    <div class="announcement-list" style="display: flex; flex-direction: column; gap: 16px;">
      ${announcements.length === 0 ? `
        <div class="card"><div class="card__body text-center"><p>No announcements yet.</p></div></div>
      ` : announcements.map(post => `
        <div class="card">
          <div class="card__body">
            <h3 style="margin-bottom: 8px;">${post.title}</h3>
            <p style="color: var(--color-text-secondary); font-size: var(--font-size-sm); margin-bottom: 16px;">
              Posted by ${getUserById(post.authorId).name} on ${formatDate(post.timestamp, true)}
            </p>
            <p style="white-space: pre-wrap; margin-bottom: 0;">${post.content}</p>
            ${Permissions.canManageAnnouncements() ? `
              <div style="margin-top: 16px; border-top: 1px solid var(--color-border); padding-top: 16px;">
                <button class="btn btn--sm" onclick="handleDelete('announcements','${post.id}','announcement')">Delete</button>
              </div>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ---------- RENDER: Analytics ----------
function renderAnalytics(container) {
  const allTasks = getObjectValues(dbData.tasks);
  const doneTasks = allTasks.filter(t => t.status === 'Done').length;
  const progress = calculateProgress(allTasks);
  const totalEvents = Object.keys(dbData.events).length;
  const totalSponsors = Object.keys(dbData.sponsors).length;
  const totalMembers = Object.keys(dbData.users).length;
  const teams = getObjectValues(dbData.teams);

  container.innerHTML = `
    <div style="margin-bottom:var(--space-24);">
      <h2>Analytics Overview</h2>
    </div>
    <div class="stats-grid" style="margin-bottom: var(--space-32);">
      <div class="stat-card">
        <div class="stat-icon bg-1">✓</div>
        <div class="stat-info">
          <div class="stat-label">Total Tasks</div>
          <div class="stat-value">${allTasks.length}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon bg-2">📊</div>
        <div class="stat-info">
          <div class="stat-label">Overall Progress</div>
          <div class="stat-value">${progress}%</div>
          <div class="stat-change">${doneTasks} / ${allTasks.length} tasks</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon bg-3">📅</div>
        <div class="stat-info">
          <div class="stat-label">Total Events</div>
          <div class="stat-value">${totalEvents}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon bg-5">💰</div>
        <div class="stat-info">
          <div class="stat-label">Total Sponsors</div>
          <div class="stat-value">${totalSponsors}</div>
        </div>
      </div>
    </div>

    <div class="progress-section">
      <div class="section-header"><h3 class="section-title">Tasks per Team</h3></div>
      <div class="team-progress-list">
        ${teams.map((team, index) => {
          const teamTasks = allTasks.filter(t => t.teamId === team.id);
          const teamProgress = calculateTeamProgress(team.id);
          return `
            <div class="team-progress-item">
              <div class="team-info" style="min-width: 200px;">
                <span class="team-icon">${team.icon || '❓'}</span>
                <span class="team-name">${team.name}</span>
              </div>
              <div class="progress-bar-container">
                <div class="progress-bar color-${(index % 5) + 1}" style="width: ${teamProgress}%"></div>
              </div>
              <div class="progress-percentage-text" style="min-width: 80px;">${teamTasks.length} Tasks</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
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
      daysEl.textContent = '0'; hoursEl.textContent = '0'; minsEl.textContent = '0'; secsEl.textContent = '0';
      return;
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);
    daysEl.textContent = days; hoursEl.textContent = hours; minsEl.textContent = minutes; secsEl.textContent = seconds;
  }
  update();
  setInterval(update, 1000);
}

// ---------- CRUD helpers (simple) ----------
function handleDelete(node, id, label) {
  if (!confirm(`Are you sure you want to delete this ${label}?`)) return;
  // Check permissions
  if (node === 'events' && !Permissions.canManageEvents()) { alert('Insufficient permissions'); return; }
  if (node === 'sponsors' && !Permissions.canManageSponsors()) { alert('Insufficient permissions'); return; }
  if (node === 'announcements' && !Permissions.canManageAnnouncements()) { alert('Insufficient permissions'); return; }

  db.ref(`${node}/${id}`).remove().then(() => {
    console.log(`${label} ${id} removed`);
  }).catch(err => console.error('Delete error', err));
}

// ----------------- MODAL & FORM HANDLING -----------------

function closeModal() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.style.display = 'none';
  });
}

function populateSelect(elId, items, selectedValue = null) {
  const selectEl = document.getElementById(elId);
  if (!selectEl) return;
  selectEl.innerHTML = ''; // Clear old options
  items.forEach(item => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    if (item.id === selectedValue) {
      option.selected = true;
    }
    selectEl.appendChild(option);
  });
}

// --- TASK MODAL (Updated) ---
// REPLACE your old openTaskModal function with this one
function openTaskModal(taskId = null) {
  const modalOverlay = document.getElementById('taskModalOverlay');
  const modalTitle = document.getElementById('taskModalTitle');
  const form = document.getElementById('taskForm');
  
  form.reset();
  document.getElementById('taskIdInput').value = '';

  // --- Get progress slider elements ---
  const progressContainer = document.getElementById('taskProgressContainer');
  const progressSlider = document.getElementById('taskProgressInput');
  const progressLabel = document.getElementById('taskProgressLabel');

  // --- Add event listeners for slider and status ---
  progressSlider.oninput = (e) => {
    progressLabel.textContent = e.target.value + '%';
  };
  
  document.getElementById('taskStatusInput').onchange = (e) => {
    if (e.target.value === 'In Progress') {
      progressContainer.style.display = 'block';
    } else {
      progressContainer.style.display = 'none';
    }
  };

  const allTeams = getObjectValues(dbData.teams).map(t => ({ id: t.id, name: `${t.icon || '❓'} ${t.name}` }));
  const allUsers = getObjectValues(dbData.users);
  
  function updateAssignees(teamId, selectedAssigneeId = null) {
    const teamMembers = allUsers
      .filter(u => u.teamId === teamId || (u.role === 'admin' && !u.teamId))
      .map(u => ({ id: u.uid, name: u.name }));
    populateSelect('taskAssigneeInput', teamMembers, selectedAssigneeId);
  }

  document.getElementById('taskTeamInput').onchange = (e) => updateAssignees(e.target.value);
  
  if (taskId && dbData.tasks[taskId]) {
    // EDIT MODE
    const task = dbData.tasks[taskId];
    modalTitle.textContent = 'Edit Task';
    document.getElementById('taskIdInput').value = taskId;
    document.getElementById('taskTitleInput').value = task.title || '';
    document.getElementById('taskDescInput').value = task.description || '';
    document.getElementById('taskStatusInput').value = task.status || 'To Do';
    document.getElementById('taskPriorityInput').value = task.priority || 'Medium';
    document.getElementById('taskDueDateInput').value = task.dueDate || '';
    
    populateSelect('taskTeamInput', allTeams, task.teamId);
    updateAssignees(task.teamId, task.assigneeId);

    // --- NEW: Set slider value and visibility ---
    const currentProgress = task.progress || 0;
    progressSlider.value = currentProgress;
    progressLabel.textContent = currentProgress + '%';
    progressContainer.style.display = (task.status === 'In Progress') ? 'block' : 'none';
    
  } else {
    // CREATE MODE
    modalTitle.textContent = 'Create New Task';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('taskDueDateInput').value = tomorrow.toISOString().split('T')[0];
    let defaultTeamId = currentUser.teamId || allTeams[0]?.id;
    populateSelect('taskTeamInput', allTeams, defaultTeamId);
    updateAssignees(defaultTeamId);
    
    // --- NEW: Reset slider ---
    progressSlider.value = 0;
    progressLabel.textContent = '0%';
    progressContainer.style.display = 'none';
  }
  modalOverlay.style.display = 'flex';
}

// REPLACE your old handleTaskFormSubmit function with this one
async function handleTaskFormSubmit(event) {
  event.preventDefault();
  const saveBtn = document.getElementById('saveTaskBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  
  const taskId = document.getElementById('taskIdInput').value;
  const status = document.getElementById('taskStatusInput').value;

  // 1. Collect all text-based data
  const taskData = {
    title: document.getElementById('taskTitleInput').value,
    description: document.getElementById('taskDescInput').value,
    teamId: document.getElementById('taskTeamInput').value,
    assigneeId: document.getElementById('taskAssigneeInput').value,
    status: status,
    priority: document.getElementById('taskPriorityInput').value,
    dueDate: document.getElementById('taskDueDateInput').value,
  };

  // --- NEW: Add progress based on status ---
  if (status === 'Done') {
    taskData.progress = 100;
  } else if (status === 'In Progress') {
    taskData.progress = parseInt(document.getElementById('taskProgressInput').value, 10);
  } else {
    taskData.progress = 0;
  }

  try {
    // 3. Save the task data to Realtime Database
    if (taskId) {
      console.log(`Updating task ${taskId}`);
      await db.ref(`tasks/${taskId}`).update(taskData);
    } else {
      console.log('Creating new task');
      taskData.createdAt = new Date().toISOString();
      taskData.creatorId = currentUser.uid;
      await db.ref('tasks').push(taskData);
    }
    
    closeModal(); // Close the modal on success
  } catch (err) {
    console.error("Error saving task:", err);
    alert("Error saving task.");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Task';
  }
}

function openTaskDetailModal(id) { 
  openTaskModal(id);
}

// --- EVENT MODAL ---
function openEventModal(eventId = null) {
  const modalOverlay = document.getElementById('eventModalOverlay');
  const modalTitle = document.getElementById('eventModalTitle');
  const form = document.getElementById('eventForm');
  form.reset();
  document.getElementById('eventIdInput').value = '';

  if (eventId && dbData.events[eventId]) {
    // EDIT MODE
    const event = dbData.events[eventId];
    modalTitle.textContent = 'Edit Event';
    document.getElementById('eventIdInput').value = eventId;
    document.getElementById('eventNameInput').value = event.name || '';
    document.getElementById('eventTypeInput').value = event.type || 'Technical';
    document.getElementById('eventDateInput').value = event.date || '';
    document.getElementById('eventVenueInput').value = event.venue || '';
  } else {
    // CREATE MODE
    modalTitle.textContent = 'Add New Event';
  }
  modalOverlay.style.display = 'flex';
}

async function handleEventFormSubmit(event) {
  event.preventDefault();
  const eventId = document.getElementById('eventIdInput').value;
  const eventData = {
    name: document.getElementById('eventNameInput').value,
    type: document.getElementById('eventTypeInput').value,
    date: document.getElementById('eventDateInput').value,
    venue: document.getElementById('eventVenueInput').value,
  };
  try {
    if (eventId) {
      await db.ref(`events/${eventId}`).update(eventData);
    } else {
      await db.ref('events').push(eventData);
    }
    closeModal();
  } catch (err) {
    console.error("Error saving event:", err);
    alert("Error saving event.");
  }
}

// --- SPONSOR MODAL (Updated) ---
// REPLACE your old openSponsorModal function with this one
function openSponsorModal(sponsorId = null) {
  const modalOverlay = document.getElementById('sponsorModalOverlay');
  const modalTitle = document.getElementById('sponsorModalTitle');
  const form = document.getElementById('sponsorForm');

  form.reset();
  document.getElementById('sponsorIdInput').value = '';

  if (sponsorId && dbData.sponsors[sponsorId]) {
    // EDIT MODE
    const sponsor = dbData.sponsors[sponsorId];
    modalTitle.textContent = 'Edit Sponsor';
    document.getElementById('sponsorIdInput').value = sponsorId;
    document.getElementById('sponsorNameInput').value = sponsor.name || '';
    document.getElementById('sponsorTierInput').value = sponsor.tier || 'General';
    document.getElementById('sponsorAmountInput').value = sponsor.amount || ''; // ADDED
    document.getElementById('sponsorDescInput').value = sponsor.description || ''; // ADDED
  } else {
    // CREATE MODE
    modalTitle.textContent = 'Add New Sponsor';
  }

  modalOverlay.style.display = 'flex';
}

// REPLACE your old handleSponsorFormSubmit function with this one
async function handleSponsorFormSubmit(event) {
  event.preventDefault();
  const sponsorId = document.getElementById('sponsorIdInput').value;
  
  const sponsorData = {
    name: document.getElementById('sponsorNameInput').value,
    tier: document.getElementById('sponsorTierInput').value,
    amount: document.getElementById('sponsorAmountInput').value, // ADDED
    description: document.getElementById('sponsorDescInput').value, // ADDED
  };

  try {
    if (sponsorId) {
      console.log(`Updating sponsor ${sponsorId}`);
      await db.ref(`sponsors/${sponsorId}`).update(sponsorData);
    } else {
      console.log('Creating new sponsor');
      await db.ref('sponsors').push(sponsorData);
    }
    closeModal();
  } catch (err) {
    console.error("Error saving sponsor:", err);
    alert("Error saving sponsor.");
  }
}

// --- TEAM MODAL ---
function openTeamModal(teamId = null) {
  const modalOverlay = document.getElementById('teamModalOverlay');
  const modalTitle = document.getElementById('teamModalTitle');
  const form = document.getElementById('teamForm');
  form.reset();
  document.getElementById('teamIdInput').value = '';

  if (teamId && dbData.teams[teamId]) {
    // EDIT MODE
    const team = dbData.teams[teamId];
    modalTitle.textContent = 'Edit Team';
    document.getElementById('teamIdInput').value = teamId;
    document.getElementById('teamNameInput').value = team.name || '';
    document.getElementById('teamIconInput').value = team.icon || '';
  } else {
    // CREATE MODE
     modalTitle.textContent = 'Add New Team';
  }
  modalOverlay.style.display = 'flex';
}

async function handleTeamFormSubmit(event) {
  event.preventDefault();
  const teamId = document.getElementById('teamIdInput').value;
  const teamData = {
    name: document.getElementById('teamNameInput').value,
    icon: document.getElementById('teamIconInput').value,
  };
  try {
    if (teamId) {
      await db.ref(`teams/${teamId}`).update(teamData);
    } else {
      await db.ref('teams').push(teamData);
    }
    closeModal();
  } catch (err) {
    console.error("Error saving team:", err);
    alert("Error saving team.");
  }
}

// --- ANNOUNCEMENT MODAL ---
function openAnnouncementModal() {
  const modalOverlay = document.getElementById('announcementModalOverlay');
  document.getElementById('announcementForm').reset();
  modalOverlay.style.display = 'flex';
}

async function handleAnnouncementFormSubmit(event) {
  event.preventDefault();
  const postData = {
    title: document.getElementById('announcementTitleInput').value,
    content: document.getElementById('announcementContentInput').value,
    authorId: currentUser.uid,
    timestamp: new Date().toISOString()
  };
  try {
    await db.ref('announcements').push(postData);
    closeModal();
  } catch (err) {
    console.error("Error posting announcement:", err);
    alert("Error posting announcement.");
  }
}

// ----------------- END OF FILE -----------------