const nodemailer = require('nodemailer');
const { smtpHost, smtpPort, smtpUser, smtpPass, mailFrom } = require('../config');

let transporter;

if (smtpHost && smtpPort && smtpUser && smtpPass) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });
} else {
  transporter = nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true,
  });
}

async function sendEmail(to, subject, text) {
  const info = await transporter.sendMail({ from: mailFrom, to, subject, text });
  if (info.message) {
    console.log('Email preview:\n', info.message.toString());
  }
}

module.exports = { sendEmail };
