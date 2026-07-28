import { MercadoPagoConfig, Payment } from 'mercadopago';
import { Resend } from 'resend';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const mpAccessToken = process.env.MP_ACCESS_TOKEN;
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!mpAccessToken || !resendApiKey) {
      console.error('Faltan claves de entorno en el servidor.');
      return res.status(500).json({ error: 'Configuración incompleta' });
    }

    // Identificar el ID del pago desde IPN o Webhook
    let paymentId;
    if (req.query.type === 'payment' && req.query['data.id']) {
      paymentId = req.query['data.id']; // IPN format
    } else if (req.body && req.body.type === 'payment' && req.body.data && req.body.data.id) {
      paymentId = req.body.data.id; // Webhook format
    }

    // Mercado Pago requiere que respondamos 200 OK de inmediato para Webhooks,
    // pero en Serverless debemos procesarlo antes de cerrar la conexión o usar background functions.
    // Procesaremos rápido (toma ~2-3 segs).
    if (!paymentId) {
      return res.status(200).send('Not a payment event');
    }

    const client = new MercadoPagoConfig({ accessToken: mpAccessToken });
    const paymentApi = new Payment(client);
    const payment = await paymentApi.get({ id: paymentId });

    if (payment.status === 'approved') {
      const meta = payment.metadata || {};
      const studentName = meta.student_name || 'ALUMNO';
      const studentEmail = meta.student_email;
      const courseTitle = meta.course_title || 'Webinar Especializado';
      const courseDuration = meta.course_duration || '';
      const courseDates = meta.course_dates || '';

      if (!studentEmail) {
        console.log(`[Webhook] Pago ${paymentId} sin correo en metadata. No se envía PDF.`);
        return res.status(200).send('OK - No email in metadata');
      }

      // 1. Descargar el PDF base desde nuestro propio servidor
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'portal-diplomas-two.vercel.app';
      const pdfUrl = `${protocol}://${host}/diploma.pdf`;
      
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error('No se pudo descargar el diploma.pdf base');
      }
      const existingPdfBytes = await pdfResponse.arrayBuffer();

      // 2. Modificar con pdf-lib (Misma lógica exacta que el frontend)
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      const { width } = firstPage.getSize();

      const fontName = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
      const fontSubtitle = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const fontBody = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Limpiar zonas (cuadros blancos)
      firstPage.drawRectangle({ x: (width - 730) / 2, y: 292, width: 730, height: 56, color: rgb(1, 1, 1) });
      firstPage.drawRectangle({ x: (width - 730) / 2, y: 152, width: 730, height: 95, color: rgb(1, 1, 1) });

      // Dibujar Nombre
      let nameSize = 26;
      let nameWidth = fontName.widthOfTextAtSize(studentName, nameSize);
      while (nameWidth > 680 && nameSize > 14) {
        nameSize -= 1;
        nameWidth = fontName.widthOfTextAtSize(studentName, nameSize);
      }
      firstPage.drawText(studentName, { x: (width - nameWidth) / 2, y: 320, size: nameSize, font: fontName, color: rgb(0.1, 0.2, 0.38) });

      // Dibujar Curso
      function wrapText(text, font, fontSize, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = words[0] || '';
        for (let i = 1; i < words.length; i++) {
          const word = words[i];
          if (font.widthOfTextAtSize(currentLine + ' ' + word, fontSize) < maxWidth) {
            currentLine += ' ' + word;
          } else {
            lines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
      }

      let courseSize = 22;
      let lineSpacing = 28;
      let lines = wrapText(courseTitle, fontSubtitle, courseSize, width - 160);
      if (lines.length === 3) {
        courseSize = 18; lineSpacing = 23; lines = wrapText(courseTitle, fontSubtitle, courseSize, width - 150);
      } else if (lines.length >= 4) {
        courseSize = 15; lineSpacing = 19; lines = wrapText(courseTitle, fontSubtitle, courseSize, width - 140);
      }

      let currentY = 225;
      lines.forEach(line => {
        firstPage.drawText(line, { x: (width - fontSubtitle.widthOfTextAtSize(line, courseSize)) / 2, y: currentY, size: courseSize, font: fontSubtitle, color: rgb(0, 0, 0) });
        currentY -= lineSpacing;
      });

      // Dibujar Fecha
      const datesY = Math.max(158, Math.min(currentY - 12, 185));
      const fullDateStr = `${courseDuration}, ${courseDates}`;
      firstPage.drawText(fullDateStr, { x: (width - fontBody.widthOfTextAtSize(fullDateStr, 14.5)) / 2, y: datesY, size: 14.5, font: fontBody, color: rgb(0.15, 0.15, 0.15) });

      // Convertir a Base64
      const pdfBytes = await pdfDoc.save();
      const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

      // 3. Enviar correo usando Resend
      const resend = new Resend(resendApiKey);
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'CECANI Latinoamérica <onboarding@resend.dev>';

      await resend.emails.send({
        from: fromEmail,
        to: studentEmail,
        subject: `Tu Certificado Oficial CECANI: ${courseTitle}`,
        html: `
          <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
            <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #6366f1;">
              <h1 style="color: #1e1b4b; margin: 0; font-size: 24px;">CECANI LATINOAMÉRICA</h1>
              <p style="color: #6366f1; margin: 5px 0 0 0; font-size: 13px; font-weight: bold; letter-spacing: 1px;">PORTAL DIGITAL DE CERTIFICACIÓN</p>
            </div>
            <div style="padding: 20px 0;">
              <p style="font-size: 16px; color: #1f2937;">¡Hola <strong>${studentName}</strong>!</p>
              <p style="font-size: 15px; color: #4b5563; line-height: 1.6;">
                Confirmamos que tu pago en Mercado Pago se ha procesado correctamente. Adjunto a este correo encontrarás tu <strong>Certificado Digital Oficial en formato PDF</strong>.
              </p>
              <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #6366f1; margin: 20px 0;">
                <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px;">
                  <li><strong>Programa:</strong> ${courseTitle}</li>
                  <li><strong>Acreditación:</strong> ${courseDuration}</li>
                  <li><strong>ID de Pago (MP):</strong> <code style="background: #e2e8f0; padding: 2px 6px;">${paymentId}</code></li>
                </ul>
              </div>
            </div>
          </div>
        `,
        attachments: [
          {
            filename: `Diploma_CECANI_${studentName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
            content: pdfBase64
          }
        ]
      });

      console.log(`[Webhook] Correo enviado exitosamente a ${studentEmail} para el pago ${paymentId}`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[Webhook Error]', error);
    // Mercado Pago reintentará si devolvemos 500, pero si fue un error de procesamiento del PDF no queremos un loop eterno.
    res.status(200).send('Processed with errors');
  }
}
