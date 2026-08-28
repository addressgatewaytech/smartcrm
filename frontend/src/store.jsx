import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api";
import {
  mapUser, mapLead, mapDeal, mapQuotation, mapCustomer, mapSalesOrder, mapInvoice, mapJobCard,
  mapNotification, mapDataRecord, mapDataSettings, mapDataActivity, mapExportHistoryEntry, mapSubscriptionPlans,
  mapSubscription, mapQuotationTemplates, mapIncentiveRule, mapLeaveRequest, mapPunchRequest, mapAttendance,
  mapAppSettings, mapTask, mapTodo, mapTaskTemplate, mapSalesTaskDef, mapSalesTaskLog, mapItemCatalogEntry,
  mapCheque, mapCompanySoftwareSubscription,
} from "./mappers";

const emptyState = () => ({
  services: [], itemCatalog: [], serviceCosts: {}, employees: [], leads: [], deals: [], quotations: [], customers: [],
  salesOrders: [], invoices: [], jobCards: [], tasks: [], todos: [], notifications: [], quotationTemplates: {},
  taskTemplates: [], salesTaskDefs: [], salesTaskLogs: [],
  checklistTemplates: {}, incentiveRules: [], leaveRequests: [], punchRequests: [],
  subscriptionPlans: {}, subscriptions: [], cheques: [], companySoftwareSubscriptions: [],
  dataRecords: [], dataExportHistory: [], dataUserActivity: [],
  dataSettings: { dailyEmailTarget: 10, dailyWhatsappTarget: 10, dailyCallTarget: 10, emailIntervalMinutes: 5, whatsappIntervalMinutes: 10, recyclingEnabled: true, recyclingDays: 30, emailTemplate: { subject: "", body: "" }, whatsappTemplate: { body: "" } },
  appSettings: { emailNotificationsEnabled: true },
  approvalTypes: [],
  activity: [],
  // The logged-in user's own Module Access grid — {[moduleKey]: {canView,canAdd,canEdit,canDelete}}
  // — drives sidebar nav visibility. Admin-tier users never consult this (they always see
  // everything); see visibleNav in App.jsx.
  myModulePermissions: {},
});

