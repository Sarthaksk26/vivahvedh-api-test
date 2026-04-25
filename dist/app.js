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
const error_middleware_1 = require("./middleware/error.middleware");
const app = (0, express_1.default)();
// 1. Trust proxy for Render/Cloudflare deployment (MUST be first)
app.set('trust proxy', 1);
// 2. Global Security & CORS (MUST be before any routes)
app.use((0, cors_1.default)());
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(express_1.default.json({ limit: '1mb' }));
// 3. Basic Health Checks (Publicly accessible)
app.get('/', (req, res) => res.status(200).send('Vivahvedh API is live.'));
app.get('/health', (req, res) => res.status(200).json({ status: 'OK' }));
// 4. Rate Limiting
const globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests.' }
});
app.use('/api', globalLimiter);
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many auth attempts.' }
});
// 5. Static Files
const UPLOADS_PATH = path_1.default.join(process.cwd(), 'uploads');
app.use('/uploads', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
}, express_1.default.static(UPLOADS_PATH));
// 6. API Routes
app.use('/api/auth', authLimiter, auth_routes_1.default);
app.use('/api/user', user_routes_1.default);
app.use('/api/search', search_routes_1.default);
app.use('/api/admin', admin_routes_1.default);
app.use('/api/public', public_routes_1.default);
app.use('/api/connections', connection_routes_1.default);
app.use('/api/payments', payment_routes_1.default);
app.use('/api/stories', story_routes_1.default);
// 7. 404 Handler (Catch-all)
app.use((req, res) => {
    console.log(`404 at: ${req.originalUrl}`);
    res.status(404).json({ error: `Path ${req.originalUrl} not found.` });
});
// 8. Central Error Handler (MUST be last — 4-argument signature)
app.use(error_middleware_1.errorHandler);
exports.default = app;
