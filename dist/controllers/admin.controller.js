"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConnectionLogs = exports.sendBirthdayWish = exports.getUpcomingBirthdays = exports.updateUserByAdmin = exports.getAdminStats = exports.createOfflineUser = exports.setUserPlan = exports.markEnquiryResolved = exports.replyToEnquiry = exports.getEnquiries = exports.deleteUser = exports.banUser = exports.approveUser = exports.getAllUsers = exports.getPendingApprovals = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
const db_1 = __importDefault(require("../config/db"));
const zod_1 = require("zod");
const mail_service_1 = require("../services/mail.service");
/**
 * Generate a collision-safe RegID with retry logic.
 */
function generateUniqueRegId() {
    return __awaiter(this, void 0, void 0, function* () {
        for (let attempt = 0; attempt < 5; attempt++) {
            const regId = `VV-${Math.floor(100000 + Math.random() * 900000)}`;
            const existing = yield db_1.default.user.findUnique({ where: { regId } });
            if (!existing)
                return regId;
        }
        throw new Error('Failed to generate a unique RegID after 5 attempts.');
    });
}
const getPendingApprovals = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const pendingUsers = yield db_1.default.user.findMany({
            where: { accountStatus: 'INACTIVE' },
            include: { profile: true, images: true },
            orderBy: { createdAt: 'asc' }
        });
        res.status(200).json(pendingUsers);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending approvals' });
    }
});
exports.getPendingApprovals = getPendingApprovals;
const getAllUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { q, gender, ageMin, ageMax, accountStatus } = req.query;
        let baseWhere = {
            role: 'USER',
        };
        if (accountStatus) {
            baseWhere.accountStatus = String(accountStatus).toUpperCase();
        }
        else {
            baseWhere.accountStatus = { in: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] };
        }
        let profileFilters = {};
        if (gender)
            profileFilters.gender = String(gender).toUpperCase();
        if (ageMin || ageMax) {
            profileFilters.birthDateTime = {};
            const today = new Date();
            if (ageMax) {
                const minDate = new Date(today.getFullYear() - parseInt(String(ageMax)) - 1, today.getMonth(), today.getDate());
                profileFilters.birthDateTime.gte = minDate;
            }
            if (ageMin) {
                const maxDate = new Date(today.getFullYear() - parseInt(String(ageMin)), today.getMonth(), today.getDate());
                profileFilters.birthDateTime.lte = maxDate;
            }
        }
        if (Object.keys(profileFilters).length > 0) {
            baseWhere.profile = { is: profileFilters };
        }
        if (q) {
            const qStr = String(q);
            baseWhere.OR = [
                { regId: { contains: qStr, mode: 'insensitive' } },
                { profile: { is: { firstName: { contains: qStr, mode: 'insensitive' } } } },
                { profile: { is: { lastName: { contains: qStr, mode: 'insensitive' } } } },
            ];
        }
        const allUsers = yield db_1.default.user.findMany({
            where: baseWhere,
            include: { profile: true },
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json(allUsers);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch all network users' });
    }
});
exports.getAllUsers = getAllUsers;
const approveUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { targetUserId } = req.body;
        const targetUser = yield db_1.default.user.findUnique({ where: { id: targetUserId } });
        if (!targetUser) {
            res.status(404).json({ error: 'User not found.' });
            return;
        }
        const updatedUser = yield db_1.default.user.update({
            where: { id: targetUserId },
            data: { accountStatus: 'ACTIVE' },
            include: { profile: true }
        });
        if (updatedUser.email && updatedUser.profile) {
            (0, mail_service_1.sendApprovalEmail)(updatedUser.email, updatedUser.profile.firstName, updatedUser.regId);
        }
        res.status(200).json({ message: 'User approved successfully', user: updatedUser });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to approve user' });
    }
});
exports.approveUser = approveUser;
const banUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { targetUserId, action } = req.body;
        const targetUser = yield db_1.default.user.findUnique({ where: { id: targetUserId } });
        if (!targetUser) {
            res.status(404).json({ error: 'User not found.' });
            return;
        }
        // Prevent admin from banning themselves
        if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) === targetUserId) {
            res.status(400).json({ error: 'You cannot suspend your own account.' });
            return;
        }
        // Support toggle: ban or unban
        const newStatus = action === 'unban' ? 'ACTIVE' : 'SUSPENDED';
        yield db_1.default.user.update({
            where: { id: targetUserId },
            data: { accountStatus: newStatus }
        });
        res.status(200).json({ message: newStatus === 'ACTIVE' ? 'User reactivated.' : 'User suspended.' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update user status' });
    }
});
exports.banUser = banUser;
const deleteUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        // Prevent admin from deleting themselves
        if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) === id) {
            res.status(400).json({ error: 'You cannot delete your own account.' });
            return;
        }
        const targetUser = yield db_1.default.user.findUnique({ where: { id: String(id) } });
        if (!targetUser) {
            res.status(404).json({ error: 'User not found.' });
            return;
        }
        yield db_1.default.user.delete({
            where: { id: String(id) }
        });
        res.status(200).json({ message: 'User permanently deleted.' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});
