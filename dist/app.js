"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const search_routes_1 = __importDefault(require("./routes/search.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const connection_routes_1 = __importDefault(require("./routes/connection.routes"));
const public_routes_1 = __importDefault(require("./routes/public.routes"));
const payment_routes_1 = __importDefault(require("./routes/payment.routes"));
const story_routes_1 = __importDefault(require("./routes/story.routes"));
const app = (0, express_1.default)();
// Security Middleware
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" } // Allow serving uploads to other origins
}));
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '1mb' })); // Prevent large JSON payload DoS
// Global Rate Limiting
const globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests from this IP, please try again later.' }
});
app.use('/api', globalLimiter);
// Path import fix for uploads
// import path from 'path'; // moved to top
// Rate Limiting for Auth routes
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // limit each IP to 20 requests per windowMs
    message: { error: 'Too many authentication attempts. Please try again later.' }
});
app.use('/api/auth', authLimiter);
// Publicly expose the 'uploads' folder mapping from the exact filepath
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
// Routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/user', user_routes_1.default);
app.use('/api/search', search_routes_1.default);
app.use('/api/admin', admin_routes_1.default);
app.use('/api/public', public_routes_1.default);
app.use('/api/connections', connection_routes_1.default);
app.use('/api/payments', payment_routes_1.default);
app.use('/api/stories', story_routes_1.default);
// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'API is running optimally.' });
});
exports.default = app;
