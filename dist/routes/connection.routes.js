"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const connection_controller_1 = require("../controllers/connection.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// @route   POST /api/connections/send
router.post('/send', auth_middleware_1.requireAuth, connection_controller_1.sendInterest);
// @route   POST /api/connections/accept
router.post('/accept', auth_middleware_1.requireAuth, connection_controller_1.acceptInterest);
// @route   POST /api/connections/reject
router.post('/reject', auth_middleware_1.requireAuth, connection_controller_1.rejectInterest);
// @route   GET /api/connections/my-connections
router.get('/my-connections', auth_middleware_1.requireAuth, connection_controller_1.getMyConnections);
exports.default = router;
