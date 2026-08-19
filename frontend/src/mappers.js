// Maps backend API responses (snake_case, raw DB shape) to the camelCase shape the
// UI components expect (the shape originally used by the in-memory prototype).

export const mapUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  roles: u.roles,
  dept: u.dept,
  initials: u.initials,
  designation: u.designation,
  category: u.category || "Staff",
  photoUrl: u.photo_url ?? u.photoUrl ?? null,
  leaveBalance: u.leave_balance ?? u.leaveBalance,
  active: !!(u.active ?? true),
  joined: u.joined_date ?? u.joined,
  dateOfBirth: u.date_of_birth ?? u.dateOfBirth ?? null,
  nationality: u.nationality ?? null,
  empCode: u.emp_code ?? u.empCode ?? null,
  qidType: u.qid_type ?? u.qidType ?? null,
  mobileN: u.mobile_n ?? u.mobileN ?? null,
  mobileP: u.mobile_p ?? u.mobileP ?? null,
  mobileC: u.mobile_c ?? u.mobileC ?? null,
  cloudLink: u.cloud_link ?? u.cloudLink ?? null,
  docs: (u.docs || []).map(mapStaffDoc),
  attendance: [],
  dataActivity: { date: null, emailsSent: 0, whatsappsSent: 0, lastEmailAt: null, lastWhatsappAt: null },
});

export const mapStaffDoc = (d) => ({
  id: d.id, type: d.type, number: d.number, expiry: d.expiry, cloudLink: d.cloud_link ?? d.cloudLink ?? "",
});

export const mapLead = (l) => ({
  id: l.id, name: l.name, company: l.company, phone: l.phone, email: l.email,
  reference: l.reference, source: l.source, service: l.service, owner: l.owner, status: l.status,
  createdAt: l.created_at, nextFollowUp: l.next_follow_up, createdBy: l.created_by,
  followUps: (l.followUps || []).map((f) => ({ id: f.id, note: f.note, outcome: f.outcome, at: f.at })),
  assignedAt: l.assigned_at, slaDueAt: l.sla_due_at, slaViolated: !!l.sla_violated,
  customerId: l.customer_id,
});

export const mapDeal = (d) => ({
  id: d.id, leadId: d.lead_id, customer: d.customer, service: d.service, value: Number(d.value),
  owner: d.owner, stage: d.stage, expectedClose: d.expected_close, createdAt: d.created_at, wonAt: d.won_at,
  customerId: d.customer_id,
});

export const mapQuotation = (q) => ({
  id: q.id, dealId: q.deal_id, customer: q.customer, customerId: q.customer_id, owner: q.owner,
  subject: q.subject, feeType: q.fee_type, theme: q.theme || "charcoal", orderDiscount: Number(q.order_discount || 0),
  orderDiscountType: q.order_discount_type || "amount",
  items: (q.items || []).map((it) => ({ ...it, qty: Number(it.qty), price: Number(it.price), discountPct: Number(it.discountPct || 0) })),
  status: q.status, validTill: q.valid_till, createdAt: q.created_at,
  bank: q.bank || "", footerNote: q.footer_note || "", notes: q.notes || "", terms: q.terms || "",
  favorite: !!q.favorite, emailedToClient: !!q.emailed_to_client, emailedAt: q.emailed_at, emailCc: q.email_cc || [],
  subtotal: Number(q.subtotal || 0), total: Number(q.total || 0),
});

export const mapCustomer = (c) => ({
  id: c.id, name: c.name, type: c.type, contact: c.contact, phone: c.phone,
  landline: c.landline, contactMobile: c.contact_mobile, email: c.email,
  address: c.address, companySize: c.company_size, createdAt: c.created_at,
  docs: (c.docs || []).map((d) => ({ id: d.id, type: d.type, number: d.number, expiry: d.expiry, cloudLink: d.cloud_link || "" })),
  employees: (c.employees || []).map((e) => ({
    id: e.id, name: e.name, designation: e.designation,
    docs: (e.docs || []).map((d) => ({ id: d.id, type: d.type, number: d.number, expiry: d.expiry, cloudLink: d.cloud_link || "" })),
  })),
});

