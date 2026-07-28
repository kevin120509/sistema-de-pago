import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import sendDiplomaHandler from '../api/send-diploma.js';

describe('Prueba de Integración - Flujo Completo Certificado y Envío a hercruz096@gmail.com', () => {

  it('debe ejecutar la función serverless send-diploma procesando solicitud POST', async () => {
    const studentName = 'MARCOS HERNANDEZ CRUZ';
    const studentEmail = 'hercruz096@gmail.com';
    const courseTitle = 'Webinar Especializado de Actualización Profesional';

    // Crear mock de req y res de Vercel/Express
    const req = {
      method: 'POST',
      body: {
        sessionId: 'TX-TEST-INTEGRATION-100',
        studentName: studentName,
        studentEmail: studentEmail,
        courseTitle: courseTitle,
        courseDuration: '5 horas de capacitación intensiva',
        courseDates: 'Agosto 2026'
      }
    };

    let responseStatus = null;
    let responseBody = null;

    const res = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    await sendDiplomaHandler(req, res);

    assert.strictEqual(responseStatus, 200, 'El código de respuesta HTTP debe ser 200 OK');
    assert.ok(responseBody, 'Debe devolver un cuerpo JSON de respuesta');
    assert.strictEqual(responseBody.success, true, 'success debe ser true');
    assert.ok(responseBody.message || responseBody.warning, 'Debe tener mensaje o advertencia de entrega');
  });

  it('debe rechazar métodos no permitidos (ej. GET)', async () => {
    const req = { method: 'GET' };
    let responseStatus = null;
    let responseBody = null;

    const res = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    await sendDiplomaHandler(req, res);

    assert.strictEqual(responseStatus, 405, 'Debe retornar 405 Method Not Allowed');
    assert.ok(responseBody.error.includes('Método no permitido'));
  });

  it('debe requerir correo y nombre obligatorios', async () => {
    const req = { method: 'POST', body: {} };
    let responseStatus = null;
    let responseBody = null;

    const res = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    await sendDiplomaHandler(req, res);

    assert.strictEqual(responseStatus, 400, 'Debe retornar 400 Bad Request cuando faltan parámetros');
  });

});
