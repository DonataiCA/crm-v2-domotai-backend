export const transformUser = (user: { id: string; email: string; firstName: string; lastName: string; password?: string | null; gender: string; phoneNumber: string; providerId?: string | null; authProvider?: string; role?: string; createdAt: Date; updatedAt: Date }) => ({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    gender: user.gender,
    phoneNumber: user.phoneNumber,
    providerId: user.providerId ?? null,
    authProvider: user.authProvider ?? null,
    role: user.role ?? 'USER',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
});

export const transformUsers = (users: Array<{ id: string; email: string; firstName: string; lastName: string; password?: string | null; gender: string; phoneNumber: string; providerId?: string | null; authProvider?: string; role?: string; createdAt: Date; updatedAt: Date }>) =>
    users.map(transformUser);

export const transformUserWithRelations = (user: any) => {
    const profile = user.profile;
    return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: profile?.fullName || `${user.firstName} ${user.lastName}`,
        gender: user.gender,
        phoneNumber: user.phoneNumber,
        providerId: user.providerId ?? null,
        authProvider: user.authProvider ?? null,
        role: profile?.role || (user.role === 'ADMIN' ? 'admin' : 'salesman'),
        commissionRate: profile?.commissionRate ?? 5.0,
        currentOrganizationId: profile?.currentOrganizationId ?? null,
        shouldChangePassword: profile?.shouldChangePassword ?? false,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
};

