import { Request, Response } from 'express';
import prisma from '../config/db';

export const submitEnquiry = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, message } = req.body;

    const names = name ? name.split(' ') : ['Guest', ''];
    const firstName = names[0];
    const lastName = names.slice(1).join(' ') || '-';

    const newEnquiry = await prisma.enquiry.create({
      data: {
        firstName,
        lastName,
        email: email || 'no-email',
        mobile: phone || 'no-phone',
        subject: 'General Contact Form',
        message: message || ''
      }
    });

    res.status(201).json({ message: "Message received successfully.", id: newEnquiry.id });
  } catch (error) {
    console.error("Enquiry submission failed:", error);
    res.status(500).json({ error: "Failed to submit message." });
  }
};
