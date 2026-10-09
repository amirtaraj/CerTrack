import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { config } from './config.js';
import { parseWorkbook, applyImport } from './lib/importer.js';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const file = args.find((a) => !a.startsWith('--')) ||
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../seed/Active_Certifications.xlsx');

const parsed = await parseWorkbook(file);
console.log(`Read ${parsed.rowsRead} rows -> ${parsed.people.length} people, ${parsed.certs.length} certifications`);
for (const i of parsed.issues) console.log(`  [${i.level}] ${i.row ? `row ${i.row}: ` : ''}${i.message}`);

if (flags.has('--no-db')) process.exit(0);

const { User } = await import('./models/User.js');
const { Certification } = await import('./models/Certification.js');
await mongoose.connect(config.mongoUri);
const result = await applyImport(parsed, {
  dryRun: flags.has('--dry-run'),
  defaultPassword: config.defaultPassword,
  User, Certification,
});
delete result.issues;
console.log(flags.has('--dry-run') ? 'Dry run (nothing written):' : 'Imported:', result);
await mongoose.disconnect();
