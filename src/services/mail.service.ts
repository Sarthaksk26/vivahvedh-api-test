import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

// ═══════════════════════════════════════════════════════════════════
//  EMAIL TRANSPORTER — Environment-Aware Setup
//
//  Modes:
//  1) PRODUCTION  — Uses real SMTP credentials from .env (Gmail, SendGrid, etc.)
//  2) TEST/DEV    — Uses Ethereal (fake inbox) when EMAIL_TEST=true in .env
//  3) FALLBACK    — Console-logs emails when no SMTP_USER is configured
//
//  See EMAIL_SETUP.md for full configuration guide.
// ═══════════════════════════════════════════════════════════════════

let transporter: Transporter;
let etherealPreviewUrl: string | null = null;

function createProductionTransporter(): Transporter {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
  });
}

async function createEtherealTransporter(): Promise<Transporter> {
  const testAccount = await nodemailer.createTestAccount();
  console.log(`📧 [Ethereal] Test inbox created:`);
  console.log(`   User: ${testAccount.user}`);
  console.log(`   Pass: ${testAccount.pass}`);
  console.log(`   View sent emails at: https://ethereal.email/login`);
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
}

// Initialize synchronously for production; async Ethereal is handled lazily
if (process.env.EMAIL_TEST === 'true') {
  // Lazy-init: will be set before first send
  transporter = null as any;
} else {
  transporter = createProductionTransporter();
}

export function escapeHTML(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const sendMail = async (to: string, subject: string, htmlContent: string) => {
  // ── Fallback: Console-log when SMTP is not configured ──
  if (!process.env.SMTP_USER && process.env.EMAIL_TEST !== 'true') {
    console.warn(`⚠️ Mail Module Skipped: SMTP_USER not configured. Would have sent "${subject}" to ${to}`);
    if (process.env.NODE_ENV === 'development') {
      console.log(`📋 [Dev Console Email Preview]`);
      console.log(`   To: ${to}`);
      console.log(`   Subject: ${subject}`);
      console.log(`   Body length: ${htmlContent.length} chars`);
    }
    return;
  }

  // ── Lazy-init Ethereal transporter for testing ──
  if (process.env.EMAIL_TEST === 'true' && !transporter) {
    transporter = await createEtherealTransporter();
  }

  try {
    const fromAddress = process.env.EMAIL_TEST === 'true'
      ? '"Vivahvedh Test" <test@vivahvedh.com>'
      : `"Vivahvedh Matrimony" <${process.env.SMTP_USER}>`;

    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html: htmlContent,
    });

    console.log(`✉️ Email securely sent: [${info.messageId}] to ${to}`);

    // If using Ethereal, log preview URL
    if (process.env.EMAIL_TEST === 'true') {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(`🔗 [Ethereal Preview] ${previewUrl}`);
        etherealPreviewUrl = previewUrl as string;
      }
    }
  } catch (error: any) {
    console.error('❌ Email send failed:', {
      to,
      subject,
      error: error.message,
      code: error.code,
      hint: error.code === 'ECONNREFUSED'
        ? 'Check SMTP_HOST and SMTP_PORT settings'
        : error.code === 'EAUTH'
        ? 'Check SMTP_USER and SMTP_PASS — authentication failed'
        : 'Unknown error'
    });
    // Re-throw so calling code can handle if needed
    throw error;
  }
};

/** Returns the last Ethereal preview URL (useful for test assertions) */
export const getLastEtherealPreviewUrl = () => etherealPreviewUrl;

// =====================================
// High-Impact Email Templates
// =====================================

