"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskPrivateDetails = exports.sanitizeUser = exports.excludeFields = void 0;
/**
 * Safely removes sensitive fields from an object or array of objects.
 * Standard PII fields to exclude: password, role, mobile, email (masking)
 */
const excludeFields = (obj, keys) => {
    if (Array.isArray(obj)) {
        return obj.map((item) => (0, exports.excludeFields)(item, keys));
    }
    if (obj && typeof obj === 'object') {
        const newObj = Object.assign({}, obj);
        keys.forEach((key) => {
            delete newObj[key];
        });
        return newObj;
    }
    return obj;
};
exports.excludeFields = excludeFields;
const sanitizeUser = (user) => {
    return (0, exports.excludeFields)(user, ['password', 'role']);
};
exports.sanitizeUser = sanitizeUser;
const maskPrivateDetails = (user, sameUser = false) => {
    if (!user)
        return user;
    const safe = (0, exports.sanitizeUser)(user);
    if (!sameUser) {
        safe.mobile = '';
        safe.email = '';
    }
    return safe;
};
exports.maskPrivateDetails = maskPrivateDetails;
