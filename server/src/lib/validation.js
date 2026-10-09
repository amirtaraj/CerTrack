import { z } from 'zod';
import { parseIsoDate } from './dates.js';

const blankToNull = (v) => (v === '' || v === undefined ? null : v);

const dateField = z.preprocess(
  blankToNull,
  z.string().nullable().refine((v) => v === null || parseIsoDate(v) !== null, 'Enter a valid date').transform((v) => (v ? parseIsoDate(v) : null))
);

const urlField = z.preprocess(
  blankToNull,
  z.string().max(500).nullable().refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), 'Enter a link starting with http:// or https://')
);

export const certInput = z
  .object({
    specialization: z.string().trim().min(1, 'Choose or type a specialization').max(60),
    name: z.string().trim().min(2, 'Enter the certification name').max(200),
    issuedOn: dateField,
    expiresOn: dateField,
    noExpiry: z.boolean().default(false),
    credentialUrl: urlField,
    note: z.string().trim().max(500).optional().default(''),
  })
  .refine((c) => c.noExpiry || !c.expiresOn || !c.issuedOn || c.expiresOn >= c.issuedOn, {
    path: ['expiresOn'], message: 'Expiry can\'t be before the completion date',
  });

export const passwordRule = z.string().min(8, 'Use at least 8 characters').max(128)
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Include at least one letter and one number');

export const empIdRule = z.string().trim().regex(/^\d{1,10}$/, 'Employee ID should be digits only');