export function useApiStore(enabled) {
  const [state, setState] = useState(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadedOnce = useRef(false);

  const refresh = useCallback(async (keys) => {
    const tasks = {
      services: async () => ({ services: await api.services.list() }),
      itemCatalog: async () => ({ itemCatalog: (await api.itemCatalog.list()).map(mapItemCatalogEntry) }),
      serviceCosts: async () => ({ serviceCosts: await api.serviceCosts.list() }),
      employees: async () => ({ employees: (await api.users.list()).map(mapUser) }),
      leads: async () => ({ leads: (await api.leads.list()).map(mapLead) }),
      deals: async () => ({ deals: (await api.deals.list()).map(mapDeal) }),
      quotations: async () => ({ quotations: (await api.quotations.list()).map(mapQuotation) }),
      customers: async () => ({ customers: (await api.customers.list()).map(mapCustomer) }),
      salesOrders: async () => ({ salesOrders: (await api.salesOrders.list()).map(mapSalesOrder) }),
      invoices: async () => ({ invoices: (await api.invoices.list()).map(mapInvoice) }),
      jobCards: async () => ({ jobCards: (await api.jobCards.list()).map(mapJobCard) }),
      tasks: async () => ({ tasks: (await api.tasks.list()).map(mapTask) }),
      todos: async () => ({ todos: (await api.todos.list()).map(mapTodo) }),
      taskTemplates: async () => ({ taskTemplates: (await api.taskTemplates.list()).map(mapTaskTemplate) }),
      salesTaskDefs: async () => ({ salesTaskDefs: (await api.salesTasks.definitions()).map(mapSalesTaskDef) }),
      salesTaskLogs: async () => ({ salesTaskLogs: (await api.salesTasks.logs()).map(mapSalesTaskLog) }),
      notifications: async () => ({ notifications: (await api.notifications.list()).map(mapNotification) }),
      quotationTemplates: async () => ({ quotationTemplates: mapQuotationTemplates(await api.quotationTemplates.list()) }),
      checklistTemplates: async () => ({ checklistTemplates: await api.checklistTemplates.list() }),
      incentiveRules: async () => ({ incentiveRules: (await api.incentives.rules()).map(mapIncentiveRule) }),
      leaveRequests: async () => ({ leaveRequests: (await api.hr.leaveRequests()).map(mapLeaveRequest) }),
      punchRequests: async () => ({ punchRequests: (await api.hr.punchRequests()).map(mapPunchRequest) }),
      subscriptionPlans: async () => ({ subscriptionPlans: mapSubscriptionPlans(await api.subscriptions.plans()) }),
      cheques: async () => ({ cheques: (await api.companyFinance.cheques()).map(mapCheque) }),
      companySoftwareSubscriptions: async () => ({ companySoftwareSubscriptions: (await api.companyFinance.softwareSubscriptions()).map(mapCompanySoftwareSubscription) }),
      subscriptions: async () => ({ subscriptions: (await api.subscriptions.list()).map(mapSubscription) }),
      dataRecords: async () => ({ dataRecords: (await api.dataManager.list()).map(mapDataRecord) }),
      dataExportHistory: async () => ({ dataExportHistory: (await api.dataManager.exportHistory()).map(mapExportHistoryEntry) }),
      dataSettings: async () => ({ dataSettings: mapDataSettings(await api.dataManager.settings()) }),
      dataUserActivity: async () => ({ dataUserActivity: (await api.dataManager.activity()).map(mapDataActivity) }),
      appSettings: async () => ({ appSettings: mapAppSettings(await api.settings.get()) }),
      approvalTypes: async () => ({ approvalTypes: await api.approvalWorkflow.types() }),
      myModulePermissions: async () => ({ myModulePermissions: await api.users.myPermissions() }),
    };
    const list = keys || Object.keys(tasks);
    // allSettled, not all — some tasks (e.g. Data Manager export history) are admin/data_manager-only
    // and 403 for every other role. With Promise.all, that one rejection used to blow up the whole
    // batch and leave every role except admin looking at a completely empty app (no leads, no deals,
    // nothing), since setState was only ever reached after every promise resolved.
    const settled = await Promise.allSettled(list.map((k) => tasks[k]()));
    const results = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
    settled.forEach((r, i) => { if (r.status === "rejected") console.error(`Failed to load "${list[i]}":`, r.reason); });
    if (results.length) setState((s) => Object.assign({ ...s }, ...results));
  }, []);

  // Attendance is per-employee (no "all attendance" endpoint) — fetch once per employee for
  // a wide date range and merge onto state.employees[].attendance.
  const refreshAttendance = useCallback(async (employees) => {
    const from = "2000-01-01", to = "2100-01-01";
    const withAtt = await Promise.all(employees.map(async (e) => ({ id: e.id, attendance: (await api.hr.attendanceFor(e.id, from, to)).map(mapAttendance) })));
    setState((s) => ({ ...s, employees: s.employees.map((e) => { const found = withAtt.find((w) => w.id === e.id); return found ? { ...e, attendance: found.attendance } : e; }) }));
  }, []);

  useEffect(() => {
    if (!enabled || loadedOnce.current) return;
    loadedOnce.current = true;
    (async () => {
      setLoading(true);
      try {
        await refresh();
        setState((s) => { refreshAttendance(s.employees); return s; });
      } catch (e) {
        setError(e.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    })();
  }, [enabled, refresh, refreshAttendance]);

  // Notifications are the one thing another user's action can create without this session doing
  // anything itself (a job card needing approval, a lead assigned, ...), so unlike everything else
  // here (which only refreshes after a dispatch), this polls on a plain timer — the bell badge and
  // any desktop/mobile notification triggered off it (see notifyNewItems in App.jsx) would
  // otherwise only ever update after this tab's own next unrelated action.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => { refresh(["notifications"]).catch(() => {}); }, 45000);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  const dispatch = useCallback(async (action) => {
    switch (action.type) {
      // --- Data Manager --------------------------------------------------------------------
      case "ADD_DATA_RECORD": await api.dataManager.create(action.payload); return refresh(["dataRecords"]);
      case "IMPORT_DATA_RECORDS": {
        const result = await api.dataManager.import(action.file, action.dataCategory, action.datasetName, action.assignTo);
        await refresh(["dataRecords"]);
        return result;
      }
      case "UPDATE_DATA_RECORD": /* no generic PATCH — use the specific action endpoints (assign/archive/etc.) */ return;
      case "DELETE_DATA_RECORD": return; // archiving (MARK_DATA_INVALID) is the supported "remove" path, matching the spec
      case "ASSIGN_DATA_RECORD": await api.dataManager.assign(action.id, action.userId); return refresh(["dataRecords"]);
      case "SEND_DATA_EMAIL": await api.dataManager.sendEmail(action.id); return refresh(["dataRecords", "dataUserActivity"]);
      case "SEND_DATA_WHATSAPP": await api.dataManager.sendWhatsapp(action.id); return refresh(["dataRecords", "dataUserActivity"]);
      case "COMPLETE_DATA_CALL": await api.dataManager.completeCall(action.id); return refresh(["dataRecords", "dataUserActivity"]);
      case "MARK_DATA_INVALID": await api.dataManager.archive(action.id, action.reason); return refresh(["dataRecords"]);
      case "CONVERT_DATA_TO_LEAD": await api.dataManager.convertToLead(action.id); return refresh(["dataRecords", "leads"]);
      case "LOG_DATA_EXPORT": return refresh(["dataExportHistory"]); // GET /export already logs server-side
      case "UPDATE_DATA_SETTINGS": await api.dataManager.updateSettings(action.payload); return refresh(["dataSettings"]);
      case "UPDATE_APP_SETTINGS": await api.settings.update(action.payload); return refresh(["appSettings"]);

      // --- Leads ----------------------------------------------------------------------------
      case "ADD_LEAD": { const r = await api.leads.create(action.payload); await refresh(["leads", "notifications", "customers"]); return r; }
      case "SET_LEAD_STATUS": await api.leads.update(action.id, { status: action.status }); return refresh(["leads"]);
      case "LOG_FOLLOWUP": await api.leads.followUp(action.id, { note: action.note, status: action.status, nextFollowUp: action.nextFollowUp }); return refresh(["leads"]);
      case "UPDATE_LEAD": await api.leads.update(action.id, action.payload); return refresh(["leads"]);
      case "DELETE_LEAD": await api.leads.remove(action.id); return refresh(["leads"]);
      case "CONVERT_LEAD_TO_DEAL": await api.leads.convertToDeal(action.id); return refresh(["leads", "deals"]);
      case "ASSIGN_LEAD": await api.leads.assign(action.id, action.userId); return refresh(["leads", "notifications"]);

      // --- Deals ----------------------------------------------------------------------------
      case "ADD_DEAL": { const r = await api.deals.create(action.payload); await refresh(["deals"]); return r; }
      case "UPDATE_DEAL": await api.deals.update(action.id, action.payload); return refresh(["deals"]);
      case "DELETE_DEAL": await api.deals.remove(action.id); return refresh(["deals"]);

      // --- Quotations -------------------------------------------------------------------------
      case "CREATE_QUOTATION": { const r = await api.quotations.create(action.payload); await refresh(["quotations", "deals"]); return r; }
      case "SUBMIT_QUOTATION_FOR_APPROVAL": await api.quotations.submitForApproval(action.id); return refresh(["quotations"]);
      case "CLONE_QUOTATION": await api.quotations.clone(action.id, action.customer); return refresh(["quotations"]);
      case "REVISE_QUOTATION": await api.quotations.revise(action.id); return refresh(["quotations", "deals"]);
      case "TOGGLE_QUOTATION_FAVORITE": await api.quotations.toggleFavorite(action.id); return refresh(["quotations"]);
      case "SET_QUOTATION_OWNER": await api.quotations.setOwner(action.id, action.owner); return refresh(["quotations"]);
      case "UPDATE_QUOTATION": await api.quotations.update(action.id, action.payload); return refresh(["quotations"]);
      case "DELETE_QUOTATION": await api.quotations.remove(action.id); return refresh(["quotations"]);
      case "UPDATE_QUOTATION_TEMPLATE": await api.quotationTemplates.update(action.service, action); return refresh(["quotationTemplates"]);
      case "DELETE_QUOTATION_TEMPLATE": await api.quotationTemplates.remove(action.service); return refresh(["quotationTemplates"]);
      case "APPROVE_QUOTATION_DISCOUNT": await api.quotations.approveDiscount(action.id); return refresh(["quotations"]);
      case "SEND_QUOTATION": await api.quotations.setStatus(action.id, "Sent"); return refresh(["quotations"]);
      case "SET_QUOTATION_STATUS": await api.quotations.setStatus(action.id, action.status); return refresh(["quotations", "deals"]);

      // --- Employee photo -----------------------------------------------------------------
      case "SET_EMPLOYEE_PHOTO": await api.users.uploadPhoto(action.employeeId, action.file); return refresh(["employees"]);

      // --- Services ----------------------------------------------------------------------
      case "ADD_SERVICE_OPTION": await api.services.add(action.name); return refresh(["services", "checklistTemplates", "quotationTemplates"]);
      case "REMOVE_SERVICE_OPTION": await api.services.remove(action.name); return refresh(["services"]);

      // --- Item catalog (reusable quotation line items) -----------------------------------
      case "ADD_ITEM_CATALOG_ENTRY": await api.itemCatalog.create(action.payload); return refresh(["itemCatalog"]);
      case "UPDATE_ITEM_CATALOG_ENTRY": await api.itemCatalog.update(action.id, action.payload); return refresh(["itemCatalog"]);
      case "REMOVE_ITEM_CATALOG_ENTRY": await api.itemCatalog.remove(action.id); return refresh(["itemCatalog"]);
      case "UPDATE_SERVICE_COST": await api.serviceCosts.update(action.service, action.cost); return refresh(["serviceCosts"]);
      // Saves another user's Module Access grid (admin-only, Users & Roles > Module Access) — not
      // the caller's own, so no local state to refresh; the admin UI re-fetches that user's grid
      // itself after saving.
      case "SET_USER_MODULE_PERMISSIONS": return api.users.setPermissions(action.userId, action.grid);

      // --- Customers -----------------------------------------------------------------------
      case "ADD_CUSTOMER": await api.customers.create(action.payload); return refresh(["customers"]);
      case "UPDATE_CUSTOMER": await api.customers.update(action.id, action.payload); return refresh(["customers"]);
      case "DELETE_CUSTOMER": await api.customers.remove(action.id); return refresh(["customers"]);
      // A merge can move records across every one of these — refresh them all rather than
      // trying to guess which ones the merged-away customer actually had anything in.
      case "MERGE_CUSTOMERS": await api.customers.merge(action.targetId, action.sourceId); return refresh(["customers", "leads", "deals", "quotations", "salesOrders", "invoices", "jobCards", "subscriptions"]);

      // --- Subscriptions -------------------------------------------------------------------
      case "ADD_SUBSCRIPTION": await api.subscriptions.create(action.payload); return refresh(["subscriptions", "invoices"]);
      case "UPDATE_SUBSCRIPTION": await api.subscriptions.update(action.id, action.payload); return refresh(["subscriptions"]);
      case "DELETE_SUBSCRIPTION": await api.subscriptions.remove(action.id); return refresh(["subscriptions"]);
      case "LOG_SUBSCRIPTION_USAGE": await api.subscriptions.logUsage(action.id, action.field, action.amount); return refresh(["subscriptions"]);
      case "RENEW_SUBSCRIPTION": await api.subscriptions.renew(action.id, action.startDate, action.alsoInvoice); return refresh(["subscriptions", "invoices"]);
      case "UPDATE_PLAN_TIER": await api.subscriptions.updateTier(action.plan, action.tierName, action.payload); return refresh(["subscriptionPlans"]);
      case "ADD_SUBSCRIPTION_PLAN": await api.subscriptions.addPlan(action.name, action.description); return refresh(["subscriptionPlans"]);
      case "UPDATE_SUBSCRIPTION_PLAN_META": await api.subscriptions.updatePlanMeta?.(action.plan, action.payload); return refresh(["subscriptionPlans"]);
      case "DELETE_SUBSCRIPTION_PLAN": await api.subscriptions.removePlan(action.name); return refresh(["subscriptionPlans"]);
      case "ADD_PLAN_TIER": await api.subscriptions.addTier(action.plan, action.tierName); return refresh(["subscriptionPlans"]);
      case "DELETE_PLAN_TIER": await api.subscriptions.removeTier?.(action.plan, action.tierName); return refresh(["subscriptionPlans"]);

      // --- Company Finance (cheques + internal software subscriptions) ---------------------
      case "ADD_CHEQUE": await api.companyFinance.addCheque(action.payload); return refresh(["cheques"]);
      // Marking an Incoming cheque "Cleared" also records an invoice payment server-side (see
      // companyFinance.routes.js) — refresh invoices too so the balance shown elsewhere updates.
      case "UPDATE_CHEQUE": await api.companyFinance.updateCheque(action.id, action.payload); return refresh(["cheques", "invoices"]);
      case "DELETE_CHEQUE": await api.companyFinance.removeCheque(action.id); return refresh(["cheques"]);
      case "ADD_SOFTWARE_SUBSCRIPTION": await api.companyFinance.addSoftwareSubscription(action.payload); return refresh(["companySoftwareSubscriptions"]);
      case "UPDATE_SOFTWARE_SUBSCRIPTION": await api.companyFinance.updateSoftwareSubscription(action.id, action.payload); return refresh(["companySoftwareSubscriptions"]);
      case "DELETE_SOFTWARE_SUBSCRIPTION": await api.companyFinance.removeSoftwareSubscription(action.id); return refresh(["companySoftwareSubscriptions"]);

      // --- KYC docs --------------------------------------------------------------------------
      case "ADD_KYC_DOC": await api.customers.addDoc(action.customerId, action.doc); return refresh(["customers"]);
      case "ADD_CUSTOMER_EMPLOYEE": await api.customers.addEmployee(action.customerId, action.employee); return refresh(["customers"]);
      case "UPDATE_CUSTOMER_EMPLOYEE": await api.customers.updateEmployee?.(action.customerId, action.employeeId, action.payload); return refresh(["customers"]);
      case "DELETE_CUSTOMER_EMPLOYEE": await api.customers.removeEmployee(action.customerId, action.employeeId); return refresh(["customers"]);
      case "ADD_CUSTOMER_EMPLOYEE_DOC": await api.customers.addEmployeeDoc(action.customerId, action.employeeId, action.doc); return refresh(["customers"]);
      case "UPDATE_CUSTOMER_EMPLOYEE_DOC": await api.customers.updateEmployeeDoc?.(action.customerId, action.employeeId, action.docId, action.payload); return refresh(["customers"]);
      case "DELETE_CUSTOMER_EMPLOYEE_DOC": await api.customers.removeEmployeeDoc?.(action.customerId, action.employeeId, action.docId); return refresh(["customers"]);
      case "SET_DOC_CLOUD_LINK": await api.customers.updateDoc(action.customerId, action.docId, { cloudLink: action.url }); return refresh(["customers"]);
      case "SET_CUSTOMER_CLOUD_LINK": await api.customers.setCloudLink(action.id, action.url); return refresh(["customers"]);
      case "UPDATE_KYC_DOC": await api.customers.updateDoc(action.customerId, action.docId, action.payload); return refresh(["customers"]);
      case "DELETE_KYC_DOC": await api.customers.removeDoc(action.customerId, action.docId); return refresh(["customers"]);
      case "SET_EMPLOYEE_DOC_CLOUD_LINK": await api.customers.updateEmployeeDoc?.(action.customerId, action.employeeId, action.docId, { cloudLink: action.url }); return refresh(["customers"]);

      // --- Sales pipeline ----------------------------------------------------------------
      case "CONVERT_TO_SALES_ORDER": { const r = await api.quotations.convertToSalesOrder(action.quotationId); await refresh(["quotations", "salesOrders", "deals", "customers"]); return r; }
      case "GENERATE_INVOICE": return; // superseded — GENERATE_INVOICE + ONBOARD_CLIENT are one atomic /onboard call on this backend
      case "ONBOARD_CLIENT": { const r = await api.salesOrders.onboard(action.salesOrderId); await refresh(["salesOrders", "invoices", "jobCards", "notifications"]); return r; }
      case "UPDATE_SALES_ORDER": await api.salesOrders.update(action.id, action.payload); return refresh(["salesOrders"]);
      case "DELETE_SALES_ORDER": await api.salesOrders.remove(action.id); return refresh(["salesOrders"]);
      case "RECORD_PAYMENT": await api.invoices.recordPayment(action.invoiceId, action.amount, action.mode, action.paidAt); return refresh(["invoices"]);
      case "REMOVE_PAYMENT": await api.invoices.removePayment(action.invoiceId, action.paymentId); return refresh(["invoices"]);
      case "UPDATE_INVOICE": await api.invoices.update(action.id, action.payload); return refresh(["invoices"]);
      case "DELETE_INVOICE": await api.invoices.remove(action.id); return refresh(["invoices"]);

      // --- Job cards --------------------------------------------------------------------
      case "CREATE_DIRECT_JOB_CARD": await api.jobCards.createDirect(action); return refresh(["jobCards", "notifications"]);
      case "APPROVE_JOB_CARD": await api.jobCards.approve(action.id); return refresh(["jobCards"]);
      case "REJECT_JOB_CARD": await api.jobCards.reject(action.id, action.reason); return refresh(["jobCards"]);
      case "ASSIGN_JOB": await api.jobCards.assign(action.id, action.assignees); return refresh(["jobCards", "notifications"]);
      case "TOGGLE_CHECKLIST_ITEM": await api.jobCards.toggleChecklistItem(action.jobId, action.itemId); return refresh(["jobCards"]);
      case "ADD_JOB_CHECKLIST_ITEM": await api.jobCards.addChecklistItem(action.jobId, action.label); return refresh(["jobCards"]);
      case "REMOVE_JOB_CHECKLIST_ITEM": await api.jobCards.removeChecklistItem(action.jobId, action.itemId); return refresh(["jobCards"]);
      case "ADD_JOB_COMMENT": await api.jobCards.addComment(action.id, action.note); return refresh(["jobCards"]);
      case "UPDATE_JOB_CARD": await api.jobCards.update(action.id, action.payload); return refresh(["jobCards"]);
      case "SET_JOB_STATUS": await api.jobCards.setStatus(action.id, action.status, action.reason); return refresh(["jobCards", "notifications"]);
      case "DELETE_JOB_CARD": await api.jobCards.remove(action.id); return refresh(["jobCards"]);

      // --- Tasks -----------------------------------------------------------------------
      case "CREATE_TASK": await api.tasks.create(action.payload); return refresh(["tasks", "notifications"]);
      case "UPDATE_TASK": await api.tasks.update(action.id, action.payload); return refresh(["tasks"]);
      case "ACCEPT_TASK": await api.tasks.accept(action.id); return refresh(["tasks"]);
      case "PROGRESS_TASK": await api.tasks.progress(action.id, action.progressPct, action.note); return refresh(["tasks"]);
      case "SUBMIT_TASK_FOR_APPROVAL": await api.tasks.submitForApproval(action.id); return refresh(["tasks", "notifications"]);
      case "APPROVE_TASK": await api.tasks.approve(action.id); return refresh(["tasks"]);
      case "REJECT_TASK": await api.tasks.reject(action.id, action.reason); return refresh(["tasks"]);
      case "DELETE_TASK": await api.tasks.remove(action.id); return refresh(["tasks"]);
      case "SET_CONTENT_STAGE_TARGET": await api.tasks.setContentStageTarget(action.id, action.stageIndex, action.targetDate); return refresh(["tasks"]);
      case "ADVANCE_CONTENT_STAGE": await api.tasks.advanceContentStage(action.id); return refresh(["tasks"]);
      case "ADMIN_OVERRIDE_CONTENT_STAGE": await api.tasks.adminOverrideContentStage(action.id, action.stageIndex, action.completedAt); return refresh(["tasks"]);
      case "ADD_TASK_COMMENT": await api.tasks.addComment(action.id, action.note); return refresh(["tasks"]);

      // --- Task Templates ------------------------------------------------------------------
      case "CREATE_TASK_TEMPLATE": await api.taskTemplates.create(action.payload); return refresh(["taskTemplates"]);
      case "UPDATE_TASK_TEMPLATE": await api.taskTemplates.update(action.id, action.payload); return refresh(["taskTemplates"]);
      case "DELETE_TASK_TEMPLATE": await api.taskTemplates.remove(action.id); return refresh(["taskTemplates"]);

      // --- Sales Daily Tasks -----------------------------------------------------------------
      case "UPDATE_SALES_TASK_TARGET": await api.salesTasks.updateTarget(action.id, action.target); return refresh(["salesTaskDefs"]);
      case "REMOVE_SALES_TASK_DEF": await api.salesTasks.removeDefinition(action.id); return refresh(["salesTaskDefs", "salesTaskLogs"]);
      case "INCREMENT_SALES_TASK": await api.salesTasks.increment(action.taskDefId, action.delta); return refresh(["salesTaskLogs"]);
      case "SET_SALES_TASK_COUNT": await api.salesTasks.setCount(action.taskDefId, action.count); return refresh(["salesTaskLogs"]);

      // --- My To-Do List -----------------------------------------------------------------
      case "CREATE_TODO": await api.todos.create(action.payload); return refresh(["todos"]);
      case "UPDATE_TODO": await api.todos.update(action.id, action.payload); return refresh(["todos"]);
      case "TOGGLE_TODO": await api.todos.update(action.id, { done: action.done }); return refresh(["todos"]);
      case "DELETE_TODO": await api.todos.remove(action.id); return refresh(["todos"]);

      // --- Notifications -------------------------------------------------------------------
      case "MARK_NOTIF_READ": await api.notifications.markRead(action.id); return refresh(["notifications"]);
      case "MARK_ALL_READ": await api.notifications.markAllRead(); return refresh(["notifications"]);
      case "MARK_NOTIF_EMAILED": await api.notifications.email(action.id, action.to, action.subject, action.body); return refresh(["notifications"]);
      case "MARK_EMAILED":
        if (action.entity === "quotation") await api.quotations.markEmailed(action.id, action.cc);
        if (action.entity === "invoice") await api.invoices.markEmailed(action.id, action.cc);
        return refresh(action.entity === "quotation" ? ["quotations"] : ["invoices"]);

      // --- Users & roles --------------------------------------------------------------------
      case "ADD_USER": await api.users.create(action.payload); return refresh(["employees"]);
      case "TOGGLE_USER_ACTIVE": await api.users.toggleActive(action.id); return refresh(["employees"]);
      case "UPDATE_USER": await api.users.update(action.id, action.payload); return refresh(["employees"]);
      case "RESET_USER_PASSWORD": return api.users.resetPassword(action.id, action.password);
      case "DELETE_USER": await api.users.remove(action.id); return refresh(["employees"]);
      case "SET_APPROVAL_TYPE_APPROVERS": await api.approvalWorkflow.setTypeApprovers(action.key, action.approverDesignations); return refresh(["approvalTypes"]);

      // --- Incentives -----------------------------------------------------------------------
      case "UPDATE_INCENTIVE_RULE": await api.incentives.updateRule(action.id, action.payload); return refresh(["incentiveRules"]);
      case "ADD_INCENTIVE_RULE": await api.incentives.addRule(action.payload); return refresh(["incentiveRules"]);
      case "DELETE_INCENTIVE_RULE": await api.incentives.removeRule(action.id); return refresh(["incentiveRules"]);

      // --- Checklist templates --------------------------------------------------------------
      case "UPDATE_CHECKLIST_TEMPLATE": await api.checklistTemplates.update(action.service, action.steps); return refresh(["checklistTemplates"]);

      // --- Staff docs -------------------------------------------------------------------------
      case "ADD_EMPLOYEE_DOC": await api.users.addDoc?.(action.employeeId, action.doc); return refresh(["employees"]);
      case "UPDATE_EMPLOYEE_DOC": await api.users.updateDoc?.(action.employeeId, action.docId, action.payload); return refresh(["employees"]);
      case "DELETE_EMPLOYEE_DOC": await api.users.removeDoc?.(action.employeeId, action.docId); return refresh(["employees"]);
      case "SET_STAFF_DOC_CLOUD_LINK": await api.users.updateDoc?.(action.employeeId, action.docId, { cloudLink: action.url }); return refresh(["employees"]);
      case "SET_USER_CLOUD_LINK": await api.users.setCloudLink(action.employeeId, action.url); return refresh(["employees"]);

      // --- Attendance / leave / punch ---------------------------------------------------------
      case "MARK_ATTENDANCE": {
        await api.hr.markAttendance(action.employeeId, action.date, action.status);
        const att = (await api.hr.attendanceFor(action.employeeId, "2000-01-01", "2100-01-01")).map(mapAttendance);
        setState((s) => ({ ...s, employees: s.employees.map((e) => (e.id === action.employeeId ? { ...e, attendance: att } : e)) }));
        return;
      }
      case "ADD_LEAVE_REQUEST": await api.hr.requestLeave(action.payload); return refresh(["leaveRequests", "notifications"]);
      case "UPDATE_LEAVE_STATUS": await api.hr.decideLeave(action.id, action.status); return refresh(["leaveRequests"]);
      case "DELETE_LEAVE_REQUEST": await api.hr.removeLeave(action.id); return refresh(["leaveRequests"]);
      case "ADD_PUNCH_REQUEST": await api.hr.requestPunch(action.payload); return refresh(["punchRequests", "notifications"]);
      case "UPDATE_PUNCH_REQUEST_STATUS": {
        await api.hr.decidePunch(action.id, action.status);
        await refresh(["punchRequests"]);
        if (action.status === "Approved") {
          const req = state.punchRequests.find((r) => r.id === action.id);
          if (req) { const att = (await api.hr.attendanceFor(req.employeeId, "2000-01-01", "2100-01-01")).map(mapAttendance); setState((s) => ({ ...s, employees: s.employees.map((e) => (e.id === req.employeeId ? { ...e, attendance: att } : e)) })); }
        }
        return;
      }
      case "DELETE_PUNCH_REQUEST": await api.hr.removePunch(action.id); return refresh(["punchRequests"]);

      default: return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, state.punchRequests]);

  return { state, dispatch, loading, error, refresh };
}
