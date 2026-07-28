import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

describe('Pruebas Unitarias - Generación y Manipulación de PDF (pdf-lib)', () => {

  it('debe existir la plantilla diploma.pdf en la raíz del proyecto', () => {
    const pdfPath = path.join(process.cwd(), 'diploma.pdf');
    assert.strictEqual(fs.existsSync(pdfPath), true, 'diploma.pdf debe existir');
  });

  it('debe cargar la plantilla PDF y estampar datos del alumno correctamente', async () => {
    const pdfPath = path.join(process.cwd(), 'diploma.pdf');
    const existingBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(existingBytes);

    const pages = pdfDoc.getPages();
    assert.strictEqual(pages.length >= 1, true, 'El documento debe tener al menos 1 página');

    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();
    assert.strictEqual(width > 0 && height > 0, true, 'Dimensiones válidas');

    const fontName = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const fontSubtitle = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const testStudentName = 'HERCULES CRUZ HERNANDEZ';
    const testCourseTitle = 'Diplomado Especializado en Contabilidad para A.C. y Donatarias';

    // Probar auto-escalado de nombre
    let nameSize = 26;
    let nameWidth = fontName.widthOfTextAtSize(testStudentName, nameSize);
    while (nameWidth > 680 && nameSize > 14) {
      nameSize -= 1;
      nameWidth = fontName.widthOfTextAtSize(testStudentName, nameSize);
    }
    assert.ok(nameSize <= 26 && nameSize >= 14, 'El tamaño de letra debe estar dentro del rango 14-26');

    // Estampar rectángulos de limpieza y texto
    firstPage.drawRectangle({ x: (width - 730) / 2, y: 292, width: 730, height: 56, color: rgb(1, 1, 1) });
    firstPage.drawText(testStudentName, { x: (width - nameWidth) / 2, y: 320, size: nameSize, font: fontName, color: rgb(0.1, 0.2, 0.38) });

    const pdfBytes = await pdfDoc.save();
    assert.ok(pdfBytes instanceof Uint8Array, 'Save debe retornar Uint8Array');
    assert.ok(pdfBytes.length > 1000, 'El archivo generado debe tener contenido relevante');

    // Verificar encabezado mágico de PDF %PDF-
    const header = Buffer.from(pdfBytes.subarray(0, 5)).toString('utf8');
    assert.strictEqual(header, '%PDF-', 'Debe comenzar con la firma mágica %PDF-');
  });

  it('debe envolver adecuadamente títulos de cursos largos (text wrapping)', async () => {
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

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const longTitle = 'Curso Taller Internacional de Alta Especialización en Normatividad Fiscal y Contabilidad de Donatarias Autorizadas 2026';

    const lines = wrapText(longTitle, font, 17, 400);
    assert.ok(lines.length > 1, 'El título largo debe dividirse en 2 o más líneas');
  });

});
