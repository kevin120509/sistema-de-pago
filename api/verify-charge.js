import Openpay from 'openpay';
import { Resend } from 'resend';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  const { OPENPAY_MERCHANT_ID, OPENPAY_PRIVATE_KEY, RESEND_API_KEY, NODE_ENV } = process.env;

  if (!OPENPAY_MERCHANT_ID || !OPENPAY_PRIVATE_KEY) {
    return res.status(500).json({ error: 'Faltan variables de entorno en el servidor.' });
  }

  try {
    const openpay = new Openpay(OPENPAY_MERCHANT_ID, OPENPAY_PRIVATE_KEY);
    
    if (NODE_ENV === 'production' || process.env.OPENPAY_PRODUCTION === 'true') {
        openpay.setProductionReady(true);
    } else {
        openpay.setProductionReady(false);
    }

    const {
      transactionId,
      courseTitle = 'Webinar Especializado de Actualización Profesional',
      courseDuration = '5 horas de capacitación intensiva',
      courseDates = 'Agosto 2026',
      studentName = '',
      studentEmail = ''
    } = req.body || {};

    if (!transactionId) {
        return res.status(400).json({ error: 'Falta el ID de la transacción.' });
    }

    // 1. Obtener el estado real del cargo desde OpenPay
    const chargeResult = await new Promise((resolve, reject) => {
        openpay.charges.get(transactionId, (error, charge) => {
            if (error) {
                reject(error);
            } else {
                resolve(charge);
            }
        });
    });

    if (chargeResult.status !== 'completed') {
        return res.status(400).json({ 
            error: `El pago no pudo ser completado. Estado actual: ${chargeResult.status}`,
            status: chargeResult.status
        });
    }

    // 2. Generar el PDF
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'portal-diplomas-two.vercel.app';
    const pdfUrl = `${protocol}://${host}/diploma.pdf`;
    
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) throw new Error('No se pudo descargar el diploma.pdf base');
    const existingPdfBytes = await pdfResponse.arrayBuffer();

    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width } = firstPage.getSize();

    const fontName = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const fontSubtitle = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontBody = await pdfDoc.embedFont(StandardFonts.Helvetica);

    firstPage.drawRectangle({ x: (width - 730) / 2, y: 292, width: 730, height: 56, color: rgb(1, 1, 1) });
    firstPage.drawRectangle({ x: (width - 730) / 2, y: 152, width: 730, height: 95, color: rgb(1, 1, 1) });

    let nameSize = 26;
    let nameWidth = fontName.widthOfTextAtSize(studentName, nameSize);
    while (nameWidth > 680 && nameSize > 14) {
      nameSize -= 1;
      nameWidth = fontName.widthOfTextAtSize(studentName, nameSize);
    }
    firstPage.drawText(studentName, { x: (width - nameWidth) / 2, y: 320, size: nameSize, font: fontName, color: rgb(0.1, 0.2, 0.38) });

    function wrapText(text, font, fontSize, maxWidth) {
      const words = text.split(' ');
      let lines = [];
      let currentLine = words[0];

      for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = font.widthOfTextAtSize(currentLine + " " + word, fontSize);
        if (width < maxWidth) {
          currentLine += " " + word;
        } else {
          lines.push(currentLine);
          currentLine = word;
        }
      }
      lines.push(currentLine);
      return lines;
    }

    const titleLines = wrapText(courseTitle, fontSubtitle, 17, 700);
    let currentY = 222;
    titleLines.forEach(line => {
      firstPage.drawText(line, { x: (width - fontSubtitle.widthOfTextAtSize(line, 17)) / 2, y: currentY, size: 17, font: fontSubtitle, color: rgb(0.1, 0.2, 0.38) });
      currentY -= 22;
    });

    const datesY = Math.max(158, Math.min(currentY - 12, 185));
    const fullDateStr = `${courseDuration}, ${courseDates}`;
    firstPage.drawText(fullDateStr, { x: (width - fontBody.widthOfTextAtSize(fullDateStr, 14.5)) / 2, y: datesY, size: 14.5, font: fontBody, color: rgb(0.15, 0.15, 0.15) });

    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

    // 3. Enviar correo usando Resend
    if (RESEND_API_KEY) {
      try {
        const resend = new Resend(RESEND_API_KEY);
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
                  Confirmamos que tu pago en <strong>OpenPay</strong> se ha procesado correctamente tras la verificación bancaria. Adjunto a este correo encontrarás tu <strong>Certificado Digital Oficial en formato PDF</strong>.
                </p>
                <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #6366f1; margin: 20px 0;">
                  <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px;">
                    <li><strong>Programa:</strong> ${courseTitle}</li>
                    <li><strong>Acreditación:</strong> ${courseDuration}</li>
                    <li><strong>ID de Pago (OP):</strong> <code style="background: #e2e8f0; padding: 2px 6px;">${transactionId}</code></li>
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
      } catch (emailError) {
        console.error("Error enviando el correo:", emailError);
      }
    }

    res.status(200).json({ success: true, status: 'completed', paymentId: transactionId });

  } catch (error) {
    console.error('Error verificando pago:', error);
    let errorMsg = 'Error verificando el pago.';
    if (error.description) {
        errorMsg = error.description;
    } else if (error.message) {
        errorMsg = error.message;
    }
    res.status(500).json({ error: errorMsg });
  }
}