export const mapSalesOrder = (so) => ({
  id: so.id, quotationId: so.quotation_id, customer: so.customer, service: so.service,
  feeType: so.fee_type, amount: Number(so.amount), professionalFeeAmount: Number(so.professional_fee_amount ?? so.amount),
  orderDiscount: Number(so.order_discount || 0), createdAt: so.created_at, customerId: so.customer_id,
});

export const mapPayment = (p) => ({ id: p.id, amount: Number(p.amount), mode: p.mode, date: p.paid_at, by: p.recorded_by });

export const mapInvoice = (inv) => ({
  id: inv.id, salesOrderId: inv.sales_order_id, subscriptionId: inv.subscription_id, customer: inv.customer,
  feeType: inv.fee_type, amount: Number(inv.amount), professionalFeeAmount: Number(inv.professional_fee_amount ?? inv.amount),
  status: inv.status, dueDate: inv.due_date, createdAt: inv.created_at,
  emailedToClient: !!inv.emailed_to_client, emailedAt: inv.emailed_at, emailCc: inv.email_cc || [],
  payments: (inv.payments || []).map(mapPayment), customerId: inv.customer_id,
});

export const mapStatusLogEntry = (l) => ({ status: l.status, at: l.at, by: l.by_user, note: l.note });

export const mapJobCard = (j) => ({
  id: j.id, salesOrderId: j.sales_order_id, customer: j.customer, service: j.service, description: j.description || "",
  status: j.status, priority: j.priority, targetDate: j.target_date, checklist: j.checklist || [],
  cancelReason: j.cancel_reason, createdBy: j.created_by, createdAt: j.created_at,
  leadCreatorName: j.lead_creator_name || null, customerId: j.customer_id,
  assignees: j.assignees || [], statusLog: (j.statusLog || []).map(mapStatusLogEntry),
});

export const mapNotification = (n) => ({
  id: n.id, type: n.type, title: n.title, body: n.body, audience: n.audience || [],
  read: !!n.read_flag, createdAt: n.created_at, emailSent: !!n.email_sent, emailedAt: n.emailed_at,
});

export const mapDataRecord = (d) => ({
  id: d.id, companyName: d.company_name, contactName: d.contact_name, mobile: d.mobile, email: d.email,
  reference: d.reference, source: d.source, businessCategory: d.business_category, location: d.location,
  dataCategory: d.data_category, dataOwner: d.data_owner, assignedUser: d.assigned_user, status: d.status,
  remarks: d.remarks, archivedReason: d.archived_reason, createdDate: d.created_date, createdBy: d.created_by,
  lastContactDate: d.last_contact_date, leadId: d.lead_id, emailSentAt: d.email_sent_at, whatsappSentAt: d.whatsapp_sent_at,
  callCompletedAt: d.call_completed_at, datasetName: d.dataset_name,
});

export const mapDataSettings = (s) => ({
  dailyEmailTarget: s.daily_email_target, dailyWhatsappTarget: s.daily_whatsapp_target, dailyCallTarget: s.daily_call_target,
  emailIntervalMinutes: s.email_interval_minutes, whatsappIntervalMinutes: s.whatsapp_interval_minutes,
  recyclingEnabled: !!s.recycling_enabled, recyclingDays: s.recycling_days,
  emailTemplate: { subject: s.email_subject, body: s.email_body },
  whatsappTemplate: { body: s.whatsapp_body },
});

export const mapExportHistoryEntry = (e) => ({ id: e.id, exportedBy: e.exported_by, exportDate: e.export_date, count: e.record_count, purpose: e.purpose, format: e.format });

export const mapDataActivity = (a) => ({
  userId: a.user_id, emailsSent: a.emails_sent, whatsappsSent: a.whatsapps_sent, callsCompleted: a.calls_completed,
  lastEmailAt: a.last_email_at, lastWhatsappAt: a.last_whatsapp_at, lastCallAt: a.last_call_at,
});

export const mapAppSettings = (s) => ({ emailNotificationsEnabled: !!s.email_notifications_enabled });

export const mapTier = (t) => ({
  name: t.tier_name, annualFee: Number(t.annual_fee), companySize: t.company_size,
  transactionsIncluded: t.transactions_included, hukoomiServices: t.hukoomi_services,
  trainingSessions: t.training_sessions, trainingRate: t.training_rate ? Number(t.training_rate) : null,
  trainingTeamMembers: t.training_team_members, legalAdvising: t.legal_advising,
  dedicatedPro: !!t.dedicated_pro, translationPages: t.translation_pages,
  extraFeatures: t.extra_features || [],
});

