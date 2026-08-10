import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
});

async function main() {
    console.log('🌱 Creating admin user...');

    try {
        // Test database connection
        await prisma.$connect();
        console.log('✅ Database connected successfully');
    } catch (error) {
        console.error('❌ Failed to connect to database:', error);
        throw error;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('develop', 12);

    // Check if admin already exists
    const existingAdmin = await prisma.user.findUnique({
        where: { email: 'admin@example.com' }
    });

    if (existingAdmin) {
        console.log('⚠️  Admin user already exists. Updating password...');

        const updatedAdmin = await prisma.user.update({
            where: { email: 'admin@example.com' },
            data: {
                password: hashedPassword,
                role: 'ADMIN'
            }
        });

        console.log('✅ Admin user updated successfully');
        console.log(`📧 Email: ${updatedAdmin.email}`);
        console.log(`🔑 Password: develop`);
        console.log(`👤 Role: ${updatedAdmin.role}`);
    } else {
        // Create admin user
        const adminUser = await prisma.user.create({
            data: {
                firstName: 'Admin',
                lastName: 'System',
                email: 'admin@example.com',
                password: hashedPassword,
                gender: 'M',
                phoneNumber: '+0000000000',
                authProvider: 'EMAIL',
                role: 'ADMIN'
            }
        });

        console.log('✅ Admin user created successfully');
        console.log('\n📊 Admin Details:');
        console.log(`📧 Email: ${adminUser.email}`);
        console.log(`🔑 Password: develop`);
        console.log(`👤 Name: ${adminUser.firstName} ${adminUser.lastName}`);
        console.log(`🎭 Role: ${adminUser.role}`);
        console.log(`🆔 ID: ${adminUser.id}`);
    }
}

main()
    .catch((e) => {
        console.error('❌ Error during seeding:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

