// Reusable dev-DB seed — real first names, fake-but-format-valid Swiss
// phone numbers (same principle as backend/test/helpers/test-data.ts's
// testPhone(): random, never claims to dial a real person), circles and
// Sentinel links already wired up.
//
// Run manually: `npm run seed:dev` (in backend/). Deliberately NOT wired
// into Prisma's `migrations.seed` hook — that would make
// `test/global-setup.js`'s `prisma migrate reset` (run before every e2e
// run) seed this data into mysentinelcircle_test too, which we never want.
//
// Idempotent: every User is upserted by its own fixed phone number (the
// identity that never changes between runs — emails use the dedicated
// @testmsc.ch domain, but aren't the upsert key), every LinkSentinels by
// the real @@unique([userSentinelId, userCompanionId]) constraint, every
// Circle by {userCompanionId, label} — re-running only ever touches rows
// this script itself created. Nothing is ever deleted (every relation in
// schema.prisma is onDelete: Restrict, and a real Alert raised against a
// seeded companion would block a delete anyway).

// Run directly via ts-node (not through the Prisma CLI, see header comment
// above), so backend/.env isn't auto-loaded the way it is for `npx prisma
// ...` commands (via prisma.config.ts) — load it ourselves.
import 'dotenv/config';
import {
  PrismaClient,
  CircleType,
  CircleStatus,
  LinkStatus,
  LinkInitiator,
  SentinelType,
  UserType,
  LeadSlot,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { writeFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

const SEED_PASSWORD = 'TestPass1234!';

function assertSafeTarget() {
  const url = process.env.DATABASE_URL ?? '';
  if (url.includes('mysentinelcircle_test')) {
    throw new Error(
      '[seed] Refusing to run against mysentinelcircle_test — this is dev-only demo data.',
    );
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed] Refusing to run with NODE_ENV=production.');
  }
}

interface SeedAccount {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  userName: string;
}

// A full, phone-verified, password-login-capable account — same shape a
// real signup + OTP verification would produce (see AuthService). Upserted
// by phone, not email — phone is the identity that never changes between
// runs; if a seeded account's email format ever changes, this still finds
// and updates the same row instead of colliding with it on userName/phone.
async function upsertAccount(a: SeedAccount) {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const data = {
    firstName: a.firstName,
    lastName: a.lastName,
    email: a.email,
    userName: a.userName,
    passwordHash,
    userType: UserType.ACCOUNT,
    phoneVerifiedAt: new Date(),
  };
  return prisma.user.upsert({
    where: { phone: a.phone },
    update: data,
    create: { phone: a.phone, ...data },
  });
}

// A bare, account-less "Sentinel SMS" stub — same shape
// SentinelService.findOrCreateUserByPhone produces for an unknown number.
async function upsertSmsStub(firstName: string, phone: string) {
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) return existing;
  return prisma.user.create({
    data: { firstName, phone, userType: UserType.ONLY_SMS },
  });
}

async function findOrCreateCircle(
  userCompanionId: string,
  label: string,
  circleType: CircleType,
) {
  const existing = await prisma.circle.findFirst({
    where: { userCompanionId, label },
  });
  if (existing) return existing;
  return prisma.circle.create({
    data: { userCompanionId, label, circleType, status: CircleStatus.ACTIVE },
  });
}

async function linkSentinel(params: {
  userSentinelId: string;
  userCompanionId: string;
  circleId: string;
  status: LinkStatus;
  leadSlot?: LeadSlot;
}) {
  const shared = {
    circleId: params.circleId,
    status: params.status,
    initiatedBy: LinkInitiator.COMPANION,
    sentinelType: SentinelType.SENTINEL,
    leadSlot: params.leadSlot ?? null,
    requestedAsLead: !!params.leadSlot,
  };
  return prisma.linkSentinels.upsert({
    where: {
      userSentinelId_userCompanionId: {
        userSentinelId: params.userSentinelId,
        userCompanionId: params.userCompanionId,
      },
    },
    update: shared,
    create: {
      userSentinelId: params.userSentinelId,
      userCompanionId: params.userCompanionId,
      ...shared,
    },
  });
}

