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
exports.getPublicProfile = exports.executeSearch = void 0;
const db_1 = __importDefault(require("../config/db"));
const sanitize_1 = require("../utils/sanitize");
const executeSearch = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { gender, maritalStatus, casteId, q, ageMin, ageMax, height, trade, occupation, location, diet, page = '1', limit = '20' } = req.query;
        let profileFilters = {};
        if (gender)
            profileFilters.gender = String(gender).toUpperCase();
        if (maritalStatus)
            profileFilters.maritalStatus = String(maritalStatus).toUpperCase();
        if (casteId)
            profileFilters.casteId = parseInt(String(casteId));
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
        // Build conditions array for consistent AND logic
        const conditions = [
            { accountStatus: 'ACTIVE' },
            { role: 'USER' }
        ];
        // Profile Filters
        if (Object.keys(profileFilters).length > 0) {
            conditions.push({ profile: { is: profileFilters } });
        }
        else {
            conditions.push({ profile: { isNot: null } });
        }
        // Physical Filters
        if (height || diet) {
            const physicalFilter = {};
            if (height)
                physicalFilter.height = { contains: String(height), mode: 'insensitive' };
            if (diet)
                physicalFilter.diet = { contains: String(diet), mode: 'insensitive' };
            conditions.push({ physical: { is: physicalFilter } });
        }
        // Education Filters
        if (trade || occupation) {
            const educationFilter = {};
            if (trade)
                educationFilter.trade = { contains: String(trade), mode: 'insensitive' };
            if (occupation)
                educationFilter.jobBusiness = { contains: String(occupation), mode: 'insensitive' };
            conditions.push({ education: { is: educationFilter } });
        }
        // Location Filters
        if (location) {
            const locStr = String(location);
            conditions.push({
                addresses: {
                    some: {
                        OR: [
                            { city: { contains: locStr, mode: 'insensitive' } },
                            { district: { contains: locStr, mode: 'insensitive' } },
                            { state: { contains: locStr, mode: 'insensitive' } }
                        ]
                    }
                }
            });
        }
        // Keyword Search (q) - Applied as an OR within the filtered results
        if (q) {
            const qStr = String(q);
            conditions.push({
                OR: [
                    { regId: { contains: qStr.toUpperCase() } },
                    { profile: { is: { firstName: { contains: qStr, mode: 'insensitive' } } } },
                    { profile: { is: { lastName: { contains: qStr, mode: 'insensitive' } } } }
                ]
            });
        }
        const baseWhere = { AND: conditions };
        const pageNumber = parseInt(String(page)) || 1;
        const pageSize = parseInt(String(limit)) || 20;
        const skip = (pageNumber - 1) * pageSize;
        // Get total count for pagination
        const totalResults = yield db_1.default.user.count({ where: baseWhere });
        const totalPages = Math.ceil(totalResults / pageSize);
        // Gold users appear first (priority listing)
        const matches = yield db_1.default.user.findMany({
            where: baseWhere,
            include: {
                profile: true,
                images: {
                    where: { isPrimary: true },
                    take: 1
                },
                education: true,
                physical: true
            },
            orderBy: [
                { planType: 'desc' }, // GOLD > SILVER > FREE
                { createdAt: 'desc' }
            ],
            skip,
            take: pageSize
        });
        // Strip out sensitive base user fields before sending
        const safeMatches = matches.map(user => {
            var _a;
            const sameUser = user.id === ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id);
            const safeQuery = (0, sanitize_1.maskPrivateDetails)(user, sameUser);
            // Guest users only see surname
            if (!req.user && safeQuery.profile) {
                safeQuery.profile.firstName = '***';
            }
            return safeQuery;
        });
        res.status(200).json({
            results: safeMatches,
            pagination: {
                currentPage: pageNumber,
                totalPages,
                totalResults,
                pageSize
            }
        });
    }
    catch (error) {
        console.error("Matchmaking Error:", error);
        res.status(500).json({ error: 'Failed to execute query.' });
    }
});
exports.executeSearch = executeSearch;
const getPublicProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const viewerId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const isAdmin = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.role) === 'ADMIN';
        const whereClause = {
            id: id,
            role: 'USER'
        };
        if (!isAdmin) {
            whereClause.accountStatus = 'ACTIVE';
        }
        const userProfile = yield db_1.default.user.findUnique({
            where: whereClause,
            include: {
                profile: true,
                family: true,
                education: true,
                physical: true,
                astrology: true,
                images: true
            }
        });
        if (!userProfile) {
            res.status(404).json({ error: 'Target profile not found or is currently private.' });
            return;
        }
        // Record profile view (fire and forget)
        if (viewerId && viewerId !== id) {
            db_1.default.profileView.upsert({
                where: { viewerId_viewedId: { viewerId, viewedId: id } },
                update: { viewedAt: new Date() },
                create: { viewerId, viewedId: id }
            }).catch(() => { });
        }
        // Contact Info Check
        let showContactInfo = false;
        if (isAdmin) {
            showContactInfo = true;
        }
        else if (viewerId && viewerId !== id) {
            // Check if there is an ACCEPTED request between them
            const connection = yield db_1.default.request.findFirst({
                where: {
                    OR: [
                        { senderId: viewerId, receiverId: id, status: 'ACCEPTED' },
                        { senderId: id, receiverId: viewerId, status: 'ACCEPTED' }
                    ]
                }
            });
            if (connection) {
                showContactInfo = true;
            }
        }
        else if (viewerId === id) {
            showContactInfo = true;
        }
        const safeQuery = (0, sanitize_1.maskPrivateDetails)(userProfile, showContactInfo);
        if (!req.user && safeQuery.profile) {
            safeQuery.profile.firstName = '***';
        }
        res.status(200).json(safeQuery);
    }
    catch (error) {
        console.error("Public Profile Error:", error);
        res.status(500).json({ error: 'Failed to fetch profile.' });
    }
});
exports.getPublicProfile = getPublicProfile;
