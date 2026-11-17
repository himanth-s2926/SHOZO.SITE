'use strict';
const { z } = require('zod');
const { HttpError } = require('./middleware/errors');
const { CATEGORIES, INQUIRY_STATUSES } = require('./db');

// Must match the <option> text in contact.html (the test suite checks this).
const SPACE_TYPES = ['Home / Residential', 'Hospitality / Restaurant', 'Office / Studio', 'Other'];
const BUDGETS = ['Under ₹5,00,000', '₹5,00,000 – ₹15,00,000', '₹15,00,000 – ₹40,00,000', 'Above ₹40,00,000'];

function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const seen = new Set();
    const details = result.error.issues
      .map((i) => ({ path: i.path.join('.'), message: i.message }))
      .filter((d) => !seen.has(d.path) && seen.add(d.path)); // one message per field
    throw new HttpError(400, 'validation_error', 'Some fields are invalid.', details);
  }
  return result.data;
}

const singleLine = /^[^\u0000-\u001F\u007F]*$/; // no newlines / control chars (header-injection safe)
const text = (max) => z.string().trim().min(1).max(max).regex(singleLine, 'Must be a single line of text');
const longText = (max) => z.string().trim().max(max);
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const slug = z.string().max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens');
const imageUrl = z.string().trim().max(500).refine(
  (v) => /^https:\/\//i.test(v) || (v.startsWith('/') && !v.startsWith('//')),
  'Must be an https:// URL or a site path starting with a single /'
);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

// NOTE: no .default() anywhere. Defaults live in the DB schema, so PATCH (schema.partial())
// can never silently reset a field the caller did not send.
const schemas = {
  inquiry: z.object({
    name: text(100),
    email,
    space: z.enum(SPACE_TYPES),
    budget: z.enum(BUDGETS),
    message: longText(4000).optional(),
    website: z.string().max(200).optional(), // honeypot
  }),
  subscribe: z.object({ email }),
  unsubscribe: z.object({ token: z.string().min(10).max(100) }),
  login: z.object({ email: z.string().trim().max(254), password: z.string().min(1).max(200) }),
  inquiryStatus: z.object({ status: z.enum(INQUIRY_STATUSES) }),

  project: z.object({
    title: text(120),
    slug: slug.optional(),
    category: z.enum(CATEGORIES),
    year: z.number().int().min(1990).max(2100),
    imageUrl,
    imageAlt: text(200).nullable().optional(),
    description: longText(2000).nullable().optional(),
    featured: z.boolean().optional(),
    published: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
  }),
  post: z.object({
    title: text(200),
    slug: slug.optional(),
    category: text(40).nullable().optional(),
    excerpt: longText(600).nullable().optional(),
    body: longText(50000).nullable().optional(),
    imageUrl: imageUrl.nullable().optional(),
    imageAlt: text(200).nullable().optional(),
    featured: z.boolean().optional(),
    published: z.boolean().optional(),
    publishedAt: isoDate.optional(),
  }),
  service: z.object({
    code: text(3),
    title: text(120),
    description: text(600),
    priceFrom: z.number().int().min(0).max(1_000_000_000),
    sortOrder: z.number().int().min(0).max(100000).optional(),
  }),
  processStep: z.object({
    stepNo: z.number().int().min(1).max(99),
    title: text(120),
    description: text(600),
  }),
  team: z.object({
    name: text(100),
    role: text(100),
    imageUrl,
    imageAlt: text(200).nullable().optional(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
  }),

  listQuery: z.object({
    category: z.enum(CATEGORIES).optional(),
    featured: z.enum(['true', 'false']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  }),
  adminInquiryQuery: z.object({
    status: z.enum(INQUIRY_STATUSES).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
  id: z.coerce.number().int().min(1),
};

module.exports = { parse, schemas, SPACE_TYPES, BUDGETS };
