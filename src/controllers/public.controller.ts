import { Request, Response } from 'express';
import prisma from '../config/db';
import { sendEnquiryNotificationEmail, sendMail } from '../services/mail.service';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';

const enquirySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).toLowerCase(),
  phone: z.string().trim().min(8).max(20).optional().or(z.literal('')),
  message: z.string().trim().min(10).max(2000),
}).strict();

export const submitEnquiry = asyncHandler(async (req: Request, res: Response) => {
  const validated = enquirySchema.parse(req.body);
  const { name, email, phone, message } = validated;

  const names = name.split(' ');
  const firstName = names[0];
  const lastName = names.slice(1).join(' ') || '-';

  const subject = 'General Contact Form';
  const mobile = phone || 'no-phone';

  const enquiry = await prisma.enquiry.create({
    data: { firstName, lastName, email, mobile, subject, message },
  });

  if (process.env.SMTP_USER) {
    sendEnquiryNotificationEmail(process.env.SMTP_USER, enquiry)
      .catch((err: Error) => console.error("Admin Notify Error:", err.message));
  }

  const userThankYou = `
    <div style="font-family: Arial, sans-serif; text-align: center; padding: 30px;">
      <h2 style="color: #e11d48;">Thank you for contacting Vivahvedh!</h2>
      <p>Namaste ${firstName},</p>
      <p>We have received your message regarding <b>"${subject}"</b>. Our support team will get back to you shortly.</p>
      <hr />
      <p style="font-size: 12px; color: #777;">Vivahvedh Matrimony Support Team</p>
    </div>
  `;
  sendMail(email, "Enquiry Received | Vivahvedh Matrimony", userThankYou)
    .catch((err: Error) => console.error("User Notify Error:", err.message));

  res.status(201).json({ message: 'Enquiry submitted successfully. We will contact you soon.' });
});
