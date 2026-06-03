const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

async function sendMail(to, subject, html) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return;
  await transporter.sendMail({
    from: `"Plateforme RH" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

module.exports = {
  sendWelcome(email, prenom) {
    return sendMail(
      email,
      'Bienvenue sur la plateforme',
      `<p>Bonjour ${prenom},</p><p>Votre compte a bien été créé. Vous pouvez dès à présent vous connecter.</p>`
    );
  },

  sendDemandeAcceptee(email, prenom, nomOrg) {
    return sendMail(
      email,
      'Votre demande a été acceptée',
      `<p>Bonjour ${prenom},</p><p>Votre demande pour rejoindre/créer l'organisation <strong>${nomOrg}</strong> a été validée. Vous êtes désormais recruteur.</p>`
    );
  },

  sendAdhesionAcceptee(email, prenom, nomOrg) {
    return sendMail(
      email,
      'Adhésion à une organisation validée',
      `<p>Bonjour ${prenom},</p><p>Votre demande d'adhésion à l'organisation <strong>${nomOrg}</strong> a été acceptée.</p>`
    );
  },

  sendAdminRights(email, prenom) {
    return sendMail(
      email,
      'Droits administrateur accordés',
      `<p>Bonjour ${prenom},</p><p>Des droits d'administration vous ont été octroyés sur la plateforme.</p>`
    );
  },
};
