// 1. Supabase Client Configuration
const SUPABASE_URL = "https://hhyvzsrbrjhyfovljfxg.supabase.co";
const SUPABASE_KEY ="sb_publishable_fHBGhjgN__JZjIny23yw7g_p863UNk8"; // Replace with your actual publishable key
async function testConnection() {
    const { data, error } = await supabaseClient
        .from("reports")
        .select("*");

    console.log(data);
    console.log(error);
}
testConnection();

const departments = [
    "Main Leather Cutting", "Edging", "Buffing/Colouring", "Sole Raised",
    "Lacquering", "Creasing", "Ink/Plastic Mark", "Soft Leather Cutting", 
    "Padding", "Hand Stitch", "M/C Stitch", "Fancy Stitch", 
    "Fancy Stitch Final", "Assembly", "Finishing"
];

const state = {
    user: null,
    view: "login",
    reportFilters: { date: "", month: "", supervisor: "all", jobNumber: "", status: "all", department: "all" },
    draftMessage: "",
    editingReportId: ""
};

const app = document.querySelector("#app");

// Utility helper utilities
function today() { return new Date().toISOString().slice(0, 10); }
function dateOffset(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}
function isLocked() { return new Date().getHours() >= 18; }
function escapeHtml(v = "") {
    return String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
}
function totalReport(r) {
    return Math.round((departments.reduce((s, d) => s + Number(r.quantities[d] || 0), 0) / departments.length) * 10) / 10;
}
function percentValue(v) { return `${Number(v || 0)}%`; }
function clampPercent(v) { return Math.max(0, Math.min(100, Number(v || 0))); }
function formatFillTime(r) {
    if (!r.filledAt && !r.updatedAt) return "";
    return new Date(r.filledAt || r.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function jobKey(value) { return String(value || "").trim().toLowerCase(); }
function makeReportId(supervisorId, date, jobNumber) {
    return `${supervisorId}-${date}-${jobKey(jobNumber).replace(/[^a-z0-9]+/g, "-") || Date.now()}`;
}

// 2. Updated Database Operations (Async)
async function currentUsers() {
    const { data, error } = await supabaseClient
        .from("users")
        .select("*");

    if (error) {
        console.error(error);
        return [];
    }
    return data;
}

async function currentReports() {
    const { data, error } = await supabaseClient
        .from("reports")
        .select("*")
        .order("date", { ascending: false }); // Ordered by date column matching the object schema

    if (error) {
        console.error(error);
        return [];
    }
    return data;
}

async function saveReportToDB(report) {
    const { error } = await supabaseClient
        .from("reports")
        .upsert(report);

    if (error) {
        console.error(error);
        alert(error.message);
    }
}

// 3. Updated Authentication & Session Management
async function login(employeeId, password) {
    const { data, error } = await supabaseClient
        .from("users")
        .select("*")
        .eq("id", employeeId)
        .eq("password", password)
        .single();

    if (error || !data) {
        alert("Invalid Login");
        return;
    }

    if (!data.active) {
        alert("Account is inactive.");
        return;
    }

    // Keep session token strategy or fall back to storing user data strictly locally
    localStorage.setItem("pdt_token", btoa(JSON.stringify({ employeeId: data.id, role: data.role, issuedAt: Date.now() })));
    state.user = data;
    state.view = data.role === "admin" ? "admin-dashboard" : "supervisor-dashboard";
    render();
}

function logout() {
    localStorage.removeItem("pdt_token");
    state.user = null;
    state.view = "login";
    render();
}

async function bootUser() {
    try {
        const tokenStr = localStorage.getItem("pdt_token");
        if (!tokenStr) { render(); return; }
        const token = JSON.parse(atob(tokenStr));
        if (!token) { render(); return; }

        const users = await currentUsers();
        const u = users.find(x => x.id === token.employeeId && x.active);
        if (u) {
            state.user = u;
            state.view = u.role === "admin" ? "admin-dashboard" : "supervisor-dashboard";
        }
    } catch (e) {
        console.error("Session restoration error:", e);
    }
    render();
}

// 4. Base Presentation Elements
function shell(content, subtitle = "") {
    app.innerHTML = `<div class="app-shell"><main class="phone"><header class="topbar">${state.view === "login" ? `<div class="brand-mark">PD</div>` : `<button class="icon-btn" onclick="goBack()" title="Back">‹</button>`}<div><h1>Production Daily Tracker</h1><small>${subtitle}</small></div><div class="spacer"></div>${state.user ? `<button class="icon-btn" onclick="logout()" title="Logout">⏻</button>` : ""}</header>${content}</main></div>`;
}

function goBack() {
    state.view = !state.user ? "login" : state.user.role === "admin" ? "admin-dashboard" : "supervisor-dashboard";
    render();
}

function renderLogin() {
    app.innerHTML = `<div class="app-shell"><main class="phone"><section class="login-panel"><div class="login-card"><div class="brand-mark">PD</div><h1>Production Daily Tracker</h1><p>Daily leather production reporting for supervisors and factory administrators.</p><form onsubmit="event.preventDefault(); login(this.employeeId.value, this.password.value)"><div class="field"><label for="employeeId">Employee ID</label><input id="employeeId" name="employeeId" autocomplete="username" placeholder="SUP101" required></div><div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" placeholder="Password" required></div><button class="btn primary full" type="submit">Login</button></form><div class="demo">Admin: ADM001 / admin123<br>Supervisor: SUP101 / pass123 or SUP102 / pass123</div></div></section></main></div>`;
}

// 5. Supervisor Views
async function renderSupervisorDashboard() {
    const allReports = await currentReports();
    const todayItems = allReports.filter(r => r.supervisorId === state.user.id && r.date === today());
    const yesterdayItems = allReports.filter(r => r.supervisorId === state.user.id && r.date === dateOffset(-1));
    const lock = isLocked();

    shell(`<section class="content"><div class="status-row"><span class="pill ${lock ? "locked" : "ok"}">${lock ? "Locked after 6 PM" : "Open until 6 PM"}</span><span class="pill">${escapeHtml(state.user.name)}</span><span class="pill">${escapeHtml(state.user.id)}</span></div><div class="menu"><button onclick="state.view='entry'; render()"><strong>Fill Today's Report</strong><span>${todayItems.length ? `${todayItems.length} job entry saved today` : "Enter production percentage for all 15 departments"}</span></button><button onclick="state.view='yesterday'; render()" ${yesterdayItems.length ? "" : "disabled"}><strong>Yesterday's Report</strong><span>${yesterdayItems.length ? `${yesterdayItems.length} job entry available` : "No report available for yesterday"}</span></button><button onclick="state.view='profile'; render()"><strong>My Profile</strong><span>Employee details, role, and access status</span></button></div></section>`, "Supervisor Dashboard");
}

function makeBlankReport() {
    const quantities = {};
    departments.forEach(d => quantities[d] = "");
    return { id: `${state.user.id}-${today()}`, supervisorId: state.user.id, supervisorName: state.user.name, teamLeaderName: "", jobNumber: "", filledAt: "", date: today(), status: "new", remarks: "", quantities };
}

function renderEntry() {
    const lock = isLocked(), r = makeBlankReport();
    const inputs = departments.map(d => `<div class="dept-row"><label for="${d}">${d}</label><input id="${d}" name="${d}" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${r.quantities[d] || ""}" placeholder="0-100" ${lock ? "disabled" : ""}></div>`).join("");
    
    shell(`<form onsubmit="event.preventDefault(); saveReport(this, 'submitted')" class="content"><div class="status-row"><span class="pill ${lock ? "locked" : "ok"}">${lock ? "Entry locked" : "Today's entry open"}</span><span class="pill">${today()}</span><span class="pill">${r.status}</span></div>${lock ? `<div class="notice">The daily production form is locked because the factory cutoff time is 6:00 PM.</div>` : ""}${state.draftMessage ? `<div class="notice">${state.draftMessage}</div>` : ""}<section class="panel"><h2>Job Details</h2><div class="filters"><div class="field"><label for="jobNumber">Job Number</label><input id="jobNumber" name="jobNumber" value="${escapeHtml(r.jobNumber || "")}" ${lock ? "disabled" : ""} required></div><div class="field"><label for="teamLeaderName">Team Leader Name</label><input id="teamLeaderName" name="teamLeaderName" value="${escapeHtml(r.teamLeaderName || "")}" ${lock ? "disabled" : ""} required></div></div></section><section class="panel" style="margin-top:12px"><h2>Department Production %</h2><div class="dept-grid">${inputs}</div></section><section class="panel" style="margin-top:12px"><div class="field"><label for="remarks">Remarks</label><textarea id="remarks" name="remarks" ${lock ? "disabled" : ""}>${escapeHtml(r.remarks || "")}</textarea></div></section><div class="footer-actions"><button class="btn secondary" type="button" onclick="saveReport(document.querySelector('form'),'draft')" ${lock ? "disabled" : ""}>Save Draft</button><button class="btn primary" type="submit" ${lock ? "disabled" : ""}>Submit</button></div></form>`, "Daily Entry");
}

function valuesFromForm(form) {
    const quantities = {};
    departments.forEach(d => quantities[d] = clampPercent(form.elements[d].value));
    const jobNumber = form.jobNumber.value.trim();
    return { id: makeReportId(state.user.id, today(), jobNumber), supervisorId: state.user.id, supervisorName: state.user.name, teamLeaderName: form.teamLeaderName.value.trim(), jobNumber, date: today(), remarks: form.remarks.value.trim(), quantities, filledAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

// 6. Updated Save Operations with Database Synchronization
async function saveReport(form, status) {
    if (isLocked()) {
        alert("Daily entry is locked after 6:00 PM.");
        return;
    }

    const report = {
        ...valuesFromForm(form),
        status
    };

    const { error } = await supabaseClient
        .from("reports")
        .upsert(report);

    if (error) {
        alert(error.message);
        return;
    }

    alert("Saved Successfully");
    state.draftMessage = status === "draft" ? "Draft saved for this job number." : "Report submitted for this job number.";
    render();
}

function reportSummary(r) {
    const rows = departments.map(d => `<tr><td>${d}</td><td>${percentValue(r.quantities[d])}</td></tr>`).join("");
    return `<section class="panel"><div class="status-row"><span class="pill">${r.date}</span><span class="pill">Job ${escapeHtml(r.jobNumber || "Not set")}</span><span class="pill">Team Leader: ${escapeHtml(r.teamLeaderName || r.supervisorName || "Not set")}</span><span class="pill">Filled: ${formatFillTime(r) || "Not set"}</span><span class="pill">${r.status}</span><span class="pill ok">Average ${totalReport(r)}%</span></div><div class="table-wrap"><table><thead><tr><th>Department</th><th>Production %</th></tr></thead><tbody>${rows}</tbody></table></div><p><strong>Remarks:</strong> ${escapeHtml(r.remarks || "None")}</p></section>`;
}

async function renderYesterday() {
    const allReports = await currentReports();
    const items = allReports.filter(r => r.supervisorId === state.user.id && r.date === dateOffset(-1));
    shell(`<section class="content grid">${items.length ? items.map(reportSummary).join("") : `<div class="empty">Yesterday's report is not available.</div>`}</section>`, "Yesterday's Report");
}

function renderProfile() {
    shell(`<section class="content grid"><div class="panel"><h2>${escapeHtml(state.user.name)}</h2><p><strong>Employee ID:</strong> ${escapeHtml(state.user.id)}</p><p><strong>Role:</strong> ${escapeHtml(state.user.role)}</p><p><strong>Status:</strong> ${state.user.active ? "Enabled" : "Disabled"}</p><p><strong>Phone:</strong> ${escapeHtml(state.user.phone || "Not set")}</p></div></section>`, "My Profile");
}

// 7. Admin Dashboard and Views
async function renderAdminDashboard() {
    const reports = await currentReports();
    const users = await currentUsers();
    
    const todayReports = reports.filter(r => r.date === today());
    const totalToday = todayReports.length ? Math.round((todayReports.reduce((s, r) => s + totalReport(r), 0) / todayReports.length) * 10) / 10 : 0;
    const supervisors = users.filter(u => u.role === "supervisor");
    const activeSupervisors = supervisors.filter(u => u.active);
    const submittedIds = new Set(todayReports.map(r => r.supervisorId));
    const topReport = todayReports.slice().sort((a, b) => totalReport(b) - totalReport(a))[0];

    const supervisorRows = activeSupervisors.map(u => {
        const report = todayReports.find(r => r.supervisorId === u.id);
        return `<div class="dash-supervisor-row"><div><strong>${escapeHtml(u.name)}</strong><span>${escapeHtml(u.id)}</span></div><span class="pill ${report ? "ok" : "locked"}">${report ? `${report.status} · ${totalReport(report)}%` : "Not filled"}</span></div>`;
    }).join("") || `<div class="empty">No active supervisors.</div>`;

    shell(`<section class="content admin-dashboard"><div class="dash-hero"><div><span class="pill ${isLocked() ? "locked" : "ok"}">${isLocked() ? "Locked after 6 PM" : "Entry open until 6 PM"}</span><h2>Admin Production Dashboard</h2><p>${today()} · ${todayReports.length} report${todayReports.length === 1 ? "" : "s"} received</p></div><button class="btn primary" onclick="state.view='reports'; render()">View Reports</button></div><div class="dash-kpis"><div class="metric"><strong>${totalToday}%</strong><span>Today average</span></div><div class="metric"><strong>${activeSupervisors.length}</strong><span>Active supervisors</span></div><div class="metric"><strong>${submittedIds.size}/${activeSupervisors.length}</strong><span>Supervisor filled</span></div><div class="metric"><strong>${topReport ? escapeHtml(topReport.teamLeaderName || topReport.supervisorName || "-") : "-"}</strong><span>Top team leader</span></div></div><nav class="dash-actions"><button onclick="state.view='reports'; render()"><strong>Reports</strong><span>Filter, edit, print, Excel and PDF</span></button><button onclick="state.view='analytics'; render()"><strong>Analytics</strong><span>Daily and department performance</span></button><button onclick="state.view='users'; render()"><strong>Supervisors</strong><span>Add, disable and reset access</span></button><button onclick="exportFilteredReports()"><strong>Export Excel</strong><span>Download production percentages</span></button><button onclick="state.view='settings'; render()"><strong>Settings</strong><span>Lock timing and app rules</span></button></nav><div class="dash-grid"><section class="panel today-panel"><div class="panel-head"><h2>Today's Production</h2><span class="pill">Average ${totalToday}%</span></div>${reportsTable(todayReports)}</section><section class="panel dash-side"><div class="panel-head"><h2>Supervisor Status</h2><button class="btn secondary" onclick="state.view='users'; render()">Manage</button></div><div class="dash-supervisor-list">${supervisorRows}</div></section></div></section>`, "Admin Dashboard");
}

// Wrapper to bridge async data filtering with legacy sync event handlers
async function exportFilteredReports() {
    const reports = await currentReports();
    const filtered = reports.filter(r => {
        if (state.reportFilters.date && r.date !== state.reportFilters.date) return false;
        if (state.reportFilters.month && !r.date.startsWith(state.reportFilters.month)) return false;
        if (state.reportFilters.supervisor !== "all" && r.supervisorId !== state.reportFilters.supervisor) return false;
        if (state.reportFilters.jobNumber && !(r.jobNumber || "").toLowerCase().includes(state.reportFilters.jobNumber.toLowerCase())) return false;
        if (state.reportFilters.status !== "all" && r.status !== state.reportFilters.status) return false;
        return true;
    });
    downloadCsv(filtered, 'production-reports.csv');
}

function reportsTable(reports) {
    if (!reports.length) return `<div class="empty">No production reports found.</div>`;
    const dept = state.reportFilters.department || "all";
    if (dept !== "all") {
        const rows = reports.map(r => `<tr><td>${r.date}</td><td>${formatFillTime(r)}</td><td>${escapeHtml(r.jobNumber || "")}</td><td>${escapeHtml(r.teamLeaderName || r.supervisorName || "")}</td><td>${escapeHtml(r.status)}</td><td>${dept}</td><td>${percentValue(r.quantities[dept])}</td><td>${totalReport(r)}%</td><td><div class="row-actions"><button class="btn secondary" onclick="openAdminEdit('${r.id}')">Edit</button><button class="btn danger" onclick="deleteReport('${r.id}')">Delete</button></div></td></tr>`).join("");
        return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Fill Time</th><th>Job Number</th><th>Team Leader Name</th><th>Status</th><th>Department</th><th>Production %</th><th>Average %</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    const headers = departments.map(d => `<th>${d}</th>`).join("");
    const rows = reports.map(r => `<tr><td>${r.date}</td><td>${formatFillTime(r)}</td><td>${escapeHtml(r.jobNumber || "")}</td><td>${escapeHtml(r.teamLeaderName || r.supervisorName || "")}</td><td>${escapeHtml(r.status)}</td>${departments.map(d => `<td>${percentValue(r.quantities[d])}</td>`).join("")}<td><strong>${totalReport(r)}%</strong></td><td><div class="row-actions"><button class="btn secondary" onclick="openAdminEdit('${r.id}')">Edit</button><button class="btn danger" onclick="deleteReport('${r.id}')">Delete</button></div></td></tr>`).join("");
    return `<div class="table-wrap"><table class="report-grid"><thead><tr><th>Date</th><th>Fill Time</th><th>Job Number</th><th>Team Leader Name</th><th>Status</th>${headers}<th>Average %</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function renderReports() {
    const reports = await currentReports();
    const users = await currentUsers();
    const supervisors = users.filter(u => u.role === "supervisor");
    const jobNumbers = [...new Set(reports.map(r => r.jobNumber).filter(Boolean))].sort();

    const filtered = reports.filter(r => {
        if (state.reportFilters.date && r.date !== state.reportFilters.date) return false;
        if (state.reportFilters.month && !r.date.startsWith(state.reportFilters.month)) return false;
        if (state.reportFilters.supervisor !== "all" && r.supervisorId !== state.reportFilters.supervisor) return false;
        if (state.reportFilters.jobNumber && !(r.jobNumber || "").toLowerCase().includes(state.reportFilters.jobNumber.toLowerCase())) return false;
        if (state.reportFilters.status !== "all" && r.status !== state.reportFilters.status) return false;
        return true;
    });

    shell(`<section class="content grid"><section class="panel no-print"><h2>Filters</h2><div class="filters"><div class="field"><label>Date</label><input type="date" value="${state.reportFilters.date}" onchange="state.reportFilters.date=this.value; render()"></div><div class="field"><label>Month</label><input type="month" value="${state.reportFilters.month}" onchange="state.reportFilters.month=this.value; render()"></div><div class="field"><label>Supervisor</label><select onchange="state.reportFilters.supervisor=this.value; render()"><option value="all">All</option>${supervisors.map(u => `<option value="${u.id}" ${state.reportFilters.supervisor === u.id ? "selected" : ""}>${u.name}</option>`).join("")}</select></div><div class="field"><label>Job Number</label><select onchange="state.reportFilters.jobNumber=this.value; render()"><option value="">All Jobs</option>${jobNumbers.map(job => `<option value="${escapeHtml(job)}" ${state.reportFilters.jobNumber === job ? "selected" : ""}>${escapeHtml(job)}</option>`).join("")}</select></div><div class="field"><label>Status</label><select onchange="state.reportFilters.status=this.value; render()"><option value="all">All Status</option><option value="draft" ${state.reportFilters.status === "draft" ? "selected" : ""}>Draft</option><option value="pending" ${state.reportFilters.status === "pending" ? "selected" : ""}>Pending</option><option value="submitted" ${state.reportFilters.status === "submitted" ? "selected" : ""}>Submitted</option></select></div><div class="field"><label>Department</label><select onchange="state.reportFilters.department=this.value; render()"><option value="all">All</option>${departments.map(d => `<option value="${d}" ${state.reportFilters.department === d ? "selected" : ""}>${d}</option>`).join("")}</select></div></div><div class="actions"><button class="btn secondary" onclick="exportFilteredReports()">Excel</button><button class="btn secondary" onclick="window.print()">PDF</button><button class="btn primary" onclick="window.print()">Print</button><button class="btn warn" onclick="state.reportFilters={date:'',month:'',supervisor:'all',jobNumber:'',status:'all',department:'all'}; render()">Reset</button></div></section><section class="panel"><h2>Reports</h2>${reportsTable(filtered)}</section></section>`, "Reports");
}

function downloadCsv(reports, filename) {
    if(!reports.length) { alert("No data to export"); return; }
    const sorted = reports.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const dateHeaders = sorted.map(r => formatExportDate(r.date));
    const lines = [];
    lines.push(["Supervisor name", uniqueJoined(sorted.map(r => r.supervisorName)), "", "Job Order Number", uniqueJoined(sorted.map(r => r.jobNumber)), "", "Team Leader Name", uniqueJoined(sorted.map(r => r.teamLeaderName || r.supervisorName)), "", "Year:-", exportYear(sorted)]);
    lines.push([]);
    lines.push(["Department", ...dateHeaders]);
    departments.forEach(d => { lines.push([d, ...sorted.map(r => percentValue(r.quantities[d]))]); });
    lines.push([]);
    lines.push(["Average %", ...sorted.map(r => `${totalReport(r)}%`)]);
    lines.push(["Fill Time", ...sorted.map(r => formatFillTime(r))]);
    lines.push(["Status", ...sorted.map(r => r.status)]);
    lines.push(["Remarks", ...sorted.map(r => r.remarks || "")]);
    const csv = lines.map(row => row.map(cell => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}
function formatExportDate(date) { const parts = String(date || "").split("-"); return parts.length === 3 ? `${parts[2]}/${parts[1]}` : date; }
function exportYear(reports) { const date = (reports[0] && reports[0].date) || today(); return String(date).split("-")[0] || new Date().getFullYear(); }
function uniqueJoined(values) { return [...new Set(values.filter(Boolean))].join(", "); }

// 8. Analytics Engine and Aggregations
async function aggregateByDate() {
    const reports = await currentReports();
    const m = {};
    reports.forEach(r => m[r.date] = (m[r.date] || 0) + totalReport(r));
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).slice(-10);
}
async function aggregateBySupervisor() {
    const reports = await currentReports();
    const m = {};
    reports.forEach(r => m[r.supervisorName] = (m[r.supervisorName] || 0) + totalReport(r));
    return Object.entries(m);
}
async function aggregateByDepartment() {
    const reports = await currentReports();
    const m = {};
    reports.forEach(r => departments.forEach(d => m[d] = (m[d] || 0) + Number(r.quantities[d] || 0)));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

function renderAnalytics() {
    shell(`<section class="content grid"><div class="tabs no-print"><button class="active" onclick="drawChart('daily')">Daily</button><button onclick="drawChart('weekly')">Weekly</button><button onclick="drawChart('monthly')">Monthly</button></div><section class="panel"><h2>Production Trend</h2><canvas id="trendChart" class="chart"></canvas></section><section class="panel"><h2>Supervisor Performance</h2><canvas id="supervisorChart" class="chart"></canvas></section><section class="panel"><h2>Department Performance</h2><canvas id="departmentChart" class="chart"></canvas></section></section>`, "Analytics");
    requestAnimationFrame(async () => {
        drawChart("daily");
        drawBar("supervisorChart", await aggregateBySupervisor());
        drawBar("departmentChart", (await aggregateByDepartment()).slice(0, 8));
    });
}
async function drawChart(mode) {
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("active", b.textContent.toLowerCase() === mode));
    drawBar("trendChart", await aggregateByDate());
}
function drawBar(id, data) {
    const c = document.getElementById(id);
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.width = Math.floor(r.width * devicePixelRatio);
    c.height = Math.floor(r.height * devicePixelRatio);
    const x = c.getContext("2d");
    x.scale(devicePixelRatio, devicePixelRatio);
    x.clearRect(0, 0, r.width, r.height);
    const pad = 34, max = Math.max(...data.map(i => i[1]), 1), w = (r.width - pad * 2) / Math.max(data.length, 1);
    x.fillStyle = "#eef2ef"; x.fillRect(0, 0, r.width, r.height);
    data.forEach(([label, value], i) => {
        const h = ((r.height - 76) * value) / max, bx = pad + i * w + 5, by = r.height - pad - h;
        x.fillStyle = i % 2 ? "#2f6f9f" : "#f5b642"; x.fillRect(bx, by, Math.max(14, w - 10), h);
        x.fillStyle = "#17211c"; x.font = "11px Arial"; x.fillText(String(value), bx, by - 5);
        x.save(); x.translate(bx, r.height - 12); x.rotate(-.55); x.fillText(label.slice(0, 12), 0, 0); x.restore();
    });
}

// 9. Data Editing and Deletion
async function deleteReport(id) {
    const reports = await currentReports();
    const report = reports.find(r => r.id === id);
    if (!report) { alert("Report not found."); return; }
    const label = `${report.date} / ${report.jobNumber || "No job"}`;
    if (!confirm(`Delete production report ${label}?`)) return;

    const { error } = await supabaseClient
        .from("reports")
        .delete()
        .eq("id", id);

    if (error) { alert(error.message); return; }
    render();
}

async function openAdminEdit(id) {
    state.editingReportId = id;
    state.view = "admin-edit";
    render();
}

async function renderAdminEdit() {
    const reports = await currentReports();
    const report = reports.find(r => r.id === state.editingReportId);
    if (!report) {
        shell(`<section class="content"><div class="empty">Report not found.</div></section>`, "Edit Production");
        return;
    }
    const inputs = departments.map(d => `<div class="dept-row"><label for="${d}">${d}</label><input id="${d}" name="${d}" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${Number(report.quantities[d] || 0)}" placeholder="0-100"></div>`).join("");
    shell(`<form onsubmit="event.preventDefault(); saveAdminEdit(this)" class="content"><div class="status-row"><span class="pill">${report.date}</span><span class="pill">Filled: ${formatFillTime(report) || "Not set"}</span><span class="pill">Admin edit enabled</span></div><section class="panel"><h2>Production Details</h2><div class="filters"><div class="field"><label for="jobNumber">Job Number</label><input id="jobNumber" name="jobNumber" value="${escapeHtml(report.jobNumber || "")}" required></div><div class="field"><label for="teamLeaderName">Team Leader Name</label><input id="teamLeaderName" name="teamLeaderName" value="${escapeHtml(report.teamLeaderName || report.supervisorName || "")}" required></div><div class="field"><label for="status">Status</label><select id="status" name="status"><option value="draft" ${report.status === "draft" ? "selected" : ""}>Draft</option><option value="pending" ${report.status === "pending" ? "selected" : ""}>Pending</option><option value="submitted" ${report.status === "submitted" ? "selected" : ""}>Submitted</option></select></div><div class="field"><label for="date">Date</label><input id="date" name="date" type="date" value="${report.date}" required></div></div></section><section class="panel" style="margin-top:12px"><h2>Department Production %</h2><div class="dept-grid">${inputs}</div></section><section class="panel" style="margin-top:12px"><div class="field"><label for="remarks">Remarks</label><textarea id="remarks" name="remarks">${escapeHtml(report.remarks || "")}</textarea></div></section><div class="footer-actions"><button class="btn secondary" type="button" onclick="state.view='reports'; render()">Cancel</button><button class="btn primary" type="submit">Save Changes</button></div></form>`, "Edit Production");
}

async function saveAdminEdit(form) {
    const reports = await currentReports();
    const index = reports.findIndex(r => r.id === state.editingReportId);
    if (index < 0) { alert("Report not found."); return; }
    const original = reports[index];
    const quantities = {};
    departments.forEach(d => quantities[d] = clampPercent(form.elements[d].value));

    const updatedReport = {
        ...original,
        date: form.date.value,
        jobNumber: form.jobNumber.value.trim(),
        teamLeaderName: form.teamLeaderName.value.trim(),
        status: form.status.value,
        remarks: form.remarks.value.trim(),
        quantities,
        adminEditedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    const { error } = await supabaseClient
        .from("reports")
        .upsert(updatedReport);

    if (error) { alert(error.message); return; }

    state.view = "reports";
    state.editingReportId = "";
    render();
}

// 10. User Modification and Administration Views
async function renderUsers() {
    const users = await currentUsers();
    const supervisors = users.filter(u => u.role === "supervisor");
    shell(`<section class="content grid"><section class="panel"><h2>Add Supervisor</h2><form onsubmit="event.preventDefault(); addSupervisor(this)" class="grid"><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Employee ID</label><input name="id" required></div><div class="field"><label>Password</label><input name="password" value="pass123" required></div><button class="btn primary" type="submit">Add Supervisor</button></form></section><section class="panel"><h2>Supervisors</h2>${supervisors.map(userRow).join("")}</section></section>`, "User Management");
}

function userRow(u) {
    return `<div class="user-row"><div><strong>${escapeHtml(u.name)}</strong><br><span>${escapeHtml(u.id)} · ${u.active ? "Enabled" : "Disabled"}</span></div><div class="user-tools"><button class="btn secondary" onclick="renameSupervisor('${u.id}')">Edit</button><button class="btn warn" onclick="resetPassword('${u.id}')">Reset</button><button class="btn ${u.active ? "danger" : "secondary"}" onclick="toggleUser('${u.id}')">${u.active ? "Disable" : "Enable"}</button></div></div>`;
}

async function addSupervisor(form) {
    const users = await currentUsers();
    if (users.some(u => u.id.toLowerCase() === form.id.value.toLowerCase())) {
        alert("Employee ID already exists.");
        return;
    }

    const newUser = { id: form.id.value.trim(), password: form.password.value, role: "supervisor", name: form.name.value.trim(), active: true };
    const { error } = await supabaseClient.from("users").upsert(newUser);
    if (error) { alert(error.message); return; }
    render();
}

async function renameSupervisor(id) {
    const users = await currentUsers();
    const u = users.find(x => x.id === id);
    const name = prompt("Supervisor name", u.name);
    if (!name) return;
    
    u.name = name.trim();
    const { error } = await supabaseClient.from("users").upsert(u);
    if (error) { alert(error.message); return; }
    render();
}

async function resetPassword(id) {
    const users = await currentUsers();
    const u = users.find(x => x.id === id);
    u.password = "pass123";
    
    const { error } = await supabaseClient.from("users").upsert(u);
    if (error) { alert(error.message); return; }
    alert("Password reset to pass123.");
}

async function toggleUser(id) {
    const users = await currentUsers();
    const u = users.find(x => x.id === id);
    u.active = !u.active;
    
    const { error } = await supabaseClient.from("users").upsert(u);
    if (error) { alert(error.message); return; }
    render();
}

function renderSettings() {
    shell(`<section class="content grid"><section class="panel"><h2>Settings</h2><p><strong>Authentication:</strong> Employee ID and password authenticated via Supabase.</p><p><strong>Daily cutoff:</strong> Strict auto-lock at 6:00 PM local device time.</p><p><strong>Supervisor history:</strong> Only yesterday's report is available from supervisor login.</p><p><strong>Data:</strong> Hosted via Supabase PostgreSQL Instance.</p></section></section>`, "Settings");
}

// 11. State Routing Engine
function render() {
    state.draftMessage = state.view === "entry" ? state.draftMessage : "";
    if (!state.user) return renderLogin();
    if (state.view === "supervisor-dashboard") return renderSupervisorDashboard();
    if (state.view === "entry") return renderEntry();
    if (state.view === "yesterday") return renderYesterday();
    if (state.view === "profile") return renderProfile();
    if (state.view === "admin-dashboard") return renderAdminDashboard();
    if (state.view === "reports") return renderReports();
    if (state.view === "analytics") return renderAnalytics();
    if (state.view === "users") return renderUsers();
    if (state.view === "admin-edit") return renderAdminEdit();
    if (state.view === "settings") return renderSettings();
    renderLogin();
}

// App bootstrapping init sequence
bootUser();