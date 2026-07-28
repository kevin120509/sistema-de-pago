import Stripe from 'stripe';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido. Usa GET.' });
  }

  const { session_id } = req.query;
  if (!session_id) {
    return res.status(400).json({ error: 'El parámetro session_id es requerido.' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return res.status(500).json({
      error: 'STRIPE_SECRET_KEY no está configurado.'
    });
  }

  try {
    const stripe = new Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.retrieve(session_id);

    return res.status(200).json({
      paid: session.payment_status === 'paid',
      status: session.status,
      customerEmail: session.customer_email || session.customer_details?.email || session.metadata?.studentEmail,
      studentName: session.metadata?.studentName || session.customer_details?.name || '',
      courseType: session.metadata?.courseType || 'webinar',
      courseTitle: session.metadata?.courseTitle || '',
      courseDuration: session.metadata?.courseDuration || '',
      courseDates: session.metadata?.courseDates || '',
      paymentIntent: session.payment_intent,
      amountTotal: session.amount_total ? session.amount_total / 100 : 0,
      currency: session.currency?.toUpperCase() || 'MXN'
    });
  } catch (error) {
    console.error('Error verificando Stripe Session:', error);
    return res.status(500).json({
      error: error.message || 'Error consultando la sesión de pago.'
    });
  }
}
