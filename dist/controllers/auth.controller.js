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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.register = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = __importDefault(require("../config/db"));
const zod_1 = require("zod");
const env_1 = require("../config/env");
const mail_service_1 = require("../services/mail.service");
const asyncHandler_1 = require("../utils/asyncHandler");
const PROFILE_CREATED_BY_OPTIONS = ['Self', 'Father', 'Mother', 'Sibling', 'Relative', 'Friend', 'Marriage Bureau'];
// Zod Schema for strict validation
const registerSchema = zod_1.z.object({
    mobile: zod_1.z.string().min(10).max(15),
    password: zod_1.z.string().min(6),
    firstName: zod_1.z.string().min(1),
    lastName: zod_1.z.string().min(1),
    gender: zod_1.z.enum(['MALE', 'FEMALE', 'OTHER']),
    maritalStatus: zod_1.z.enum(['UNMARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED']),
    email: zod_1.z.string().email(),
    birthDate: zod_1.z.string().refine((val) => {
        const dob = new Date(`${val.slice(0, 10)}T12:00:00Z`);
        if (isNaN(dob.getTime()))
            return false;
        const age = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        return age >= 18;
    }, { message: 'Date of Birth is required and must be at least 18 years old.' }),
    profileCreatedBy: zod_1.z.enum(PROFILE_CREATED_BY_OPTIONS).optional()
});
/**
 * Generate a collision-safe RegID with retry logic.
 * Attempts up to 5 times before throwing.
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
exports.register = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const validatedData = registerSchema.parse(req.body);
    const emailLower = validatedData.email.toLowerCase();
    // Check if user already exists by mobile
    const existingMobile = yield db_1.default.user.findUnique({
        where: { mobile: validatedData.mobile }
    });
    if (existingMobile) {
        res.status(400).json({ error: 'User with this mobile number already exists.' });
        return;
    }
    // Check if user already exists by email
    const existingEmail = yield db_1.default.user.findUnique({
        where: { email: emailLower }
    });
    if (existingEmail) {
        res.status(400).json({ error: 'User with this email already exists.' });
        return;
    }
    const hashedPassword = yield bcrypt_1.default.hash(validatedData.password, 10);
    const newRegId = yield generateUniqueRegId();
    // Parse birthDate at UTC noon to prevent IST timezone shift
    const birthDateTime = new Date(`${validatedData.birthDate.slice(0, 10)}T12:00:00Z`);
    const newUser = yield db_1.default.user.create({
        data: {
            regId: newRegId,
            mobile: validatedData.mobile,
            email: emailLower,
            password: hashedPassword,
            accountStatus: 'INACTIVE',
            profileCreatedBy: validatedData.profileCreatedBy || null,
            profile: {
                create: {
                    firstName: validatedData.firstName,
                    lastName: validatedData.lastName,
                    gender: validatedData.gender,
                    maritalStatus: validatedData.maritalStatus,
                    birthDateTime
                }
            }
        },
        include: {
            profile: true
        }
    });
    if (emailLower) {
        (0, mail_service_1.sendWelcomeEmail)(emailLower, validatedData.firstName, newRegId);
    }
    res.status(201).json({
        message: 'Registration successful! Awaiting admin approval.',
        regId: newUser.regId
    });
}));
exports.login = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
        res.status(400).json({ error: 'Provide username (Email, Mobile, or RegID) and password' });
        return;
    }
    const idLower = identifier.trim().toLowerCase();
    // Omni-Login Logic
    const user = yield db_1.default.user.findFirst({
        where: {
            OR: [
                { mobile: identifier },
                { email: idLower },
                { regId: identifier.toUpperCase() }
            ]
        }
    });
    if (!user) {
        res.status(401).json({ error: 'Invalid credentials.' });
        return;
    }
    const isMatch = yield bcrypt_1.default.compare(password, user.password);
    if (!isMatch) {
        res.status(401).json({ error: 'Invalid credentials.' });
        return;
    }
    // Generate JWT — includes requiresPasswordChange so frontend can redirect
    const token = jsonwebtoken_1.default.sign({
        id: user.id,
        role: user.role,
        accountStatus: user.accountStatus,
        planType: user.planType,
        requiresPasswordChange: user.requiresPasswordChange
    }, (0, env_1.getJwtSecret)(), { expiresIn: '7d' });
    res.status(200).json({
        token,
        user: {
            regId: user.regId,
            role: user.role,
            status: user.accountStatus,
            planType: user.planType,
            requiresPasswordChange: user.requiresPasswordChange
        }
    });
}));
