import { Resend } from 'resend';
import Stripe from 'stripe';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!resendApiKey || !stripeSecretKey) {
    return res.status(500).json({ error: 'Faltan claves de API en el servidor.' });
  }

  try {
    const { sessionId, studentName, studentEmail, courseTitle, courseDuration, courseDates, pdfBase64 } = req.body;

    if (!studentEmail || !pdfBase64) {
      return res.status(400).json({ error: 'Faltan datos requeridos (correo o PDF).' });
    }

    // Opcional: Verificar la sesión de Stripe
    if (sessionId && sessionId.startsWith('cs_')) {
      const stripe = new Stripe(stripeSecretKey);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== 'paid') {
        return res.status(402).json({ error: 'El pago no ha sido completado.' });
      }
    }

    const resend = new Resend(resendApiKey);
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'CECANI Latinoamérica <onboarding@resend.dev>';

    const emailResult = await resend.emails.send({
      from: fromEmail,
      to: studentEmail,
      subject: `Tu Certificado Oficial CECANI: ${courseTitle}`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #6366f1;">
            <h1 style="color: #1e1b4b; margin: 0; font-size: 24px;">CECANI LATINOAMÉRICA</h1>
            <p style="color: #6366f1; margin: 5px 0 0 0; font-size: 13px; font-weight: bold; letter-spacing: 1px;">PORTAL DIGITAL DE CERTIFICACIÓN</p>
          </div>
          
          <div style="padding: 20px 0;">
            <p style="font-size: 16px; color: #1f2937;">¡Hola <strong>${studentName || 'Alumno'}</strong>!</p>
            <p style="font-size: 15px; color: #4b5563; line-height: 1.6;">
              Confirmamos que tu pago se ha procesado correctamente. Adjunto a este correo encontrarás tu <strong>Certificado Digital Oficial en formato PDF</strong> listo para descargar e imprimir.
            </p>
            
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #6366f1; margin: 20px 0;">
              <p style="margin: 0 0 8px 0; font-weight: bold; color: #1e293b;">Resumen de tu Certificación:</p>
              <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px;">
                <li><strong>Programa:</strong> ${courseTitle || 'Capacitación Especializada'}</li>
                <li><strong>Acreditación:</strong> ${courseDuration || '-'}</li>
                <li><strong>Período:</strong> ${courseDates || '-'}</li>
                <li><strong>ID de Pago:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${sessionId || 'N/A'}</code></li>
              </ul>
            </div>
            
            <p style="font-size: 14px; color: #6b7280; text-align: center; margin-top: 25px;">
              Gracias por formar parte de la comunidad académica de CECANI Latinoamérica.
            </p>
          </div>
          
          <div style="text-align: center; padding-top: 20px; border-top: 1px solid #f3f4f6; color: #9ca3af; font-size: 12px;">
            &copy; 2026 CECANI Latinoamérica &bull; Sistema Automatizado de Emisión Digital
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `Diploma_CECANI_${(studentName || 'Alumno').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
          content: Buffer.from(pdfBase64, 'base64')
        }
      ]
    });

    console.log(`[RESEND OK] Correo enviado a ${studentEmail}. ID: ${emailResult.id || 'ok'}`);
    return res.status(200).json({ success: true, emailId: emailResult.id });

  } catch (error) {
    console.error('Error enviando correo:', error);
    return res.status(500).json({ error: error.message || 'Error al despachar el correo' });
  }
}
