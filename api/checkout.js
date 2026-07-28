import Stripe from 'stripe';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return res.status(500).json({
      error: 'La variable de entorno STRIPE_SECRET_KEY no está configurada en Vercel.'
    });
  }

  try {
    const stripe = new Stripe(stripeSecretKey);
    const {
      courseType = 'webinar',
      courseTitle = 'Webinar Especializado de Actualización Profesional',
      courseDuration = '5 horas de capacitación intensiva',
      courseDates = 'Agosto 2026',
      studentName = '',
      studentEmail = '',
      customPrice = null
    } = req.body || {};

    // Determinar precio en centavos MXN (ej. 199 MXN = 19900)
    let unitAmount = 19900;
    if (customPrice && !isNaN(customPrice)) {
      unitAmount = Math.round(Number(customPrice) * 100);
    } else if (courseType === 'ac') {
      unitAmount = 29900;
    }

    // Detectar el dominio de la petición
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'portal-diplomas-two.vercel.app';
    const origin = req.headers.origin || `${protocol}://${host}`;

    const params = new URLSearchParams({
      curso: courseType,
      titulo: courseTitle,
      duracion: courseDuration,
      fecha: courseDates
    });

    const successUrl = `${origin}/?success=true&session_id={CHECKOUT_SESSION_ID}&${params.toString()}`;
    const cancelUrl = `${origin}/?${params.toString()}&canceled=true`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: studentEmail ? studentEmail : undefined,
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            product_data: {
              name: courseTitle,
              description: `Constancia/Diplomado oficial CECANI - ${courseDuration}`,
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        studentName: studentName ? studentName.toUpperCase() : '',
        studentEmail: studentEmail || '',
        courseType: courseType,
        courseTitle: courseTitle,
        courseDuration: courseDuration,
        courseDates: courseDates,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return res.status(200).json({
      url: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error('Error al crear Stripe Checkout Session:', error);
    return res.status(500).json({
      error: error.message || 'Error al procesar el pago en Stripe'
    });
  }
}
