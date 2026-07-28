import { Resend } from 'resend';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  const { RESEND_API_KEY } = process.env;
  const {
    sessionId = 'TX-MANUAL',
    studentName = '',
    studentEmail = '',
    courseTitle = 'Webinar Especializado de Actualización Profesional',
    courseDuration = '5 horas de capacitación intensiva',
    courseDates = 'Agosto 2026',
    pdfBase64 = null
  } = req.body || {};

  if (!studentEmail || !studentName) {
    return res.status(400).json({ error: 'El nombre y correo del alumno son obligatorios.' });
  }

  try {
    let finalBase64 = pdfBase64;

    // Si no viene Base64 desde el cliente, generar el PDF en el servidor
    if (!finalBase64) {
      const pdfPath = path.join(process.cwd(), 'diploma.pdf');
      if (!fs.existsSync(pdfPath)) {
        return res.status(500).json({ error: 'No se encontró la plantilla diploma.pdf' });
      }

      const existingPdfBytes = fs.readFileSync(pdfPath);
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      const { width } = firstPage.getSize();

      const fontName = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
      const fontSubtitle = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const fontBody = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Limpiar datos anteriores
      firstPage.drawRectangle({ x: (width - 730) / 2, y: 292, width: 730, height: 56, color: rgb(1, 1, 1) });
      firstPage.drawRectangle({ x: (width - 730) / 2, y: 152, width: 730, height: 95, color: rgb(1, 1, 1) });

      let nameSize = 26;
      let nameWidth = fontName.widthOfTextAtSize(studentName.toUpperCase(), nameSize);
      while (nameWidth > 680 && nameSize > 14) {
        nameSize -= 1;
        nameWidth = fontName.widthOfTextAtSize(studentName.toUpperCase(), nameSize);
      }
      firstPage.drawText(studentName.toUpperCase(), { x: (width - nameWidth) / 2, y: 320, size: nameSize, font: fontName, color: rgb(0.1, 0.2, 0.38) });

      const titleWidth = fontSubtitle.widthOfTextAtSize(courseTitle, 17);
      firstPage.drawText(courseTitle, { x: (width - titleWidth) / 2, y: 222, size: 17, font: fontSubtitle, color: rgb(0.1, 0.2, 0.38) });

      const fullDateStr = `${courseDuration}, ${courseDates}`;
      const dateWidth = fontBody.widthOfTextAtSize(fullDateStr, 14.5);
      firstPage.drawText(fullDateStr, { x: (width - dateWidth) / 2, y: 185, size: 14.5, font: fontBody, color: rgb(0.15, 0.15, 0.15) });

      const pdfBytes = await pdfDoc.save();
      finalBase64 = Buffer.from(pdfBytes).toString('base64');
    }

    if (!RESEND_API_KEY) {
      return res.status(200).json({
        success: true,
        warning: 'RESEND_API_KEY no configurado en servidor. PDF generado pero correo omitido.',
        simulated: true,
        pdfBase64: finalBase64
      });
    }

    const resend = new Resend(RESEND_API_KEY);
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'CECANI Latinoamérica <onboarding@resend.dev>';

    const emailResult = await resend.emails.send({
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
              Adjunto a este correo encontrarás tu <strong>Certificado Digital Oficial en formato PDF</strong> de CECANI Latinoamérica.
            </p>
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #6366f1; margin: 20px 0;">
              <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px;">
                <li><strong>Programa:</strong> ${courseTitle}</li>
                <li><strong>Acreditación:</strong> ${courseDuration}</li>
                <li><strong>ID de Referencia:</strong> <code style="background: #e2e8f0; padding: 2px 6px;">${sessionId}</code></li>
              </ul>
            </div>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `Diploma_CECANI_${studentName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
          content: finalBase64
        }
      ]
    });

    return res.status(200).json({
      success: true,
      message: 'Correo con diploma enviado exitosamente.',
      emailId: emailResult.id || 'sent'
    });

  } catch (error) {
    console.error('Error enviando diploma:', error);
    return res.status(500).json({ error: error.message || 'Error interno enviando diploma' });
  }
}
