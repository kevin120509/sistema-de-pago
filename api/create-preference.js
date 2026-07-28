import { MercadoPagoConfig, Preference } from 'mercadopago';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  const mpAccessToken = process.env.MP_ACCESS_TOKEN;
  if (!mpAccessToken) {
    return res.status(500).json({ error: 'Falta MP_ACCESS_TOKEN en variables de entorno.' });
  }

  try {
    const client = new MercadoPagoConfig({ accessToken: mpAccessToken });
    const preference = new Preference(client);

    const {
      courseType = 'webinar',
      courseTitle = 'Webinar Especializado de Actualización Profesional',
      courseDuration = '5 horas de capacitación intensiva',
      courseDates = 'Agosto 2026',
      studentName = '',
      studentEmail = '',
      customPrice = null
    } = req.body || {};

    let unitAmount = 199;
    if (customPrice && !isNaN(customPrice)) {
      unitAmount = Math.round(Number(customPrice));
    } else if (courseType === 'ac') {
      unitAmount = 299;
    }

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'portal-diplomas-two.vercel.app';
    const origin = req.headers.origin || `${protocol}://${host}`;

    const params = new URLSearchParams({
      curso: courseType,
      titulo: courseTitle,
      duracion: courseDuration,
      fecha: courseDates
    });

    const body = {
      items: [
        {
          id: courseType,
          title: `Constancia/Certificado: ${courseTitle}`,
          quantity: 1,
          currency_id: 'MXN',
          unit_price: unitAmount,
        }
      ],
      payer: {
        name: studentName,
        email: studentEmail
      },
      back_urls: {
        success: `${origin}/?success=true&${params.toString()}`,
        failure: `${origin}/?canceled=true&${params.toString()}`,
        pending: `${origin}/?pending=true&${params.toString()}`
      },
      auto_return: 'approved',
      metadata: {
        courseType: courseType,
        courseTitle: courseTitle,
        courseDuration: courseDuration,
        courseDates: courseDates,
        studentName: studentName,
        studentEmail: studentEmail
      },
      statement_descriptor: 'CECANI DIPLOMAS'
    };

    const response = await preference.create({ body });

    res.status(200).json({ 
      id: response.id,
      init_point: response.init_point 
    });

  } catch (error) {
    console.error('Error al crear preferencia en Mercado Pago:', error);
    res.status(500).json({ error: error.message });
  }
}
