import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { ApiError } from "../utils/api-error";
import { hashPassword, verifyPassword } from "../utils/password.util";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.util";
import { generateSecureToken, hashToken } from "../utils/token.util";
import { createAuditLog } from "./audit.service";
import { sendVerificationEmail, sendPasswordResetEmail } from "./email.service";
import * as userService from "./user.service";
import type { RequestMeta } from "../utils/request-meta.util";
import type {
    RegisterInput,
    LoginInput,
    ChangePasswordInput,
} from "../modules/auth/auth.schema";
export async function register(data: RegisterInput, meta: RequestMeta) {
    const { email, username, password } = data;
    const existing = await userService.findByEmail(email);
    if (existing) {
        throw ApiError.conflict("An account with this email already exists");
    }
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
        data: {
            email,
            username,
            password: passwordHash,
            emailverified: false,
        },
        select: {
            id: true,
            email: true,
            username: true,
            emailverified: true,
            createdAt: true,
        },
    });
    const rawToken = generateSecureToken();
    const hashedToken = hashToken(rawToken);

    await prisma.emailVerificationToken.create({
        data: {
            userId: user.id,
            token: hashedToken,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
    });
    await sendVerificationEmail(user.email, user.username, rawToken);
    await createAuditLog({
        userId: user.id,
        action: "USER_REGISTERED",
        resource: "User",
        resourceId: user.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
    });

    return {
        user,
        message: "Registration successful. Please check your email to verify your account.",
    };
}
export async function login(data: LoginInput, meta: RequestMeta) {
    const { email, password } = data;
    const user = await userService.findByEmailWithPassword(email);
    if (!user) {
        throw ApiError.unauthorized("Invalid email or password");
    }
    if (!user.isActive) {
        throw ApiError.forbidden(
            "Your account has been suspended. Please contact support.",
        );
    }
    const passwordValid = await verifyPassword(password, user.password);
    if (!passwordValid) {
        await createAuditLog({
            userId: user.id,
            action: "SUSPICIOUS_LOGIN",
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
            metadata: { reason: "invalid_password" },
        });
        throw ApiError.unauthorized("Invalid email or password");
    }
    const accessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        username: user.username,
    });
    const { raw: refreshTokenRaw, hash: refreshTokenHash } =
        await signRefreshToken();
    const expiresAt = new Date(
        Date.now() + env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );
    await prisma.refreshToken.create({
        data: {
            userId: user.id,
            token: refreshTokenHash,
            expiresAt,
            userAgent: meta.userAgent,
            ipAddress: meta.ipAddress,
            deviceName: meta.deviceName,
            lastUsedAt: new Date(),
        },
    });
    await createAuditLog({
        userId: user.id,
        action: "USER_LOGIN",
        resource: "User",
        resourceId: user.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
    });
    const { password: _pw, ...safeUser } = user;
    return {
        accessToken,
        refreshToken: refreshTokenRaw,
        user: safeUser,
    };
}
export async function refreshAccessToken(
    rawToken: string,
    meta: RequestMeta,
) {
    const allTokens = await prisma.refreshToken.findMany({
        where: { revoked: false },
        include: { user: { select: { id: true, email: true, username: true, isActive: true, emailverified: true } } },
    });
    let matchedToken: (typeof allTokens)[number] | null = null;
    for (const record of allTokens) {
        const isMatch = await verifyRefreshToken(rawToken, record.token);
        if (isMatch) {
            matchedToken = record;
            break;
        }
    }
    if (!matchedToken) {
        throw ApiError.unauthorized("Invalid refresh token");
    }
    if (matchedToken.expiresAt < new Date()) {
        await prisma.refreshToken.update({
            where: { id: matchedToken.id },
            data: { revoked: true, revokedAt: new Date() },
        });
        throw ApiError.unauthorized("Refresh token has expired. Please log in again.");
    }
    if (!matchedToken.user.isActive) {
        throw ApiError.forbidden("Account has been suspended");
    }
    await prisma.refreshToken.update({
        where: { id: matchedToken.id },
        data: {
            revoked: true,
            revokedAt: new Date(),
            lastUsedAt: new Date(),
        },
    });
    const accessToken = signAccessToken({
        sub: matchedToken.user.id,
        email: matchedToken.user.email,
        username: matchedToken.user.username,
    });

    const { raw: newRefreshRaw, hash: newRefreshHash } =
        await signRefreshToken();

    const expiresAt = new Date(
        Date.now() + env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    await prisma.refreshToken.create({
        data: {
            userId: matchedToken.user.id,
            token: newRefreshHash,
            expiresAt,
            userAgent: meta.userAgent,
            ipAddress: meta.ipAddress,
            deviceName: meta.deviceName,
            lastUsedAt: new Date(),
        },
    });
    await createAuditLog({
        userId: matchedToken.user.id,
        action: "TOKEN_REFRESHED",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
    });

    return {
        accessToken,
        refreshToken: newRefreshRaw,
    };
}
export async function logout(
    rawToken: string,
    userId: string,
    meta: RequestMeta,
) {
    const userTokens = await prisma.refreshToken.findMany({
        where: { userId, revoked: false },
    });

    for (const record of userTokens) {
        const isMatch = await verifyRefreshToken(rawToken, record.token);
        if (isMatch) {
            await prisma.refreshToken.update({
                where: { id: record.id },
                data: { revoked: true, revokedAt: new Date() },
            });
            break;
        }
    }

    await createAuditLog({
        userId,
        action: "USER_LOGOUT",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
    });
}
export async function logoutAllDevices(userId: string, meta: RequestMeta) {
    await prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
    });

    await createAuditLog({
        userId,
        action: "TOKEN_REVOKED",
        metadata: { scope: "all_devices" },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
    });
}
export async function verifyEmail(rawToken: string) {
    const hashedToken = hashToken(rawToken);

    const record = await prisma.emailVerificationToken.findUnique({
        where: { token: hashedToken },
        include: { user: true },
    });

    if (!record) {
        throw ApiError.badRequest("Invalid or expired verification token");
    }

    if (record.expiresAt < new Date()) {
        await prisma.emailVerificationToken.delete({ where: { id: record.id } });
        throw ApiError.badRequest(
            "Verification token has expired. Please request a new one.",
        );
    }
    await prisma.$transaction([
        prisma.user.update({
            where: { id: record.userId },
            data: { emailverified: true },
        }),
        prisma.emailVerificationToken.deleteMany({
            where: { userId: record.userId },
        }),
    ]);

    await createAuditLog({
        userId: record.userId,
        action: "EMAIL_VERIFIED",
        resource: "User",
        resourceId: record.userId,
    });

    return { message: "Email verified successfully" };
}
export async function resendVerificationEmail(userId: string) {
    const user = await userService.findById(userId);

    if (!user) {
        throw ApiError.notFound("User not found");
    }

    if (user.emailverified) {
        throw ApiError.badRequest("Email is already verified");
    }

    await prisma.emailVerificationToken.deleteMany({
        where: { userId },
    });

    const rawToken = generateSecureToken();
    const hashedToken = hashToken(rawToken);

    await prisma.emailVerificationToken.create({
        data: {
            userId,
            token: hashedToken,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
    });

    await sendVerificationEmail(user.email, user.username, rawToken);

    return { message: "Verification email sent" };
}

export async function forgotPassword(email: string, meta: RequestMeta) {
    const genericResponse = {
        message: "If an account with that email exists, a password reset link has been sent.",
    };

    const user = await userService.findByEmail(email);

    if (!user) {
        return genericResponse;
    }

    await prisma.passwordResetToken.deleteMany({
        where: { userId: user.id },
    });
    const rawToken = generateSecureToken();
    const hashedToken = hashToken(rawToken);
    await prisma.passwordResetToken.create({
        data: {
            userId: user.id,
            token: hashedToken,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
    });

    await sendPasswordResetEmail(user.email, user.username, rawToken);

    await createAuditLog({
        userId: user.id,
        action: "PASSWORD_RESET_REQUESTED",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
    });

    return genericResponse;
}
export async function resetPassword(rawToken: string, newPassword: string) {
    const hashedToken = hashToken(rawToken);

    const record = await prisma.passwordResetToken.findUnique({
        where: { token: hashedToken },
    });

    if (!record) {
        throw ApiError.badRequest("Invalid or expired reset token");
    }

    if (record.expiresAt < new Date()) {
        await prisma.passwordResetToken.delete({ where: { id: record.id } });
        throw ApiError.badRequest(
            "Reset token has expired. Please request a new password reset.",
        );
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction([
        prisma.user.update({
            where: { id: record.userId },
            data: { password: passwordHash },
        }),
        prisma.refreshToken.updateMany({
            where: { userId: record.userId, revoked: false },
            data: { revoked: true, revokedAt: new Date() },
        }),
        prisma.passwordResetToken.deleteMany({
            where: { userId: record.userId },
        }),
    ]);

    await createAuditLog({
        userId: record.userId,
        action: "PASSWORD_RESET_COMPLETED",
    });

    return { message: "Password reset successful. Please log in with your new password." };
}
export async function changePassword(
    userId: string,
    data: ChangePasswordInput,
    meta: RequestMeta,
) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { password: true },
    });

    if (!user) {
        throw ApiError.notFound("User not found");
    }
    const isValid = await verifyPassword(data.currentPassword, user.password);
    if (!isValid) {
        throw ApiError.unauthorized("Current password is incorrect");
    }
    const newHash = await hashPassword(data.newPassword);
    await prisma.$transaction([
        prisma.user.update({
            where: { id: userId },
            data: { password: newHash },
        }),
        prisma.refreshToken.updateMany({
            where: { userId, revoked: false },
            data: { revoked: true, revokedAt: new Date() },
        }),
    ]);
    await createAuditLog({
        userId,
        action: "PASSWORD_CHANGED",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
    });
    return { message: "Password changed successfully. Please log in again on all devices." };
}
export async function getProfile(userId: string) {
    const user = await userService.findById(userId);

    if (!user) {
        throw ApiError.notFound("User not found");
    }

    return { user };
}