export const sendWelcomeEmail = async (to: string, name: string, regId: string) => {
  const safeName = escapeHTML(name);
  const safeRegId = escapeHTML(regId);
  const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 40px;">
      <h1 style="color: #e11d48;">Welcome to Vivahvedh!</h1>
      <p style="font-size: 16px;">Namaste <b>${safeName}</b>,</p>
      <p>Your registration was successful. Your unique Register ID is: <b style="color: #e11d48; font-size: 20px;">${safeRegId}</b></p>
      <p>You have taken the first step towards finding your perfect life partner securely.</p>
      <p>An Admin will review your profile shortly. Make sure to complete your Dashboard details and upload photos to get approved faster!</p>
      <div style="margin-top: 30px; font-size: 12px; color: #777;">
        © ${new Date().getFullYear()} Vivahvedh Matrimonial
      </div>
    </div>
  `;
  await sendMail(to, `Welcome to Vivahvedh Matrimony! | ${safeRegId}`, html);
};

export const sendApprovalEmail = async (to: string, name: string, regId: string) => {
  const baseUrl = process.env.CLIENT_URL || 'https://vivahvedh.com';
  const safeName = escapeHTML(name);
  const safeRegId = escapeHTML(regId);
  const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 40px; border-top: 5px solid #16a34a;">
      <h1 style="color: #16a34a;">Profile Approved! ✅</h1>
      <p style="font-size: 16px;">Dear <b>${safeName}</b> (ID: ${safeRegId}),</p>
      <p>Incredible news! The Vivahvedh moderation team has approved your profile.</p>
      <p>Your profile is now <b>Active</b> and completely searchable by thousands of other network members.</p>
      <a href="${baseUrl}/dashboard" style="background-color: #e11d48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-top: 20px;">
        Go to Dashboard
      </a>
    </div>
  `;
  await sendMail(to, "Your Profile is Now Active! | Vivahvedh", html);
};

export const sendConnectionRequestEmail = async (to: string, receiverName: string, senderName: string) => {
  const baseUrl = process.env.CLIENT_URL || 'https://vivahvedh.com';
  const safeReceiverName = escapeHTML(receiverName);
  const safeSenderName = escapeHTML(senderName);
  const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 40px;">
      <h1 style="color: #e11d48;">New Match Interest! ❤️</h1>
      <p style="font-size: 16px;">Dear <b>${safeReceiverName}</b>,</p>
      <p>Someone has noticed you! <b>${safeSenderName}</b> has expressed interest in your profile.</p>
      <p>Log in now to view their profile details and decide if you want to connect.</p>
      <a href="${baseUrl}/dashboard" style="background-color: #e11d48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-top: 20px;">
        View Request
      </a>
    </div>
  `;
  await sendMail(to, `New Interest from ${safeSenderName}`, html);
};

export const sendProposalSentConfirmationEmail = async (
  to: string,
  senderName: string,
  receiverName: string
) => {
  const baseUrl = process.env.CLIENT_URL || 'https://vivahvedh.com';
  const safeSenderName = escapeHTML(senderName);
  const safeReceiverName = escapeHTML(receiverName);
  const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 40px;">
      <h1 style="color: #16a34a;">Proposal Sent Successfully! ✅</h1>
      <p style="font-size: 16px;">Dear <b>${safeSenderName}</b>,</p>
      <p>Your match proposal to <b>${safeReceiverName}</b> has been sent successfully.</p>
      <p>They will be notified and can now view your profile and respond.</p>
      <a href="${baseUrl}/dashboard" style="background-color: #e11d48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-top: 20px;">
        Go to Dashboard
      </a>
    </div>
  `;
  await sendMail(to, `Your Proposal to ${safeReceiverName} Was Sent`, html);
};

export const sendConnectionAcceptedEmail = async (to: string, receiverName: string, accepterName: string) => {
  const baseUrl = process.env.CLIENT_URL || 'https://vivahvedh.com';
  const safeReceiverName = escapeHTML(receiverName);
  const safeAccepterName = escapeHTML(accepterName);
  const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 40px; border-top: 5px solid #16a34a;">
      <h1 style="color: #16a34a;">Request Accepted! 🎉</h1>
      <p style="font-size: 16px;">Dear <b>${safeReceiverName}</b>,</p>
      <p>Great news! <b>${safeAccepterName}</b> has accepted your connection request.</p>
      <p>You can now view their direct contact information and initiate communication.</p>
      <a href="${baseUrl}/dashboard" style="background-color: #e11d48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-top: 20px;">
        View Connected Match
      </a>
    </div>
  `;
  await sendMail(to, `${safeAccepterName} Accepted Your Request!`, html);
};

export const sendPaymentStatusEmail = async (to: string, name: string, plan: string, status: 'APPROVED' | 'REJECTED') => {
  const baseUrl = process.env.CLIENT_URL || 'https://vivahvedh.com';
  const isApproved = status === 'APPROVED';
  const safeName = escapeHTML(name);
  const safePlan = escapeHTML(plan);
  const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 40px; border-top: 5px solid ${isApproved ? '#16a34a' : '#dc2626'};">
      <h1 style="color: ${isApproved ? '#16a34a' : '#dc2626'};">Payment ${status}! ${isApproved ? '🎉' : '⚠️'}</h1>
      <p style="font-size: 16px;">Dear <b>${safeName}</b>,</p>
      <p>Your payment submission for the <b>${safePlan} Plan</b> has been ${status.toLowerCase()}.</p>
      ${isApproved 
        ? `<p>Your account features have been upgraded immediately. You now have full access according to your plan.</p>`
        : `<p>Unfortunately, your transaction could not be verified. Please ensure the transaction ID is correct and the screenshot is clear, then try again.</p>`
      }
      <a href="${baseUrl}/dashboard" style="background-color: #e11d48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-top: 20px;">
        Go to Dashboard
      </a>
    </div>
  `;
  await sendMail(to, `Payment ${status} | Vivahvedh Matrimony`, html);
};

