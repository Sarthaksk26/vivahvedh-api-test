# Email Setup Guide — Vivahvedh API

This document explains how to configure email sending for **development**, **testing**, and **production** environments.

---

## Architecture

All emails flow through `api/src/services/mail.service.ts` which uses **nodemailer**.

The service auto-detects the environment and selects the appropriate transport:

| Mode | Trigger | Behavior |
|------|---------|----------|
| **Production** | `SMTP_USER` is set, `EMAIL_TEST` is empty | Sends real emails via configured SMTP |
| **Ethereal Test** | `EMAIL_TEST=true` in `.env` | Captures emails in a fake inbox (no real delivery) |
| **Console Fallback** | No `SMTP_USER`, no `EMAIL_TEST` | Logs email metadata to console |

---

## 1. Development (Console Logging)

If you don't configure any SMTP settings, emails are automatically **logged to the console** instead of being sent. This is the zero-config default.

```bash
# .env (minimal — emails will be console-logged)
NODE_ENV="development"
# SMTP_USER and SMTP_PASS left empty
```

Console output will show:
```
⚠️ Mail Module Skipped: SMTP_USER not configured. Would have sent "Welcome to Vivahvedh!" to user@example.com
📋 [Dev Console Email Preview]
   To: user@example.com
   Subject: Welcome to Vivahvedh!
   Body length: 1234 chars
```

---

## 2. Testing with Ethereal (Recommended for QA)

[Ethereal](https://ethereal.email) is a free fake SMTP service by Nodemailer. Emails are captured in a web inbox — nothing is sent to real addresses.

### Setup

```bash
# .env
EMAIL_TEST="true"
```

That's it! The service auto-creates a test account on startup. Check your server logs for:

```
📧 [Ethereal] Test inbox created:
   User: abc123@ethereal.email
   Pass: xyz789
   View sent emails at: https://ethereal.email/login
```

Every sent email will also log a preview URL:
```
🔗 [Ethereal Preview] https://ethereal.email/message/abc123
```

### Viewing Emails
1. Go to [https://ethereal.email/login](https://ethereal.email/login)
2. Use the auto-generated credentials from your server logs
3. Browse all captured emails

---

## 3. Production (Gmail / SMTP)

### Gmail with App Password

1. Go to [Google Account → Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification**
3. Generate an **App Password** (select "Mail" and your device)
4. Configure `.env`:

```bash
# .env
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=465
SMTP_SECURE="true"
SMTP_USER="vivahvedhgad@gmail.com"
SMTP_PASS="your_16_char_app_password"
NODE_ENV="production"
```

### Other SMTP Providers

| Provider | Host | Port | Secure |
|----------|------|------|--------|
| Gmail | smtp.gmail.com | 465 | true |
| Outlook | smtp.office365.com | 587 | false |
| SendGrid | smtp.sendgrid.net | 587 | false |
| Mailtrap | sandbox.smtp.mailtrap.io | 2525 | false |

### Vercel / Production Deployment

Set environment variables in your hosting dashboard:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=vivahvedhgad@gmail.com
SMTP_PASS=<your-app-password>
```

> ⚠️ **Never commit real SMTP credentials to git.** Use environment variables only.

---

## 4. Using Mailtrap (Alternative Test Service)

If you prefer Mailtrap over Ethereal for a richer UI:

1. Sign up at [mailtrap.io](https://mailtrap.io)
2. Create an inbox and get SMTP credentials
3. Configure:

```bash
# .env
SMTP_HOST="sandbox.smtp.mailtrap.io"
SMTP_PORT=2525
SMTP_SECURE="false"
SMTP_USER="your_mailtrap_user"
SMTP_PASS="your_mailtrap_pass"
```

---

## Quick Reference

```bash
# Development (no emails sent, console only)
# → Leave SMTP_USER empty

# Testing (Ethereal fake inbox)
EMAIL_TEST="true"

# Production (real Gmail)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=465
SMTP_SECURE="true"
SMTP_USER="your@gmail.com"
SMTP_PASS="app-password"
```
