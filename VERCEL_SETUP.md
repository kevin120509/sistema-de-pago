# Guía de Configuración en Vercel: Stripe Checkout + Resend

Esta guía describe los pasos para conectar tu cuenta de **Stripe** y **Resend** a tu proyecto desplegado en Vercel.

---

## 1. Variables de Entorno en Vercel

Ingresa a tu cuenta en [Vercel Dashboard](https://vercel.com/dashboard) -> selecciona tu proyecto -> **Project Settings** -> **Environment Variables**.

Agrega las siguientes variables:

| Variable | Valor | Descripción |
| :--- | :--- | :--- |
| `STRIPE_SECRET_KEY` | `sk_test_...` (o `sk_live_...`) | Obtenida en Stripe Dashboard -> API Keys. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Obtenida al registrar el Webhook en Stripe. |
| `RESEND_API_KEY` | `re_...` | Obtenida en [Resend.com](https://resend.com) (Plan de 3,000 correos/mes gratis). |
| `RESEND_FROM_EMAIL` | `CECANI Latinoamérica <onboarding@resend.dev>` | Dirección remitente oficial para los correos. |

---

## 2. Registrar el Webhook en Stripe

Para que los diplomas se envíen automáticamente por correo cuando el alumno pague:

1. Ve a tu **Stripe Dashboard** -> **Developers** -> **Webhooks**.
2. Haz clic en **Add endpoint** (Agregar punto de enlace).
3. En **Endpoint URL**, escribe la URL de tu proyecto en Vercel seguida de `/api/webhook`:
   ```text
   https://tu-dominio.vercel.app/api/webhook
   ```
4. En **Events to send** (Eventos a escuchar), selecciona:
   - `checkout.session.completed`
5. Haz clic en **Add endpoint**.
6. Copia el **Signing secret** (`whsec_...`) y pégalo en la variable `STRIPE_WEBHOOK_SECRET` en Vercel.

---

## 3. Probar la Integración

1. Abre la URL de tu aplicación desplegada.
2. Haz clic en **Pagar**.
3. Te redirigirá al checkout oficial de Stripe.
4. Al completar el pago, regresarás al portal donde se mostrará el certificado para descargar y se enviará una copia en PDF al correo electrónico vía Resend.
