// Thin fetch wrapper for the Address Gateway backend API.
// Same-origin in production (frontend is served by the same Express app); a Vite dev
// proxy (see vite.config.js) forwards /api and /uploads to localhost:3000 in development.

let authToken = localStorage.getItem("agw_token") || null;

export function setToken(token) {
  authToken = token;
  if (token) localStorage.setItem("agw_token", token);
  else localStorage.removeItem("agw_token");
}
export function getToken() {
  return authToken;
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body, isFormData = false) {
  const headers = {};
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  if (!isFormData && body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json().catch(() => ({})) : await res.text();

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data;
}

const get = (path) => request("GET", path);
const post = (path, body) => request("POST", path, body ?? {});
const patch = (path, body) => request("PATCH", path, body ?? {});
const del = (path) => request("DELETE", path);
const postForm = (path, formData) => request("POST", path, formData, true);

export const api = {
  auth: {
    login: (email, password) => post("/auth/login", { email, password }),
    me: () => get("/auth/me"),
    forgotPassword: (email) => post("/auth/forgot-password", { email }),
    resetPassword: (email, otp, newPassword) => post("/auth/reset-password", { email, otp, newPassword }),
    changePassword: (currentPassword, newPassword) => post("/auth/change-password", { currentPassword, newPassword }),
  },
  users: {
    list: () => get("/users"),
    create: (payload) => post("/users", payload),
    update: (id, payload) => patch(`/users/${id}`, payload),
    toggleActive: (id) => post(`/users/${id}/toggle-active`),
    resetPassword: (id, password) => post(`/users/${id}/reset-password`, { password }),
    remove: (id) => del(`/users/${id}`),
    uploadPhoto: (id, file) => { const fd = new FormData(); fd.append("photo", file); return postForm(`/users/${id}/photo`, fd); },
    addDoc: (id, doc) => post(`/users/${id}/docs`, doc),
    updateDoc: (id, docId, payload) => patch(`/users/${id}/docs/${docId}`, payload),
    removeDoc: (id, docId) => del(`/users/${id}/docs/${docId}`),
  },
  leads: {
    list: () => get("/leads"),
    create: (payload) => post("/leads", payload),
    update: (id, payload) => patch(`/leads/${id}`, payload),
    followUp: (id, payload) => post(`/leads/${id}/follow-up`, payload),
    convertToDeal: (id, value) => post(`/leads/${id}/convert-to-deal`, { value }),
    remove: (id) => del(`/leads/${id}`),
  },
  deals: {
    list: () => get("/deals"),
    create: (payload) => post("/deals", payload),
    update: (id, payload) => patch(`/deals/${id}`, payload),
    remove: (id) => del(`/deals/${id}`),
  },
  quotations: {
    list: () => get("/quotations"),
    get: (id) => get(`/quotations/${id}`),
    create: (payload) => post("/quotations", payload),
    update: (id, payload) => patch(`/quotations/${id}`, payload),
    remove: (id) => del(`/quotations/${id}`),
    approveDiscount: (id) => post(`/quotations/${id}/approve-discount`),
    setStatus: (id, status) => post(`/quotations/${id}/status`, { status }),
    toggleFavorite: (id) => post(`/quotations/${id}/favorite`),
    markEmailed: (id, cc) => post(`/quotations/${id}/emailed`, { cc }),
    clone: (id, customer) => post(`/quotations/${id}/clone`, { customer }),
    convertToSalesOrder: (id) => post(`/quotations/${id}/convert-to-sales-order`),
    pdfUrl: (id) => `/api/quotations/${id}/pdf`,
  },
  salesOrders: {
    list: () => get("/sales-orders"),
    onboard: (id) => post(`/sales-orders/${id}/onboard`),
  },
  invoices: {
    list: () => get("/invoices"),
    recordPayment: (id, amount, mode) => post(`/invoices/${id}/payments`, { amount, mode }),
    removePayment: (id, paymentId) => del(`/invoices/${id}/payments/${paymentId}`),
    markEmailed: (id, cc) => post(`/invoices/${id}/emailed`, { cc }),
  },
  customers: {
    list: () => get("/customers"),
    create: (payload) => post("/customers", payload),
    update: (id, payload) => patch(`/customers/${id}`, payload),
    remove: (id) => del(`/customers/${id}`),
    addDoc: (id, doc) => post(`/customers/${id}/docs`, doc),
    updateDoc: (id, docId, payload) => patch(`/customers/${id}/docs/${docId}`, payload),
    removeDoc: (id, docId) => del(`/customers/${id}/docs/${docId}`),
    addEmployee: (id, employee) => post(`/customers/${id}/employees`, employee),
    updateEmployee: (id, empId, payload) => patch(`/customers/${id}/employees/${empId}`, payload),
    removeEmployee: (id, empId) => del(`/customers/${id}/employees/${empId}`),
    addEmployeeDoc: (id, empId, doc) => post(`/customers/${id}/employees/${empId}/docs`, doc),
    updateEmployeeDoc: (id, empId, docId, payload) => patch(`/customers/${id}/employees/${empId}/docs/${docId}`, payload),
    removeEmployeeDoc: (id, empId, docId) => del(`/customers/${id}/employees/${empId}/docs/${docId}`),
    dashboard: (id) => get(`/customers/${id}/dashboard`),
  },
  jobCards: {
    list: () => get("/job-cards"),
    createDirect: (payload) => post("/job-cards/direct", payload),
    approve: (id) => post(`/job-cards/${id}/approve`),
    reject: (id, reason) => post(`/job-cards/${id}/reject`, { reason }),
    assign: (id, assignees) => post(`/job-cards/${id}/assign`, { assignees }),
    setStatus: (id, status, reason) => post(`/job-cards/${id}/status`, { status, reason }),
    update: (id, payload) => patch(`/job-cards/${id}`, payload),
    toggleChecklistItem: (id, itemId) => post(`/job-cards/${id}/checklist`, { itemId }),
    removeChecklistItem: (id, itemId) => post(`/job-cards/${id}/checklist`, { itemId, remove: true }),
    addChecklistItem: (id, label) => post(`/job-cards/${id}/checklist`, { label }),
  },
  subscriptions: {
    plans: () => get("/subscriptions/plans"),
    addPlan: (name, description) => post("/subscriptions/plans", { name, description }),
    updatePlanMeta: (name, payload) => patch(`/subscriptions/plans/${encodeURIComponent(name)}`, payload),
    removePlan: (name) => del(`/subscriptions/plans/${encodeURIComponent(name)}`),
    updateTier: (plan, tierName, payload) => request("PUT", `/subscriptions/plans/${encodeURIComponent(plan)}/tiers/${encodeURIComponent(tierName)}`, payload),
    addTier: (plan, tierName) => post(`/subscriptions/plans/${encodeURIComponent(plan)}/tiers`, { tierName }),
    removeTier: (plan, tierName) => del(`/subscriptions/plans/${encodeURIComponent(plan)}/tiers/${encodeURIComponent(tierName)}`),
    list: () => get("/subscriptions"),
    create: (payload) => post("/subscriptions", payload),
    update: (id, payload) => patch(`/subscriptions/${id}`, payload),
    remove: (id) => del(`/subscriptions/${id}`),
    renew: (id, startDate, alsoInvoice) => post(`/subscriptions/${id}/renew`, { startDate, alsoInvoice }),
    cancel: (id) => post(`/subscriptions/${id}/cancel`),
    logUsage: (id, field, amount) => post(`/subscriptions/${id}/log-usage`, { field, amount }),
  },
  hr: {
    markAttendance: (userId, date, status) => post("/hr/attendance/mark", { userId, date, status }),
    attendanceFor: (userId, from, to) => get(`/hr/attendance/${userId}?from=${from || ""}&to=${to || ""}`),
    leaveRequests: () => get("/hr/leave-requests"),
    requestLeave: (payload) => post("/hr/leave-requests", payload),
    decideLeave: (id, status) => post(`/hr/leave-requests/${id}/decide`, { status }),
    removeLeave: (id) => del(`/hr/leave-requests/${id}`),
    punchRequests: () => get("/hr/punch-requests"),
    requestPunch: (payload) => post("/hr/punch-requests", payload),
    decidePunch: (id, status) => post(`/hr/punch-requests/${id}/decide`, { status }),
  },
  incentives: {
    rules: () => get("/incentives/rules"),
    addRule: (payload) => post("/incentives/rules", payload),
    updateRule: (id, payload) => patch(`/incentives/rules/${id}`, payload),
    removeRule: (id) => del(`/incentives/rules/${id}`),
    earned: (userId) => get(`/incentives/earned/${userId}`),
  },
  notifications: {
    list: () => get("/notifications"),
    markRead: (id) => post(`/notifications/${id}/read`),
    markAllRead: () => post("/notifications/mark-all-read"),
    email: (id, to, subject, body) => post(`/notifications/${id}/email`, { to, subject, body }),
  },
  reports: {
    businessVolume: (from, to) => get(`/reports/business-volume?from=${from || ""}&to=${to || ""}`),
    salesByPerson: (from, to) => get(`/reports/sales-by-person?from=${from || ""}&to=${to || ""}`),
    collections: (from, to) => get(`/reports/collections?from=${from || ""}&to=${to || ""}`),
    customers: (from, to) => get(`/reports/customers?from=${from || ""}&to=${to || ""}`),
    userBase: () => get("/reports/user-base"),
    attendanceHr: (from, to) => get(`/reports/attendance-hr?from=${from || ""}&to=${to || ""}`),
    operations: (from, to) => get(`/reports/operations?from=${from || ""}&to=${to || ""}`),
  },
  dataManager: {
    list: () => get("/data-manager"),
    create: (payload) => post("/data-manager", payload),
    import: (file, dataCategory) => { const fd = new FormData(); fd.append("file", file); fd.append("dataCategory", dataCategory); return postForm("/data-manager/import", fd); },
    assign: (id, userId) => post(`/data-manager/${id}/assign`, { userId }),
    autoAssign: () => post("/data-manager/auto-assign"),
    endOfDayReturn: () => post("/data-manager/end-of-day-return"),
    recycle: () => post("/data-manager/recycle"),
    sendEmail: (id, subject, body) => post(`/data-manager/${id}/send-email`, { subject, body }),
    sendWhatsapp: (id) => post(`/data-manager/${id}/send-whatsapp`),
    archive: (id, reason) => post(`/data-manager/${id}/archive`, { reason }),
    convertToLead: (id) => post(`/data-manager/${id}/convert-to-lead`),
    settings: () => get("/data-manager/settings"),
    updateSettings: (payload) => patch("/data-manager/settings", payload),
    exportData: (scope, format) => get(`/data-manager/export?scope=${encodeURIComponent(scope)}&format=${format}`),
    exportHistory: () => get("/data-manager/export-history"),
  },
  services: {
    list: () => get("/services"),
    add: (name) => post("/services", { name }),
    remove: (name) => del(`/services/${encodeURIComponent(name)}`),
  },
  quotationTemplates: {
    list: () => get("/quotation-templates"),
    update: (service, feeType, payload) => request("PUT", `/quotation-templates/${encodeURIComponent(service)}/${encodeURIComponent(feeType)}`, payload),
  },
  checklistTemplates: {
    list: () => get("/checklist-templates"),
    update: (service, steps) => request("PUT", `/checklist-templates/${encodeURIComponent(service)}`, { steps }),
  },
};

export { ApiError };
