'use strict';
const nodemailer = require('nodemailer');

/**
 * With SMTP_HOST unset, nothing is sent: a one-line note is logged instead, so the site still
 * works in development. Emails are plain text on purpose (no HTML => no injection via form fields).
 */
function createMailer(config) {
  const m = config.mail;
  const live = Boolean(m.smtpHost);
  const transport = live
    ? nodemailer.createTransport({
        host: m.smtpHost,
        port: m.smtpPort,
        secure: m.smtpSecure,
        auth: m.smtpUser ? { user: m.smtpUser, pass: m.smtpPass } : undefined,
      })
    : nodemailer.createTransport({ jsonTransport: true });

  async function send(message) {
    await transport.sendMail({ from: m.from, ...message });
    if (!live) console.log('[mail] SMTP not configured, not sent: "%s"', message.subject);
  }

  return {
    notifyNewInquiry(i) {
      return send({
        to: m.studioInbox,
        replyTo: { name: i.name, address: i.email },
        subject: `New inquiry: ${i.name} (${i.space_type})`,
        text: [
          'A new inquiry came in through the website.',
          '',
          `Name:   ${i.name}`,
          `Email:  ${i.email}`,
          `Space:  ${i.space_type}`,
          `Budget: ${i.budget}`,
          '',
          'Message:',
          i.message || '(none)',
        ].join('\n'),
      });
    },
    sendAutoReply(i) {
      return send({
        to: { name: i.name, address: i.email },
        subject: 'We received your inquiry — SHOZO Interior Designs',
        text: `Hello ${i.name},\n\nThank you for getting in touch. Someone from the studio will reply within two working days.\n\nSHOZO Interior Designs\nBanjara Hills, Hyderabad\n`,
      });
    },
  };
}

module.exports = { createMailer };