export const sendStoryApprovedEmail = async (to: string, groomName: string, brideName: string) => {
  const baseUrl = process.env.CLIENT_URL || 'https://vivahvedh.com';
  const safeGroomName = escapeHTML(groomName);
  const safeBrideName = escapeHTML(brideName);
  const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 40px; border-top: 5px solid #e11d48;">
      <h1 style="color: #e11d48;">Story Published! ❤️</h1>
      <p style="font-size: 16px;">Dear <b>${safeGroomName} & ${safeBrideName}</b>,</p>
      <p>Congratulations! Your success story has been approved and is now live on the Vivahvedh Success Stories page.</p>
      <p>Your journey will inspire thousands of other members to find their soulmates.</p>
      <a href="${baseUrl}/success-stories" style="background-color: #e11d48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-top: 20px;">
        View Your Story
      </a>
    </div>
  `;
  await sendMail(to, `Your Success Story is Live! | Vivahvedh`, html);
};

export const sendEnquiryNotificationEmail = async (adminEmail: string, enquiry: any) => {
  const safeFirstName = escapeHTML(enquiry.firstName);
  const safeLastName = escapeHTML(enquiry.lastName);
  const safeEmail = escapeHTML(enquiry.email);
  const safeMobile = escapeHTML(enquiry.mobile);
  const safeSubject = escapeHTML(enquiry.subject);
  const safeMessage = escapeHTML(enquiry.message).replace(/\n/g, '<br/>');
  const html = `
    <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
      <h2 style="color: #e11d48; border-bottom: 2px solid #eee; padding-bottom: 10px;">New Enquiry Received</h2>
      <p><b>From:</b> ${safeFirstName} ${safeLastName}</p>
      <p><b>Email:</b> ${safeEmail}</p>
      <p><b>Mobile:</b> ${safeMobile}</p>
      <p><b>Subject:</b> ${safeSubject}</p>
      <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin-top: 10px;">
        <p><b>Message:</b></p>
        <p>${safeMessage}</p>
      </div>
    </div>
  `;
  await sendMail(adminEmail, `[NEW ENQUIRY] ${safeSubject}`, html);
};

export const sendOfflineCredentialsEmail = async (to: string, name: string, regId: string, tempPassword: string) => {
  const safeName = escapeHTML(name);
  const safeRegId = escapeHTML(regId);
  const safeTempPassword = escapeHTML(tempPassword);
  const html = `
    <div style="font-family: Arial, sans-serif; color: #333; padding: 40px; max-width: 600px; margin: 0 auto;">
      <div style="text-align: center; border-bottom: 3px solid #e11d48; padding-bottom: 20px; margin-bottom: 30px;">
        <h1 style="color: #e11d48; margin-bottom: 5px;">Welcome to Vivahvedh! 🎉</h1>
        <p style="color: #666; font-size: 14px;">Your profile has been created by our team</p>
      </div>
      
      <p style="font-size: 16px;">Namaste <b>${safeName}</b>,</p>
      <p>Your Vivahvedh matrimonial profile has been created successfully. Here are your login credentials:</p>
      
      <div style="background: #f8f9fa; border: 2px solid #e11d48; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
        <p style="margin: 0 0 12px;"><b style="color: #666;">Login ID (RegID):</b></p>
        <p style="font-size: 24px; font-weight: bold; color: #e11d48; margin: 0 0 16px; letter-spacing: 2px;">${safeRegId}</p>
        <p style="margin: 0 0 12px;"><b style="color: #666;">Temporary Password:</b></p>
        <p style="font-size: 20px; font-weight: bold; color: #333; margin: 0; font-family: monospace; background: #fff; display: inline-block; padding: 8px 16px; border-radius: 6px; border: 1px solid #ddd;">${safeTempPassword}</p>
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
  await sendMail(to, `Your Vivahvedh Login Credentials | ${safeRegId}`, html);
};

