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
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sanitize_1 = require("../utils/sanitize");
const getMyProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // The user ID is guaranteed by our requireAuth middleware
        const userId = req.user.id;
        // We pull down the core user account + their deep linked profile and family stats natively.
        const fullUser = yield db_1.default.user.findUnique({
            where: { id: userId },
            include: {
                profile: true,
                family: true,
                physical: true,
                education: true,
                astrology: true,
                preferences: true,
                images: true
            }
        });
        if (!fullUser) {
            res.status(404).json({ error: 'User block not found.' });
            return;
        }
        // Never send the password hash back to the frontend!
        const { password } = fullUser, safeUser = __rest(fullUser, ["password"]);
        res.status(200).json((0, sanitize_1.maskPrivateDetails)(safeUser, true));
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error fetching profile' });
    }
});
exports.getMyProfile = getMyProfile;
const uploadPhoto = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No image file provided.' });
            return;
        }
        const userId = req.user.id;
        // Construct the public URL that the frontend will use to display it
        // Store only the relative path for environment portability
        const photoUrl = `/uploads/${req.file.filename}`;
        // Check how many photos already exist
        const existingCount = yield db_1.default.image.count({ where: { userId } });
        // Update the Prisma database to create a new Image tracking record
        yield db_1.default.image.create({
            data: {
                userId: userId,
                url: photoUrl,
                isPrimary: existingCount === 0 // First photo is automatically primary
            }
        });
        res.status(200).json({ success: true, photoUrl });
    }
    catch (error) {
        console.error("Photo Upload Error:", error);
        res.status(500).json({ error: 'Failed to upload photo.' });
    }
});
exports.uploadPhoto = uploadPhoto;
const deletePhoto = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const imageId = req.params.imageId;
        // Find the image and verify ownership
        const image = yield db_1.default.image.findUnique({ where: { id: imageId } });
        if (!image || image.userId !== userId) {
            res.status(404).json({ error: 'Image not found or access denied.' });
            return;
        }
        // Delete from disk
        try {
            const filename = image.url.split('/uploads/')[1];
            if (filename) {
                const filePath = path_1.default.join(__dirname, '../../uploads', filename);
                if (fs_1.default.existsSync(filePath)) {
                    fs_1.default.unlinkSync(filePath);
                }
            }
        }
        catch (fsError) {
            console.warn("File deletion warning:", fsError);
        }
        // Delete from database
        yield db_1.default.image.delete({ where: { id: imageId } });
        // If deleted image was primary, set the next one as primary
        if (image.isPrimary) {
            const nextImage = yield db_1.default.image.findFirst({
                where: { userId },
                orderBy: { createdAt: 'asc' }
            });
            if (nextImage) {
                yield db_1.default.image.update({
                    where: { id: nextImage.id },
                    data: { isPrimary: true }
                });
            }
        }
        res.status(200).json({ success: true, message: 'Photo deleted.' });
    }
    catch (error) {
        console.error("Photo Delete Error:", error);
        res.status(500).json({ error: 'Failed to delete photo.' });
    }
});
exports.deletePhoto = deletePhoto;
const updateProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { profile, family, education, physical, astrology, preferences } = req.body;
        const updatedUser = yield db_1.default.user.update({
            where: { id: userId },
            data: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (profile && {
                profile: {
                    upsert: {
                        create: profile,
                        update: profile
                    }
                }
            })), (family && {
                family: {
                    upsert: {
                        create: family,
                        update: family
                    }
                }
            })), (education && {
                education: {
                    upsert: {
                        create: education,
                        update: education
                    }
                }
            })), (physical && {
                physical: {
                    upsert: {
                        create: physical,
                        update: physical
                    }
                }
            })), (astrology && {
                astrology: {
                    upsert: {
                        create: astrology,
                        update: astrology
                    }
                }
            })), (preferences && {
                preferences: {
                    upsert: {
                        create: preferences,
                        update: preferences
                    }
                }
            })),
            include: {
                profile: true,
                family: true,
                education: true,
                physical: true,
                astrology: true,
                preferences: true
            }
        });
        res.status(200).json({ success: true, message: 'Profile data saved successfully.', user: updatedUser });
    }
    catch (error) {
        console.error("Profile Update Error:", error);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});
exports.updateProfile = updateProfile;
const changePassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword || newPassword.length < 6) {
            res.status(400).json({ error: 'Current password and new password (min 6 chars) required.' });
            return;
        }
        const user = yield db_1.default.user.findUnique({ where: { id: userId } });
        if (!user) {
            res.status(404).json({ error: 'User not found.' });
            return;
        }
        const isMatch = yield bcrypt_1.default.compare(currentPassword, user.password);
        if (!isMatch) {
            res.status(401).json({ error: 'Current password is incorrect.' });
            return;
        }
        const hashedPassword = yield bcrypt_1.default.hash(newPassword, 10);
        yield db_1.default.user.update({
            where: { id: userId },
            data: {
                password: hashedPassword,
                requiresPasswordChange: false
            }
        });
        res.status(200).json({ success: true, message: 'Password changed successfully.' });
    }
    catch (error) {
        console.error("Password Change Error:", error);
        res.status(500).json({ error: 'Failed to change password.' });
    }
});
exports.changePassword = changePassword;
const shortlistProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { targetUserId } = req.body;
        if (userId === targetUserId) {
            res.status(400).json({ error: 'Cannot shortlist yourself.' });
            return;
        }
        // Check if already shortlisted
        const existing = yield db_1.default.shortlist.findFirst({
            where: { userId, targetUserId }
        });
        if (existing) {
            // Remove from shortlist (toggle)
            yield db_1.default.shortlist.delete({ where: { id: existing.id } });
            res.status(200).json({ shortlisted: false, message: 'Removed from shortlist.' });
            return;
        }
        yield db_1.default.shortlist.create({
            data: { userId, targetUserId }
        });
        res.status(200).json({ shortlisted: true, message: 'Profile shortlisted.' });
    }
    catch (error) {
        console.error("Shortlist Error:", error);
        res.status(500).json({ error: 'Failed to shortlist profile.' });
    }
});
exports.shortlistProfile = shortlistProfile;
const getMyShortlist = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const shortlisted = yield db_1.default.shortlist.findMany({
            where: { userId },
            include: {
                target: {
                    include: { profile: true, images: { where: { isPrimary: true }, take: 1 } }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json(shortlisted);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch shortlist.' });
    }
});
exports.getMyShortlist = getMyShortlist;
const recordProfileView = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const viewerId = req.user.id;
        const profileId = req.params.profileId;
        if (viewerId === profileId) {
            res.status(200).json({ recorded: false });
            return;
        }
        // Upsert: update timestamp if already viewed, otherwise create
        yield db_1.default.profileView.upsert({
            where: {
                viewerId_viewedId: { viewerId, viewedId: profileId }
            },
            update: { viewedAt: new Date() },
            create: { viewerId, viewedId: profileId }
        });
        res.status(200).json({ recorded: true });
    }
    catch (error) {
        console.error("Profile View Error:", error);
        res.status(500).json({ error: 'Failed to record view.' });
    }
});
exports.recordProfileView = recordProfileView;
const getProfileViewers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const viewers = yield db_1.default.profileView.findMany({
            where: { viewedId: userId },
            include: {
                viewer: {
                    include: { profile: true, images: { where: { isPrimary: true }, take: 1 } }
                }
            },
            orderBy: { viewedAt: 'desc' },
            take: 50
        });
        res.status(200).json(viewers);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile viewers.' });
    }
});
exports.getProfileViewers = getProfileViewers;