exports.deleteUser = deleteUser;
const getEnquiries = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const enquiries = yield db_1.default.enquiry.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json(enquiries);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch enquiries' });
    }
});
exports.getEnquiries = getEnquiries;
const replyToEnquiry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { enquiryId, replyMessage } = req.body;
        if (!enquiryId || !replyMessage) {
            res.status(400).json({ error: 'enquiryId and replyMessage are required' });
            return;
        }
        const enquiry = yield db_1.default.enquiry.findUnique({ where: { id: enquiryId } });
        if (!enquiry) {
            res.status(404).json({ error: 'Enquiry not found' });
            return;
        }
        // Send the email
        yield (0, mail_service_1.sendEnquiryReplyEmail)(enquiry.email, enquiry.firstName, enquiry.message, replyMessage);
        // Mark as resolved
        yield db_1.default.enquiry.update({
            where: { id: enquiryId },
            data: { isResolved: true }
        });
        res.status(200).json({ message: 'Reply sent successfully and enquiry marked as resolved.' });
    }
    catch (error) {
        console.error('Reply Enquiry Error:', error);
        res.status(500).json({ error: 'Failed to reply to enquiry' });
    }
});
exports.replyToEnquiry = replyToEnquiry;
const markEnquiryResolved = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { enquiryId, isResolved } = req.body;
        if (!enquiryId) {
            res.status(400).json({ error: 'enquiryId is required' });
            return;
        }
        yield db_1.default.enquiry.update({
            where: { id: enquiryId },
            data: { isResolved: !!isResolved }
        });
        res.status(200).json({ message: 'Enquiry status updated successfully.' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update enquiry status' });
    }
});
exports.markEnquiryResolved = markEnquiryResolved;
const setUserPlan = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { targetUserId, planType, durationMonths } = req.body;
        if (!['FREE', 'SILVER', 'GOLD'].includes(planType)) {
            res.status(400).json({ error: 'Invalid plan type. Must be FREE, SILVER, or GOLD.' });
            return;
        }
        const planExpiresAt = planType === 'FREE'
            ? null
            : new Date(Date.now() + (durationMonths || 6) * 30 * 24 * 60 * 60 * 1000);
        const updatedUser = yield db_1.default.user.update({
            where: { id: targetUserId },
            data: {
                planType,
                planExpiresAt,
                paymentDone: planType !== 'FREE'
            },
            include: { profile: true }
        });
        res.status(200).json({
            message: `Plan set to ${planType} successfully.`,
            user: updatedUser
        });
    }
    catch (error) {
        console.error("Set Plan Error:", error);
        res.status(500).json({ error: 'Failed to set user plan' });
    }
});
exports.setUserPlan = setUserPlan;
// ===========================
// NEW: Admin creates offline user
// ===========================
const createOfflineUserSchema = zod_1.z.object({
    firstName: zod_1.z.string().min(1),
    lastName: zod_1.z.string().min(1),
    mobile: zod_1.z.string().min(10).max(15),
    email: zod_1.z.string().email(),
    gender: zod_1.z.enum(['MALE', 'FEMALE', 'OTHER']),
    maritalStatus: zod_1.z.enum(['UNMARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED']),
    profileCreatedBy: zod_1.z.enum(['Self', 'Father', 'Mother', 'Sibling', 'Relative', 'Friend', 'Marriage Bureau']).optional()
});
const createOfflineUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const validatedData = createOfflineUserSchema.parse(req.body);
        const emailLower = validatedData.email.toLowerCase();
        // Check for existing mobile
        const existingMobile = yield db_1.default.user.findUnique({ where: { mobile: validatedData.mobile } });
        if (existingMobile) {
            res.status(400).json({ error: 'A user with this mobile number already exists.' });
            return;
        }
        // Check for existing email
        const existingEmail = yield db_1.default.user.findUnique({ where: { email: emailLower } });
        if (existingEmail) {
            res.status(400).json({ error: 'A user with this email already exists.' });
            return;
        }
        // Generate secure temporary password (12 chars, alphanumeric)
        const tempPassword = crypto_1.default.randomBytes(8).toString('base64url').slice(0, 12);
        const hashedPassword = yield bcrypt_1.default.hash(tempPassword, 10);
        // Generate collision-safe RegID
        const newRegId = yield generateUniqueRegId();
        // Create the user — bypasses OTP, auto-activated, flagged for password change
        const newUser = yield db_1.default.user.create({
            data: {
                regId: newRegId,
                mobile: validatedData.mobile,
                email: emailLower,
                password: hashedPassword,
                accountStatus: 'ACTIVE',
                requiresPasswordChange: true,
                profileCreatedBy: validatedData.profileCreatedBy || 'Marriage Bureau',
                profile: {
                    create: {
                        firstName: validatedData.firstName,
                        lastName: validatedData.lastName,
                        gender: validatedData.gender,
                        maritalStatus: validatedData.maritalStatus
                    }
                }
            },
            include: { profile: true }
        });
        // Send credentials email — password is NEVER returned in the API response
        (0, mail_service_1.sendOfflineCredentialsEmail)(emailLower, validatedData.firstName, newRegId, tempPassword);
        res.status(201).json({
            message: `Profile created successfully. Login credentials have been sent to ${validatedData.email}.`,
            regId: newUser.regId,
            userName: `${validatedData.firstName} ${validatedData.lastName}`
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
            return;
        }
        console.error("Create Offline User Error:", error);
        res.status(500).json({ error: 'Failed to create offline user profile.' });
    }
});
exports.createOfflineUser = createOfflineUser;
const getAdminStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [totalUsers, activeUsers, pendingApprovals, pendingPayments, totalConnections, thisMonthRegs] = yield Promise.all([
            db_1.default.user.count({ where: { role: 'USER' } }),
            db_1.default.user.count({ where: { role: 'USER', accountStatus: 'ACTIVE' } }),
            db_1.default.user.count({ where: { role: 'USER', accountStatus: 'INACTIVE' } }),
            db_1.default.pendingPayment.count({ where: { status: 'PENDING' } }),
            db_1.default.request.count(),
            db_1.default.user.count({ where: { role: 'USER', createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } })
        ]);
        res.json({ totalUsers, activeUsers, pendingApprovals, pendingPayments, totalConnections, thisMonthRegs });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});
