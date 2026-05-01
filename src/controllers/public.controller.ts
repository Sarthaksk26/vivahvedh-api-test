import { Request, Response } from 'express';
import prisma from '../config/db';
import { sendEnquiryNotificationEmail, sendMail } from '../services/mail.service';
import { z } from 'zod';

const enquirySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(8).max(20).optional().or(z.literal('')),
  message: z.string().trim().min(10).max(2000),
});

export const submitEnquiry = async (req: Request, res: Response) => {
  try {
    const parsed = enquirySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message) });
    }

    const { name, email, phone, message } = parsed.data;

    const names = name ? name.split(' ') : ['Guest', ''];
    const firstName = names[0];
    const lastName = names.slice(1).join(' ') || '-';

    const subject = 'General Contact Form';
    const mobile = phone || 'no-phone';

    const enquiry = await prisma.enquiry.create({
      data: { firstName, lastName, email, mobile, subject, message },
    });

    // Notify Administrator (assuming SMTP_USER is the primary admin or support email)
    if (process.env.SMTP_USER) {
      sendEnquiryNotificationEmail(process.env.SMTP_USER, enquiry).catch(e => console.error("Admin Notify Error:", e));
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
    sendMail(email, "Enquiry Received | Vivahvedh Matrimony", userThankYou).catch(e => console.error("User Notify Error:", e));

    res.status(201).json({ message: 'Enquiry submitted successfully. We will contact you soon.' });
  } catch (error) {
    console.error("Enquiry submission failed:", error);
    res.status(500).json({ error: "Failed to submit message." });
  }
};
