import nodemailer from 'nodemailer';

// Create a reusable transporter using exactly what we specify in .env
// We default to a silent fail-catcher if env variables are missing so the app doesn't crash during development
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || '', 
    pass: process.env.SMTP_PASS || '', 
  },
});

export const sendMail = async (to: string, subject: string, htmlContent: string) => {
  if (!process.env.SMTP_USER) {
    console.warn(`⚠️ Mail Module Skipped: SMTP_USER not configured. Would have sent "${subject}" to ${to}`);
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: `"Vivahvedh Matrimony" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: htmlContent,
    });
    console.log(`✉️ Email securely sent: [${info.messageId}] to ${to}`);
  } catch (error) {
    console.error('❌ Failed to route email:', error);
  }
};

// =====================================
// High-Impact Email Templates
// =====================================

export const sendWelcomeEmail = async (to: string, name: string) => {
  const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 40px;">
      <h1 style="color: #e11d48;">Welcome to Vivahvedh!</h1>
      <p style="font-size: 16px;">Namaste <b>${name}</b>,</p>
      <p>Your registration was successful. You have taken the first step towards finding your perfect life partner securely.</p>
      <p>An Admin will review your profile shortly. Make sure to complete your Dashboard details and upload photos to get approved faster!</p>
      <div style="margin-top: 30px; font-size: 12px; color: #777;">
        © ${new Date().getFullYear()} Vivahvedh Matrimonial
      </div>
    </div>
  `;
  await sendMail(to, "Welcome to Vivahvedh Matrimony!", html);
};

export const sendApprovalEmail = async (to: string, name: string) => {
  const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 40px; border-top: 5px solid #16a34a;">
      <h1 style="color: #16a34a;">Profile Approved! ✅</h1>
      <p style="font-size: 16px;">Dear <b>${name}</b>,</p>
      <p>Incredible news! The Vivahvedh moderation team has approved your profile.</p>
      <p>Your profile is now <b>Active</b> and completely searchable by thousands of other network members.</p>
      <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard" style="background-color: #e11d48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-top: 20px;">
        Go to Dashboard
      </a>
    </div>
  `;
  await sendMail(to, "Your Profile is Now Active! | Vivahvedh", html);
};

export const sendConnectionRequestEmail = async (to: string, receiverName: string, senderName: string) => {
  const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 40px;">
      <h1 style="color: #e11d48;">New Match Interest! ❤️</h1>
      <p style="font-size: 16px;">Dear <b>${receiverName}</b>,</p>
      <p>Someone has noticed you! <b>${senderName}</b> has expressed interest in your profile.</p>
      <p>Log in now to view their profile details and decide if you want to connect.</p>
      <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard" style="background-color: #e11d48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-top: 20px;">
        View Request
      </a>
    </div>
  `;
  await sendMail(to, `New Interest from ${senderName}`, html);
};

export const sendConnectionAcceptedEmail = async (to: string, receiverName: string, accepterName: string) => {
  const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 40px; border-top: 5px solid #16a34a;">
      <h1 style="color: #16a34a;">Request Accepted! 🎉</h1>
      <p style="font-size: 16px;">Dear <b>${receiverName}</b>,</p>
      <p>Great news! <b>${accepterName}</b> has accepted your connection request.</p>
      <p>You can now view their direct contact information and initiate communication.</p>
      <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard" style="background-color: #e11d48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-top: 20px;">
        View Connected Match
      </a>
    </div>
  `;
  await sendMail(to, `${accepterName} Accepted Your Request!`, html);
};
