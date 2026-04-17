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
exports.submitEnquiry = void 0;
const db_1 = __importDefault(require("../config/db"));
const mail_service_1 = require("../services/mail.service");
const submitEnquiry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, email, phone, message } = req.body;
        const names = name ? name.split(' ') : ['Guest', ''];
        const firstName = names[0];
        const lastName = names.slice(1).join(' ') || '-';
        const subject = 'General Contact Form';
        const mobile = phone || 'no-phone';
        const enquiry = yield db_1.default.enquiry.create({
            data: { firstName, lastName, email, mobile, subject, message },
        });
        // Notify Administrator (assuming SMTP_USER is the primary admin or support email)
        if (process.env.SMTP_USER) {
            (0, mail_service_1.sendEnquiryNotificationEmail)(process.env.SMTP_USER, enquiry).catch(e => console.error("Admin Notify Error:", e));
        }
        // Auto-respond to User
        const userThankYou = `
      <div style="font-family: Arial, sans-serif; text-align: center; padding: 30px;">
        <h2 style="color: #e11d48;">Thank you for contacting Vivahvedh!</h2>
        <p>Namaste ${firstName},</p>
        <p>We have received your message regarding <b>"${subject}"</b>. Our support team will get back to you shortly.</p>
        <hr />
        <p style="font-size: 12px; color: #777;">Vivahvedh Matrimony Support Team</p>
      </div>
    `;
        (0, mail_service_1.sendMail)(email, "Enquiry Received | Vivahvedh Matrimony", userThankYou).catch(e => console.error("User Notify Error:", e));
        res.status(201).json({ message: 'Enquiry submitted successfully. We will contact you soon.' });
    }
    catch (error) {
        console.error("Enquiry submission failed:", error);
        res.status(500).json({ error: "Failed to submit message." });
    }
});
exports.submitEnquiry = submitEnquiry;
