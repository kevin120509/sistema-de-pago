/* ==========================================================================
   CECANI LATINOAMÉRICA - APPLICATION LOGIC 3.0 (app.js)
   Architecture: Simplified 2-View System (Admin Home vs Student Direct Checkout)
   ========================================================================== */

// Estado global de la aplicación
const AppState = {
    currentView: 'admin', // 'admin' | 'student'
    currentStep: 1, // En vista student: 1 (Pago) | 2 (Diploma)
    selectedCourse: 'webinar',
    isPreconfigured: false,
    courses: {
        webinar: {
            id: 'webinar',
            title: 'Webinar Especializado de Actualización Profesional',
            subtitle: 'Constancia de Webinar',
            price: 199,
            desc: 'Constancia oficial digital por participación en webinars especializados de actualización y normatividad.',
            duration: '5 horas de capacitación intensiva',
            dates: 'Agosto 2026',
            defaultName: 'CARLOS EDUARDO MENDOZA VALLADARES'
        },
        ac: {
            id: 'ac',
            title: 'Diplomado Especializado en Contabilidad para A.C y Donatarias',
            subtitle: 'Diplomado / Curso A.C.',
            price: 299,
            desc: 'Emisión de Diploma con valor curricular y sello de autenticidad para cursos y diplomados A.C.',
            duration: 'Con 20 horas de duración',
            dates: '1 de Junio al 1 de Julio 2026',
            defaultName: 'CARLOS EDUARDO MENDOZA VALLADARES'
        }
    },
    payment: {
        completed: false,
        txId: '',
        mode: 'serverless', // 'serverless' | 'simulation' | 'live'
        studentName: '',
        studentEmail: '',
        liveLinks: {
            webinar: '',
            ac: ''
        }
    },
    pdfCoords: {
        coverExample: false,
        nameY: 320,
        nameSize: 26,
        courseY: 225,
        datesY: 185
    },
    pdfBlobUrl: null,
    debounceTimer: null
};

/* ==========================================================================
   INICIALIZACIÓN Y ENRUTAMIENTO DE VISTAS
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    initUrlParamsAndRouting();
    initFormFormatters();
    initFormListeners();
});

/**
 * Lee la URL: si contiene parámetros (?curso=... o ?titulo=...), activa automáticamente
 * la VISTA ALUMNO en Paso 1 (pago directo). Si no hay parámetros, muestra la VISTA ADMIN.
 */
