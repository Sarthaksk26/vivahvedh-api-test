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
exports.sendEnquiryReplyEmail = exports.sendOfflineCredentialsEmail = exports.sendEnquiryNotificationEmail = exports.sendStoryApprovedEmail = exports.sendPaymentStatusEmail = exports.sendConnectionAcceptedEmail = exports.sendConnectionRequestEmail = exports.sendApprovalEmail = exports.sendWelcomeEmail = exports.sendMail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
// Create a reusable transporter using exactly what we specify in .env
// We default to a silent fail-catcher if env variables are missing so the app doesn't crash during development
const transporter = nodemailer_1.default.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
    },
    connectionTimeout: 5000, // 5 seconds
    greetingTimeout: 5000, // 5 seconds
    socketTimeout: 5000, // 5 seconds
});
const sendMail = (to, subject, htmlContent) => __awaiter(void 0, void 0, void 0, function* () {
    if (!process.env.SMTP_USER) {
        console.warn(`⚠️ Mail Module Skipped: SMTP_USER not configured. Would have sent "${subject}" to ${to}`);
        return;
    }
    try {
        const info = yield transporter.sendMail({
            from: `"Vivahvedh Matrimony" <${process.env.SMTP_USER}>`,
            to,
            subject,
            html: htmlContent,
        });
        console.log(`✉️ Email securely sent: [${info.messageId}] to ${to}`);
    }
    catch (error) {
        console.error('❌ Failed to route email:', error);
    }
});
exports.sendMail = sendMail;
// =====================================
// High-Impact Email Templates
// =====================================
const sendWelcomeEmail = (to, name, regId) => __awaiter(void 0, void 0, void 0, function* () {
    const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 40px;">
      <h1 style="color: #e11d48;">Welcome to Vivahvedh!</h1>
      <p style="font-size: 16px;">Namaste <b>${name}</b>,</p>
      <p>Your registration was successful. Your unique Register ID is: <b style="color: #e11d48; font-size: 20px;">${regId}</b></p>
      <p>You have taken the first step towards finding your perfect life partner securely.</p>
      <p>An Admin will review your profile shortly. Make sure to complete your Dashboard details and upload photos to get approved faster!</p>
      <div style="margin-top: 30px; font-size: 12px; color: #777;">
        © ${new Date().getFullYear()} Vivahvedh Matrimonial
      </div>
    </div>
  `;
    yield (0, exports.sendMail)(to, `Welcome to Vivahvedh Matrimony! | ${regId}`, html);
});
exports.sendWelcomeEmail = sendWelcomeEmail;
const sendApprovalEmail = (to, name, regId) => __awaiter(void 0, void 0, void 0, function* () {
    const baseUrl = process.env.CLIENT_URL || 'https://vivahvedh.com';
    const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 40px; border-top: 5px solid #16a34a;">
      <h1 style="color: #16a34a;">Profile Approved! ✅</h1>
      <p style="font-size: 16px;">Dear <b>${name}</b> (ID: ${regId}),</p>
      <p>Incredible news! The Vivahvedh moderation team has approved your profile.</p>
      <p>Your profile is now <b>Active</b> and completely searchable by thousands of other network members.</p>
      <a href="${baseUrl}/dashboard" style="background-color: #e11d48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-top: 20px;">
        Go to Dashboard
      </a>
    </div>
  `;
    yield (0, exports.sendMail)(to, "Your Profile is Now Active! | Vivahvedh", html);
});
exports.sendApprovalEmail = sendApprovalEmail;
const sendConnectionRequestEmail = (to, receiverName, senderName) => __awaiter(void 0, void 0, void 0, function* () {
    const baseUrl = process.env.CLIENT_URL || 'https://vivahvedh.com';
    const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 40px;">
      <h1 style="color: #e11d48;">New Match Interest! ❤️</h1>
      <p style="font-size: 16px;">Dear <b>${receiverName}</b>,</p>
      <p>Someone has noticed you! <b>${senderName}</b> has expressed interest in your profile.</p>
      <p>Log in now to view their profile details and decide if you want to connect.</p>
      <a href="${baseUrl}/dashboard" style="background-color: #e11d48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-top: 20px;">
        View Request
      </a>
    </div>
  `;
    yield (0, exports.sendMail)(to, `New Interest from ${senderName}`, html);
});
exports.sendConnectionRequestEmail = sendConnectionRequestEmail;
const sendConnectionAcceptedEmail = (to, receiverName, accepterName) => __awaiter(void 0, void 0, void 0, function* () {
    const baseUrl = process.env.CLIENT_URL || 'https://vivahvedh.com';
    const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 40px; border-top: 5px solid #16a34a;">
      <h1 style="color: #16a34a;">Request Accepted! 🎉</h1>
      <p style="font-size: 16px;">Dear <b>${receiverName}</b>,</p>
      <p>Great news! <b>${accepterName}</b> has accepted your connection request.</p>
      <p>You can now view their direct contact information and initiate communication.</p>
      <a href="${baseUrl}/dashboard" style="background-color: #e11d48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-top: 20px;">
        View Connected Match
      </a>
    </div>
  `;
    yield (0, exports.sendMail)(to, `${accepterName} Accepted Your Request!`, html);
});
exports.sendConnectionAcceptedEmail = sendConnectionAcceptedEmail;
const sendPaymentStatusEmail = (to, name, plan, status) => __awaiter(void 0, void 0, void 0, function* () {
    const baseUrl = process.env.CLIENT_URL || 'https://vivahvedh.com';
    const isApproved = status === 'APPROVED';
    const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 40px; border-top: 5px solid ${isApproved ? '#16a34a' : '#dc2626'};">
      <h1 style="color: ${isApproved ? '#16a34a' : '#dc2626'};">Payment ${status}! ${isApproved ? '🎉' : '⚠️'}</h1>
      <p style="font-size: 16px;">Dear <b>${name}</b>,</p>
      <p>Your payment submission for the <b>${plan} Plan</b> has been ${status.toLowerCase()}.</p>
      ${isApproved
        ? `<p>Your account features have been upgraded immediately. You now have full access according to your plan.</p>`
        : `<p>Unfortunately, your transaction could not be verified. Please ensure the transaction ID is correct and the screenshot is clear, then try again.</p>`}
      <a href="${baseUrl}/dashboard" style="background-color: #e11d48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-top: 20px;">
        Go to Dashboard
      </a>
    </div>
  `;
    yield (0, exports.sendMail)(to, `Payment ${status} | Vivahvedh Matrimony`, html);
});
exports.sendPaymentStatusEmail = sendPaymentStatusEmail;
const sendStoryApprovedEmail = (to, groomName, brideName) => __awaiter(void 0, void 0, void 0, function* () {
    const baseUrl = process.env.CLIENT_URL || 'https://vivahvedh.com';
    const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 40px; border-top: 5px solid #e11d48;">
      <h1 style="color: #e11d48;">Story Published! ❤️</h1>
      <p style="font-size: 16px;">Dear <b>${groomName} & ${brideName}</b>,</p>
      <p>Congratulations! Your success story has been approved and is now live on the Vivahvedh Success Stories page.</p>
      <p>Your journey will inspire thousands of other members to find their soulmates.</p>
      <a href="${baseUrl}/success-stories" style="background-color: #e11d48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-top: 20px;">
        View Your Story
      </a>
    </div>
  `;
    yield (0, exports.sendMail)(to, `Your Success Story is Live! | Vivahvedh`, html);
});
exports.sendStoryApprovedEmail = sendStoryApprovedEmail;
const sendEnquiryNotificationEmail = (adminEmail, enquiry) => __awaiter(void 0, void 0, void 0, function* () {
    const html = `
    <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
      <h2 style="color: #e11d48; border-bottom: 2px solid #eee; padding-bottom: 10px;">New Enquiry Received</h2>
      <p><b>From:</b> ${enquiry.firstName} ${enquiry.lastName}</p>
      <p><b>Email:</b> ${enquiry.email}</p>
      <p><b>Mobile:</b> ${enquiry.mobile}</p>
      <p><b>Subject:</b> ${enquiry.subject}</p>
      <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin-top: 10px;">
        <p><b>Message:</b></p>
        <p>${enquiry.message}</p>
      </div>
    </div>
  `;
    yield (0, exports.sendMail)(adminEmail, `[NEW ENQUIRY] ${enquiry.subject}`, html);
});
exports.sendEnquiryNotificationEmail = sendEnquiryNotificationEmail;
const sendOfflineCredentialsEmail = (to, name, regId, tempPassword) => __awaiter(void 0, void 0, void 0, function* () {
    const html = `
    <div style="font-family: Arial, sans-serif; color: #333; padding: 40px; max-width: 600px; margin: 0 auto;">
      <div style="text-align: center; border-bottom: 3px solid #e11d48; padding-bottom: 20px; margin-bottom: 30px;">
        <h1 style="color: #e11d48; margin-bottom: 5px;">Welcome to Vivahvedh! 🎉</h1>
        <p style="color: #666; font-size: 14px;">Your profile has been created by our team</p>
      </div>
      
      <p style="font-size: 16px;">Namaste <b>${name}</b>,</p>
      <p>Your Vivahvedh matrimonial profile has been created successfully. Here are your login credentials:</p>
      
      <div style="background: #f8f9fa; border: 2px solid #e11d48; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
        <p style="margin: 0 0 12px;"><b style="color: #666;">Login ID (RegID):</b></p>
        <p style="font-size: 24px; font-weight: bold; color: #e11d48; margin: 0 0 16px; letter-spacing: 2px;">${regId}</p>
        <p style="margin: 0 0 12px;"><b style="color: #666;">Temporary Password:</b></p>
        <p style="font-size: 20px; font-weight: bold; color: #333; margin: 0; font-family: monospace; background: #fff; display: inline-block; padding: 8px 16px; border-radius: 6px; border: 1px solid #ddd;">${tempPassword}</p>
      </div>
      
      <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; border-radius: 4px; margin: 20px 0;">
        <p style="margin: 0; font-weight: bold; color: #856404;">⚠️ Important: You MUST change your password upon your first login for security.</p>
      </div>
      
      <a href="${process.env.CLIENT_URL || '#'}/login" style="background-color: #e11d48; color: white; padding: 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; margin-top: 20px; text-align: center;">
        Login Now →
      </a>
      
      <div style="margin-top: 40px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px;">
        <p>If you did not request this account, please contact us immediately.</p>
        <p>© ${new Date().getFullYear()} Vivahvedh Matrimonial</p>
      </div>
    </div>
  `;
    yield (0, exports.sendMail)(to, `Your Vivahvedh Login Credentials | ${regId}`, html);
});
exports.sendOfflineCredentialsEmail = sendOfflineCredentialsEmail;
const sendEnquiryReplyEmail = (to, name, originalMessage, replyMessage) => __awaiter(void 0, void 0, void 0, function* () {
    const html = `
    <div style="font-family: Arial, sans-serif; color: #333; padding: 30px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px;">
      <h2 style="color: #e11d48; margin-bottom: 20px;">Support Reply | Vivahvedh</h2>
      <p style="font-size: 16px;">Dear <b>${name}</b>,</p>
      <p>Thank you for reaching out to us. Here is the response from our team:</p>
      
      <div style="background: #fdfdfd; border-left: 4px solid #e11d48; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; white-space: pre-wrap;">${replyMessage}</p>
      </div>
      
      <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin-top: 30px; font-size: 13px; color: #666;">
        <p style="margin-top: 0;"><b>Your Original Message:</b></p>
        <p style="margin-bottom: 0; font-style: italic;">"${originalMessage}"</p>
      </div>
      
      <div style="margin-top: 30px; font-size: 12px; color: #999;">
        <p>Best regards,<br>Vivahvedh Administration Team</p>
      </div>
    </div>
  `;
    yield (0, exports.sendMail)(to, `Re: Your Enquiry to Vivahvedh`, html);
});
exports.sendEnquiryReplyEmail = sendEnquiryReplyEmail;
