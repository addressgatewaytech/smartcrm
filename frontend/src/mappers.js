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
  photoUrl: u.photo_url ?? u.photoUrl ?? null,
  leaveBalance: u.leave_balance ?? u.leaveBalance,
  active: !!(u.active ?? true),
  joined: u.joined_date ?? u.joined,
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
  createdAt: l.created_at, nextFollowUp: l.next_follow_up,
  followUps: (l.followUps || []).map((f) => ({ id: f.id, note: f.note, outcome: f.outcome, at: f.at })),
});

export const mapDeal = (d) => ({
  id: d.id, leadId: d.lead_id, customer: d.customer, service: d.service, value: Number(d.value),
  owner: d.owner, stage: d.stage, expectedClose: d.expected_close, createdAt: d.created_at,
});

export const mapQuotation = (q) => ({
  id: q.id, dealId: q.deal_id, customer: q.customer, owner: q.owner,
  subject: q.subject, feeType: q.fee_type, orderDiscount: Number(q.order_discount || 0),
  items: (q.items || []).map((it) => ({ ...it, qty: Number(it.qty), price: Number(it.price), discountPct: Number(it.discountPct || 0) })),
  status: q.status, validTill: q.valid_till, createdAt: q.created_at,
  bank: q.bank || "", footerNote: q.footer_note || "", notes: q.notes || "", terms: q.terms || "",
  favorite: !!q.favorite, emailedToClient: !!q.emailed_to_client, emailedAt: q.emailed_at, emailCc: q.email_cc || [],
  subtotal: Number(q.subtotal || 0), total: Number(q.total || 0),
});

export const mapCustomer = (c) => ({
  id: c.id, name: c.name, type: c.type, contact: c.contact, phone: c.phone, email: c.email,
  address: c.address, companySize: c.company_size,
  docs: (c.docs || []).map((d) => ({ id: d.id, type: d.type, number: d.number, expiry: d.expiry, cloudLink: d.cloud_link || "" })),
  employees: (c.employees || []).map((e) => ({
    id: e.id, name: e.name, designation: e.designation,
    docs: (e.docs || []).map((d) => ({ id: d.id, type: d.type, number: d.number, expiry: d.expiry, cloudLink: d.cloud_link || "" })),
  })),
});

export const mapSalesOrder = (so) => ({
  id: so.id, quotationId: so.quotation_id, customer: so.customer, service: so.service,
  feeType: so.fee_type, amount: Number(so.amount), orderDiscount: Number(so.order_discount || 0),
  createdAt: so.created_at,
});

export const mapPayment = (p) => ({ id: p.id, amount: Number(p.amount), mode: p.mode, date: p.paid_at, by: p.recorded_by });

export const mapInvoice = (inv) => ({
  id: inv.id, salesOrderId: inv.sales_order_id, subscriptionId: inv.subscription_id, customer: inv.customer,
  feeType: inv.fee_type, amount: Number(inv.amount), status: inv.status, dueDate: inv.due_date, createdAt: inv.created_at,
  emailedToClient: !!inv.emailed_to_client, emailedAt: inv.emailed_at, emailCc: inv.email_cc || [],
  payments: (inv.payments || []).map(mapPayment),
});

export const mapStatusLogEntry = (l) => ({ status: l.status, at: l.at, by: l.by_user, note: l.note });

export const mapJobCard = (j) => ({
  id: j.id, salesOrderId: j.sales_order_id, customer: j.customer, service: j.service, description: j.description || "",
  status: j.status, priority: j.priority, targetDate: j.target_date, checklist: j.checklist || [],
  cancelReason: j.cancel_reason, createdBy: j.created_by, createdAt: j.created_at,
  leadCreatorName: j.lead_creator_name || null,
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
});

export const mapDataSettings = (s) => ({
  dailyEmailTarget: s.daily_email_target, dailyWhatsappTarget: s.daily_whatsapp_target,
  emailIntervalMinutes: s.email_interval_minutes, whatsappIntervalMinutes: s.whatsapp_interval_minutes,
  recyclingEnabled: !!s.recycling_enabled, recyclingDays: s.recycling_days,
  emailTemplate: { subject: s.email_subject, body: s.email_body },
  whatsappTemplate: { body: s.whatsapp_body },
});

export const mapExportHistoryEntry = (e) => ({ id: e.id, exportedBy: e.exported_by, exportDate: e.export_date, count: e.record_count, purpose: e.purpose, format: e.format });

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

// Backend returns { [service]: { [feeType]: {..., order_discount, footer_note} } }; flatten field names.
export const mapQuotationTemplates = (raw) => {
  const out = {};
  for (const service of Object.keys(raw)) {
    out[service] = {};
    for (const feeType of Object.keys(raw[service])) {
      const t = raw[service][feeType];
      out[service][feeType] = {
        subject: t.subject, items: t.items || [], notes: t.notes || "", terms: t.terms || "",
        orderDiscount: Number(t.order_discount || 0), bank: t.bank || "", footerNote: t.footer_note || "",
      };
    }
  }
  return out;
};

export const mapIncentiveRule = (r) => ({ id: r.id, role: r.role, period: r.period, metric: r.metric, amount: Number(r.amount) });

export const mapLeaveRequest = (r) => ({
  id: r.id, employeeId: r.user_id, type: r.type, startDate: r.start_date, endDate: r.end_date,
  reason: r.reason, status: r.status, requestedAt: r.requested_at, decidedBy: r.decided_by,
});

export const mapPunchRequest = (r) => ({
  id: r.id, employeeId: r.user_id, date: r.date, inTime: r.in_time, outTime: r.out_time,
  reason: r.reason, status: r.status, requestedAt: r.requested_at, decidedBy: r.decided_by,
});

export const mapAttendance = (a) => ({ id: a.id, date: a.date, status: a.status, inTime: a.in_time, outTime: a.out_time, by: a.marked_by });