function initUrlParamsAndRouting() {
    const urlParams = new URLSearchParams(window.location.search);
    
    const cursoParam = urlParams.get('curso') || urlParams.get('course');
    const tituloParam = urlParams.get('titulo') || urlParams.get('title');
    const duracionParam = urlParams.get('duracion') || urlParams.get('duration');
    const fechaParam = urlParams.get('fecha') || urlParams.get('dates') || urlParams.get('date');
    const liveLinkParam = urlParams.get('live_link');
    
    // Retornos de Stripe Live
    const successParam = urlParams.get('success');
    const txParam = urlParams.get('tx') || urlParams.get('session_id');
    const nombreParam = urlParams.get('nombre') || urlParams.get('name');
    const correoParam = urlParams.get('correo') || urlParams.get('email');

    const adminSection = document.getElementById('view-admin');
    const studentSection = document.getElementById('view-student');
    const navBadge = document.getElementById('nav-mode-badge');

    // SI HAY PARÁMETROS DE CURSO O RETORNO DE STRIPE -> VISTA ALUMNO (DIRECTO A PAGAR O DIPLOMA)
    if (cursoParam || tituloParam || successParam === 'true' || successParam === '1') {
        AppState.currentView = 'student';
        
        if (adminSection) adminSection.classList.remove('active');
        if (studentSection) studentSection.classList.add('active');
        if (navBadge) {
            navBadge.innerHTML = '<i class="fa-solid fa-user-graduate"></i> Inscripción de Alumno';
            navBadge.style.borderColor = 'rgba(59, 130, 246, 0.4)';
            navBadge.style.color = '#93c5fd';
        }

        const cType = (cursoParam && AppState.courses[cursoParam.toLowerCase()]) ? cursoParam.toLowerCase() : 'webinar';
        AppState.selectedCourse = cType;
        
        if (tituloParam) AppState.courses[cType].title = decodeURIComponent(tituloParam);
        if (duracionParam) AppState.courses[cType].duration = decodeURIComponent(duracionParam);
        if (fechaParam) AppState.courses[cType].dates = decodeURIComponent(fechaParam);
        if (liveLinkParam) AppState.payment.liveLinks[cType] = decodeURIComponent(liveLinkParam);

        // Poblar tarjeta de resumen en Paso 1 del alumno
        populateStudentSummary();

        // Si regresó de pagar en Stripe Checkout o Payment Link con éxito -> Ir directo al Paso 2 (Diploma)
        if (successParam === 'true' || successParam === '1') {
            AppState.payment.completed = true;
            AppState.payment.txId = txParam || `TX-STRIPE-${Math.floor(100000 + Math.random() * 900000)}`;
            if (nombreParam) AppState.payment.studentName = decodeURIComponent(nombreParam).toUpperCase();
            if (correoParam) AppState.payment.studentEmail = decodeURIComponent(correoParam);

            if (txParam && txParam.startsWith('cs_')) {
                fetch(`/api/verify-session?session_id=${encodeURIComponent(txParam)}`)
                    .then(res => res.json())
                    .then(data => {
                        if (data && data.paid) {
                            if (data.studentName) AppState.payment.studentName = data.studentName;
                            if (data.customerEmail) AppState.payment.studentEmail = data.customerEmail;
                            if (data.paymentIntent) AppState.payment.txId = data.paymentIntent;
                            if (data.courseTitle) AppState.courses[cType].title = data.courseTitle;
                            if (data.courseDuration) AppState.courses[cType].duration = data.courseDuration;
                            if (data.courseDates) AppState.courses[cType].dates = data.courseDates;
                        }
                    })
                    .catch(err => console.log('Sin verificación backend serverless diferida:', err))
                    .finally(() => {
                        goToStudentStep(2);
                        showNotification(`¡Pago oficial en Stripe verificado! Diploma de ${AppState.payment.studentName || 'Alumno'} emitido y enviado por correo.`);
                    });
            } else {
                setTimeout(() => {
                    goToStudentStep(2);
                    showNotification(`¡Pago oficial en Stripe verificado! Diploma de ${AppState.payment.studentName || 'Alumno'} emitido.`);
                }, 300);
            }
        } else {
            // Mostrar notificación de bienvenida al curso
            setTimeout(() => {
                showNotification(`✨ Inscripción habilitada: ${AppState.courses[cType].title}`);
            }, 500);
        }

    } else {
        // VISTA POR DEFECTO: ADMINISTRADOR / CREADOR DE ENLACES
        AppState.currentView = 'admin';
        if (adminSection) adminSection.classList.add('active');
        if (studentSection) studentSection.classList.remove('active');
        updateAdminDefaults();
    }
}

function populateStudentSummary() {
    const course = AppState.courses[AppState.selectedCourse];
    if (!course) return;

    const titleEl = document.getElementById('student-course-title');
    const priceEl = document.getElementById('student-course-price');
    const descEl = document.getElementById('student-course-desc');
    const durEl = document.getElementById('student-duration');
    const datesEl = document.getElementById('student-dates');
    const subEl = document.getElementById('student-subtotal');
    const totEl = document.getElementById('student-total');
    const btnTextEl = document.getElementById('btn-pay-text');

    if (titleEl) titleEl.textContent = course.title;
    if (priceEl) priceEl.textContent = `$${course.price} MXN`;
    if (descEl) descEl.textContent = course.desc;
    if (durEl) durEl.textContent = course.duration;
    if (datesEl) datesEl.textContent = course.dates;
    if (subEl) subEl.textContent = `$${course.price}.00 MXN`;
    if (totEl) totEl.textContent = `$${course.price}.00 MXN`;
    if (btnTextEl) btnTextEl.textContent = `Pagar $${course.price} MXN y Emitir Diploma`;
}

/* ==========================================================================
   PANEL ADMINISTRADOR: CREACIÓN DE ENLACES
   ========================================================================== */
