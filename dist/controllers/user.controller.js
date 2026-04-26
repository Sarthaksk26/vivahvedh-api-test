"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProfileViewers = exports.recordProfileView = exports.getMyShortlist = exports.shortlistProfile = exports.changePassword = exports.updateProfile = exports.deletePhoto = exports.uploadPhoto = exports.getMyProfile = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const db_1 = __importDefault(require("../config/db"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
const sanitize_1 = require("../utils/sanitize");
const AppError_1 = require("../utils/AppError");
const asyncHandler_1 = require("../utils/asyncHandler");
// ═══════════════════════════════════════════════════════════════════
// Zod schemas — whitelist of ALLOWED fields per sub-model.
// Any field NOT listed here is silently stripped from the payload.
// ═══════════════════════════════════════════════════════════════════
const profileSchema = zod_1.z.object({
    firstName: zod_1.z.string().min(1).max(100).optional(),
    middleName: zod_1.z.string().max(100).optional().nullable(),
    lastName: zod_1.z.string().min(1).max(100).optional(),
    gender: zod_1.z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
    maritalStatus: zod_1.z.enum(['UNMARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED']).optional(),
    birthDateTime: zod_1.z.string().optional().nullable().transform((val) => {
        if (!val)
            return null;
        // Parse at UTC noon to prevent IST timezone shift
        return new Date(`${val.slice(0, 10)}T12:00:00Z`);
    }),
    birthPlace: zod_1.z.string().max(200).optional().nullable(),
    aboutMe: zod_1.z.string().max(2000).optional().nullable(),
    religionId: zod_1.z.number().int().positive().optional().nullable(),
    casteId: zod_1.z.number().int().positive().optional().nullable(),
    subCasteId: zod_1.z.number().int().positive().optional().nullable(),
}).strict();
const familySchema = zod_1.z.object({
    fatherName: zod_1.z.string().max(100).optional().nullable(),
    fatherOccupation: zod_1.z.string().max(200).optional().nullable(),
    motherName: zod_1.z.string().max(100).optional().nullable(),
    motherOccupation: zod_1.z.string().max(200).optional().nullable(),
    motherHometown: zod_1.z.string().max(200).optional().nullable(),
    maternalUncleName: zod_1.z.string().max(100).optional().nullable(),
    brothers: zod_1.z.number().int().min(0).max(20).optional(),
    marriedBrothers: zod_1.z.number().int().min(0).max(20).optional(),
    sisters: zod_1.z.number().int().min(0).max(20).optional(),
    marriedSisters: zod_1.z.number().int().min(0).max(20).optional(),
    relativesSirnames: zod_1.z.string().max(500).optional().nullable(),
    familyBackground: zod_1.z.string().max(1000).optional().nullable(),
    familyWealth: zod_1.z.string().max(200).optional().nullable(),
    agricultureLand: zod_1.z.string().max(200).optional().nullable(),
    plot: zod_1.z.string().max(200).optional().nullable(),
    flat: zod_1.z.string().max(200).optional().nullable(),
}).strict();
const educationSchema = zod_1.z.object({
    qualificationId: zod_1.z.number().int().positive().optional().nullable(),
    trade: zod_1.z.string().max(200).optional().nullable(),
    college: zod_1.z.string().max(300).optional().nullable(),
    jobBusiness: zod_1.z.string().max(300).optional().nullable(),
    jobAddress: zod_1.z.string().max(500).optional().nullable(),
    annualIncome: zod_1.z.string().max(100).optional().nullable(),
    specialAchievement: zod_1.z.string().max(500).optional().nullable(),
}).strict();
const physicalSchema = zod_1.z.object({
    height: zod_1.z.string().max(50).optional().nullable(),
    weight: zod_1.z.number().int().min(20).max(300).optional().nullable(),
    bloodGroup: zod_1.z.string().max(10).optional().nullable(),
    complexion: zod_1.z.string().max(50).optional().nullable(),
    health: zod_1.z.string().max(200).optional().nullable(),
    disease: zod_1.z.string().max(200).optional().nullable(),
    diet: zod_1.z.string().max(50).optional().nullable(),
    smoke: zod_1.z.boolean().optional().nullable(),
    drink: zod_1.z.boolean().optional().nullable(),
}).strict();
const astrologySchema = zod_1.z.object({
    gothra: zod_1.z.string().max(100).optional().nullable(),
    rashi: zod_1.z.string().max(100).optional().nullable(),
    nakshatra: zod_1.z.string().max(100).optional().nullable(),
    charan: zod_1.z.string().max(50).optional().nullable(),
    nadi: zod_1.z.string().max(50).optional().nullable(),
    gan: zod_1.z.string().max(50).optional().nullable(),
    mangal: zod_1.z.string().max(50).optional().nullable(),
}).strict();
const preferencesSchema = zod_1.z.object({
    expectations: zod_1.z.string().max(2000).optional().nullable(),
}).strict();
const addressSchema = zod_1.z.object({
    city: zod_1.z.string().max(100).optional().nullable(),
    district: zod_1.z.string().max(100).optional().nullable(),
    state: zod_1.z.string().max(100).optional().nullable(),
    addressLine: zod_1.z.string().max(300).optional().nullable(),
    addressType: zod_1.z.string().default('PERMANENT'),
}).strict();
const updateProfileBodySchema = zod_1.z.object({
    profile: profileSchema.optional(),
    family: familySchema.optional(),
    education: educationSchema.optional(),
    physical: physicalSchema.optional(),
    astrology: astrologySchema.optional(),
    preferences: preferencesSchema.optional(),
    addresses: addressSchema.optional(),
}).strict();
// ═══════════════════════════════════════════════════════════════════
// Safe file-path helper — prevents path-traversal attacks
// ═══════════════════════════════════════════════════════════════════
const UPLOADS_DIR = path_1.default.join(process.cwd(), 'uploads');
/**
 * Given a stored image URL like `/uploads/img-xxx.webp`, returns
 * the safe absolute path on disk. Returns null if the URL is
 * malformed or attempts traversal.
 */