export const sendEnquiryReplyEmail = async (to: string, name: string, originalMessage: string, replyMessage: string) => {
  const safeName = escapeHTML(name);
  const safeOriginal = escapeHTML(originalMessage).replace(/\n/g, '<br/>');
  const safeReply = escapeHTML(replyMessage).replace(/\n/g, '<br/>');
  const html = `
    <div style="font-family: Arial, sans-serif; color: #333; padding: 30px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px;">
      <h2 style="color: #e11d48; margin-bottom: 20px;">Support Reply | Vivahvedh</h2>
      <p style="font-size: 16px;">Dear <b>${safeName}</b>,</p>
      <p>Thank you for reaching out to us. Here is the response from our team:</p>
      
      <div style="background: #fdfdfd; border-left: 4px solid #e11d48; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; white-space: pre-wrap;">${safeReply}</p>
      </div>
      
      <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin-top: 30px; font-size: 13px; color: #666;">
        <p style="margin-top: 0;"><b>Your Original Message:</b></p>
        <p style="margin-bottom: 0; font-style: italic;">"${safeOriginal}"</p>
      </div>
      
      <div style="margin-top: 30px; font-size: 12px; color: #999;">
        <p>Best regards,<br>Vivahvedh Administration Team</p>
      </div>
    </div>
  `;
  await sendMail(to, `Re: Your Enquiry to Vivahvedh`, html);
};

export const sendBirthdayWishEmail = async (to: string, name: string, customMessage?: string) => {
  const safeName = escapeHTML(name);
  const safeCustom = customMessage ? escapeHTML(customMessage).replace(/\n/g, '<br/>') : '';
  const html = customMessage ? `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; padding: 40px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px;">
      <h1 style="color: #e11d48; margin-bottom: 20px;">🎂 Happy Birthday, ${safeName}!</h1>
      <div style="text-align: left; background-color: #f9f9f9; padding: 30px; border-radius: 8px; font-size: 16px; line-height: 1.6; color: #444; white-space: pre-wrap;">
${safeCustom}
      </div>
      <div style="margin-top: 40px; font-size: 13px; color: #999; border-top: 1px solid #eee; padding-top: 20px;">
        With love, <b>Vivahvedh Matrimonial Team</b><br/>
        © ${new Date().getFullYear()} Vivahvedh Matrimonial
      </div>
    </div>` : `
    <div style="font-family: Arial, sans-serif; text-align: center; padding: 40px;">
      <h1 style="color: #e11d48;">🎂 Happy Birthday, ${safeName}!</h1>
      <p style="font-size: 16px;">Namaste <b>${safeName}</b>,</p>
      <p>Wishing you a wonderful birthday filled with joy and happiness.</p>
      <p>May this year bring you your perfect life partner!</p>
      <div style="margin-top: 30px; font-size: 12px; color: #777;">
        With love, Vivahvedh Matrimonial Team<br/>
        © ${new Date().getFullYear()} Vivahvedh Matrimonial
      </div>
    </div>`;
  await sendMail(to, `🎂 Happy Birthday ${safeName}! | Vivahvedh`, html);
};

