const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

// Échappe les valeurs fournies par l'utilisateur (prénom, nom d'organisation)
// avant de les interpoler dans le HTML de l'e-mail, pour éviter l'injection de
// balises HTML dans le corps du message.
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
      `<p>Bonjour ${esc(prenom)},</p><p>Votre compte a bien été créé. Vous pouvez dès à présent vous connecter.</p>`
    );
  },

  sendDemandeAcceptee(email, prenom, nomOrg) {
    return sendMail(
      email,
      'Votre demande a été acceptée',
      `<p>Bonjour ${esc(prenom)},</p><p>Votre demande pour rejoindre/créer l'organisation <strong>${esc(nomOrg)}</strong> a été validée. Vous êtes désormais recruteur.</p>`
    );
  },

  sendAdhesionAcceptee(email, prenom, nomOrg) {
    return sendMail(
      email,
      'Adhésion à une organisation validée',
      `<p>Bonjour ${esc(prenom)},</p><p>Votre demande d'adhésion à l'organisation <strong>${esc(nomOrg)}</strong> a été acceptée.</p>`
    );
  },

  sendAdminRights(email, prenom) {
    return sendMail(
      email,
      'Droits administrateur accordés',
      `<p>Bonjour ${esc(prenom)},</p><p>Des droits d'administration vous ont été octroyés sur la plateforme.</p>`
    );
  },
};
