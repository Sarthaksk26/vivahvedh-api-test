/**
 * VIVAHVEDH SQL-FILE MIGRATION SCRIPT
 * ====================================
 * Reads the legacy MySQL dump file and migrates all data to PostgreSQL via Prisma.
 * No live MySQL connection required — reads directly from the .sql file.
 *
 * Usage:
 *   npx ts-node src/scripts/migrate-from-sql.ts                # Full migration
 *   npx ts-node src/scripts/migrate-from-sql.ts --dry-run      # Preview only
 *   npx ts-node src/scripts/migrate-from-sql.ts --lookups-only # Lookup tables only
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import path from 'path';
import prisma from '../config/db'; // Uses PII encryption middleware
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const DRY_RUN = process.argv.includes('--dry-run');
const LOOKUPS_ONLY = process.argv.includes('--lookups-only');

/** Sanitize a legacy DB value: convert literal 'NULL' and empty strings to null.
 *  Preserves '0' and other numeric strings since they may be valid IDs or data. */
function cleanVal(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '' || s.toUpperCase() === 'NULL') return null;
  return s;
}

function safeDate(d: any): Date | null {
  if (!d) return null;
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return null;
  // Ignore '0000-00-00'
  if (parsed.getFullYear() < 1900) return null;
  return parsed;
}

// ═══════════════════════════════════════════════════════════════════
//  PART 1: MySQL Dump Parser
// ═══════════════════════════════════════════════════════════════════

/** Parse a raw SQL value literal into a JS value. */
function parseSQLValue(raw: string): any {
  const s = raw.trim();
  if (s.toUpperCase() === 'NULL') return null;
  if (s.startsWith("'") && s.endsWith("'")) {
    return s
      .slice(1, -1)
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\0/g, '\0');
  }
  const n = Number(s);
  return isNaN(n) ? s : n;
}

