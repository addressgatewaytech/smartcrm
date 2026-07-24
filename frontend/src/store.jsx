import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api";
import {
  mapUser, mapLead, mapDeal, mapQuotation, mapCustomer, mapSalesOrder, mapInvoice, mapJobCard,
  mapNotification, mapDataRecord, mapDataSettings, mapExportHistoryEntry, mapSubscriptionPlans,
  mapSubscription, mapQuotationTemplates, mapIncentiveRule, mapLeaveRequest, mapPunchRequest, mapAttendance,
  mapAppSettings,
} from "./mappers";

const emptyState = () => ({
  services: [], employees: [], leads: [], deals: [], quotations: [], customers: [],
  salesOrders: [], invoices: [], jobCards: [], notifications: [], quotationTemplates: {},
  checklistTemplates: {}, incentiveRules: [], leaveRequests: [], punchRequests: [],
  subscriptionPlans: {}, subscriptions: [], dataRecords: [], dataExportHistory: [],
  dataSettings: { dailyEmailTarget: 25, dailyWhatsappTarget: 25, emailIntervalMinutes: 5, whatsappIntervalMinutes: 10, recyclingEnabled: true, recyclingDays: 30, emailTemplate: { subject: "", body: "" }, whatsappTemplate: { body: "" } },
  appSettings: { emailNotificationsEnabled: true },
  activity: [],
});

// Real backend equivalent of the prototype's ID-generated notification/activity pushes —
// server already creates these; this is just for local optimistic activity-log lines the
// server doesn't track anywhere (e.g. no dedicated activity_log read endpoint is wired here yet).
function pushLocalActivity(setState, text) {
  setState((s) => ({ ...s, activity: [{ id: "AC-" + Date.now(), text, at: new Date().toISOString().slice(0, 10) }, ...s.activity].slice(0, 30) }));
}

