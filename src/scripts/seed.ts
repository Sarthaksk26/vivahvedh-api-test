import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding test accounts...\n');

  const password = await bcrypt.hash('Test@123', 10);

  // ==========================================
  // 1. ADMIN ACCOUNT
  // ==========================================
  const admin = await prisma.user.upsert({
    where: { mobile: '9999000001' },
    update: {},
    create: {
      regId: 'VV-ADMIN1',
      mobile: '9999000001',
      email: 'admin@vivahvedh.test',
      password,
      role: 'ADMIN',
      accountStatus: 'ACTIVE',
      planType: 'GOLD',
      profile: {
        create: {
          firstName: 'Vivahvedh',
          lastName: 'Admin',
          gender: 'MALE',
          maritalStatus: 'UNMARRIED',
          aboutMe: 'Platform administrator account for managing Vivahvedh Matrimony.',
        }
      }
    }
  });
  console.log('✅ Admin created:', admin.regId);

  // ==========================================
  // 2. GOLD PLAN USER — Male Groom
  // ==========================================
  const goldUser = await prisma.user.upsert({
    where: { mobile: '9999000002' },
    update: {},
    create: {
      regId: 'VV-100201',
      mobile: '9999000002',
      email: 'rahul.test@vivahvedh.test',
      password,
      role: 'USER',
      accountStatus: 'ACTIVE',
      planType: 'GOLD',
      paymentDone: true,
      planExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      profile: {
        create: {
          firstName: 'Rahul',
          lastName: 'Deshmukh',
          gender: 'MALE',
          maritalStatus: 'UNMARRIED',
          aboutMe: 'Software Engineer based in Pune. Love hiking, cooking, and reading. Looking for a life partner who shares family values and has a positive outlook on life.',
          birthPlace: 'Pune',
        }
      },
      physical: {
        create: {
          height: 178,
          weight: 75,
          bloodGroup: 'B+',
          complexion: 'Wheatish',
          diet: 'Vegetarian',
          smoke: false,
          drink: false,
        }
      },
      education: {
        create: {
          trade: 'B.Tech Computer Science',
          college: 'College of Engineering, Pune',
          jobBusiness: 'Senior Software Engineer at TCS',
          annualIncome: '12 LPA',
          specialAchievement: 'Published research paper in AI/ML domain.',
        }
      },
      family: {
        create: {
          fatherName: 'Suresh Deshmukh',
          fatherOccupation: 'Retired Government Officer',
          motherName: 'Sunita Deshmukh',
          motherOccupation: 'Homemaker',
          brothers: 1,
          marriedBrothers: 0,
          sisters: 1,
          marriedSisters: 1,
          familyWealth: 'Own house in Pune, Agricultural land in Satara.',
        }
      },
      astrology: {
        create: {
          gothra: 'Kashyap',
          rashi: 'वृश्चिक',
          nakshatra: 'Anuradha',
          nadi: 'मध्य',
          gan: 'देव',
          mangal: 'No',
        }
      },
      preferences: {
        create: {
          expectations: 'Looking for an educated, family-oriented girl. Preferably from Pune or Mumbai. Should value traditions and have a modern outlook.',
        }
      }
    }
  });
  console.log('✅ Gold User (Male) created:', goldUser.regId);

  // ==========================================
  // 3. SILVER PLAN USER — Female Bride
  // ==========================================
  const silverUser = await prisma.user.upsert({
    where: { mobile: '9999000003' },
    update: {},
    create: {
      regId: 'VV-100302',
      mobile: '9999000003',
      email: 'priya.test@vivahvedh.test',
      password,
      role: 'USER',
      accountStatus: 'ACTIVE',
      planType: 'SILVER',
      paymentDone: true,
      planExpiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 6 months
      profile: {
        create: {
          firstName: 'Priya',
          lastName: 'Kulkarni',
          gender: 'FEMALE',
          maritalStatus: 'UNMARRIED',
          aboutMe: 'CA working in Mumbai. Passionate about music and travel. Looking for a partner who is ambitious, caring, and supportive.',
          birthPlace: 'Nashik',
        }
      },
      physical: {
        create: {
          height: 162,
          weight: 55,
          bloodGroup: 'A+',
          complexion: 'Fair',
          diet: 'Vegetarian',
          smoke: false,
          drink: false,
        }
      },
      education: {
        create: {
          trade: 'Chartered Accountant (CA)',
          college: 'Symbiosis College, Pune',
          jobBusiness: 'Senior Auditor at Deloitte',
          annualIncome: '15 LPA',
        }
      },
      family: {
        create: {
          fatherName: 'Anil Kulkarni',
          fatherOccupation: 'Business Owner',
          motherName: 'Meera Kulkarni',
          motherOccupation: 'School Teacher',
          brothers: 0,
          marriedBrothers: 0,
          sisters: 1,
          marriedSisters: 0,
        }
      },
      astrology: {
        create: {
          gothra: 'Bharadwaj',
          rashi: 'कन्या',
          nakshatra: 'Hasta',
          nadi: 'आद्य',
          gan: 'मानव',
          mangal: 'No',
        }
      },
      preferences: {
        create: {
          expectations: 'Looking for a well-educated, professional groom. Age 27-32. Preferably from Maharashtra. Should be understanding and supportive of working women.',
        }
      }
    }
  });
  console.log('✅ Silver User (Female) created:', silverUser.regId);

  // ==========================================
  // 4. FREE PLAN USER — Male (Pending Approval)
  // ==========================================
  const freeUser = await prisma.user.upsert({
    where: { mobile: '9999000004' },
    update: {},
    create: {
      regId: 'VV-100403',
      mobile: '9999000004',
      email: 'amit.test@vivahvedh.test',
      password,
      role: 'USER',
      accountStatus: 'INACTIVE', // Pending admin approval
      planType: 'FREE',
      profile: {
        create: {
          firstName: 'Amit',
          lastName: 'Patil',
          gender: 'MALE',
          maritalStatus: 'DIVORCED',
          aboutMe: 'Teacher in Nagpur. Looking for a fresh start with an understanding partner.',
          birthPlace: 'Nagpur',
        }
      },
      physical: {
        create: {
          height: 170,
          weight: 68,
          bloodGroup: 'O+',
          complexion: 'Medium',
          diet: 'Non-Vegetarian',
          smoke: false,
          drink: false,
        }
      },
      education: {
        create: {
          trade: 'M.Ed Education',
          college: 'Nagpur University',
          jobBusiness: 'High School Teacher',
          annualIncome: '5 LPA',
        }
      },
      family: {
        create: {
          fatherName: 'Ramesh Patil',
          fatherOccupation: 'Farmer',
          motherName: 'Kavita Patil',
          motherOccupation: 'Homemaker',
          brothers: 2,
          marriedBrothers: 1,
          sisters: 1,
          marriedSisters: 1,
          familyWealth: 'Agricultural land in Nagpur district.',
        }
      }
    }
  });
  console.log('✅ Free User (Pending) created:', freeUser.regId);

  console.log('\n🎉 All test accounts seeded successfully!\n');
  console.log('┌──────────────────────────────────────────────────────────────────────┐');
  console.log('│                    TEST ACCOUNT CREDENTIALS                         │');
  console.log('├────────────┬───────────────┬───────────┬──────────┬─────────────────┤');
  console.log('│ Role       │ Username      │ Password  │ Plan     │ Status          │');
  console.log('├────────────┼───────────────┼───────────┼──────────┼─────────────────┤');
  console.log('│ ADMIN      │ 9999000001    │ Test@123  │ Gold     │ Active          │');
  console.log('│ USER       │ 9999000002    │ Test@123  │ Gold     │ Active          │');
  console.log('│ USER       │ 9999000003    │ Test@123  │ Silver   │ Active          │');
  console.log('│ USER       │ 9999000004    │ Test@123  │ Free     │ Pending Approval│');
  console.log('└────────────┴───────────────┴───────────┴──────────┴─────────────────┘');

  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error('❌ Seed failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