/** Split a comma-separated tuple into individual value strings, respecting quoted strings. */
function splitCSV(input: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inStr = false;
  let esc = false;
  for (const ch of input) {
    if (esc) { cur += ch; esc = false; continue; }
    if (ch === '\\' && inStr) { cur += ch; esc = true; continue; }
    if (ch === "'") { cur += ch; inStr = !inStr; continue; }
    if (ch === ',' && !inStr) { result.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) result.push(cur);
  return result;
}

/** Extract all rows for a given MySQL table from the SQL dump string. */
function extractRows(sql: string, tableName: string): Record<string, any>[] {
  const rows: Record<string, any>[] = [];
  const marker = `INSERT INTO \`${tableName}\``;
  let pos = 0;

  while (true) {
    const start = sql.indexOf(marker, pos);
    if (start === -1) break;

    // Find terminating semicolon (outside strings)
    let end = start;
    let inStr = false, esc = false;
    for (let i = start; i < sql.length; i++) {
      const ch = sql[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === "'") { inStr = !inStr; continue; }
      if (ch === ';' && !inStr) { end = i; break; }
    }

    const block = sql.slice(start, end + 1);
    pos = end + 1;

    // Extract column names
    const colMatch = block.match(/\(([^)]+)\)\s*VALUES/i);
    if (!colMatch) continue;
    const columns = colMatch[1].split(',').map((c) => c.trim().replace(/`/g, ''));

    // Extract VALUES portion
    const valIdx = block.indexOf('VALUES', colMatch.index!);
    const valSection = block.slice(valIdx + 6, -1); // Strip trailing ;

    // Parse tuples
    let depth = 0, curTuple = '';
    inStr = false; esc = false;
    for (const ch of valSection) {
      if (esc) { curTuple += ch; esc = false; continue; }
      if (ch === '\\' && inStr) { curTuple += ch; esc = true; continue; }
      if (ch === "'") { curTuple += ch; inStr = !inStr; continue; }
      if (!inStr) {
        if (ch === '(') {
          depth++;
          if (depth === 1) { curTuple = ''; continue; }
        }
        if (ch === ')') {
          depth--;
          if (depth === 0) {
            const vals = splitCSV(curTuple);
            if (vals.length === columns.length) {
              const row: Record<string, any> = {};
              for (let j = 0; j < columns.length; j++) {
                row[columns[j]] = parseSQLValue(vals[j]);
              }
              rows.push(row);
            }
            curTuple = '';
            continue;
          }
        }
      }
      if (depth >= 1) curTuple += ch;
    }
  }

  return rows;
}

// ═══════════════════════════════════════════════════════════════════
//  PART 2: Lookup Table Migration
// ═══════════════════════════════════════════════════════════════════

async function migrateLookupTables(sql: string) {
  console.log('\n📋 Migrating lookup tables...');

  if (DRY_RUN) {
    console.log('  [DRY RUN] Lookup tables would be inserted without deleting existing data.');
    return;
  }

  // — Religion —
  const religions = extractRows(sql, 'religion');
  await prisma.religion.createMany({ 
    data: religions.map(r => ({ id: r.religion_id, name: r.religion_name })),
    skipDuplicates: true
  });
  console.log(`  ✅ Religion: ${religions.length} rows`);

  // — Caste —
  const castes = extractRows(sql, 'caste');
  await prisma.caste.createMany({ 
    data: castes.map(r => ({ id: r.caste_id, religionId: r.religion_id, name: r.caste_name })),
    skipDuplicates: true
  });
  console.log(`  ✅ Caste: ${castes.length} rows`);

  // — SubCaste —
  const subcastes = extractRows(sql, 'subcaste');
  await prisma.subCaste.createMany({ 
    data: subcastes.map(r => ({ id: r.subcaste_id, casteId: r.caste_id, name: r.subcaste_name })),
    skipDuplicates: true
  });
  console.log(`  ✅ SubCaste: ${subcastes.length} rows`);

  // — State —
  const states = extractRows(sql, 'state');
  await prisma.state.createMany({ 
    data: states.map(r => ({ id: r.state_id, name: r.state_name })),
    skipDuplicates: true
  });
  console.log(`  ✅ State: ${states.length} rows`);

  // — District —
  const districts = extractRows(sql, 'district');
  await prisma.district.createMany({ 
    data: districts.map(r => ({ id: r.district_id, name: r.district_name })),
    skipDuplicates: true
  });
  console.log(`  ✅ District: ${districts.length} rows`);

  // — Taluka —
  const talukas = extractRows(sql, 'taluka');
  await prisma.taluka.createMany({ 
    data: talukas.map(r => ({ id: r.taluka_id, districtId: r.district_id, name: r.taluka_name })),
    skipDuplicates: true
  });
  console.log(`  ✅ Taluka: ${talukas.length} rows`);

  // — Qualification —
  const quals = extractRows(sql, 'member_qualification');
  await prisma.qualification.createMany({
    data: quals.map(r => ({ id: r.qualification_id, name: r.qualification_name, group: r.qualification_group || null })),
    skipDuplicates: true
  });
  console.log(`  ✅ Qualification: ${quals.length} rows`);

  // — Occupation —
  const occs = extractRows(sql, 'occupation');
  await prisma.occupation.createMany({ 
    data: occs.map(r => ({ id: r.occupation_id, type: r.occupation_type })),
    skipDuplicates: true
  });
  console.log(`  ✅ Occupation: ${occs.length} rows`);

  // — IncomeRange —
  const incomes = extractRows(sql, 'income');
  await prisma.incomeRange.createMany({ 
    data: incomes.map(r => ({ id: r.income_id, range: r.income_range })),
    skipDuplicates: true
  });
  console.log(`  ✅ IncomeRange: ${incomes.length} rows`);

  // Reset PostgreSQL sequences to continue after the max inserted ID
  const seqResets = [
    '"Religion"', '"Caste"', '"SubCaste"', '"State"', '"District"',
    '"Taluka"', '"Qualification"', '"Occupation"', '"IncomeRange"',
  ];
  for (const table of seqResets) {
    try {
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1));`
      );
    } catch {
      // Some tables may not have sequences — ignore
    }
  }
  console.log('  🔄 Auto-increment sequences reset.');
}

// ═══════════════════════════════════════════════════════════════════
//  PART 3: Build Reference Maps (Height, Weight, Income)
// ═══════════════════════════════════════════════════════════════════

function buildHeightMap(sql: string): Map<number, string> {
  const rows = extractRows(sql, 'member_height');
  const map = new Map<number, string>();
  for (const r of rows) {
    if (r.height_id !== 0) {
      map.set(r.height_id, r.height_length);
    }
  }
  return map;
}

function buildWeightMap(sql: string): Map<number, number | null> {
  const rows = extractRows(sql, 'member_weight');
  const map = new Map<number, number | null>();
  for (const r of rows) {
    if (r.weight_id === 0) { map.set(0, null); continue; }
    const match = String(r.weight_kg).match(/(\d+)/);
    map.set(r.weight_id, match ? parseInt(match[1]) : null);
  }
  return map;
}

