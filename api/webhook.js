import Stripe from 'stripe';
import { Resend } from 'resend';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

// Desactivar el bodyParser de Vercel para recibir la firma cruda de Stripe
export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err) => reject(err));
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!stripeSecretKey) {
    console.error('Falta STRIPE_SECRET_KEY en las variables de entorno.');
    return res.status(500).json({ error: 'Falta STRIPE_SECRET_KEY' });
  }

  const stripe = new Stripe(stripeSecretKey);
  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } else {
      // Si no se ha configurado webhookSecret aún (modo desarrollo), parsear evento
      console.warn('[WEBHOOK] STRIPE_WEBHOOK_SECRET no configurado. Parseando evento sin verificar firma.');
      event = JSON.parse(rawBody.toString('utf8'));
    }
  } catch (err) {
    console.error(`[WEBHOOK ERROR] Error de verificación de Webhook de Stripe: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Procesar evento de checkout exitoso
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log(`[PAGO OK] Pago recibido exitosamente para la sesión: ${session.id}`);

    const metadata = session.metadata || {};
    const studentName = (metadata.studentName || session.customer_details?.name || 'ALUMNO REGISTRADO').toUpperCase();
    const studentEmail = metadata.studentEmail || session.customer_email || session.customer_details?.email;
    const courseTitle = metadata.courseTitle || 'Capacitación Especializada CECANI';
    const courseDuration = metadata.courseDuration || '5 horas de capacitación';
    const courseDates = metadata.courseDates || 'Agosto 2026';
    const txId = session.payment_intent || session.id;

    if (!studentEmail) {
      console.error('[WEBHOOK ERROR] No se encontró correo de alumno en la sesión de Stripe.');
      return res.status(200).json({ received: true, warning: 'Sin correo de destino' });
    }

    try {
      // 1. Generar el PDF del certificado
      const pdfPath = path.join(process.cwd(), 'diploma.pdf');
      let pdfDoc;

      if (fs.existsSync(pdfPath)) {
        const existingPdfBytes = fs.readFileSync(pdfPath);
        pdfDoc = await PDFDocument.load(existingPdfBytes);
      } else {
        // Fallback: Crear documento PDF de cero si no existe diploma.pdf
        pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([842, 595]); // A4 Landscape
      }

      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      const { width, height } = firstPage.getSize();

      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Coordenadas idénticas a las configuradas en el frontend app.js
      // Nombre del Alumno
      const nameFontSize = 26;
      const nameTextWidth = fontBold.widthOfTextAtSize(studentName, nameFontSize);
      firstPage.drawText(studentName, {
        x: (width - nameTextWidth) / 2,
        y: 320,
        size: nameFontSize,
        font: fontBold,
        color: rgb(0.1, 0.15, 0.3)
      });

      // Título del Curso
      const courseFontSize = 14;
      const courseTextWidth = fontBold.widthOfTextAtSize(courseTitle, courseFontSize);
      firstPage.drawText(courseTitle, {
        x: (width - courseTextWidth) / 2,
        y: 225,
        size: courseFontSize,
        font: fontBold,
        color: rgb(0.12, 0.12, 0.12)
      });

      // Fecha y Duración
      const datesText = `${courseDuration} | Emisión: ${courseDates}`;
      const datesFontSize = 11;
      const datesTextWidth = fontRegular.widthOfTextAtSize(datesText, datesFontSize);
      firstPage.drawText(datesText, {
        x: (width - datesTextWidth) / 2,
        y: 185,
        size: datesFontSize,
        font: fontRegular,
        color: rgb(0.3, 0.3, 0.3)
      });

      // Código de verificación y sello de transacción Stripe
      const verifyText = `ID Verificación Stripe: ${txId} | Emisión Digital Autorizada CECANI`;
      firstPage.drawText(verifyText, {
        x: 40,
        y: 30,
        size: 8,
        font: fontRegular,
        color: rgb(0.5, 0.5, 0.5)
      });

      const pdfBytes = await pdfDoc.save();

      // 2. Enviar por correo electrónico con Resend
      if (resendApiKey) {
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
                <p style="font-size: 16px; color: #1f2937;">¡Hola <strong>${studentName}</strong>!</p>
                <p style="font-size: 15px; color: #4b5563; line-height: 1.6;">
                  Confirmamos que tu pago se ha procesado correctamente. Adjunto a este correo encontrarás tu <strong>Certificado Digital Oficial en formato PDF</strong> listo para descargar e imprimir.
                </p>
                
                <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #6366f1; margin: 20px 0;">
                  <p style="margin: 0 0 8px 0; font-weight: bold; color: #1e293b;">Resumen de tu Certificación:</p>
                  <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px;">
                    <li><strong>Programa:</strong> ${courseTitle}</li>
                    <li><strong>Acreditación:</strong> ${courseDuration}</li>
                    <li><strong>Período:</strong> ${courseDates}</li>
                    <li><strong>ID de Pago:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${txId}</code></li>
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
              filename: `Diploma_CECANI_${studentName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
              content: Buffer.from(pdfBytes)
            }
          ]
        });

        console.log(`[RESEND OK] Correo enviado exitosamente vía Resend a ${studentEmail}. ID: ${emailResult.id || 'ok'}`);
      } else {
        console.warn('[RESEND WARN] RESEND_API_KEY no configurado. Se generó el PDF pero no se envió el correo.');
      }

    } catch (pdfErr) {
      console.error('Error generando PDF o enviando correo:', pdfErr);
    }
  }

  return res.status(200).json({ received: true });
}
