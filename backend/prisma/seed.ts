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
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

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
  lastName: string | null;
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

// Find-or-create a circle and link every member into it — ACCEPTED unless
// stated. Reusing an existing label just adds members to that circle.
async function fillCircle(
  userCompanionId: string,
  label: string,
  circleType: CircleType,
  members: { sentinel: { id: string }; status?: LinkStatus; leadSlot?: LeadSlot }[],
) {
  const circle = await findOrCreateCircle(userCompanionId, label, circleType);
  for (const m of members) {
    await linkSentinel({
      userSentinelId: m.sentinel.id,
      userCompanionId,
      circleId: circle.id,
      status: m.status ?? LinkStatus.ACCEPTED,
      leadSlot: m.leadSlot,
    });
  }
  return circle;
}

// Mirrors SentinelService.createGroup + respondToGroupInvitation: the
// founder's GROUP circle is the root, every other member gets their own
// GROUP circle pointing at it plus an ACCEPTED invitation, and every directed
// pair is linked in the companion's group circle — unless that pair is
// already linked (from outside the group), which is left untouched.
async function seedGroup(
  founder: { id: string },
  label: string,
  members: { user: { id: string }; invitedBy: { id: string } }[],
) {
  await prisma.user.update({ where: { id: founder.id }, data: { hasPaid: true } });
  const root =
    (await prisma.circle.findFirst({
      where: { userCompanionId: founder.id, label, circleType: CircleType.GROUP, groupRootId: null },
    })) ??
    (await prisma.circle.create({
      data: { userCompanionId: founder.id, label, circleType: CircleType.GROUP },
    }));

  const circles = [root];
  for (const m of members) {
    circles.push(
      await prisma.circle.upsert({
        where: { userCompanionId_groupRootId: { userCompanionId: m.user.id, groupRootId: root.id } },
        update: {},
        create: { userCompanionId: m.user.id, label, circleType: CircleType.GROUP, groupRootId: root.id },
      }),
    );
    await prisma.sentinelGroupInvitation.upsert({
      where: { groupRootId_invitedUserId: { groupRootId: root.id, invitedUserId: m.user.id } },
      update: { status: LinkStatus.ACCEPTED },
      create: {
        groupRootId: root.id,
        invitedUserId: m.user.id,
        invitedById: m.invitedBy.id,
        status: LinkStatus.ACCEPTED,
      },
    });
  }

  for (const companionCircle of circles) {
    for (const sentinelCircle of circles) {
      const userSentinelId = sentinelCircle.userCompanionId;
      const userCompanionId = companionCircle.userCompanionId;
      if (userSentinelId === userCompanionId) continue;
      const existing = await prisma.linkSentinels.findUnique({
        where: { userSentinelId_userCompanionId: { userSentinelId, userCompanionId } },
      });
      if (existing) continue;
      await prisma.linkSentinels.create({
        data: {
          userSentinelId,
          userCompanionId,
          circleId: companionCircle.id,
          status: LinkStatus.ACCEPTED,
          initiatedBy: LinkInitiator.COMPANION,
          sentinelType: SentinelType.SENTINEL,
        },
      });
    }
  }
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
    status: LinkStatus.ACCEPTED,
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
    status: LinkStatus.ACCEPTED,
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

  // ---- Cross-links: turn the 4 separate stars above into one web. Companions
  // watch over each other, Sentinels watch over several people, and several
  // Sentinels become companions themselves. Every pair below is new — the
  // @@unique([userSentinelId, userCompanionId]) allows only one link per pair.
  // Emma stays Sentinel-less (her 409 case) but watches over others.

  // Companions watching over each other.
  await fillCircle(lea.id, 'Amis', CircleType.BASIC, [
    { sentinel: noah },
    { sentinel: thomas },
    { sentinel: zoe },
  ]);
  await fillCircle(lea.id, 'Voisins', CircleType.BASIC, [{ sentinel: emma }]);
  await fillCircle(lea.id, 'Travail', CircleType.BASIC, [{ sentinel: juliette }]);
  await fillCircle(noah.id, 'Premier cercle', CircleType.FIRST, [{ sentinel: chloe }]);
  await fillCircle(noah.id, 'Amis', CircleType.BASIC, [
    { sentinel: lea },
    { sentinel: gabriel },
  ]);
  await fillCircle(noah.id, 'Sport', CircleType.BASIC, [{ sentinel: oceane }]);
  await fillCircle(noah.id, 'Quartier', CircleType.BASIC, [
    { sentinel: emma },
    { sentinel: camille },
  ]);
  await fillCircle(thomas.id, 'Premier cercle', CircleType.FIRST, [{ sentinel: lea }]);
  await fillCircle(thomas.id, 'Études', CircleType.BASIC, [{ sentinel: noah }]);
  await fillCircle(thomas.id, 'Amis', CircleType.BASIC, [
    { sentinel: gabriel },
    { sentinel: hugo },
    { sentinel: zoe },
    { sentinel: lucas },
  ]);

  // Sentinels who are companions too.
  await fillCircle(gabriel.id, 'Premier cercle', CircleType.FIRST, [
    { sentinel: lea, leadSlot: LeadSlot.LEAD_1 },
    { sentinel: chloe },
    { sentinel: mathis },
  ]);
  await fillCircle(gabriel.id, 'Famille', CircleType.BASIC, [{ sentinel: theo }]);

  await fillCircle(zoe.id, 'Premier cercle', CircleType.FIRST, [
    { sentinel: noah, leadSlot: LeadSlot.LEAD_1 },
    { sentinel: hugo, leadSlot: LeadSlot.LEAD_2 },
    { sentinel: manon },
  ]);
  await fillCircle(zoe.id, 'Amis', CircleType.BASIC, [
    { sentinel: elise },
    { sentinel: gabriel, status: LinkStatus.PENDING },
  ]);

  await fillCircle(oceane.id, 'Premier cercle', CircleType.FIRST, [
    { sentinel: thomas, leadSlot: LeadSlot.LEAD_1 },
    { sentinel: yanis },
    { sentinel: juliette },
  ]);
  await fillCircle(oceane.id, 'Sport', CircleType.BASIC, [
    { sentinel: julien },
    { sentinel: nadia },
  ]);

  await fillCircle(chloe.id, 'Premier cercle', CircleType.FIRST, [
    { sentinel: mathis, leadSlot: LeadSlot.LEAD_1 },
    { sentinel: gabriel },
  ]);
  await fillCircle(chloe.id, 'Voisins', CircleType.BASIC, [
    { sentinel: camille },
    { sentinel: sarah, status: LinkStatus.PENDING },
  ]);

  await fillCircle(ines.id, 'Premier cercle', CircleType.FIRST, [
    { sentinel: maxime, leadSlot: LeadSlot.LEAD_1 },
    { sentinel: damien },
    { sentinel: alicia },
  ]);

  // ---- Demo set: Léa, Gabriel, Chloé, Mathis — Gabriel and Chloé have
  // 12–20 links (as Sentinel or companion), Léa and Mathis many more through
  // the Chorale group below. Mathis is the only one with no Lead
  // Sentinel, and the 8 PENDING links of the whole seed all involve one of them.
  await fillCircle(lea.id, 'Immeuble', CircleType.BASIC, [
    { sentinel: elise },
    { sentinel: romain },
    { sentinel: leon },
    { sentinel: nadia },
  ]);
  await fillCircle(lea.id, 'Famille', CircleType.BASIC, [
    { sentinel: damien },
    { sentinel: coralie },
    { sentinel: alicia },
  ]);
  await fillCircle(lea.id, 'Sport', CircleType.BASIC, [
    { sentinel: julien },
    { sentinel: nicolas },
    { sentinel: hugo },
  ]);
  await fillCircle(lea.id, 'Travail', CircleType.BASIC, [{ sentinel: maxime }]);

  await fillCircle(mathis.id, 'Premier cercle', CircleType.FIRST, [
    { sentinel: chloe },
    { sentinel: leon },
    { sentinel: gabriel },
    { sentinel: lea },
  ]);
  await fillCircle(mathis.id, 'Amis', CircleType.BASIC, [
    { sentinel: hugo },
    { sentinel: yanis },
    { sentinel: juliette, status: LinkStatus.PENDING },
  ]);
  await fillCircle(noah.id, 'Sport', CircleType.BASIC, [{ sentinel: mathis }]);
  await fillCircle(thomas.id, 'Études', CircleType.BASIC, [{ sentinel: mathis }]);
  await fillCircle(oceane.id, 'Sport', CircleType.BASIC, [{ sentinel: mathis }]);

  await fillCircle(gabriel.id, 'Famille', CircleType.BASIC, [{ sentinel: laura }]);
  await fillCircle(gabriel.id, 'Sport', CircleType.BASIC, [
    { sentinel: julien },
    { sentinel: nicolas },
  ]);
  await fillCircle(gabriel.id, 'Travail', CircleType.BASIC, [
    { sentinel: ines, status: LinkStatus.PENDING },
    { sentinel: maxime, status: LinkStatus.PENDING },
  ]);

  await fillCircle(chloe.id, 'Premier cercle', CircleType.FIRST, [{ sentinel: lea }]);
  await fillCircle(chloe.id, 'Voisins', CircleType.BASIC, [{ sentinel: lucas }]);
  await fillCircle(chloe.id, 'Amis', CircleType.BASIC, [
    { sentinel: manon },
    { sentinel: elise },
    { sentinel: oceane, status: LinkStatus.PENDING },
  ]);
  await fillCircle(thomas.id, 'Amis', CircleType.BASIC, [{ sentinel: chloe }]);

  // ---- Deji: linked both ways with Léa, Mathis and Chloé ----
  // In their "Amis" circles, and they make up his own 1st circle (Léa as
  // Lead), so he can be tried as Sentinel and as companion.
  const deji = await upsertAccount({
    firstName: 'Deji',
    lastName: null,
    phone: '+41791234500',
    email: 'deji@testmsc.ch',
    userName: 'deji',
  });
  await fillCircle(lea.id, 'Amis', CircleType.BASIC, [{ sentinel: deji }]);
  await fillCircle(mathis.id, 'Amis', CircleType.BASIC, [{ sentinel: deji }]);
  await fillCircle(chloe.id, 'Amis', CircleType.BASIC, [{ sentinel: deji }]);
  await fillCircle(deji.id, 'Premier cercle', CircleType.FIRST, [
    { sentinel: lea, leadSlot: LeadSlot.LEAD_1 },
    { sentinel: mathis },
  ]);
  // Chloé is a work colleague, not in his 1st circle (the upsert moves her
  // there on a re-run).
  await fillCircle(deji.id, 'Travail', CircleType.BASIC, [
    { sentinel: chloe },
    { sentinel: ines },
    { sentinel: maxime },
    { sentinel: romain },
  ]);
  await fillCircle(deji.id, 'Voisins', CircleType.BASIC, [
    { sentinel: lucas },
    { sentinel: camille },
    { sentinel: nadia },
  ]);

  // A 14-member group circle founded by Léa, with Mathis in it. Each
  // invitation comes from someone already linked to the invitee (the trust
  // chain inviteToGroup enforces) — Yanis and Océane through Mathis.
  await seedGroup(lea, 'Chorale', [
    { user: mathis, invitedBy: lea },
    { user: theo, invitedBy: lea },
    { user: laura, invitedBy: lea },
    { user: camille, invitedBy: lea },
    { user: lucas, invitedBy: lea },
    { user: julien, invitedBy: lea },
    { user: nicolas, invitedBy: lea },
    { user: hugo, invitedBy: lea },
    { user: elise, invitedBy: lea },
    { user: juliette, invitedBy: lea },
    { user: damien, invitedBy: lea },
    { user: yanis, invitedBy: mathis },
    { user: oceane, invitedBy: mathis },
  ]);

  const rows = [
    { role: 'Companion', name: 'Léa Dubois', phone: lea.phone, email: lea.email, note: 'DEMO — 45 links, founder of group Chorale (14). Premier cercle (3) + Travail (4) + Voisins (4) + Immeuble (4) + Famille (5) + Sport (3) + Amis (3); also Lead of Gabriel, Sentinel of Noah/Thomas/Chloé/Mathis' },
    { role: 'Companion', name: 'Noah Keller', phone: noah.phone, email: noah.email, note: 'Premier cercle (3) + Amis (4) + Sport (3) + Quartier (4); also Lead of Zoé, Sentinel of Léa/Thomas' },
    { role: 'Companion', name: 'Thomas Guillod', phone: thomas.phone, email: thomas.email, note: 'Premier cercle (4, 2 Leads) + Études (4) + Famille (2) + Amis (4); also Lead of Océane, Sentinel of Léa' },
    { role: 'Companion', name: 'Emma Favre', phone: emma.phone, email: emma.email, note: 'Premier cercle vide — pas de Lead Sentinel; Sentinel of Léa/Noah' },
    { role: 'Companion + Sentinel', name: 'Gabriel Rochat', phone: gabriel.phone, email: gabriel.email, note: 'DEMO — 15 links. own: Premier cercle (3, Lead Léa) + Famille (2) + Sport (2) + Travail (2 PENDING)' },
    { role: 'Companion + Sentinel', name: 'Zoé Currat', phone: zoe.phone, email: zoe.email, note: 'own: Premier cercle (3, Leads Noah/Hugo) + Amis (2)' },
    { role: 'Companion + Sentinel', name: 'Océane Bersier', phone: oceane.phone, email: oceane.email, note: 'own: Premier cercle (3, Lead Thomas) + Sport (2)' },
    { role: 'Companion + Sentinel', name: 'Chloé Morel', phone: chloe.phone, email: chloe.email, note: 'DEMO — 14 links. own: Premier cercle (3, Lead Mathis) + Voisins (3) + Amis (3)' },
    { role: 'Companion + Sentinel', name: 'Inès Bovet', phone: ines.phone, email: ines.email, note: 'own: Premier cercle (3, Lead Maxime)' },
    { role: 'Companion + Sentinel', name: 'Deji', phone: deji.phone, email: deji.email, note: 'own: Premier cercle (2, Lead Léa) + Travail (4, with Chloé) + Voisins (3); Sentinel in the Amis of Léa, Mathis, Chloé' },
    { role: 'Companion + Sentinel', name: 'Mathis Perrin', phone: mathis.phone, email: mathis.email, note: 'DEMO — 33 links, member of group Chorale. own: Premier cercle (4, NO Lead) + Amis (3)' },
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
    { role: 'Sentinel, Quartier (Noah)', name: 'Romain Cuche', phone: romain.phone, email: romain.email, note: 'accepted' },
    { role: 'Lead Sentinel (Thomas)', name: 'Océane Bersier', phone: oceane.phone, email: oceane.email, note: 'LEAD_1' },
    { role: 'Lead Sentinel (Thomas)', name: 'Yanis Monney', phone: yanis.phone, email: yanis.email, note: 'LEAD_2' },
    { role: 'Sentinel (Thomas)', name: 'Léon Aebi', phone: leon.phone, email: leon.email, note: '' },
    { role: 'Sentinel, Études (Thomas)', name: 'Juliette Kolly', phone: juliette.phone, email: juliette.email, note: 'accepted' },
    { role: 'Sentinel, Études (Thomas)', name: 'Maxime Dupasquier', phone: maxime.phone, email: maxime.email, note: 'accepted' },
    { role: 'Sentinel, Études (Thomas)', name: 'Alicia Nguyen', phone: alicia.phone, email: alicia.email, note: 'accepted' },
    { role: 'Sentinel, Famille (Thomas)', name: 'Damien Chassot', phone: damien.phone, email: damien.email, note: 'accepted' },
    { role: 'Sentinel, Famille (Thomas)', name: 'Coralie', phone: coralie.phone, email: coralie.email, note: 'accepted, SMS only, no account' },
  ].map((r) => ({ ...r, email: r.email ?? '— (SMS only, no account)' }));

  // ---- The feedback inbox (Give feedback page) — see SupportService. Its
  // email must match SUPPORT_EMAIL in backend/.env. Nobody sees it as a
  // contact; logged in as it, you read every feedback in Messages.
  await upsertAccount({
    firstName: 'Équipe',
    lastName: 'MySentinelCircle',
    phone: '+41790000001',
    email: 'support@testmsc.ch',
    userName: 'msc_support',
  });

  await seedDemoAvatars();
  await seedDemoStatuses();

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

// Demo profile photos (illustrated flowers/portraits, committed under
// prisma/demo-avatars/), for about half the accounts, so the UI shows both
// cases. Keyed by phone, like the accounts themselves. Copied under a random
// name into uploads/avatars/ — same layout as a real upload (see
// UserController.uploadAvatar) — and only for an account with no photo yet:
// idempotent, and never overwrites one changed by hand.
const DEMO_AVATARS: { phone: string; file: string }[] = [
  { phone: '+41791112233', file: 'lea.png' },
  { phone: '+41791556677', file: 'chloe.png' },
  { phone: '+41781667788', file: 'mathis.png' },
  { phone: '+41791223355', file: 'camille.png' },
  { phone: '+41771445577', file: 'sarah.png' },
  { phone: '+41791667799', file: 'laura.png' },
  { phone: '+41791990011', file: 'zoe.png' },
  { phone: '+41781778800', file: 'nicolas.png' },
  { phone: '+41761990022', file: 'julien.png' },
  { phone: '+41761667700', file: 'romain.png' },
  { phone: '+41791778811', file: 'oceane.png' },
  { phone: '+41771990033', file: 'leon.png' },
  { phone: '+41791112255', file: 'maxime.png' },
  { phone: '+41771334477', file: 'damien.png' },
  { phone: '+41791234500', file: 'deji.png' },
];

// Demo public statuses (the line shown under a name on a person page and
// in a conversation header), for about half the accounts. Same rules as the
// photos: keyed by phone, only set when the account has none — never
// overwrites a status changed by hand.
const DEMO_STATUSES: { phone: string; status: string }[] = [
  { phone: '+41791112233', status: 'En vacances jusqu\'au 12' },
  { phone: '+41781667788', status: 'Dispo le soir et le week-end' },
  { phone: '+41791223355', status: 'Au travail jusqu\'à 18h, je réponds après' },
  { phone: '+41771445577', status: 'En déplacement à Genève cette semaine' },
  { phone: '+41791667799', status: 'Ne pas appeler après 22h' },
  { phone: '+41791990011', status: 'Sans réseau en montagne jusqu\'à dimanche' },
  { phone: '+41781778800', status: 'Toujours joignable par SMS' },
  { phone: '+41771889911', status: 'En congé maternité, SMS plutôt qu\'appel' },
  { phone: '+41761667700', status: 'J\'habite à 5 minutes du centre' },
  { phone: '+41791778811', status: 'Infirmière, horaires de nuit cette semaine' },
  { phone: '+41761001144', status: 'En examens, réponses lentes' },
  { phone: '+41781223366', status: 'Dispo pour aider, j\'ai une voiture' },
  { phone: '+41771334455', status: 'De retour lundi' },
  { phone: '+41781445588', status: 'Je parle français, allemand et anglais' },
];

async function seedDemoStatuses() {
  let added = 0;
  for (const { phone, status } of DEMO_STATUSES) {
    const updated = await prisma.user.updateMany({
      where: { phone, publicStatus: null },
      data: { publicStatus: status },
    });
    added += updated.count;
  }
  console.log(`[seed] Demo public statuses added: ${added}`);
}

async function seedDemoAvatars() {
  const avatarDir = join(process.cwd(), 'uploads', 'avatars');
  mkdirSync(avatarDir, { recursive: true });
  let added = 0;
  for (const { phone, file } of DEMO_AVATARS) {
    const source = join(__dirname, 'demo-avatars', file);
    if (!existsSync(source)) continue;
    const user = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, avatarPath: true },
    });
    if (!user || user.avatarPath) continue;
    const filename = `${randomUUID()}.png`;
    copyFileSync(source, join(avatarDir, filename));
    await prisma.user.update({
      where: { id: user.id },
      data: { avatarPath: filename },
    });
    added++;
  }
  console.log(`[seed] Demo profile photos added: ${added}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
