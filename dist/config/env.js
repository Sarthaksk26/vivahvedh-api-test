"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJwtSecret = void 0;
const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('FATAL ERROR: JWT_SECRET is not defined in environment variables.');
    }
    return secret;
};
exports.getJwtSecret = getJwtSecret;