export const sendPasswordChangedEmail = async (to: string, regId: string) => {
  if (!to) return;
  const safeRegId = escapeHTML(regId);
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; padding: 40px; max-width: 600px; margin: 0 auto; border: 1px solid #f0f0f0; border-radius: 16px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="background-color: #fff1f2; width: 64px; height: 64px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
          <span style="font-size: 32px;">🔐</span>
        </div>
        <h2 style="color: #e11d48; margin: 0; font-size: 24px; font-weight: 800;">Password Updated</h2>
        <p style="color: #666; font-size: 14px; margin-top: 8px;">Security notification for your Vivahvedh account</p>
      </div>

      <div style="background-color: #f8fafc; padding: 24px; border-radius: 12px; border-left: 4px solid #e11d48; margin-bottom: 24px;">
        <p style="margin: 0; font-size: 16px; line-height: 1.6;">
          Hello Member <b>(${safeRegId})</b>,
        </p>
        <p style="margin: 12px 0 0; font-size: 15px; color: #475569; line-height: 1.6;">
          Your account password was successfully changed on <b>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'medium' })} IST</b>.
        </p>
      </div>

      <div style="background-color: #fffbeb; border: 1px solid #fef3c7; padding: 20px; border-radius: 12px; margin-bottom: 30px;">
        <h4 style="margin: 0 0 8px; color: #92400e; font-size: 14px; font-weight: 700; text-transform: uppercase; tracking-wider;">Didn't make this change?</h4>
        <p style="margin: 0; font-size: 14px; color: #b45309; line-height: 1.5;">
          If you didn't authorize this, your account may have been compromised. Please reset your password immediately or contact our support team at 
          <a href="mailto:${process.env.SMTP_USER}" style="color: #e11d48; font-weight: 600; text-decoration: none;">${process.env.SMTP_USER}</a>.
        </p>
      </div>

      <div style="text-align: center; border-top: 1px solid #eee; padding-top: 30px;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">
          Vivahvedh Matrimony — Securing your journey to a perfect match.<br/>
          © ${new Date().getFullYear()} Vivahvedh Matrimonial
        </p>
      </div>
    </div>
  `;
  
  await sendMail(to, '🔐 Security Alert: Your Password was Changed', html);
};

/**
 * Sends a password reset email
 */
export async function sendPasswordResetEmail(to: string, firstName: string, resetLink: string): Promise<void> {
  const subject = 'Reset Your Password - Vivahvedh';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #f1f5f9; padding: 20px; text-align: center; border-bottom: 3px solid #000;">
        <h1 style="color: #0f172a; margin: 0;">Password Reset Request</h1>
      </div>
      <div style="padding: 30px; background-color: #ffffff;">
        <p style="color: #334155; font-size: 16px;">Dear <strong>${firstName}</strong>,</p>
        <p style="color: #334155; font-size: 16px; line-height: 1.6;">
          We received a request to reset your password for your Vivahvedh account. 
          If you didn't make this request, you can safely ignore this email.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #64748b; font-size: 14px; text-align: center;">
          This link will expire in 1 hour.
        </p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
          Best regards,<br>The Vivahvedh Team
        </p>
      </div>
    </div>
  `;
  return await sendMail(to, subject, html);
}

export const sendContactDetailsEmail = async (to: string, targetUserName: string, targetContactInfo: { mobile: string; email: string }) => {
  const safeName = escapeHTML(targetUserName);
  const safeMobile = escapeHTML(targetContactInfo.mobile);
  const safeEmail = escapeHTML(targetContactInfo.email);
  const html = `
    <div style="font-family: Arial, sans-serif; color: #333; padding: 40px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px;">
      <h2 style="color: #e11d48; margin-bottom: 20px; text-align: center;">Contact Details Requested</h2>
      <p style="font-size: 16px;">Dear Member,</p>
      <p>As requested, here are the contact details for <b>${safeName}</b>:</p>
      
      <div style="background: #fdfdfd; border-left: 4px solid #e11d48; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0 0 10px 0;"><b>Mobile:</b> <a href="tel:${safeMobile}" style="color: #e11d48; text-decoration: none;">${safeMobile}</a></p>
        <p style="margin: 0;"><b>Email:</b> <a href="mailto:${safeEmail}" style="color: #e11d48; text-decoration: none;">${safeEmail}</a></p>
      </div>
      
      <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; border-radius: 4px; margin: 20px 0;">
        <p style="margin: 0; font-size: 13px; color: #856404;">⚠️ <b>Privacy Notice:</b> Please respect the member's privacy and use these details solely for matrimonial communication.</p>
      </div>
      
      <div style="margin-top: 30px; font-size: 12px; color: #999; text-align: center;">
        <p>Best regards,<br>Vivahvedh Matchmaking Team</p>
      </div>
    </div>
  `;
  
  await sendMail(to, `Contact Details for ${safeName} | Vivahvedh`, html);
};

export const sendAdminNotification = async (event: string, details: string) => {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || '';
  if (!adminEmail) return;

  const safeEvent = escapeHTML(event);
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
      <h2 style="color: #e11d48; border-bottom: 2px solid #e11d48; padding-bottom: 10px;">Admin Alert: ${safeEvent}</h2>
      <div style="padding: 15px; background: #f9f9f9; border-radius: 5px; margin-top: 20px;">
        ${details}
      </div>
      <p style="font-size: 12px; color: #999; margin-top: 20px;">
        This is an automated notification from the Vivahvedh Backend.
      </p>
    </div>
  `;
  
  await sendMail(adminEmail, `[Vivahvedh Admin] ${safeEvent}`, html);
};