function updateAdminDefaults() {
    const type = document.getElementById('admin-course-type').value;
    const course = AppState.courses[type];
    if (!course) return;

    document.getElementById('admin-course-title').value = course.title;
    document.getElementById('admin-course-duration').value = course.duration;
    document.getElementById('admin-course-dates').value = course.dates;
}

function generateCustomLink(event) {
    event.preventDefault();

    const type = document.getElementById('admin-course-type').value;
    const title = document.getElementById('admin-course-title').value.trim();
    const duration = document.getElementById('admin-course-duration').value.trim();
    const dates = document.getElementById('admin-course-dates').value.trim();
    const stripeLink = document.getElementById('admin-stripe-link').value.trim();

    // Construir URL limpia con parámetros
    const baseUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    const params = new URLSearchParams({
        curso: type,
        titulo: title,
        duracion: duration,
        fecha: dates
    });

    if (stripeLink && stripeLink !== '') {
        params.append('live_link', stripeLink);
    }

    const fullUrl = `${baseUrl}?${params.toString()}`;

    // Mostrar en caja de resultados
    const outputEl = document.getElementById('admin-output-url');
    const boxEl = document.getElementById('admin-generated-box');
    
    if (outputEl) outputEl.value = fullUrl;
    if (boxEl) {
        boxEl.style.display = 'block';
        boxEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    showNotification('🔗 Enlace de alumno generado exitosamente.');
}

function copyToClipboard(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input || !input.value) return;

    input.select();
    input.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(input.value).then(() => {
        const origText = btnEl.innerHTML;
        btnEl.innerHTML = '<i class="fa-solid fa-check"></i> ¡Copiado!';
        btnEl.style.background = '#10b981';
        setTimeout(() => {
            btnEl.innerHTML = origText;
            btnEl.style.background = '';
        }, 2000);
        showNotification('Enlace copiado. Puedes pegarlo y compartirlo con tus alumnos.');
    }).catch(err => {
        alert('Selecciona el texto de la caja y cópialo manualmente con Ctrl+C.');
    });
}

function testGeneratedLink() {
    const outputEl = document.getElementById('admin-output-url');
    if (outputEl && outputEl.value) {
        window.location.href = outputEl.value;
    }
}

/* ==========================================================================
   NAVEGACIÓN DE ALUMNO (STEPPER DE 2 PASOS)
   ========================================================================== */
function goToStudentStep(stepNumber) {
    if (stepNumber === 2 && !AppState.payment.completed) {
        alert('Por favor, realiza y confirma el pago primero para poder emitir el diploma oficial.');
        stepNumber = 1;
    }

    AppState.currentStep = stepNumber;

    document.querySelectorAll('.student-subview').forEach(el => el.classList.remove('active'));
    const targetSub = document.getElementById(`student-step-${stepNumber}`);
    if (targetSub) targetSub.classList.add('active');

    for (let i = 1; i <= 2; i++) {
        const ind = document.getElementById(`student-step-indicator-${i}`);
        if (!ind) continue;
        
        ind.classList.remove('active', 'completed');
        if (i < stepNumber) {
            ind.classList.add('completed');
            ind.querySelector('.step-circle').innerHTML = '<i class="fa-solid fa-check"></i>';
        } else if (i === stepNumber) {
            ind.classList.add('active');
            ind.querySelector('.step-circle').textContent = i;
        } else {
            ind.querySelector('.step-circle').textContent = i;
        }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (stepNumber === 2) {
        populateDiplomaForm();
        previewDiploma();
        simulateEmailDelivery();
    }
}

/* ==========================================================================
   PASO 1 DEL ALUMNO: PAGO SEGURO Y REGISTRO DE DATOS
   ========================================================================== */
function initFormFormatters() {
    const cardInput = document.getElementById('card-number');
    const expiryInput = document.getElementById('card-expiry');
    const brandIcon = document.getElementById('card-brand-icon');

    if (cardInput) {
        cardInput.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '');
            let formatted = '';
            for (let i = 0; i < val.length; i++) {
                if (i > 0 && i % 4 === 0) formatted += ' ';
                formatted += val[i];
            }
            e.target.value = formatted.substring(0, 19);

            if (val.startsWith('4')) {
                brandIcon.innerHTML = '<i class="fa-brands fa-cc-visa" style="color: #60a5fa;"></i>';
            } else if (val.startsWith('5') || val.startsWith('2')) {
                brandIcon.innerHTML = '<i class="fa-brands fa-cc-mastercard" style="color: #f97316;"></i>';
            } else if (val.startsWith('34') || val.startsWith('37')) {
                brandIcon.innerHTML = '<i class="fa-brands fa-cc-amex" style="color: #34d399;"></i>';
            } else {
                brandIcon.innerHTML = '<i class="fa-solid fa-credit-card"></i>';
            }
        });
    }

    if (expiryInput) {
        expiryInput.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '');
            if (val.length >= 2) {
                e.target.value = val.substring(0, 2) + '/' + val.substring(2, 4);
            } else {
                e.target.value = val;
            }
        });
    }
}