function buildIncomeMap(sql: string): Map<number, string> {
  const rows = extractRows(sql, 'income');
  const map = new Map<number, string>();
  for (const r of rows) {
    if (r.income_id !== 0) map.set(r.income_id, r.income_range);
  }
  return map;
}

function buildOccupationMap(sql: string): Map<number, string> {
  const rows = extractRows(sql, 'occupation');
  const map = new Map<number, string>();
  for (const r of rows) {
    if (r.occupation_id != null && r.occupation_type) {
      map.set(Number(r.occupation_id), r.occupation_type);
    }
  }
  return map;
}

function buildLandMap(sql: string): Map<number, string> {
  const rows = extractRows(sql, 'landrange');
  const map = new Map<number, string>();
  for (const r of rows) {
    if (r.land_id !== 0 && r.land_range) {
      map.set(Number(r.land_id), r.land_range);
    }
  }
  return map;
}

function buildDistrictMap(sql: string): Map<number, string> {
  const rows = extractRows(sql, 'district');
  const map = new Map<number, string>();
  for (const r of rows) {
    if (r.district_id != null && r.district_name) {
      map.set(Number(r.district_id), r.district_name);
    }
  }
  return map;
}

function buildStateMap(sql: string): Map<number, string> {
  const rows = extractRows(sql, 'state');
  const map = new Map<number, string>();
  for (const r of rows) {
    if (r.state_id != null && r.state_name) {
      map.set(Number(r.state_id), r.state_name);
    }
  }
  return map;
}

// ═══════════════════════════════════════════════════════════════════
//  PART 3.5: Legacy Admin & Enquiry Migration
// ═══════════════════════════════════════════════════════════════════