async function main() {
  assertSafeTarget();

  // ---- Léa: a fully-staffed companion (1st circle + an outer circle) ----
  const lea = await upsertAccount({
    firstName: 'Léa',
    lastName: 'Dubois',
    phone: '+41791112233',
    email: 'lea.dubois@testmsc.ch',
    userName: 'lea_dubois',
  });
  const leaFirst = await findOrCreateCircle(lea.id, 'Premier cercle', CircleType.FIRST);
  const gabriel = await upsertAccount({
    firstName: 'Gabriel',
    lastName: 'Rochat',
    phone: '+41761445566',
    email: 'gabriel.rochat@testmsc.ch',
    userName: 'gabriel_rochat',
  });
  const chloe = await upsertAccount({
    firstName: 'Chloé',
    lastName: 'Morel',
    phone: '+41791556677',
    email: 'chloe.morel@testmsc.ch',
    userName: 'chloe_morel',
  });
  const mathis = await upsertAccount({
    firstName: 'Mathis',
    lastName: 'Perrin',
    phone: '+41781667788',
    email: 'mathis.perrin@testmsc.ch',
    userName: 'mathis_perrin',
  });
  await linkSentinel({
    userSentinelId: gabriel.id,
    userCompanionId: lea.id,
    circleId: leaFirst.id,
    status: LinkStatus.ACCEPTED,
    leadSlot: LeadSlot.LEAD_1,
  });
  await linkSentinel({
    userSentinelId: chloe.id,
    userCompanionId: lea.id,
    circleId: leaFirst.id,
    status: LinkStatus.ACCEPTED,
  });
  await linkSentinel({
    userSentinelId: mathis.id,
    userCompanionId: lea.id,
    circleId: leaFirst.id,
    status: LinkStatus.ACCEPTED,
  });

  const leaTravail = await findOrCreateCircle(lea.id, 'Travail', CircleType.BASIC);
  const ines = await upsertAccount({
    firstName: 'Inès',
    lastName: 'Bovet',
    phone: '+41771778899',
    email: 'ines.bovet@testmsc.ch',
    userName: 'ines_bovet',
  });
  const arthur = await upsertSmsStub('Arthur', '+41761889900');
  await linkSentinel({
    userSentinelId: ines.id,
    userCompanionId: lea.id,
    circleId: leaTravail.id,
    status: LinkStatus.ACCEPTED,
  });
  await linkSentinel({
    userSentinelId: arthur.id,
    userCompanionId: lea.id,
    circleId: leaTravail.id,
    status: LinkStatus.PENDING,
  });

  // Two more outer circles for Léa, so once outer-circle escalation exists
  // the 1st circle has several real circles to choose between.
  const leaVoisins = await findOrCreateCircle(lea.id, 'Voisins', CircleType.BASIC);
  const camille = await upsertAccount({
    firstName: 'Camille',
    lastName: 'Rossier',
    phone: '+41791223355',
    email: 'camille.rossier@testmsc.ch',
    userName: 'camille_rossier',
  });
  const lucas = await upsertAccount({
    firstName: 'Lucas',
    lastName: 'Girod',
    phone: '+41781334466',
    email: 'lucas.girod@testmsc.ch',
    userName: 'lucas_girod',
  });
  const sarah = await upsertAccount({
    firstName: 'Sarah',
    lastName: 'Weber',
    phone: '+41771445577',
    email: 'sarah.weber@testmsc.ch',
    userName: 'sarah_weber',
  });
  await linkSentinel({
    userSentinelId: camille.id,
    userCompanionId: lea.id,
    circleId: leaVoisins.id,
    status: LinkStatus.ACCEPTED,
  });
  await linkSentinel({
    userSentinelId: lucas.id,
    userCompanionId: lea.id,
    circleId: leaVoisins.id,
    status: LinkStatus.ACCEPTED,
  });
  await linkSentinel({
    userSentinelId: sarah.id,
    userCompanionId: lea.id,
    circleId: leaVoisins.id,
    status: LinkStatus.PENDING,
  });

  const leaFamille = await findOrCreateCircle(lea.id, 'Famille', CircleType.BASIC);
  const theo = await upsertAccount({
    firstName: 'Théo',
    lastName: 'Blanc',
    phone: '+41761556688',
    email: 'theo.blanc@testmsc.ch',
    userName: 'theo_blanc',
  });
  const laura = await upsertAccount({
    firstName: 'Laura',
    lastName: 'Jaquet',
    phone: '+41791667799',
    email: 'laura.jaquet@testmsc.ch',
    userName: 'laura_jaquet',
  });
  await linkSentinel({
    userSentinelId: theo.id,
    userCompanionId: lea.id,
    circleId: leaFamille.id,
    status: LinkStatus.ACCEPTED,
  });
  await linkSentinel({
    userSentinelId: laura.id,
    userCompanionId: lea.id,
    circleId: leaFamille.id,
    status: LinkStatus.ACCEPTED,
  });

  // ---- Noah: a minimal companion (1st circle, 2 Sentinels) ----
  const noah = await upsertAccount({
    firstName: 'Noah',
    lastName: 'Keller',
    phone: '+41781223344',
    email: 'noah.keller@testmsc.ch',
    userName: 'noah_keller',
  });
  const noahFirst = await findOrCreateCircle(noah.id, 'Premier cercle', CircleType.FIRST);
  const zoe = await upsertAccount({
    firstName: 'Zoé',
    lastName: 'Currat',
    phone: '+41791990011',
    email: 'zoe.currat@testmsc.ch',
    userName: 'zoe_currat',
  });
  const hugo = await upsertAccount({
    firstName: 'Hugo',
    lastName: 'Pasche',
    phone: '+41781001122',
    email: 'hugo.pasche@testmsc.ch',
    userName: 'hugo_pasche',
  });
  await linkSentinel({
    userSentinelId: zoe.id,
    userCompanionId: noah.id,
    circleId: noahFirst.id,
    status: LinkStatus.ACCEPTED,
    leadSlot: LeadSlot.LEAD_1,
  });
  await linkSentinel({
    userSentinelId: hugo.id,
    userCompanionId: noah.id,
    circleId: noahFirst.id,
    status: LinkStatus.ACCEPTED,
  });

  // Two outer circles for Noah too — a second companion to escalate from.
  const noahAmis = await findOrCreateCircle(noah.id, 'Amis', CircleType.BASIC);
  const nicolas = await upsertAccount({
    firstName: 'Nicolas',
    lastName: 'Fontaine',
    phone: '+41781778800',
    email: 'nicolas.fontaine@testmsc.ch',
    userName: 'nicolas_fontaine',
  });
  const manon = await upsertAccount({
    firstName: 'Manon',
    lastName: 'Streit',
    phone: '+41771889911',
    email: 'manon.streit@testmsc.ch',
    userName: 'manon_streit',
  });
  await linkSentinel({
    userSentinelId: nicolas.id,
    userCompanionId: noah.id,
    circleId: noahAmis.id,
    status: LinkStatus.ACCEPTED,
  });
  await linkSentinel({
    userSentinelId: manon.id,
    userCompanionId: noah.id,
    circleId: noahAmis.id,
    status: LinkStatus.ACCEPTED,
  });

  const noahSport = await findOrCreateCircle(noah.id, 'Sport', CircleType.BASIC);
  const julien = await upsertAccount({
    firstName: 'Julien',
    lastName: 'Megevand',
    phone: '+41761990022',
    email: 'julien.megevand@testmsc.ch',
    userName: 'julien_megevand',
  });
  const nadia = await upsertSmsStub('Nadia', '+41791001133');
  await linkSentinel({
    userSentinelId: julien.id,
    userCompanionId: noah.id,
    circleId: noahSport.id,
    status: LinkStatus.ACCEPTED,
  });
  await linkSentinel({
    userSentinelId: nadia.id,
    userCompanionId: noah.id,
    circleId: noahSport.id,
    status: LinkStatus.ACCEPTED,
  });

  const noahQuartier = await findOrCreateCircle(noah.id, 'Quartier', CircleType.BASIC);
  const elise = await upsertAccount({
    firstName: 'Elise',
    lastName: 'Rey',
    phone: '+41771556699',
    email: 'elise.rey@testmsc.ch',
    userName: 'elise_rey',
  });
  const romain = await upsertAccount({
    firstName: 'Romain',
    lastName: 'Cuche',
    phone: '+41761667700',
    email: 'romain.cuche@testmsc.ch',
    userName: 'romain_cuche',
  });
  await linkSentinel({
    userSentinelId: elise.id,
    userCompanionId: noah.id,
    circleId: noahQuartier.id,
    status: LinkStatus.ACCEPTED,
  });
  await linkSentinel({
    userSentinelId: romain.id,
    userCompanionId: noah.id,
    circleId: noahQuartier.id,
    status: LinkStatus.PENDING,
  });

  // ---- Thomas: a 4th companion, 1st circle with 2 Leads (useful later for
  // lead-handoff/succession testing) + two outer circles ----
  const thomas = await upsertAccount({
    firstName: 'Thomas',
    lastName: 'Guillod',
    phone: '+41781445588',
    email: 'thomas.guillod@testmsc.ch',
    userName: 'thomas_guillod',
  });
  const thomasFirst = await findOrCreateCircle(thomas.id, 'Premier cercle', CircleType.FIRST);
  const oceane = await upsertAccount({
    firstName: 'Océane',
    lastName: 'Bersier',
    phone: '+41791778811',
    email: 'oceane.bersier@testmsc.ch',
    userName: 'oceane_bersier',
  });
  const yanis = await upsertAccount({
    firstName: 'Yanis',
    lastName: 'Monney',
    phone: '+41781889922',
    email: 'yanis.monney@testmsc.ch',
    userName: 'yanis_monney',
  });
  const leon = await upsertAccount({
    firstName: 'Léon',
    lastName: 'Aebi',
    phone: '+41771990033',
    email: 'leon.aebi@testmsc.ch',
    userName: 'leon_aebi',
  });
  await linkSentinel({
    userSentinelId: oceane.id,
    userCompanionId: thomas.id,
    circleId: thomasFirst.id,
    status: LinkStatus.ACCEPTED,
    leadSlot: LeadSlot.LEAD_1,
  });
  await linkSentinel({
    userSentinelId: yanis.id,
    userCompanionId: thomas.id,
    circleId: thomasFirst.id,
    status: LinkStatus.ACCEPTED,
    leadSlot: LeadSlot.LEAD_2,
  });
  await linkSentinel({
    userSentinelId: leon.id,
    userCompanionId: thomas.id,
    circleId: thomasFirst.id,
    status: LinkStatus.ACCEPTED,
  });

  const thomasEtudes = await findOrCreateCircle(thomas.id, 'Études', CircleType.BASIC);
  const juliette = await upsertAccount({
    firstName: 'Juliette',
    lastName: 'Kolly',
    phone: '+41761001144',
    email: 'juliette.kolly@testmsc.ch',
    userName: 'juliette_kolly',
  });
  const maxime = await upsertAccount({
    firstName: 'Maxime',
    lastName: 'Dupasquier',
    phone: '+41791112255',
    email: 'maxime.dupasquier@testmsc.ch',
    userName: 'maxime_dupasquier',
  });
  const alicia = await upsertAccount({
    firstName: 'Alicia',
    lastName: 'Nguyen',
    phone: '+41781223366',
    email: 'alicia.nguyen@testmsc.ch',
    userName: 'alicia_nguyen',
  });
  await linkSentinel({
    userSentinelId: juliette.id,
    userCompanionId: thomas.id,
    circleId: thomasEtudes.id,
    status: LinkStatus.ACCEPTED,
  });
  await linkSentinel({
    userSentinelId: maxime.id,
    userCompanionId: thomas.id,
    circleId: thomasEtudes.id,
    status: LinkStatus.ACCEPTED,
  });
  await linkSentinel({
    userSentinelId: alicia.id,
    userCompanionId: thomas.id,
    circleId: thomasEtudes.id,
    status: LinkStatus.PENDING,
  });

  const thomasFamille = await findOrCreateCircle(thomas.id, 'Famille', CircleType.BASIC);
  const damien = await upsertAccount({
    firstName: 'Damien',
    lastName: 'Chassot',
    phone: '+41771334477',
    email: 'damien.chassot@testmsc.ch',
    userName: 'damien_chassot',
  });
  const coralie = await upsertSmsStub('Coralie', '+41761445599');
  await linkSentinel({
    userSentinelId: damien.id,
    userCompanionId: thomas.id,
    circleId: thomasFamille.id,
    status: LinkStatus.ACCEPTED,
  });
  await linkSentinel({
    userSentinelId: coralie.id,
    userCompanionId: thomas.id,
    circleId: thomasFamille.id,
    status: LinkStatus.ACCEPTED,
  });

  // ---- Emma: 1st circle provisioned, zero Sentinels — exercises
  // raiseAlert's "no Lead Sentinel yet" 409 ----
  const emma = await upsertAccount({
    firstName: 'Emma',
    lastName: 'Favre',
    phone: '+41771334455',
    email: 'emma.favre@testmsc.ch',
    userName: 'emma_favre',
  });
  await findOrCreateCircle(emma.id, 'Premier cercle', CircleType.FIRST);

  const rows = [
    { role: 'Companion', name: 'Léa Dubois', phone: lea.phone, email: lea.email, note: 'Premier cercle (3) + Travail (2) + Voisins (3) + Famille (2)' },
    { role: 'Companion', name: 'Noah Keller', phone: noah.phone, email: noah.email, note: 'Premier cercle (2) + Amis (2) + Sport (2) + Quartier (2)' },
    { role: 'Companion', name: 'Thomas Guillod', phone: thomas.phone, email: thomas.email, note: 'Premier cercle (3, 2 Leads) + Études (3) + Famille (2)' },
    { role: 'Companion', name: 'Emma Favre', phone: emma.phone, email: emma.email, note: 'Premier cercle vide — pas de Lead Sentinel' },
    { role: 'Lead Sentinel (Léa)', name: 'Gabriel Rochat', phone: gabriel.phone, email: gabriel.email, note: '' },
    { role: 'Sentinel (Léa)', name: 'Chloé Morel', phone: chloe.phone, email: chloe.email, note: '' },
    { role: 'Sentinel (Léa)', name: 'Mathis Perrin', phone: mathis.phone, email: mathis.email, note: '' },
    { role: 'Sentinel, Travail (Léa)', name: 'Inès Bovet', phone: ines.phone, email: ines.email, note: 'accepted' },
    { role: 'Sentinel, Travail (Léa)', name: 'Arthur', phone: arthur.phone, email: arthur.email, note: 'PENDING, SMS only, no account' },
    { role: 'Sentinel, Voisins (Léa)', name: 'Camille Rossier', phone: camille.phone, email: camille.email, note: 'accepted' },
    { role: 'Sentinel, Voisins (Léa)', name: 'Lucas Girod', phone: lucas.phone, email: lucas.email, note: 'accepted' },
    { role: 'Sentinel, Voisins (Léa)', name: 'Sarah Weber', phone: sarah.phone, email: sarah.email, note: 'PENDING' },
    { role: 'Sentinel, Famille (Léa)', name: 'Théo Blanc', phone: theo.phone, email: theo.email, note: 'accepted' },
    { role: 'Sentinel, Famille (Léa)', name: 'Laura Jaquet', phone: laura.phone, email: laura.email, note: 'accepted' },
    { role: 'Lead Sentinel (Noah)', name: 'Zoé Currat', phone: zoe.phone, email: zoe.email, note: '' },
    { role: 'Sentinel (Noah)', name: 'Hugo Pasche', phone: hugo.phone, email: hugo.email, note: '' },
    { role: 'Sentinel, Amis (Noah)', name: 'Nicolas Fontaine', phone: nicolas.phone, email: nicolas.email, note: 'accepted' },
    { role: 'Sentinel, Amis (Noah)', name: 'Manon Streit', phone: manon.phone, email: manon.email, note: 'accepted' },
    { role: 'Sentinel, Sport (Noah)', name: 'Julien Megevand', phone: julien.phone, email: julien.email, note: 'accepted' },
    { role: 'Sentinel, Sport (Noah)', name: 'Nadia', phone: nadia.phone, email: nadia.email, note: 'accepted, SMS only, no account' },
    { role: 'Sentinel, Quartier (Noah)', name: 'Elise Rey', phone: elise.phone, email: elise.email, note: 'accepted' },
    { role: 'Sentinel, Quartier (Noah)', name: 'Romain Cuche', phone: romain.phone, email: romain.email, note: 'PENDING' },
    { role: 'Lead Sentinel (Thomas)', name: 'Océane Bersier', phone: oceane.phone, email: oceane.email, note: 'LEAD_1' },
    { role: 'Lead Sentinel (Thomas)', name: 'Yanis Monney', phone: yanis.phone, email: yanis.email, note: 'LEAD_2' },
    { role: 'Sentinel (Thomas)', name: 'Léon Aebi', phone: leon.phone, email: leon.email, note: '' },
    { role: 'Sentinel, Études (Thomas)', name: 'Juliette Kolly', phone: juliette.phone, email: juliette.email, note: 'accepted' },
    { role: 'Sentinel, Études (Thomas)', name: 'Maxime Dupasquier', phone: maxime.phone, email: maxime.email, note: 'accepted' },
    { role: 'Sentinel, Études (Thomas)', name: 'Alicia Nguyen', phone: alicia.phone, email: alicia.email, note: 'PENDING' },
    { role: 'Sentinel, Famille (Thomas)', name: 'Damien Chassot', phone: damien.phone, email: damien.email, note: 'accepted' },
    { role: 'Sentinel, Famille (Thomas)', name: 'Coralie', phone: coralie.phone, email: coralie.email, note: 'accepted, SMS only, no account' },
  ].map((r) => ({ ...r, email: r.email ?? '— (SMS only, no account)' }));

  console.log(`\nSeed complete. Password for every full account: ${SEED_PASSWORD}\n`);
  console.table(rows);

  const md = [
    '# Seeded dev accounts (local only — never commit)',
    '',
    `Generated by \`npm run seed:dev\` (backend/prisma/seed.ts) — re-run anytime, it's idempotent.`,
    '',
    `Password for every full account: \`${SEED_PASSWORD}\``,
    '',
    '| Role | Name | Phone | Email | Note |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.role} | ${r.name} | ${r.phone} | ${r.email} | ${r.note} |`),
  ].join('\n');
  writeFileSync(join(__dirname, '../test-users.local.md'), md + '\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
