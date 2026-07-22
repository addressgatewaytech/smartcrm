// Default quotation & checklist templates, carried over verbatim from the original prototype
// (address-gateway-crm_2.jsx) so a fresh deploy — or a repair of a deploy that only ever got
// empty/partial templates — starts with the real Address Gateway content, not blank forms.

const SERVICES = [
  "100% Foreign Ownership Company Formation",
  "Company Formation with Qatari Partner",
  "Growth Partner Program",
  "Bank Account Opening",
  "PRO Services",
  "Office Space Assistance",
];

const QUOTATION_TEMPLATES = {
  [SERVICES[0]]: {
    "Professional Fee": {
      subject: "100% FOREIGN OWNERSHIP COMPANY FORMATION - Professional fees",
      items: [
        { category: "", service: SERVICES[0], description: "PROFESSIONAL FEE IS INCLUSIVE OF THE FOLLOWING:", note: "• Business Consulting: Expert advice for business improvement.\n• PRO Support: Professional assistance for governmental processes.\n• Messenger Service: Delivery of documents.\n• Ministry Visit: Accompany clients to government ministries.", qty: 1, price: 7500, discountPct: 0 },
      ],
      orderDiscount: 1500,
      notes: "Looking forward for your business.\nWe truly appreciate the opportunity to work with you and your team.\nOur goal is to deliver exceptional service and support at every step.\nWe look forward to building a successful and long-lasting business relationship.",
      terms: "100% of the Professional Fee to be paid in advance before commencement of work.\nGovernment Fees by Client — payable directly by the client or reimbursed if paid by the service provider.\nGovernment fees are subject to change without prior notice.\nAll payments for government fees are non-refundable once submitted.\nProcessing timelines depend on government authority procedures.\nThis quotation is eligible for the Mega Promotion 2026 offer and is subject to the applicable terms and conditions of the promotion.",
      bank: "",
    },
    "Government Fee": {
      subject: "100% FOREIGN OWNERSHIP COMPANY FORMATION - Government Fees",
      items: [
        { category: "STAGE - 1 : GOVERNMENT FEES", service: SERVICES[0], description: "Signature Authentication Fees", note: "50 QAR per partner (charged as per the number of partners)", qty: 1, price: 50, discountPct: 0 },
        { category: "STAGE - 1 : GOVERNMENT FEES", service: SERVICES[0], description: "Issue New CR", note: "", qty: 1, price: 500, discountPct: 0 },
        { category: "STAGE - 1 : GOVERNMENT FEES", service: SERVICES[0], description: "Qatar Chamber Registration Fees", note: "Will vary depending on business activity", qty: 1, price: 500, discountPct: 0 },
        { category: "STAGE - 1 : GOVERNMENT FEES", service: SERVICES[0], description: "Activity Fees", note: "QAR 300 to 500 for one activity. For more activity will vary depending on business activity", qty: 1, price: 300, discountPct: 0 },
        { category: "STAGE - 2 : GOVERNMENT FEES", service: SERVICES[0], description: "Trade License", note: "Office space is mandatory for trade license approval.", qty: 1, price: 500, discountPct: 0 },
        { category: "STAGE - 2 : GOVERNMENT FEES", service: SERVICES[0], description: "Computer Card", note: "Computer Card Print", qty: 1, price: 200, discountPct: 0 },
        { category: "STAGE - 2 : GOVERNMENT FEES", service: SERVICES[0], description: "Labour Updation", note: "", qty: 1, price: 0, discountPct: 0 },
      ],
      orderDiscount: 0,
      notes: "Looking forward for your business.\nWe truly appreciate the opportunity to work with you and your team.\nOur goal is to deliver exceptional service and support at every step.\nWe look forward to building a successful and long-lasting business relationship.",
      terms: "100% of the Professional Fee to be paid in advance before commencement of work.\nGovernment Fees by Client — payable directly by the client or reimbursed if paid by the service provider.\nGovernment fees are subject to change without prior notice.\nAll payments for government fees are non-refundable once submitted.\nProcessing timelines depend on government authority procedures.\nThis proposal is not eligible for and is excluded from the Mega Promotion 2026 campaign.",
      bank: "",
    },
  },
  [SERVICES[1]]: {
    "Professional Fee": {
      subject: "COMPANY FORMATION WITH QATARI PARTNER - Professional fees",
      items: [
        { category: "", service: SERVICES[1], description: "PROFESSIONAL FEE IS INCLUSIVE OF THE FOLLOWING:", note: "• Qatari partner sourcing & vetting.\n• Partnership agreement drafting.\n• PRO Support: Professional assistance for governmental processes.\n• Ministry Visit: Accompany clients to government ministries.", qty: 1, price: 9000, discountPct: 0 },
      ],
      orderDiscount: 0,
      notes: "Looking forward for your business.\nWe truly appreciate the opportunity to work with you and your team.\nOur goal is to deliver exceptional service and support at every step.\nWe look forward to building a successful and long-lasting business relationship.",
      terms: "100% of the Professional Fee to be paid in advance before commencement of work.\nGovernment Fees by Client — payable directly by the client or reimbursed if paid by the service provider.\nGovernment fees are subject to change without prior notice.\nAll payments for government fees are non-refundable once submitted.\nProcessing timelines depend on government authority procedures.\nThis proposal is not eligible for and is excluded from the Mega Promotion 2026 campaign.",
      bank: "",
    },
    "Government Fee": {
      subject: "COMPANY FORMATION WITH QATARI PARTNER - Government Fees",
      items: [
        { category: "STAGE - 1 : GOVERNMENT FEES", service: SERVICES[1], description: "Signature Authentication Fees", note: "50 QAR per partner (charged as per the number of partners)", qty: 1, price: 50, discountPct: 0 },
        { category: "STAGE - 1 : GOVERNMENT FEES", service: SERVICES[1], description: "Issue New CR", note: "", qty: 1, price: 500, discountPct: 0 },
        { category: "STAGE - 1 : GOVERNMENT FEES", service: SERVICES[1], description: "Qatar Chamber Registration Fees", note: "Will vary depending on business activity", qty: 1, price: 500, discountPct: 0 },
        { category: "STAGE - 2 : GOVERNMENT FEES", service: SERVICES[1], description: "Trade License", note: "Office space is mandatory for trade license approval.", qty: 1, price: 500, discountPct: 0 },
        { category: "STAGE - 2 : GOVERNMENT FEES", service: SERVICES[1], description: "Computer Card", note: "Computer Card Print", qty: 1, price: 200, discountPct: 0 },
      ],
      orderDiscount: 0,
      notes: "Looking forward for your business.\nWe truly appreciate the opportunity to work with you and your team.\nOur goal is to deliver exceptional service and support at every step.\nWe look forward to building a successful and long-lasting business relationship.",
      terms: "100% of the Professional Fee to be paid in advance before commencement of work.\nGovernment Fees by Client — payable directly by the client or reimbursed if paid by the service provider.\nGovernment fees are subject to change without prior notice.\nAll payments for government fees are non-refundable once submitted.\nProcessing timelines depend on government authority procedures.\nThis proposal is not eligible for and is excluded from the Mega Promotion 2026 campaign.",
      bank: "",
    },
  },
  [SERVICES[2]]: {
    "Professional Fee": {
      subject: "Growth Partner - Silver - 1 Year Package",
      items: [
        { category: "", service: SERVICES[2], description: "PACKAGE IS INCLUSIVE OF THE FOLLOWING:", note: "• Business Consulting: Expert advice for business improvement.\n• PRO Support: Professional assistance for governmental processes.\n• Package Includes Online Transactions Only\n• Terms and conditions apply", qty: 1, price: 5000, discountPct: 0 },
      ],
      orderDiscount: 0,
      notes: "Looking forward for your business.\nWe truly appreciate the opportunity to work with you and your team.\nOur goal is to deliver exceptional service and support at every step.\nWe look forward to building a successful and long-lasting business relationship.",
      terms: "100% of the Fee to be paid in advance before commencement of work.\nGovernment Fees by Client — payable directly by the client or reimbursed if paid by the service provider.\nGovernment fees are subject to change without prior notice.\nAll payments for government fees are non-refundable once submitted.\nProcessing timelines depend on government authority procedures.\nUpon acceptance of this proposal, a Service Agreement will be signed by both parties outlining the detailed scope of services, terms, and conditions.\nThis quotation is eligible for the Mega Promotion 2026 offer and is subject to the applicable terms and conditions of the promotion.",
      bank: "",
    },
  },
  [SERVICES[3]]: {
    "Professional Fee": {
      subject: "BANK ACCOUNT OPENING - Professional fees",
      items: [
        { category: "", service: SERVICES[3], description: "PROFESSIONAL FEE IS INCLUSIVE OF THE FOLLOWING:", note: "• KYC pack preparation & bank submission.\n• Bank liaison & compliance follow-up.", qty: 1, price: 5000, discountPct: 0 },
      ],
      orderDiscount: 0,
      notes: "Looking forward for your business.\nWe truly appreciate the opportunity to work with you and your team.\nOur goal is to deliver exceptional service and support at every step.\nWe look forward to building a successful and long-lasting business relationship.",
      terms: "100% of the Professional Fee to be paid in advance before commencement of work.\nBank fees are payable directly by the client or reimbursed if paid by the service provider.\nBank approval is at the sole discretion of the bank and is not guaranteed.\nAll payments made are non-refundable once submitted.\nThis proposal is not eligible for and is excluded from the Mega Promotion 2026 campaign.",
      bank: "",
    },
  },
  [SERVICES[4]]: {
    "Professional Fee": {
      subject: "PRO SERVICES - Professional fees",
      items: [
        { category: "", service: SERVICES[4], description: "PROFESSIONAL FEE IS INCLUSIVE OF THE FOLLOWING:", note: "• Document collection & POA preparation.\n• PRO Support: Professional assistance for governmental processes.\n• Messenger Service: Delivery of documents.\n• Ministry Visit: Accompany clients to government ministries.", qty: 1, price: 2500, discountPct: 0 },
      ],
      orderDiscount: 0,
      notes: "Looking forward for your business.\nWe truly appreciate the opportunity to work with you and your team.\nOur goal is to deliver exceptional service and support at every step.\nWe look forward to building a successful and long-lasting business relationship.",
      terms: "100% of the Professional Fee to be paid in advance before commencement of work.\nGovernment Fees by Client — payable directly by the client or reimbursed if paid by the service provider.\nGovernment fees are subject to change without prior notice.\nAll payments for government fees are non-refundable once submitted.\nThis proposal is not eligible for and is excluded from the Mega Promotion 2026 campaign.",
      bank: "",
    },
    "Government Fee": {
      subject: "PRO SERVICES - Government Fees",
      items: [
        { category: "MINISTRY & ATTESTATION FEES", service: SERVICES[4], description: "Ministry Application & Attestation Fees", note: "Will vary depending on document type", qty: 1, price: 2000, discountPct: 0 },
      ],
      orderDiscount: 0,
      notes: "Looking forward for your business.\nWe truly appreciate the opportunity to work with you and your team.\nOur goal is to deliver exceptional service and support at every step.\nWe look forward to building a successful and long-lasting business relationship.",
      terms: "100% of the Professional Fee to be paid in advance before commencement of work.\nGovernment Fees by Client — payable directly by the client or reimbursed if paid by the service provider.\nGovernment fees are subject to change without prior notice.\nAll payments for government fees are non-refundable once submitted.\nThis proposal is not eligible for and is excluded from the Mega Promotion 2026 campaign.",
      bank: "",
    },
  },
  [SERVICES[5]]: {
    "Professional Fee": {
      subject: "Office Space Assistance",
      items: [
        { category: "", service: SERVICES[5], description: "Office Space Assistance - Consultation", note: "Only Trade License Purpose - No physical space available", qty: 1, price: 12000, discountPct: 0 },
      ],
      orderDiscount: 0,
      notes: "Looking forward for your business.\nWe truly appreciate the opportunity to work with you and your team.\nOur goal is to deliver exceptional service and support at every step.\nWe look forward to building a successful and long-lasting business relationship.",
      terms: "100% of the Professional Consultation Fee must be paid in advance before commencement of services.\nThis proposal is strictly for Trade License registration and consultation purposes only.\nNo physical office space, workstation, or business premises will be provided under this proposal.\nThe service includes only the minimum requirements necessary for Trade License application and processing.\nAll government fees paid to authorities are non-refundable once submitted.\nThis proposal is not eligible for and is excluded from the Mega Promotion 2026 campaign.",
      bank: "ADDRESS GATEWAY BUSINESS SERVICES\nAccount Number: 021513170010010010000\nIBAN - QA82DOHB021513170010010010000\nSwift Code – DOHBQAQA\nCompany Fawran - ADDRESS GATEWAY BUSINESS SERVICES\nAlias Type - CR Number, Alias ID - CR-209532,\nBRANCH: D RING ROAD, DOHA, QATAR.",
    },
  },
};

const CHECKLIST_TEMPLATES = {
  [SERVICES[0]]: ["Trade name reservation", "Draft & notarize Articles of Association", "Submit CR application to MOCI", "Chamber of Commerce enrollment", "Apply for trade license", "Establishment ID & tax registration"],
  [SERVICES[1]]: ["Identify & vet Qatari partner", "Draft partnership agreement", "Trade name reservation", "Submit CR application to MOCI", "Apply for trade license"],
  [SERVICES[2]]: ["Onboarding call", "Growth plan drafted", "Quarterly milestones agreed", "PRO/compliance check-in scheduled"],
  [SERVICES[3]]: ["Prepare bank KYC pack", "Submit to partner bank", "Bank compliance review", "Account activation"],
  [SERVICES[4]]: ["Collect POA & documents", "Submit ministry application", "Track approval", "Deliver certified documents"],
  [SERVICES[5]]: ["Confirm trade-license-only requirement with client", "Prepare office space consultation", "Issue office space documentation for trade license", "Deliver to client"],
};

module.exports = { SERVICES, QUOTATION_TEMPLATES, CHECKLIST_TEMPLATES };
