import { PrismaClient } from '@prisma/client';

// Define subscription plan types to match the Prisma schema
type SubscriptionPlan = 'FREE' | 'PRO' | 'TEAM';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Starting seed...');

    // Create test users with different subscription plans
    // 1. Free user
    const freeUser = await createUser('free@example.com', 'Free User', 'password123', 'FREE');
    
    // 2. Pro user
    const proUser = await createUser('pro@example.com', 'Pro User', 'password123', 'PRO');
    
    // 3. Team admin
    const teamAdmin = await createUser('admin@example.com', 'Team Admin', 'password123', 'TEAM', true);
    
    // 4. Team member
    const teamMember = await createUser('member@example.com', 'Team Member', 'password123', 'TEAM', false);

    console.log('Seed completed successfully!');
    console.log('Created users:');
    console.log(`- Free User (${freeUser.email})`);
    console.log(`- Pro User (${proUser.email})`);
    console.log(`- Team Admin (${teamAdmin.email})`);
    console.log(`- Team Member (${teamMember.email})`);
    console.log('All passwords are: password123');
  } catch (error) {
    console.error('Error during seeding:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function createUser(
  email: string, 
  name: string,
  password: string,
  plan: SubscriptionPlan = 'FREE',
  isAdmin: boolean = false
) {
  // Hash the password
  const hashedPassword = await bcrypt.hash(password, 10);
  
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });
    
    if (existingUser) {
      console.log(`User with email ${email} already exists. Updating...`);
      
      // Update the user
      const updatedUser = await prisma.user.update({
        where: { email },
        data: {
          name,
          password: hashedPassword
        }
      });
      
      // Upsert the subscription
      // @ts-ignore - UserSubscription exists in the schema but TypeScript doesn't recognize it yet
      await prisma.userSubscription.upsert({
        where: { userId: updatedUser.id },
        update: {
          plan,
          isAdmin,
          expiresAt: plan !== 'FREE' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null
        },
        create: {
          userId: updatedUser.id,
          plan,
          isAdmin,
          expiresAt: plan !== 'FREE' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null
        }
      });
      
      return updatedUser;
    } else {
      // Create a new user with subscription
      // Using a two-step process to work around Prisma TypeScript limitations
      const newUser = await prisma.user.create({
        data: {
          email,
          name,
          password: hashedPassword
        }
      });
      
      // Create subscription separately
      // @ts-ignore - UserSubscription exists in the schema but TypeScript doesn't recognize it yet
      await prisma.userSubscription.create({
        data: {
          userId: newUser.id,
          plan,
          isAdmin,
          expiresAt: plan !== 'FREE' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null
        }
      });
      
      return newUser;
    }
  } catch (error) {
    console.error(`Error creating/updating user ${email}:`, error);
    throw error;
  }
}

// Execute the main function
main()
  .catch((e) => {
    console.error('Error in seed script:', e);
    process.exit(1);
  });
