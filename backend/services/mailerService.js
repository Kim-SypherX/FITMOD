const nodemailer = require('nodemailer');

// ─── Configuration par défaut (sécurité) ───
// Le backend utilisera les variables d'environnement SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.
// Si aucune configuration SMTP n'est fournie, il plantera (fail-fast), vu qu'on veut de vrais e-mails.

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: parseInt(process.env.SMTP_PORT) === 465 ? true : false, // true pour le port 465
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

/**
 * Envoie un e-mail de fond commun FITMOD (template structure de base).
 * @param {string} to Adresse e-mail destinataire
 * @param {string} subject Sujet de l'e-mail
 * @param {string} htmlContent Contenu HTML de l'e-mail
 */
async function sendMail(to, subject, htmlContent) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn("⚠️ [Mailer] SMTP_USER ou SMTP_PASS manquant dans .env. L'e-mail ne partira pas.");
        return false;
    }

    const htmlBody = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f6f0; color: #2a1f18; border-radius: 12px; border: 1px solid rgba(139, 94, 60, 0.2);">
            <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="color: #d97706; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">FITMOD</h1>
                <p style="margin: 5px 0 0; color: #8b5e3c; font-size: 14px;">La mode sur mesure, en toute confiance.</p>
            </div>
            
            <div style="background-color: #ffffff; padding: 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                ${htmlContent}
            </div>
            
            <div style="text-align: center; margin-top: 24px; font-size: 12px; color: #a4a09c;">
                <p>Cet e-mail a été envoyé automatiquement par FITMOD. Merci de ne pas y répondre.</p>
                <p>&copy; ${new Date().getFullYear()} FITMOD. Tous droits réservés.</p>
            </div>
        </div>
    `;

    const textBody = htmlContent.replace(/<[^>]+>/g, '').replace(/\n\s+/g, '\n').trim() + "\n\nFITMOD - La mode sur mesure, en toute confiance.\nCet e-mail est automatique, merci de ne pas y répondre.";

    try {
        const info = await transporter.sendMail({
            from: `"FITMOD Support" <${process.env.SMTP_USER}>`,
            replyTo: `"FITMOD Contact" <${process.env.SMTP_USER}>`,
            to,
            subject,
            text: textBody, // Version texte brut essentielle pour réduire le score Spam
            html: htmlBody,
            headers: {
                'X-Entity-Ref-ID': Date.now().toString(),
                'List-Unsubscribe': `<mailto:${process.env.SMTP_USER}>`
            }
        });
        console.log(`✅ [Mailer] E-mail envoyé à ${to} avec succès. (MessageId: ${info.messageId})`);
        
        return true;
    } catch (err) {
        console.error(`❌ [Mailer] Échec de l'envoi d'e-mail à ${to}:`, err.message);
        return false;
    }
}

/**
 * E-mail de bienvenue après inscription.
 */
async function sendWelcomeEmail(email, nom, type_compte) {
    const isTailleur = type_compte === 'tailleur';
    const sujet = isTailleur ? 'Bienvenue sur FITMOD — Pôle Tailleur ! 🧵' : 'Bienvenue sur FITMOD ! ✨';
    
    const html = `
        <h2 style="color: #2a1f18; margin-top: 0;">Bonjour ${nom},</h2>
        <p>Toute l'équipe est ravie de vous accueillir sur <strong>FITMOD</strong>.</p>
        ${
            isTailleur 
                ? "<p>Votre compte partenaire a bien été créé ! Complétez le profil de votre atelier pour un traitement rapide. <strong>Notez qu'un administrateur révisera votre profil avant son activation sur le catalogue.</strong></p>"
                : '<p>Votre compte client est désormais actif. Vous pouvez dès à présent parcourir le catalogue de nos maîtres tailleurs et tester vos futures tenues avec notre cabine virtuelle 3D.</p>'
        }
        <div style="text-align: center; margin: 30px 0;">
            <a href="http://localhost:5173/catalogue" style="background-color: #d97706; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">Accéder à la plateforme</a>
        </div>
        <p>Si vous avez la moindre question, nous sommes là pour vous aider !</p>
        <p>A très vite,<br>L'équipe FITMOD</p>
    `;
    
    return sendMail(email, sujet, html);
}

/**
 * E-mail Mot de passe oublié.
 */
async function sendPasswordResetEmail(email, nom, token) {
    // Note: Le lien pointe vers l'application React
    const resetLink = `http://localhost:5173/?resetToken=${token}`;
    
    const html = `
        <h2 style="color: #2a1f18; margin-top: 0;">Bonjour ${nom},</h2>
        <p>Vous avez fait une demande de réinitialisation de votre mot de passe FITMOD.</p>
        <p>Cliquez sur le lien ci-dessous pour configurer un nouveau mot de passe. <strong>Ce lien expire dans 1 heure.</strong></p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #2a1f18; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">Réinitialiser mon mot de passe</a>
        </div>
        <p style="font-size: 13px; color: #ef4444;">Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité.</p>
        <p>L'équipe FITMOD</p>
    `;
    
    return sendMail(email, 'FITMOD — Récupération de mot de passe 🔒', html);
}

/**
 * E-mail d'activation du compte tailleur.
 */
async function sendTailorValidationEmail(email, nom) {
    const html = `
        <h2 style="color: #2a1f18; margin-top: 0;">Félicitations ${nom} ! 🎉</h2>
        <p>Nous avons une excellente nouvelle pour vous : <strong>votre compte atelier a été vérifié et activé par nos administrateurs !</strong></p>
        <p>Vous êtes désormais officiellement partenaire de FITMOD. Votre atelier et vos modèles publiés apparaîtront dans notre catalogue pour des milliers de clients potentiels.</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="http://localhost:5173/atelier" style="background-color: #10b981; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">Consulter mon tableau de bord</a>
        </div>
        <p>Bonne confection,<br>L'équipe FITMOD</p>
    `;
    
    return sendMail(email, 'FITMOD — Votre atelier est maintenant actif ! 🎊', html);
}

module.exports = {
    sendWelcomeEmail,
    sendPasswordResetEmail,
    sendTailorValidationEmail
};
