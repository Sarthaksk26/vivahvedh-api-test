import 'dotenv/config';
import { readFileSync } from 'fs';
import path from 'path';
import prisma from '../config/db';

function parseSQLValue(raw: string): any {
  const s = raw.trim();
  if (s.toUpperCase() === 'NULL') return null;
  if (s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1)
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t');
  }
  const n = Number(s);
  return isNaN(n) ? s : n;
}

function splitCSV(input: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inStr = false, esc = false;
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

function extractRows(sql: string, tableName: string): Record<string, any>[] {
  const rows: Record<string, any>[] = [];
  const marker = `INSERT INTO \`${tableName}\``;
  let pos = 0;

  while (true) {
    const start = sql.indexOf(marker, pos);
    if (start === -1) break;

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

    const colMatch = block.match(/\(([^)]+)\)\s*VALUES/i);
    if (!colMatch) continue;
    const columns = colMatch[1].split(',').map((c) => c.trim().replace(/`/g, ''));

    const valIdx = block.indexOf('VALUES', colMatch.index!);
    const valSection = block.slice(valIdx + 6, -1);

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

async function main() {
  console.log('🔄 Backfilling and enriching existing migrated users...');
  const sqlPath = path.resolve(process.cwd(), '..', 'DB Structure with Data.sql');
  const sql = readFileSync(sqlPath, 'utf-8');

  // Build maps
  const occRows = extractRows(sql, 'occupation');
  const occupationMap = new Map<number, string>();
  for (const r of occRows) {
    if (r.occupation_id != null && r.occupation_type) occupationMap.set(Number(r.occupation_id), r.occupation_type);
  }

  const landRows = extractRows(sql, 'landrange');
  const landMap = new Map<number, string>();
  for (const r of landRows) {
    if (r.land_id !== 0 && r.land_range) landMap.set(Number(r.land_id), r.land_range);
  }

  const distRows = extractRows(sql, 'district');
  const districtMap = new Map<number, string>();
  for (const r of distRows) {
    if (r.district_id != null && r.district_name) districtMap.set(Number(r.district_id), r.district_name);
  }

  const stateRows = extractRows(sql, 'state');
  const stateMap = new Map<number, string>();
  for (const r of stateRows) {
    if (r.state_id != null && r.state_name) stateMap.set(Number(r.state_id), r.state_name);
  }

  // Load legacy members into a Map by regId
  const legacyMembers = extractRows(sql, 'members');
  const legacyMap = new Map<string, any>();
  for (const m of legacyMembers) {
    if (m.regId) legacyMap.set(m.regId, m);
  }

  // Find all existing users in PostgreSQL
  const dbUsers = await prisma.user.findMany({
    select: {
      id: true,
      regId: true,
      family: { select: { id: true } },
      addresses: { select: { id: true, districtId: true, stateId: true } },
    }
  });

  console.log(`Found ${dbUsers.length} users in database. Running concurrent backfill...`);
  let updatedCount = 0;

  async function processUser(u: any) {
    const m = legacyMap.get(u.regId);
    if (!m) return;

    // Resolve occupations
    let resolvedFatherOcc = m.fatherOccupation ? String(m.fatherOccupation) : null;
    if (resolvedFatherOcc) {
      const occId = Number(resolvedFatherOcc);
      if (!isNaN(occId) && occupationMap.has(occId)) resolvedFatherOcc = occupationMap.get(occId) || resolvedFatherOcc;
    }

    let resolvedMotherOcc = m.motherOccupation ? String(m.motherOccupation) : null;
    if (resolvedMotherOcc) {
      const occId = Number(resolvedMotherOcc);
      if (!isNaN(occId) && occupationMap.has(occId)) resolvedMotherOcc = occupationMap.get(occId) || resolvedMotherOcc;
    }

    // Resolve land
    let resolvedAgriLand = m.agricultureLand ? String(m.agricultureLand) : null;
    if (resolvedAgriLand) {
      const landId = Number(resolvedAgriLand);
      if (!isNaN(landId) && landMap.has(landId)) resolvedAgriLand = landMap.get(landId) || resolvedAgriLand;
    }

    // Resolve familyBackground with parentsMobile and whatsappMobile
    const familyBackgroundParts = [
      m.familyBackground,
      m.parentsMobile ? `पालकांचा मो.: ${m.parentsMobile}` : null,
      m.whatsappMobile ? `WhatsApp: ${m.whatsappMobile}` : null
    ].filter(Boolean);
    const resolvedFamilyBackground = familyBackgroundParts.length > 0 ? familyBackgroundParts.join(' | ') : null;

    // Resolve familyWealth with otherProperties
    const familyWealthParts = [
      m.family_wealth,
      m.otherProperties ? `वाहने/इतर मालमत्ता: ${m.otherProperties}` : null
    ].filter(Boolean);
    const resolvedFamilyWealth = familyWealthParts.length > 0 ? familyWealthParts.join(' | ') : null;

    const promises: Promise<any>[] = [];

    // Update User
    if (m.createdDatetime || m.lastPaidOn) {
      promises.push(
        prisma.user.update({
          where: { id: u.id },
          data: {
            createdAt: m.createdDatetime ? new Date(m.createdDatetime) : undefined,
            lastPaidOn: m.lastPaidOn ? new Date(m.lastPaidOn) : undefined,
          }
        })
      );
    }

    // Update Family
    if (u.family?.id) {
      promises.push(
        prisma.userFamily.update({
          where: { id: u.family.id },
          data: {
            fatherOccupation: resolvedFatherOcc,
            motherOccupation: resolvedMotherOcc,
            agricultureLand: resolvedAgriLand,
            familyBackground: resolvedFamilyBackground,
            familyWealth: resolvedFamilyWealth,
          }
        })
      );
    }

    // Update Addresses
    for (const addr of u.addresses) {
      const dName = addr.districtId != null ? districtMap.get(addr.districtId) : null;
      const sName = addr.stateId != null ? stateMap.get(addr.stateId) : null;
      if (dName || sName) {
        promises.push(
          prisma.userAddress.update({
            where: { id: addr.id },
            data: {
              district: dName || undefined,
              state: sName || undefined,
            }
          })
        );
      }
    }

    await Promise.all(promises);
    updatedCount++;
    if (updatedCount % 100 === 0 || updatedCount === dbUsers.length) {
      console.log(`  Progress: ${updatedCount}/${dbUsers.length} users enriched.`);
    }
  }

  // Safe concurrency pool of 4 workers to respect connection pool limits
  const CONCURRENCY = 4;
  let idx = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (idx < dbUsers.length) {
      const current = dbUsers[idx++];
      await processUser(current).catch(err => console.error(`Error on ${current.regId}:`, err.message));
    }
  });

  await Promise.all(workers);
  console.log(`✅ Backfill complete! Enriched ${updatedCount} users.`);
}

main()
  .catch(err => { console.error('Backfill error:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