function safeFilePath(imageUrl) {
    // Extract only the basename — path.basename strips any ../ attempts
    const segments = imageUrl.split('/');
    const rawFilename = segments[segments.length - 1];
    if (!rawFilename)
        return null;
    const basename = path_1.default.basename(rawFilename);
    // Double-check: basename must not contain path separators
    if (basename !== rawFilename || basename.includes('..'))
        return null;
    return path_1.default.join(UPLOADS_DIR, basename);
}
// ═══════════════════════════════════════════════════════════════════
// Controllers
// ═══════════════════════════════════════════════════════════════════
exports.getMyProfile = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user.id;
    const fullUser = yield db_1.default.user.findUnique({
        where: { id: userId },
        include: {
            profile: true,
            family: true,
            physical: true,
            education: true,
            astrology: true,
            preferences: true,
            images: true,
        },
    });
    if (!fullUser)
        throw new AppError_1.AppError('User not found.', 404);
    // Never leak the password hash
    const { password } = fullUser, safeUser = __rest(fullUser, ["password"]);
    res.status(200).json((0, sanitize_1.maskPrivateDetails)(safeUser, true));
}));
exports.uploadPhoto = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.file)
        throw new AppError_1.AppError('No image file provided.', 400);
    const userId = req.user.id;
    const photoUrl = `/uploads/${req.file.filename}`;
    const existingCount = yield db_1.default.image.count({ where: { userId } });
    yield db_1.default.image.create({
        data: {
            userId,
            url: photoUrl,
            isPrimary: existingCount === 0,
        },
    });
    res.status(200).json({ success: true, photoUrl });
}));
exports.deletePhoto = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user.id;
    const imageId = req.params.imageId;
    const image = yield db_1.default.image.findUnique({ where: { id: imageId } });
    if (!image || image.userId !== userId) {
        throw new AppError_1.AppError('Image not found or access denied.', 404);
    }
    // Safe deletion — uses path.basename to block traversal
    const filePath = safeFilePath(image.url);
    if (filePath) {
        try {
            yield promises_1.default.access(filePath);
            yield promises_1.default.unlink(filePath);
        }
        catch (_a) {
            // File already gone from disk — not critical
        }
    }
    yield db_1.default.image.delete({ where: { id: imageId } });
    // Promote next image to primary if needed
    if (image.isPrimary) {
        const nextImage = yield db_1.default.image.findFirst({
            where: { userId },
            orderBy: { createdAt: 'asc' },
        });
        if (nextImage) {
            yield db_1.default.image.update({
                where: { id: nextImage.id },
                data: { isPrimary: true },
            });
        }
    }
    res.status(200).json({ success: true, message: 'Photo deleted.' });
}));
exports.updateProfile = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user.id;
    // Validate + strip unknown fields via .strict()
    const data = updateProfileBodySchema.parse(req.body);
    // Build the Prisma nested-write dynamically from validated data only
    const prismaData = {};
    const subModels = ['profile', 'family', 'education', 'physical', 'astrology', 'preferences'];
    for (const key of subModels) {
        const section = data[key];
        if (section && Object.keys(section).length > 0) {
            prismaData[key] = {
                upsert: { create: section, update: section },
            };
        }
    }
    if (data.addresses && Object.keys(data.addresses).length > 0) {
        prismaData.addresses = {
            deleteMany: {}, // Clear old addresses and replace with new
            create: [data.addresses]
        };
    }
    const updatedUser = yield db_1.default.user.update({
        where: { id: userId },
        data: prismaData,
        include: {
            profile: true,
            family: true,
            education: true,
            physical: true,
            astrology: true,
            preferences: true,
            addresses: true,
        },
    });
    res.status(200).json({
        success: true,
        message: 'Profile data saved successfully.',
        user: updatedUser,
    });
}));
const changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1, 'Current password is required.'),
    newPassword: zod_1.z.string().min(6, 'New password must be at least 6 characters.'),
});
exports.changePassword = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user.id;
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const user = yield db_1.default.user.findUnique({ where: { id: userId } });
    if (!user)
        throw new AppError_1.AppError('User not found.', 404);
    const isMatch = yield bcrypt_1.default.compare(currentPassword, user.password);
    if (!isMatch)
        throw new AppError_1.AppError('Current password is incorrect.', 401);
    const hashedPassword = yield bcrypt_1.default.hash(newPassword, 10);
    yield db_1.default.user.update({
        where: { id: userId },
        data: { password: hashedPassword, requiresPasswordChange: false },
    });
    res.status(200).json({ success: true, message: 'Password changed successfully.' });
}));
exports.shortlistProfile = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user.id;
    const { targetUserId } = req.body;
    if (userId === targetUserId)
        throw new AppError_1.AppError('Cannot shortlist yourself.', 400);
    const existing = yield db_1.default.shortlist.findFirst({ where: { userId, targetUserId } });
    if (existing) {
        yield db_1.default.shortlist.delete({ where: { id: existing.id } });
        res.status(200).json({ shortlisted: false, message: 'Removed from shortlist.' });
        return;
    }
    yield db_1.default.shortlist.create({ data: { userId, targetUserId } });
    res.status(200).json({ shortlisted: true, message: 'Profile shortlisted.' });
}));
exports.getMyShortlist = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user.id;
    const shortlisted = yield db_1.default.shortlist.findMany({
        where: { userId },
        include: {
            target: {
                include: { profile: true, images: { where: { isPrimary: true }, take: 1 } },
            },
        },
        orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(shortlisted);
}));
exports.recordProfileView = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const viewerId = req.user.id;
    const profileId = req.params.profileId;
    if (viewerId === profileId) {
        res.status(200).json({ recorded: false });
        return;
    }
    yield db_1.default.profileView.upsert({
        where: { viewerId_viewedId: { viewerId, viewedId: profileId } },
        update: { viewedAt: new Date() },
        create: { viewerId, viewedId: profileId },
    });
    res.status(200).json({ recorded: true });
}));
exports.getProfileViewers = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user.id;
    const viewers = yield db_1.default.profileView.findMany({
        where: { viewedId: userId },
        include: {
            viewer: {
                include: { profile: true, images: { where: { isPrimary: true }, take: 1 } },
            },
        },
        orderBy: { viewedAt: 'desc' },
        take: 50,
    });
    res.status(200).json(viewers);
}));