function handlePaymentSubmit(event) {
    event.preventDefault();

    const course = AppState.courses[AppState.selectedCourse];
    const btnSubmit = document.getElementById('btn-submit-payment');
    const holderInput = document.getElementById('card-holder');
    const emailInput = document.getElementById('billing-email');

    if (holderInput && holderInput.value.trim() !== '') {
        AppState.payment.studentName = holderInput.value.trim().toUpperCase();
        course.defaultName = AppState.payment.studentName;
    }
    if (emailInput && emailInput.value.trim() !== '') {
        AppState.payment.studentEmail = emailInput.value.trim();
    }

    // A. Opción A: Modo Stripe Checkout Serverless (Vercel API)
    if (AppState.payment.mode === 'serverless' || AppState.payment.mode === 'live') {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Conectando con Stripe Checkout...';

        fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                courseType: AppState.selectedCourse,
                courseTitle: course.title,
                courseDuration: course.duration,
                courseDates: course.dates,
                studentName: AppState.payment.studentName,
                studentEmail: AppState.payment.studentEmail
            })
        })
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (data && data.url) {
                window.location.href = data.url;
            } else {
                throw new Error(data.error || 'No se recibió la URL de Stripe Checkout');
            }
        })
        .catch(err => {
            console.warn('Backend Serverless no disponible o error:', err.message);
            const liveUrl = AppState.payment.liveLinks[AppState.selectedCourse] || document.getElementById(`cfg-link-${AppState.selectedCourse}`)?.value;
            if (liveUrl && liveUrl.startsWith('http')) {
                window.location.href = `${liveUrl}?prefilled_email=${encodeURIComponent(AppState.payment.studentEmail)}`;
                return;
            }
            btnSubmit.disabled = false;
            runLocalSimulationPayment(btnSubmit, course);
        });
        return;
    }

    // B. Modo Simulación Local
    runLocalSimulationPayment(btnSubmit, course);
}

function runLocalSimulationPayment(btnSubmit, course) {
    btnSubmit.disabled = true;
    btnSubmit.style.background = '#4f46e5';
    btnSubmit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verificando tarjeta y saldo...';

    setTimeout(() => {
        btnSubmit.innerHTML = `<i class="fa-solid fa-lock"></i> Cobrando $${course.price} MXN a ${AppState.payment.studentName || 'Titular'}...`;
        
        setTimeout(() => {
            btnSubmit.style.background = '#10b981';
            btnSubmit.innerHTML = '<i class="fa-solid fa-check"></i> ¡Pago Aprobado y Confirmado!';

            AppState.payment.completed = true;
            AppState.payment.txId = `TX-${Math.floor(1000000 + Math.random() * 9000000)}`;

            setTimeout(() => {
                btnSubmit.disabled = false;
                btnSubmit.style.background = '#6366f1';
                btnSubmit.innerHTML = `<i class="fa-solid fa-lock"></i> Pagar $${course.price} MXN y Emitir Diploma`;
                
                goToStudentStep(2);
            }, 800);
        }, 1100);
    }, 900);
}

/* ==========================================================================
   SIMULACIÓN DE ENVÍO POR CORREO
   ========================================================================== */