exports.getAdminStats = getAdminStats;
const updateUserByAdmin = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = req.params.id;
        const { email, mobile, profile, physical, education, family, astrology } = req.body;
        const targetUser = yield db_1.default.user.findUnique({ where: { id } });
        if (!targetUser) {
            res.status(404).json({ error: 'User not found.' });
            return;
        }
        // Update account-level fields
        const accountUpdate = {};
        if (email)
            accountUpdate.email = email.toLowerCase();
        if (mobile)
            accountUpdate.mobile = mobile;
        const updatedUser = yield db_1.default.user.update({
            where: { id },
            data: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, accountUpdate), (profile && { profile: { upsert: { create: profile, update: profile } } })), (physical && { physical: { upsert: { create: physical, update: physical } } })), (education && { education: { upsert: { create: education, update: education } } })), (family && { family: { upsert: { create: family, update: family } } })), (astrology && { astrology: { upsert: { create: astrology, update: astrology } } })),
            include: { profile: true, physical: true, education: true, family: true, astrology: true }
        });
        res.json({ message: 'User updated successfully.', user: updatedUser });
    }
    catch (error) {
        if (error.code === 'P2002') {
            res.status(400).json({ error: 'Email or mobile already in use.' });
            return;
        }
        console.error('Admin Update User Error:', error);
        res.status(500).json({ error: 'Failed to update user.' });
    }
});
exports.updateUserByAdmin = updateUserByAdmin;
const getUpcomingBirthdays = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const users = yield db_1.default.user.findMany({
            where: { role: 'USER', accountStatus: 'ACTIVE', profile: { birthDateTime: { not: null } } },
            include: { profile: { select: { firstName: true, lastName: true, birthDateTime: true } } },
            orderBy: { createdAt: 'desc' }
        });
        const today = new Date();
        const upcoming = users
            .filter(u => { var _a; return (_a = u.profile) === null || _a === void 0 ? void 0 : _a.birthDateTime; })
            .map(u => {
            const bday = new Date(u.profile.birthDateTime);
            const nextBday = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
            if (nextBday < today)
                nextBday.setFullYear(nextBday.getFullYear() + 1);
            const daysUntil = Math.ceil((nextBday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            return { id: u.id, regId: u.regId, email: u.email, mobile: u.mobile, firstName: u.profile.firstName, lastName: u.profile.lastName, birthDate: u.profile.birthDateTime, daysUntil };
        })
            .filter(u => u.daysUntil <= 30)
            .sort((a, b) => a.daysUntil - b.daysUntil);
        res.json(upcoming);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch birthdays' });
    }
});
exports.getUpcomingBirthdays = getUpcomingBirthdays;
const sendBirthdayWish = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const id = req.params.id;
        const user = yield db_1.default.user.findUnique({ where: { id }, include: { profile: true } });
        if (!user || !user.email) {
            res.status(404).json({ error: 'User not found or no email.' });
            return;
        }
        const { sendBirthdayWishEmail } = yield Promise.resolve().then(() => __importStar(require('../services/mail.service')));
        yield sendBirthdayWishEmail(user.email, ((_a = user.profile) === null || _a === void 0 ? void 0 : _a.firstName) || 'Member');
        res.json({ message: 'Birthday wishes sent!' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to send wishes' });
    }
});
exports.sendBirthdayWish = sendBirthdayWish;
const getConnectionLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const status = req.query.status;
        const where = {};
        if (status && ['PENDING', 'ACCEPTED', 'REJECTED'].includes(status))
            where.status = status;
        const connections = yield db_1.default.request.findMany({
            where,
            include: {
                sender: { include: { profile: { select: { firstName: true, lastName: true } } } },
                receiver: { include: { profile: { select: { firstName: true, lastName: true } } } }
            },
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        res.json(connections);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch connections' });
    }
});
exports.getConnectionLogs = getConnectionLogs;