async function migrateAdmin(sql: string) {
  console.log('\n👑 Migrating legacy admin credentials...');
  const adminRows = extractRows(sql, 'admin');
  if (adminRows.length === 0) return;

  const legacyAdmin = adminRows[0];
  const email = legacyAdmin.admin_email || 'wedding@vivahvedh.com';
  const hashedPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would upsert admin ${email}`);
    return;
  }

  await prisma.user.upsert({
    where: { email },
    update: {
      role: 'ADMIN',
      accountStatus: 'ACTIVE',
    },
    create: {
      regId: 'VV-ADMIN-LEGACY',
      mobile: '9999000099',
      email,
      password: hashedPassword,
      role: 'ADMIN',
      accountStatus: 'ACTIVE',
      requiresPasswordChange: true,
      planType: 'GOLD',
      profile: {
        create: {
          firstName: 'Vivahvedh',
          lastName: 'Administrator',
          gender: 'MALE',
          maritalStatus: 'UNMARRIED',
          aboutMe: 'Legacy Vivahvedh platform administrator account.',
        },
      },
    },
  });
  console.log(`  ✅ Legacy admin (${email}) configured.`);
}

async function migrateEnquiries(sql: string) {
  console.log('\n📬 Migrating enquiries...');
  const enquiries = extractRows(sql, 'enquiry');
  console.log(`  📦 Found ${enquiries.length} enquiries in SQL dump.`);

  if (DRY_RUN) return;

  const existingCount = await prisma.enquiry.count();
  if (existingCount >= enquiries.length) {
    console.log(`  ⏭️ ${existingCount} enquiries already present in database.`);
    return;
  }

  let migrated = 0;
  const chunks: any[][] = [];
  let curChunk: any[] = [];

  for (const e of enquiries) {
    curChunk.push({
      firstName: e.enquiry_fname || 'Anonymous',
      lastName: e.enquiry_lname || '',
      email: e.enquiry_email || 'no-email@vivahvedh.test',
      mobile: e.enquiry_mobile || '',
      subject: e.enquiry_subject || 'General Enquiry',
      message: e.enquiry_message || '',
      isResolved: false,
      createdAt: e.enquiry_created_at ? new Date(e.enquiry_created_at) : new Date(),
    });
    if (curChunk.length === 100) {
      chunks.push(curChunk);
      curChunk = [];
    }
  }
  if (curChunk.length > 0) chunks.push(curChunk);

  for (const chunk of chunks) {
    await prisma.enquiry.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    migrated += chunk.length;
  }
  console.log(`  ✅ Enquiries done: ${migrated} records processed.`);
}

// ═══════════════════════════════════════════════════════════════════
//  PART 4: Member (User) Migration
// ═══════════════════════════════════════════════════════════════════

async function migrateMembers(sql: string) {
  console.log('\n👥 Migrating members...');

  const heightMap = buildHeightMap(sql);
  const weightMap = buildWeightMap(sql);
  const incomeMap = buildIncomeMap(sql);
  const occupationMap = buildOccupationMap(sql);
  const landMap = buildLandMap(sql);
  const districtMap = buildDistrictMap(sql);
  const stateMap = buildStateMap(sql);

  const members = extractRows(sql, 'members');
  const imageRows = extractRows(sql, 'images');

  // Pre-fetch all existing regIds, mobiles, and emails for fast resumability and unique checks
  const existingUsers = await prisma.user.findMany({ select: { regId: true, mobile: true, email: true } });
  const existingRegIds = new Set(existingUsers.map(u => u.regId));
  const existingMobiles = new Set(existingUsers.map(u => u.mobile));
  const usedEmails = new Set(existingUsers.map(u => u.email).filter(e => e !== null));

  // Group images by UserRegId
  const imagesByRegId = new Map<string, any[]>();
  for (const img of imageRows) {
    if (!img.UserRegId) continue;
    const list = imagesByRegId.get(img.UserRegId) || [];
    list.push(img);
    imagesByRegId.set(img.UserRegId, list);
  }

  console.log(`  📦 Found ${members.length} members and ${imageRows.length} images.`);

  let migrated = 0, skipped = 0, failed = 0;

  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const regId = m.regId || `VV-MIGRATE-${m.id}`;
    let mobile = m.mobile || `MIGRATE-${m.id}`;
    let email = m.email || null;

    try {
      // Resumability: skip if user exists
      if (existingRegIds.has(regId)) {
        skipped++;
        continue;
      }

      if (DRY_RUN) { migrated++; continue; }

      // Deduplicate mobiles
      if (existingMobiles.has(mobile)) {
        console.log(`  ⚠️  [${regId}] Duplicate mobile '${mobile}' found. Appending ID.`);
        mobile = `${mobile}-${m.id}`;
      }
      existingMobiles.add(mobile);

      // Deduplicate emails: if this email is already used by someone else, make it null
      if (email && usedEmails.has(email)) {
        console.log(`  ⚠️  [${regId}] Duplicate email '${email}' found. Setting to null.`);
        email = null;
      }
      if (email) usedEmails.add(email);

      // Use legacy password if available; otherwise generate random
      let hashedPwd;
      if (m.password) {
        hashedPwd = await bcrypt.hash(String(m.password), 10);
      } else {
        const randomPwd = crypto.randomBytes(32).toString('hex');
        hashedPwd = await bcrypt.hash(randomPwd, 10);
      }

      // Gender mapping
      let gender: 'MALE' | 'FEMALE' | 'OTHER' = 'OTHER';
      if (m.gender) {
        const g = String(m.gender).toUpperCase();
        if (g === 'MALE' || g === 'M') gender = 'MALE';
        else if (g === 'FEMALE' || g === 'F') gender = 'FEMALE';
      }

      // Marital status mapping
      let maritalStatus: 'UNMARRIED' | 'DIVORCED' | 'WIDOWED' | 'SEPARATED' = 'UNMARRIED';
      if (m.maritalStatus) {
        const ms = String(m.maritalStatus).toLowerCase();
        if (ms.includes('divorc')) maritalStatus = 'DIVORCED';
        else if (ms.includes('widow')) maritalStatus = 'WIDOWED';
        else if (ms.includes('separat')) maritalStatus = 'SEPARATED';
      }

      // Account status mapping (exact legacy match)
      let accountStatus: 'ACTIVE' | 'INACTIVE' | 'DELETED' = 'INACTIVE';
      if (m.regStatus) {
        const rs = String(m.regStatus).toLowerCase().trim();
        if (rs === 'active') accountStatus = 'ACTIVE';
        else if (rs.includes('deleted')) accountStatus = 'DELETED';
        else if (rs === 'inactive') accountStatus = 'INACTIVE';
      }

      // Birth datetime (set to UTC noon to avoid timezone shift)
      let birthDateTime: Date | null = null;
      if (m.birthDateTime) {
        const d = new Date(m.birthDateTime);
        if (!isNaN(d.getTime())) {
          const dateStr = d.toISOString().slice(0, 10);
          birthDateTime = new Date(`${dateStr}T12:00:00Z`);
        }
      }

      // Height / Weight / Income resolution
      const heightVal = m.height != null ? (heightMap.get(m.height) || String(m.height)) : null;
      const weightVal = m.weight != null ? (weightMap.get(m.weight) ?? (typeof m.weight === 'number' ? m.weight : null)) : null;
      let annualIncome: string | null = null;
      if (m.annualincome != null) {
        const incomeId = Number(m.annualincome);
        annualIncome = !isNaN(incomeId) ? (incomeMap.get(incomeId) || String(m.annualincome)) : String(m.annualincome);
      }

      // Smoke / Drink
      const smoke = m.smoke === 'Yes' || m.smoke === 'Y' || m.smoke === '1' ? true :
                     m.smoke === 'No' || m.smoke === 'N' || m.smoke === '0' ? false : null;
      const drink = m.drink === 'Yes' || m.drink === 'Y' || m.drink === '1' ? true :
                     m.drink === 'No' || m.drink === 'N' || m.drink === '0' ? false : null;

      // KYC mapping
      let kycType: 'AADHAR' | 'PAN' | 'PASSPORT' | null = null;
      if (m.idProof) {
        const lower = String(m.idProof).toLowerCase();
        if (lower.includes('pan')) kycType = 'PAN';
        else if (lower.includes('passport')) kycType = 'PASSPORT';
        else kycType = 'AADHAR';
      }

      // Religion / Caste IDs
      const religionId = m.religionId != null ? Number(m.religionId) : null;
      const casteId = m.casteId != null ? Number(m.casteId) : null;
      const subCasteId = m.subCasteId != null ? Number(m.subCasteId) : null;

      // Addresses (populate district and state names from maps)
      const addresses: any[] = [];
      if (m.permanentAddress) {
        addresses.push({
          addressType: 'PERMANENT',
          addressLine: m.permanentAddress,
          talukaId: m.talukaId != null ? Number(m.talukaId) : null,
          districtId: m.districtId != null ? Number(m.districtId) : null,
          district: m.districtId != null ? (districtMap.get(Number(m.districtId)) || null) : null,
          stateId: m.stateId != null ? Number(m.stateId) : null,
          state: m.stateId != null ? (stateMap.get(Number(m.stateId)) || null) : null,
        });
      }
      if (m.currentAddress && m.currentAddress !== m.permanentAddress) {
        addresses.push({ addressType: 'CURRENT', addressLine: m.currentAddress });
      }

      // Images (store old filenames as legacy URLs)
      const memberImages = imagesByRegId.get(regId) || [];
      const imageData = memberImages
        .filter((img: any) => img.FileName)
        .map((img: any, idx: number) => ({
          url: `https://vivahvedh.com/uploads/${img.FileName}`,
          isPrimary: idx === 0,
        }));

      // Store job_business: resolve numeric occupation IDs to readable names, keep raw text as-is
      let resolvedJobBusiness: string | null = cleanVal(m.job_business);
      if (resolvedJobBusiness) {
        const occId = Number(resolvedJobBusiness);
        if (!isNaN(occId) && occupationMap.has(occId)) {
          resolvedJobBusiness = occupationMap.get(occId) || resolvedJobBusiness;
        }
      }

      // Resolve father and mother occupation from occupationMap if numeric
      let resolvedFatherOccupation: string | null = cleanVal(m.fatherOccupation);
      if (resolvedFatherOccupation) {
        const occId = Number(resolvedFatherOccupation);
        if (!isNaN(occId) && occupationMap.has(occId)) {
          resolvedFatherOccupation = occupationMap.get(occId) || resolvedFatherOccupation;
        }
      }
      let resolvedMotherOccupation: string | null = cleanVal(m.motherOccupation);
      if (resolvedMotherOccupation) {
        const occId = Number(resolvedMotherOccupation);
        if (!isNaN(occId) && occupationMap.has(occId)) {
          resolvedMotherOccupation = occupationMap.get(occId) || resolvedMotherOccupation;
        }
      }

      // Resolve agriculture land from landMap
      let resolvedAgriLand: string | null = cleanVal(m.agricultureLand);
      if (resolvedAgriLand) {
        const landId = Number(resolvedAgriLand);
        if (!isNaN(landId) && landMap.has(landId)) {
          resolvedAgriLand = landMap.get(landId) || resolvedAgriLand;
        }
      }

      // Preserve parents mobile & whatsapp mobile in familyBackground
      const familyBackgroundParts = [
        m.familyBackground,
        m.parentsMobile ? `पालकांचा मो.: ${m.parentsMobile}` : null,
        m.whatsappMobile ? `WhatsApp: ${m.whatsappMobile}` : null
      ].filter(Boolean);
      const resolvedFamilyBackground = familyBackgroundParts.length > 0 ? familyBackgroundParts.join(' | ') : null;

      // Preserve vehicles / other properties in familyWealth
      const familyWealthParts = [
        m.family_wealth,
        m.otherProperties ? `वाहने/इतर मालमत्ता: ${m.otherProperties}` : null
      ].filter(Boolean);
      const resolvedFamilyWealth = familyWealthParts.length > 0 ? familyWealthParts.join(' | ') : null;

      // Create user with all nested data
      await prisma.user.create({
        data: {
          regId,
          email,
          mobile,
          password: hashedPwd,
          role: 'USER',
          accountStatus,
          profileCreatedBy: m.createdBy || null,
          // Migrating legacy passwords, but requiring users to update them immediately on login for security.
          requiresPasswordChange: true,
          paymentDone: m.paymentDone === 'Yes',
          lastPaidOn: safeDate(m.lastPaidOn),
          createdAt: safeDate(m.createdDatetime) || undefined,
          kycType,
          kycNumber: m.idProofNumber ? String(m.idProofNumber) : null,

          profile: {
            create: {
              firstName: cleanVal(m.firstName) || 'Unknown',
              lastName: cleanVal(m.lastName) || '',
              middleName: cleanVal(m.middleName) || '',
              gender,
              maritalStatus,
              birthDateTime,
              birthPlace: cleanVal(m.birthPlace),
              aboutMe: cleanVal(m.aboutMe),
              religionId: religionId && !isNaN(religionId) ? religionId : null,
              casteId: casteId && !isNaN(casteId) ? casteId : null,
              subCasteId: subCasteId && !isNaN(subCasteId) ? subCasteId : null,
            },
          },

          physical: {
            create: {
              height: heightVal,
              weight: typeof weightVal === 'number' ? weightVal : null,
              bloodGroup: cleanVal(m.bloodGroup),
              complexion: cleanVal(m.complexion),
              health: cleanVal(m.health),
              diet: cleanVal(m.diet),
              smoke,
              drink,
            },
          },

          astrology: {
            create: {
              gothra: cleanVal(m.gothra),
              rashi: cleanVal(m.rashi),
              nakshatra: cleanVal(m.nakshatra),
              charan: cleanVal(m.charan),
              nadi: cleanVal(m.nadi),
              gan: cleanVal(m.gan),
              mangal: cleanVal(m.mangal),
            },
          },

          education: {
            create: {
              qualificationId: m.qualification != null && !isNaN(Number(m.qualification)) && String(m.qualification).trim() !== '' ? Number(m.qualification) : null,
              trade: cleanVal(m.trade),
              college: cleanVal(m.collegeuniversity),
              jobBusiness: resolvedJobBusiness,
              jobAddress: cleanVal(m.job_businessAddress),
              annualIncome,
              specialAchievement: cleanVal(m.specialAchievement),
            },
          },

          family: {
            create: {
              fatherName: cleanVal(m.fatherFullName),
              fatherOccupation: resolvedFatherOccupation,
              motherName: cleanVal(m.motherFullName),
              motherOccupation: resolvedMotherOccupation,
              motherHometown: cleanVal(m.motherHometown),
              maternalUncleName: cleanVal(m.maternalUncleName),
              brothers: Number(m.brothers) || 0,
              marriedBrothers: Number(m.marriedBrothers) || 0,
              sisters: Number(m.sisters) || 0,
              marriedSisters: Number(m.marriedSisters) || 0,
              relativesSirnames: cleanVal(m.relativesSirnames),
              familyBackground: resolvedFamilyBackground,
              familyWealth: resolvedFamilyWealth,
              agricultureLand: resolvedAgriLand,
              plot: cleanVal(m.plot),
              flat: cleanVal(m.flat),
            },
          },

          preferences: {
            create: {
              expectations: cleanVal(m.expectations),
            },
          },

          addresses: { create: addresses },
          images: { create: imageData },
        },
      });

      migrated++;
    } catch (err: any) {
      failed++;
      // Prisma error messages have the actual reason at the very end
      const reason = err.message ? err.message.split('\n').pop() : String(err);
      console.error(`  ❌ [${regId}] ${reason}`);
    }

    // Progress logging every 100 rows
    if ((i + 1) % 100 === 0 || i === members.length - 1) {
      console.log(`  Progress: ${i + 1}/${members.length} (✅ ${migrated} / ⏭️ ${skipped} / ❌ ${failed})`);
    }
  }

  console.log(`\n  🏁 Members done: ✅ ${migrated} migrated, ⏭️ ${skipped} skipped, ❌ ${failed} failed`);
  return { migrated, skipped, failed };
}