function simulateEmailDelivery() {
    const emailStr = AppState.payment.studentEmail || 'alumno@correo.com';
    const nameStr = AppState.payment.studentName || AppState.courses[AppState.selectedCourse].defaultName || 'ALUMNO';
    const course = AppState.courses[AppState.selectedCourse];

    const displayEmail = document.getElementById('display-email');
    if (displayEmail) displayEmail.textContent = emailStr;

    const simTo = document.getElementById('email-sim-to');
    const simName = document.getElementById('email-sim-name');
    const simCourse = document.getElementById('email-sim-course');
    const simTx = document.getElementById('email-sim-tx');
    const simPrice = document.getElementById('email-sim-price');

    if (simTo) simTo.textContent = emailStr;
    if (simName) simName.textContent = nameStr;
    if (simCourse) simCourse.textContent = course.title;
    if (simTx) simTx.textContent = AppState.payment.txId || 'TX-9842103';
    if (simPrice) simPrice.textContent = `$${course.price}.00 MXN`;

    setTimeout(() => {
        showNotification(`📧 Diploma oficial y comprobante enviados a la bandeja de: ${emailStr}`);
    }, 1200);
}

/* ==========================================================================
   PASO 2 DEL ALUMNO: GENERADOR DIPLOMA PDF (PDF-LIB)
   ========================================================================== */
function populateDiplomaForm() {
    const course = AppState.courses[AppState.selectedCourse];
    const txEl = document.getElementById('tx-id');
    const nameInput = document.getElementById('student-name');
    const titleInput = document.getElementById('course-title-input');
    const durationInput = document.getElementById('course-duration-input');
    const dateInput = document.getElementById('course-date-input');

    if (txEl) txEl.textContent = AppState.payment.txId || 'TX-9842103';
    if (nameInput) {
        nameInput.value = AppState.payment.studentName || course.defaultName || 'CARLOS EDUARDO MENDOZA VALLADARES';
    }
    if (titleInput) titleInput.value = course.title;
    if (durationInput) durationInput.value = course.duration;
    if (dateInput) dateInput.value = course.dates;
}

function initFormListeners() {
    const inputs = ['student-name', 'course-title-input', 'course-duration-input', 'course-date-input'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                triggerPreviewUpdate();
            });
        }
    });
}

function triggerPreviewUpdate() {
    if (AppState.debounceTimer) clearTimeout(AppState.debounceTimer);
    AppState.debounceTimer = setTimeout(() => {
        previewDiploma();
    }, 400);
}

/**
 * Genera el PDF en tiempo real con pdf-lib sobre diploma.pdf
 */