// Backend returns an array of plans; the UI expects an object keyed by plan name.
export const mapSubscriptionPlans = (plans) => {
  const out = {};
  for (const p of plans) out[p.name] = { description: p.description, terms: p.terms || [], tiers: (p.tiers || []).map(mapTier) };
  return out;
};

export const mapSubscription = (s) => ({
  id: s.id, customerId: s.customer_id, customer: s.customer, plan: s.plan_name, tier: s.tier_name,
  annualFee: Number(s.annual_fee), startDate: s.start_date, expiryDate: s.expiry_date, status: s.status,
  transactionsUsed: s.transactionsUsed, trainingSessionsUsed: s.training_sessions_used,
  legalAdvisingUsed: s.legal_advising_used, translationPagesUsed: s.translation_pages_used,
});

// Backend returns { [service]: {..., order_discount, footer_note} } — one template per service
// (Government Fee lines are tagged per-item within the same items array); flatten field names.
export const mapQuotationTemplates = (raw) => {
  const out = {};
  for (const service of Object.keys(raw)) {
    const t = raw[service];
    out[service] = {
      subject: t.subject, items: t.items || [], notes: t.notes || "", terms: t.terms || "",
      orderDiscount: Number(t.order_discount || 0), orderDiscountType: t.order_discount_type || "amount",
      bank: t.bank || "", footerNote: t.footer_note || "",
    };
  }
  return out;
};

export const mapIncentiveRule = (r) => ({ id: r.id, role: r.role, period: r.period, metric: r.metric, amount: Number(r.amount) });

export const mapItemCatalogEntry = (r) => ({
  id: r.id, name: r.name, description: r.description, note: r.note || "",
  feeType: r.fee_type, price: Number(r.price), service: r.service || "",
});

export const mapLeaveRequest = (r) => ({
  id: r.id, employeeId: r.user_id, type: r.type, startDate: r.start_date, endDate: r.end_date,
  reason: r.reason, status: r.status, requestedAt: r.requested_at, decidedBy: r.decided_by,
});

export const mapPunchRequest = (r) => ({
  id: r.id, employeeId: r.user_id, date: r.date, inTime: r.in_time, outTime: r.out_time,
  reason: r.reason, status: r.status, requestedAt: r.requested_at, decidedBy: r.decided_by,
});

export const mapAttendance = (a) => ({ id: a.id, date: a.date, status: a.status, inTime: a.in_time, outTime: a.out_time, by: a.marked_by });

export const mapTodo = (t) => ({
  id: t.id, title: t.title, done: !!t.done,
  reminderEnabled: !!t.reminder_enabled, reminderDate: t.reminder_date, reminderNotified: !!t.reminder_notified,
  createdAt: t.created_at,
});

export const mapContentStage = (s) => ({
  taskId: s.task_id, stageIndex: s.stage_index, targetDate: s.target_date,
  completedAt: s.completed_at, completedBy: s.completed_by,
});

export const mapTask = (t) => ({
  id: t.id, title: t.title, description: t.description || "", priority: t.priority, status: t.status,
  dueDate: t.due_date, assignedTo: t.assigned_to, department: t.department, createdBy: t.created_by,
  progressPct: t.progress_pct ?? 0, submittedAt: t.submitted_at,
  decidedBy: t.decided_by, decidedAt: t.decided_at, rejectionReason: t.rejection_reason,
  createdAt: t.created_at, statusLog: (t.statusLog || []).map(mapStatusLogEntry),
  contentStages: (t.contentStages || []).map(mapContentStage),
});

export const mapTaskTemplate = (t) => ({
  id: t.id, name: t.name, department: t.department, title: t.title, description: t.description || "",
  priority: t.priority, dueInDays: t.due_in_days, createdBy: t.created_by, createdAt: t.created_at,
});

export const mapSalesTaskDef = (d) => ({
  id: d.id, key: d.task_key, name: d.name, metricType: d.metric_type,
  target: Number(d.target), source: d.source, sortOrder: d.sort_order,
});

export const mapSalesTaskLog = (l) => ({
  userId: l.user_id, taskDefId: l.task_def_id, activityDate: l.activity_date,
  completedCount: Number(l.completed_count),
});
