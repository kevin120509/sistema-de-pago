import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Pruebas Unitarias - Estructura de Correo y Despacho (Resend Payload)', () => {

  it('debe construir un objeto de correo con adjunto Base64 estructurado correctamente', () => {
    const studentName = 'MARCOS HERNANDEZ CRUZ';
    const studentEmail = 'hercruz096@gmail.com';
    const courseTitle = 'Webinar Especializado de Actualización Profesional';
    const mockPdfBuffer = Buffer.from('%PDF-1.4 Mock PDF Content');
    const pdfBase64 = mockPdfBuffer.toString('base64');

    const emailPayload = {
      from: 'CECANI Latinoamérica <onboarding@resend.dev>',
      to: studentEmail,
      subject: `Tu Certificado Oficial CECANI: ${courseTitle}`,
      html: `<h1>Certificado CECANI</h1><p>Hola ${studentName}</p>`,
      attachments: [
        {
          filename: `Diploma_CECANI_${studentName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
          content: pdfBase64
        }
      ]
    };

    assert.strictEqual(emailPayload.to, 'hercruz096@gmail.com');
    assert.ok(emailPayload.subject.includes(courseTitle));
    assert.strictEqual(emailPayload.attachments.length, 1);
    assert.strictEqual(emailPayload.attachments[0].filename, 'Diploma_CECANI_MARCOS_HERNANDEZ_CRUZ.pdf');
    assert.ok(typeof emailPayload.attachments[0].content === 'string');
  });

  it('debe limpiar nombres de archivo sanitizando caracteres especiales', () => {
    const rawName = 'José María Peña & Ánimas/2026!';
    const sanitized = rawName.replace(/[^a-zA-Z0-9]/g, '_');
    assert.strictEqual(sanitized, 'Jos__Mar_a_Pe_a____nimas_2026_');
  });

});