export function useApiStore(enabled) {
  const [state, setState] = useState(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadedOnce = useRef(false);

  const refresh = useCallback(async (keys) => {
    const tasks = {
      services: async () => ({ services: await api.services.list() }),
      employees: async () => ({ employees: (await api.users.list()).map(mapUser) }),
      leads: async () => ({ leads: (await api.leads.list()).map(mapLead) }),
      deals: async () => ({ deals: (await api.deals.list()).map(mapDeal) }),
      quotations: async () => ({ quotations: (await api.quotations.list()).map(mapQuotation) }),
      customers: async () => ({ customers: (await api.customers.list()).map(mapCustomer) }),
      salesOrders: async () => ({ salesOrders: (await api.salesOrders.list()).map(mapSalesOrder) }),
      invoices: async () => ({ invoices: (await api.invoices.list()).map(mapInvoice) }),
      jobCards: async () => ({ jobCards: (await api.jobCards.list()).map(mapJobCard) }),
      notifications: async () => ({ notifications: (await api.notifications.list()).map(mapNotification) }),
      quotationTemplates: async () => ({ quotationTemplates: mapQuotationTemplates(await api.quotationTemplates.list()) }),
      checklistTemplates: async () => ({ checklistTemplates: await api.checklistTemplates.list() }),
      incentiveRules: async () => ({ incentiveRules: (await api.incentives.rules()).map(mapIncentiveRule) }),
      leaveRequests: async () => ({ leaveRequests: (await api.hr.leaveRequests()).map(mapLeaveRequest) }),
      punchRequests: async () => ({ punchRequests: (await api.hr.punchRequests()).map(mapPunchRequest) }),
      subscriptionPlans: async () => ({ subscriptionPlans: mapSubscriptionPlans(await api.subscriptions.plans()) }),
      subscriptions: async () => ({ subscriptions: (await api.subscriptions.list()).map(mapSubscription) }),
      dataRecords: async () => ({ dataRecords: (await api.dataManager.list()).map(mapDataRecord) }),
      dataExportHistory: async () => ({ dataExportHistory: (await api.dataManager.exportHistory()).map(mapExportHistoryEntry) }),
      dataSettings: async () => ({ dataSettings: mapDataSettings(await api.dataManager.settings()) }),
      appSettings: async () => ({ appSettings: mapAppSettings(await api.settings.get()) }),
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

  const dispatch = useCallback(async (action) => {
    switch (action.type) {
      // --- Data Manager --------------------------------------------------------------------
      case "ADD_DATA_RECORD": await api.dataManager.create(action.payload); return refresh(["dataRecords"]);
      case "UPDATE_DATA_RECORD": /* no generic PATCH — use the specific action endpoints (assign/archive/etc.) */ return;
      case "DELETE_DATA_RECORD": return; // archiving (MARK_DATA_INVALID) is the supported "remove" path, matching the spec
      case "ASSIGN_DATA_RECORD": await api.dataManager.assign(action.id, action.userId); return refresh(["dataRecords"]);
      case "AUTO_ASSIGN_DAILY": { const r = await api.dataManager.autoAssign(); await refresh(["dataRecords"]); pushLocalActivity(setState, `Daily auto-assignment run — ${r.assigned} record(s) distributed`); return; }
      case "SEND_DATA_EMAIL": await api.dataManager.sendEmail(action.id); return refresh(["dataRecords", "employees"]);
      case "SEND_DATA_WHATSAPP": await api.dataManager.sendWhatsapp(action.id); return refresh(["dataRecords", "employees"]);
      case "MARK_DATA_INVALID": await api.dataManager.archive(action.id, action.reason); return refresh(["dataRecords"]);
      case "CONVERT_DATA_TO_LEAD": await api.dataManager.convertToLead(action.id); return refresh(["dataRecords", "leads"]);
      case "RUN_DATA_RECYCLING": { const r = await api.dataManager.recycle(); await refresh(["dataRecords"]); pushLocalActivity(setState, `Data recycling run — ${r.recycled} record(s) recycled`); return; }
      case "RETURN_UNUSED_COMPANY_DATA": { const r = await api.dataManager.endOfDayReturn(); await refresh(["dataRecords"]); pushLocalActivity(setState, `End-of-day return — ${r.returned} unused Company Data record(s) returned`); return; }
      case "LOG_DATA_EXPORT": return refresh(["dataExportHistory"]); // GET /export already logs server-side
      case "UPDATE_DATA_SETTINGS": await api.dataManager.updateSettings(action.payload); return refresh(["dataSettings"]);
      case "UPDATE_APP_SETTINGS": await api.settings.update(action.payload); return refresh(["appSettings"]);

      // --- Leads ----------------------------------------------------------------------------
      case "ADD_LEAD": { const r = await api.leads.create(action.payload); await refresh(["leads", "notifications", "customers"]); return r; }
      case "SET_LEAD_STATUS": await api.leads.update(action.id, { status: action.status }); return refresh(["leads"]);
      case "LOG_FOLLOWUP": await api.leads.followUp(action.id, { note: action.note, status: action.status, nextFollowUp: action.nextFollowUp }); return refresh(["leads"]);
      case "UPDATE_LEAD": await api.leads.update(action.id, action.payload); return refresh(["leads"]);
      case "DELETE_LEAD": await api.leads.remove(action.id); return refresh(["leads"]);
      case "CONVERT_LEAD_TO_DEAL": await api.leads.convertToDeal(action.id, action.value); return refresh(["leads", "deals"]);

      // --- Deals ----------------------------------------------------------------------------
      case "UPDATE_DEAL": await api.deals.update(action.id, action.payload); return refresh(["deals"]);
      case "DELETE_DEAL": await api.deals.remove(action.id); return refresh(["deals"]);

      // --- Quotations -------------------------------------------------------------------------
      case "CREATE_QUOTATION": await api.quotations.create(action.payload); return refresh(["quotations", "deals"]);
      case "SUBMIT_QUOTATION_FOR_APPROVAL": return; // backend computes Pending Manager Approval automatically on create/update
      case "CLONE_QUOTATION": await api.quotations.clone(action.id, action.customer); return refresh(["quotations"]);
      case "REVISE_QUOTATION": await api.quotations.revise(action.id); return refresh(["quotations", "deals"]);
      case "TOGGLE_QUOTATION_FAVORITE": await api.quotations.toggleFavorite(action.id); return refresh(["quotations"]);
      case "UPDATE_QUOTATION": await api.quotations.update(action.id, action.payload); return refresh(["quotations"]);
      case "DELETE_QUOTATION": await api.quotations.remove(action.id); return refresh(["quotations"]);
      case "UPDATE_QUOTATION_TEMPLATE": await api.quotationTemplates.update(action.service, action.feeType, action); return refresh(["quotationTemplates"]);
      case "APPROVE_QUOTATION_DISCOUNT": await api.quotations.approveDiscount(action.id); return refresh(["quotations"]);
      case "SEND_QUOTATION": await api.quotations.setStatus(action.id, "Sent"); return refresh(["quotations"]);
      case "SET_QUOTATION_STATUS": await api.quotations.setStatus(action.id, action.status); return refresh(["quotations", "deals"]);

      // --- Employee photo -----------------------------------------------------------------
      case "SET_EMPLOYEE_PHOTO": await api.users.uploadPhoto(action.employeeId, action.file); return refresh(["employees"]);

      // --- Services ----------------------------------------------------------------------
      case "ADD_SERVICE_OPTION": await api.services.add(action.name); return refresh(["services", "checklistTemplates", "quotationTemplates"]);
      case "REMOVE_SERVICE_OPTION": await api.services.remove(action.name); return refresh(["services"]);

      // --- Customers -----------------------------------------------------------------------
      case "ADD_CUSTOMER": await api.customers.create(action.payload); return refresh(["customers"]);
      case "UPDATE_CUSTOMER": await api.customers.update(action.id, action.payload); return refresh(["customers"]);
      case "DELETE_CUSTOMER": await api.customers.remove(action.id); return refresh(["customers"]);

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

      // --- KYC docs --------------------------------------------------------------------------
      case "ADD_KYC_DOC": await api.customers.addDoc(action.customerId, action.doc); return refresh(["customers"]);
      case "ADD_CUSTOMER_EMPLOYEE": await api.customers.addEmployee(action.customerId, action.employee); return refresh(["customers"]);
      case "UPDATE_CUSTOMER_EMPLOYEE": await api.customers.updateEmployee?.(action.customerId, action.employeeId, action.payload); return refresh(["customers"]);
      case "DELETE_CUSTOMER_EMPLOYEE": await api.customers.removeEmployee(action.customerId, action.employeeId); return refresh(["customers"]);
      case "ADD_CUSTOMER_EMPLOYEE_DOC": await api.customers.addEmployeeDoc(action.customerId, action.employeeId, action.doc); return refresh(["customers"]);
      case "UPDATE_CUSTOMER_EMPLOYEE_DOC": await api.customers.updateEmployeeDoc?.(action.customerId, action.employeeId, action.docId, action.payload); return refresh(["customers"]);
      case "DELETE_CUSTOMER_EMPLOYEE_DOC": await api.customers.removeEmployeeDoc?.(action.customerId, action.employeeId, action.docId); return refresh(["customers"]);
      case "SET_DOC_CLOUD_LINK": await api.customers.updateDoc(action.customerId, action.docId, { cloudLink: action.url }); return refresh(["customers"]);
      case "UPDATE_KYC_DOC": await api.customers.updateDoc(action.customerId, action.docId, action.payload); return refresh(["customers"]);
      case "DELETE_KYC_DOC": await api.customers.removeDoc(action.customerId, action.docId); return refresh(["customers"]);
      case "SET_EMPLOYEE_DOC_CLOUD_LINK": await api.customers.updateEmployeeDoc?.(action.customerId, action.employeeId, action.docId, { cloudLink: action.url }); return refresh(["customers"]);

      // --- Sales pipeline ----------------------------------------------------------------
      case "CONVERT_TO_SALES_ORDER": await api.quotations.convertToSalesOrder(action.quotationId); return refresh(["quotations", "salesOrders", "deals", "customers"]);
      case "GENERATE_INVOICE": return; // superseded — GENERATE_INVOICE + ONBOARD_CLIENT are one atomic /onboard call on this backend
      case "ONBOARD_CLIENT": await api.salesOrders.onboard(action.salesOrderId); return refresh(["salesOrders", "invoices", "jobCards", "notifications"]);
      case "DELETE_SALES_ORDER": await api.salesOrders.remove(action.id); return refresh(["salesOrders"]);
      case "RECORD_PAYMENT": await api.invoices.recordPayment(action.invoiceId, action.amount, action.mode); return refresh(["invoices"]);
      case "REMOVE_PAYMENT": await api.invoices.removePayment(action.invoiceId, action.paymentId); return refresh(["invoices"]);
      case "DELETE_INVOICE": await api.invoices.remove(action.id); return refresh(["invoices"]);

      // --- Job cards --------------------------------------------------------------------
      case "CREATE_DIRECT_JOB_CARD": await api.jobCards.createDirect(action); return refresh(["jobCards", "notifications"]);
      case "APPROVE_JOB_CARD": await api.jobCards.approve(action.id); return refresh(["jobCards"]);
      case "REJECT_JOB_CARD": await api.jobCards.reject(action.id, action.reason); return refresh(["jobCards"]);
      case "ASSIGN_JOB": await api.jobCards.assign(action.id, action.assignees); return refresh(["jobCards", "notifications"]);
      case "TOGGLE_CHECKLIST_ITEM": await api.jobCards.toggleChecklistItem(action.jobId, action.itemId); return refresh(["jobCards"]);
      case "ADD_JOB_CHECKLIST_ITEM": await api.jobCards.addChecklistItem(action.jobId, action.label); return refresh(["jobCards"]);
      case "REMOVE_JOB_CHECKLIST_ITEM": await api.jobCards.removeChecklistItem(action.jobId, action.itemId); return refresh(["jobCards"]);
      case "UPDATE_JOB_CARD": await api.jobCards.update(action.id, action.payload); return refresh(["jobCards"]);
      case "SET_JOB_STATUS": await api.jobCards.setStatus(action.id, action.status, action.reason); return refresh(["jobCards", "notifications"]);
      case "DELETE_JOB_CARD": await api.jobCards.remove(action.id); return refresh(["jobCards"]);

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
