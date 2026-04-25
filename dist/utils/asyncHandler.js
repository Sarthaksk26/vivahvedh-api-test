"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = void 0;
/**
 * Wraps an async Express route handler to automatically catch rejected
 * promises and forward them to the central error-handling middleware.
 *
 * Usage: router.get('/path', asyncHandler(myController));
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