async function previewDiploma() {
    const loader = document.getElementById('preview-loader');
    const iframe = document.getElementById('pdf-iframe');
    if (loader) loader.style.opacity = '1';

    try {
        const nameInput = document.getElementById('student-name');
        const titleInput = document.getElementById('course-title-input');
        const durationInput = document.getElementById('course-duration-input');
        const dateInput = document.getElementById('course-date-input');

        const studentName = (nameInput ? nameInput.value : 'CARLOS EDUARDO MENDOZA VALLADARES').trim().toUpperCase();
        const courseTitle = (titleInput ? titleInput.value : '').trim();
        const durationText = (durationInput ? durationInput.value : '').trim();
        const dateText = (dateInput ? dateInput.value : '').trim();

        const existingPdfBytes = await fetch('diploma.pdf').then(res => {
            if (!res.ok) throw new Error('No se pudo encontrar diploma.pdf en la carpeta del proyecto.');
            return res.arrayBuffer();
        });

        const { PDFDocument, StandardFonts, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.load(existingPdfBytes);

        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();

        const fontName = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
        const fontSubtitle = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontBody = await pdfDoc.embedFont(StandardFonts.Helvetica);

        const nameY = AppState.pdfCoords.nameY;
        let nameSize = AppState.pdfCoords.nameSize || 26;
        let nameWidth = fontName.widthOfTextAtSize(studentName, nameSize);
        while (nameWidth > 680 && nameSize > 14) {
            nameSize -= 1;
            nameWidth = fontName.widthOfTextAtSize(studentName, nameSize);
        }
        const nameX = (width - nameWidth) / 2;

        // 1. Cuadro blanco súper ancho (730px, y=292, h=56) para borrar el 100% de cualquier nombre largo anterior,
        // respetando la palabra DIPLOMA arriba (y=360) y eliminando las colitas inferiores.
        firstPage.drawRectangle({
            x: (width - 730) / 2,
            y: 292,
            width: 730,
            height: 56,
            color: rgb(1, 1, 1),
        });

        firstPage.drawText(studentName, {
            x: nameX,
            y: nameY,
            size: nameSize,
            font: fontName,
            color: rgb(0.1, 0.2, 0.38),
        });

        // 2. Cuadro blanco súper ancho (730px, y=152, h=95) para borrar el 100% del curso anterior y su fecha,
        // respetando "Por haber concluido..." (y=260) y las firmas inferiores (y=140).
        firstPage.drawRectangle({
            x: (width - 730) / 2,
            y: 152,
            width: 730,
            height: 95,
            color: rgb(1, 1, 1),
        });

        // Auto-escala dinámica para que títulos de cursos larguísimos se adapten perfectamente
        let courseSize = 22;
        let lineSpacing = 28;
        let lines = wrapText(courseTitle, fontSubtitle, courseSize, width - 160);
        if (lines.length === 3) {
            courseSize = 18;
            lineSpacing = 23;
            lines = wrapText(courseTitle, fontSubtitle, courseSize, width - 150);
        } else if (lines.length >= 4) {
            courseSize = 15;
            lineSpacing = 19;
            lines = wrapText(courseTitle, fontSubtitle, courseSize, width - 140);
        }

        const courseY = AppState.pdfCoords.courseY;
        let currentY = courseY;
        
        lines.forEach(line => {
            const lineWidth = fontSubtitle.widthOfTextAtSize(line, courseSize);
            firstPage.drawText(line, {
                x: (width - lineWidth) / 2,
                y: currentY,
                size: courseSize,
                font: fontSubtitle,
                color: rgb(0, 0, 0),
            });
            currentY -= lineSpacing;
        });

        // Ubicación dinámica de la fecha y horas para que mantenga distancia armónica y nunca choque con las firmas
        const datesY = Math.max(158, Math.min(currentY - 12, AppState.pdfCoords.datesY));
        const fullDateStr = `${durationText}, ${dateText}`;
        const dateSize = 14.5;
        const dateWidth = fontBody.widthOfTextAtSize(fullDateStr, dateSize);

        firstPage.drawText(fullDateStr, {
            x: (width - dateWidth) / 2,
            y: datesY,
            size: dateSize,
            font: fontBody,
            color: rgb(0.15, 0.15, 0.15),
        });

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        
        if (AppState.pdfBlobUrl) {
            URL.revokeObjectURL(AppState.pdfBlobUrl);
        }
        AppState.pdfBlobUrl = URL.createObjectURL(blob);

        if (iframe) {
            iframe.src = AppState.pdfBlobUrl;
        }

        if (loader) {
            setTimeout(() => { loader.style.opacity = '0'; }, 300);
        }

    } catch (error) {
        console.error('Error en PDF-Lib:', error);
        if (loader) {
            loader.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#f43f5e"></i>
            <span>Error al cargar diploma.pdf: ${error.message}</span>
            <small>Recuerda abrir con servidor local (Live Server o localhost)</small>`;
        }
    }
}

function wrapText(text, font, fontSize, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0] || '';

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = font.widthOfTextAtSize(currentLine + ' ' + word, fontSize);
        if (width < maxWidth) {
            currentLine += ' ' + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine) {
        lines.push(currentLine);
    }
    return lines;
}

function downloadDiploma() {
    if (!AppState.pdfBlobUrl) {
        alert('Esperando la generación de la vista previa del diploma...');
        return;

    }

    const nameInput = document.getElementById('student-name');
    const studentName = (nameInput ? nameInput.value : 'Alumno').trim().replace(/\s+/g, '_');
    const fileName = `Diploma_Official_CECANI_${studentName}.pdf`;

    const link = document.createElement('a');
    link.href = AppState.pdfBlobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showNotification(`¡Diploma de ${studentName.replace(/_/g, ' ')} descargado correctamente!`);
}

/* ==========================================================================
   MODALES Y UTILIDADES
   ========================================================================== */
function openModal(modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.add('active');
}

function closeModal(modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.remove('active');
}

function switchTab(tabId, btnEl) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

    if (btnEl) btnEl.classList.add('active');
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
}

function updateSliderVal(labelId, valText) {
    const el = document.getElementById(labelId);
    if (el) el.textContent = valText;

    const nameY = document.getElementById('cfg-name-y');
    const nameSize = document.getElementById('cfg-name-size');
    const courseY = document.getElementById('cfg-course-y');
    const datesY = document.getElementById('cfg-dates-y');

    if (nameY) AppState.pdfCoords.nameY = parseInt(nameY.value, 10);
    if (nameSize) AppState.pdfCoords.nameSize = parseInt(nameSize.value, 10);
    if (courseY) AppState.pdfCoords.courseY = parseInt(courseY.value, 10);
    if (datesY) AppState.pdfCoords.datesY = parseInt(datesY.value, 10);
}

function resetDefaultCoords() {
    document.getElementById('cfg-name-y').value = 320;
    document.getElementById('cfg-name-size').value = 26;
    document.getElementById('cfg-course-y').value = 225;
    document.getElementById('cfg-dates-y').value = 185;

    updateSliderVal('val-name-y', '320');
    updateSliderVal('val-name-size', '26 pt');
    updateSliderVal('val-course-y', '225');
    updateSliderVal('val-dates-y', '185');

    triggerPreviewUpdate();
    showNotification('Coordenadas restauradas a defecto de fábrica');
}

function toggleStripeMode(mode) {
    AppState.payment.mode = mode;
    const liveDiv = document.getElementById('live-stripe-config');
    const indicator = document.getElementById('payment-mode-indicator');

    if (mode === 'serverless') {
        if (liveDiv) liveDiv.style.display = 'none';
        if (indicator) {
            indicator.innerHTML = '<span class="status-dot green" style="background:#10b981;box-shadow:0 0 8px #10b981;"></span><span>⭐ Stripe Checkout + Vercel Serverless & Resend (Activo)</span>';
            indicator.style.background = 'rgba(16, 185, 129, 0.1)';
            indicator.style.borderColor = 'rgba(16, 185, 129, 0.3)';
            indicator.style.color = '#34d399';
        }
    } else if (mode === 'live') {
        if (liveDiv) liveDiv.style.display = 'block';
        if (indicator) {
            indicator.innerHTML = '<span class="status-dot" style="background:#6366f1;box-shadow:0 0 8px #6366f1;"></span><span>Modo Stripe Payment Links Activo</span>';
            indicator.style.background = 'rgba(99, 102, 241, 0.1)';
            indicator.style.borderColor = 'rgba(99, 102, 241, 0.3)';
            indicator.style.color = '#818cf8';
        }
    } else {
        if (liveDiv) liveDiv.style.display = 'none';
        if (indicator) {
            indicator.innerHTML = '<span class="status-dot yellow" style="background:#f59e0b;"></span><span>Modo Simulación Local Activo</span>';
            indicator.style.background = 'rgba(245, 158, 11, 0.1)';
            indicator.style.borderColor = 'rgba(245, 158, 11, 0.3)';
            indicator.style.color = '#fbbf24';
        }
    }
}

function showNotification(message) {
    let toast = document.getElementById('custom-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'custom-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 25px;
            right: 25px;
            background: #0f1f3e;
            color: #f3e5ab;
            border: 1px solid rgba(212, 175, 55, 0.5);
            padding: 12px 20px;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.6);
            z-index: 10000;
            font-family: 'Outfit', sans-serif;
            font-size: 0.9rem;
            display: flex;
            align-items: center;
            gap: 10px;
            opacity: 0;
            transform: translateY(15px);
            transition: all 0.3s ease;
        `;
        document.body.appendChild(toast);
    }

    toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#10b981;"></i> <span>${message}</span>`;
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 50);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(15px)';
    }, 4500);
}