// ═══════════════════════════════════════════════════════════════════
//  PART 5: Request Migration (Batched)
// ═══════════════════════════════════════════════════════════════════

async function migrateRequests(sql: string) {
  console.log('\n📨 Migrating requests in optimized batches...');
  const requestRows = extractRows(sql, 'requests');
  console.log(`  📦 Found ${requestRows.length} requests.`);

  // Load all users to map regId to id
  const allUsers = await prisma.user.findMany({ select: { id: true, regId: true } });
  const regIdToId = new Map(allUsers.map(u => [u.regId, u.id]));

  // Load all existing requests
  const existingReqs = await prisma.request.findMany({ select: { senderId: true, receiverId: true } });
  const existingPairs = new Set(existingReqs.map(r => `${r.senderId}:${r.receiverId}`));

  let migrated = 0, skipped = 0;
  const BATCH_SIZE = 500;
  let batch: any[] = [];

  for (const r of requestRows) {
    const senderRegId = String(r.RequestorRegId);
    const receiverRegId = String(r.RequestedRegId);

    // Look up users by their old regId locally
    const senderId = regIdToId.get(senderRegId);
    const receiverId = regIdToId.get(receiverRegId);
    
    if (!senderId || !receiverId) { skipped++; continue; }

    // Check if this request already exists locally
    if (existingPairs.has(`${senderId}:${receiverId}`)) { skipped++; continue; }
    existingPairs.add(`${senderId}:${receiverId}`);

    // Map status
    let status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' = 'PENDING';
    if (r.isDeleted === 'Y') status = 'WITHDRAWN';
    else if (r.isRejected === 'Y') status = 'REJECTED';
    else if (r.DetailsSent === 'Y') status = 'ACCEPTED';

    batch.push({
      senderId,
      receiverId,
      status,
      createdAt: safeDate(r.CreatedDatetime) || new Date(),
    });

    if (batch.length >= BATCH_SIZE) {
      if (!DRY_RUN) {
        await prisma.request.createMany({ data: batch, skipDuplicates: true });
      }
      migrated += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    if (!DRY_RUN) {
      await prisma.request.createMany({ data: batch, skipDuplicates: true });
    }
    migrated += batch.length;
  }

  console.log(`  🏁 Requests done: ✅ ${migrated} migrated, ⏭️ ${skipped} skipped`);
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  VIVAHVEDH SQL-FILE MIGRATION ENGINE');
  console.log('═══════════════════════════════════════════════════');
  if (DRY_RUN) console.log('⚠️  DRY RUN MODE — no data will be written.\n');

  // Locate the SQL file (project root)
  const sqlPath = path.resolve(process.cwd(), '..', 'DB Structure with Data.sql');
  console.log(`📄 Reading SQL file: ${sqlPath}`);

  let sql: string;
  try {
    sql = readFileSync(sqlPath, 'utf-8');
  } catch {
    console.error('❌ Could not read SQL file. Make sure it exists at the project root.');
    process.exit(1);
  }
  console.log(`  File size: ${(sql.length / 1024 / 1024).toFixed(1)} MB`);

  // Step 1: Lookup tables (always run)
  await migrateLookupTables(sql);

  // Step 1.5: Legacy Admin & Enquiries (always run)
  await migrateAdmin(sql);
  await migrateEnquiries(sql);

  if (!LOOKUPS_ONLY) {
    // Step 2: Members + Images
    await migrateMembers(sql);

    // Step 3: Requests (depends on members existing first)
    await migrateRequests(sql);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  ✅ MIGRATION COMPLETE' + (DRY_RUN ? ' (DRY RUN)' : ''));
  console.log('═══════════════════════════════════════════════════');
}

main()
  .catch((err) => {
    console.error('\n💥 Fatal migration error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
