import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { SeoService } from '../../../../core/seo/seo.service';

@Component({
  selector: 'app-privacy-policy-page',
  imports: [RouterLink, MatIconModule, TranslatePipe],
  template: `
    <section class="legal">
      <a class="legal__back" routerLink="/">
        <mat-icon>arrow_back</mat-icon>
        {{ 'privacy.back' | translate }}
      </a>

      <header class="legal__head">
        <span class="legal__badge">Documento legal</span>
        <h1>Política de Privacidad y Tratamiento de Datos Personales (Habeas Data)</h1>
        <p class="legal__meta">
          <span>Última actualización: 23 de septiembre de 2026</span>
          <span>Responsable del Tratamiento: ReservaYa (plataforma SaaS multi-tenant de reservas para
            negocios de servicios)</span>
          <span>Contacto para ejercicio de derechos: <a href="mailto:soporte&#64;reservaya.com">soporte&#64;reservaya.com</a></span>
        </p>
      </header>

      <div class="legal__body">
        <h2><span class="legal__num">1</span> Marco normativo aplicable</h2>
        <p>
          ReservaYa opera como plataforma "glocal": nace en Colombia pero su arquitectura está diseñada
          para escalar a otros países (arquitectura tenant-aware, campo de región por tenant). Por eso la
          política combina dos marcos:
        </p>
        <div class="legal__table-wrap">
          <table>
            <caption>Marcos normativos aplicables a la plataforma</caption>
            <thead>
              <tr>
                <th scope="col">Marco</th>
                <th scope="col">Alcance</th>
                <th scope="col">Normas clave</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Colombia</td>
                <td>Usuarios, tenants y datos alojados/operados desde Colombia</td>
                <td>Constitución Política art. 15, Ley 1581 de 2012 (Régimen General de Protección de
                  Datos), Decreto 1377 de 2013 (compilado en el Capítulo 25, Título 2, Parte 2, Libro 2
                  del Decreto Único 1074 de 2015), Ley 1266 de 2008 (datos financieros), circulares e
                  instructivos de la Superintendencia de Industria y Comercio (SIC).</td>
              </tr>
              <tr>
                <td>Internacional / expansión (Fase 2–3)</td>
                <td>Tenants y usuarios finales fuera de Colombia</td>
                <td>Reglamento General de Protección de Datos (RGPD/GDPR) de la UE (Reglamento 2016/679)
                  como estándar de referencia global, y leyes locales equivalentes (LGPD en Brasil, CCPA
                  en EE.UU., etc.).</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Esta política se redacta siguiendo el principio de "cumplimiento por diseño": la arquitectura de
          ReservaYa ya prevé un campo de región por tenant para poder aplicar reglas de residencia de
          datos diferenciadas cuando el producto se despliegue en más países.
        </p>

        <h2><span class="legal__num">2</span> Identificación del Responsable del Tratamiento</h2>
        <ul>
          <li><strong>Razón social / nombre del proyecto:</strong> ReservaYa.</li>
          <li><strong>Actividad:</strong> Plataforma SaaS multi-tenant de reservas para negocios de
            servicios (barberías, spas, consultorios, canchas, veterinarias, talleres, etc.).</li>
          <li>
            <strong>Rol frente a los datos:</strong>
            <ul>
              <li>Frente a los datos de los tenants (negocios) y sus usuarios internos (dueño,
                profesionales), ReservaYa actúa como <em>Responsable del Tratamiento</em>.</li>
              <li>Frente a los datos de los clientes finales que reservan citas a través de un tenant,
                ReservaYa actúa principalmente como <em>Encargado del Tratamiento</em> por cuenta del
                negocio (tenant), quien a su vez es Responsable frente a sus propios clientes. Esta
                distinción debe quedar explícita en los Términos de Servicio que firma cada tenant.</li>
            </ul>
          </li>
          <li><strong>Datos de contacto para ejercicio de derechos:</strong>
            <a href="mailto:soporte&#64;reservaya.com">soporte&#64;reservaya.com</a>.</li>
        </ul>

        <h2><span class="legal__num">3</span> Datos personales que se recolectan</h2>
        <p>Dado el modelo de datos "recurso-servicio-turno" descrito en la arquitectura del MVP,
          ReservaYa recolecta, entre otros:</p>
        <ul>
          <li><strong>Datos de identificación:</strong> nombre, documento de identidad (cuando el tenant
            lo requiera), correo electrónico, número de teléfono/WhatsApp.</li>
          <li><strong>Datos de agenda:</strong> citas reservadas, servicio solicitado, profesional
            asignado, historial de reservas y cancelaciones.</li>
          <li><strong>Datos de negocio (tenant):</strong> nombre comercial, NIT/RUT, dirección, horarios,
            moneda, zona horaria, datos bancarios o de pasarela de pago (Wompi, PayU, Mercado Pago,
            Stripe) para liquidaciones.</li>
          <li><strong>Datos técnicos:</strong> dirección IP, tipo de dispositivo, idioma detectado del
            navegador, cookies y datos de uso de la plataforma.</li>
          <li><strong>Datos de comunicación:</strong> mensajes enviados vía WhatsApp Business API, correos
            de notificación y confirmación de citas.</li>
        </ul>
        <p>
          No se recolectan de forma intencional datos sensibles (salud, biometría, orientación sexual,
          afiliación política/religiosa) salvo que un tenant de salud los ingrese voluntariamente en el
          campo "notas del servicio"; en ese caso se recomienda tratarlos bajo el régimen reforzado del
          artículo 6 de la Ley 1581 de 2012 (autorización explícita y no obligación de otorgarla).
        </p>

        <h2><span class="legal__num">4</span> Finalidades del tratamiento</h2>
        <ul>
          <li>Gestionar el registro y autenticación de tenants, profesionales y clientes finales.</li>
          <li>Procesar y confirmar reservas, evitando cruces de horario (motor anti-cruce).</li>
          <li>Enviar notificaciones y recordatorios de citas por WhatsApp, SMS o correo.</li>
          <li>Procesar pagos y liquidaciones a través de pasarelas conectadas por el tenant.</li>
          <li>Generar analítica de ocupación y desempeño para el panel del dueño del negocio.</li>
          <li>Cumplir obligaciones legales, contables y tributarias.</li>
          <li>Mejorar el producto, prevenir fraude y garantizar la seguridad de la plataforma.</li>
          <li>Enviar comunicaciones comerciales, únicamente si el titular otorgó autorización específica
            para ello.</li>
        </ul>
        <p>
          Ninguna finalidad adicional a las aquí descritas se ejecutará sin informar previamente al
          titular y, si la ley lo exige, sin obtener nueva autorización (principio de finalidad,
          art. 4 lit. b Ley 1581/2012; art. 5.1.b RGPD).
        </p>

        <h2><span class="legal__num">5</span> Autorización del titular (Habeas Data)</h2>
        <p>
          Conforme al artículo 9 de la Ley 1581 de 2012 y al Decreto 1377 de 2013, la autorización se
          obtendrá:
        </p>
        <ul>
          <li>Al momento del registro en la plataforma (checkbox no premarcado, acción afirmativa e
            inequívoca), antes de recolectar cualquier dato.</li>
          <li>Mediante texto claro y accesible que informe: qué datos se recolectan, con qué finalidad,
            quién es el Responsable/Encargado, y cómo ejercer los derechos de Habeas Data.</li>
          <li>De forma verificable: ReservaYa conservará registro (log, timestamp, versión de política
            aceptada) de cada autorización otorgada, como exige el deber de conservar copia de la
            autorización (art. 17 lit. b Ley 1581/2012).</li>
          <li>Para usuarios menores de edad, se exigirá autorización del representante legal, dado que su
            interés superior prevalece (art. 7 Ley 1581/2012).</li>
        </ul>
        <p>
          Para operaciones que en el futuro se extiendan a la Unión Europea, se aplicará el estándar más
          exigente de consentimiento explícito, granular y revocable en cualquier momento con la misma
          facilidad con la que se otorgó (art. 7 RGPD).
        </p>

        <h2><span class="legal__num">6</span> Derechos de los titulares</h2>
        <p>Todo titular de datos personales en ReservaYa tiene derecho a:</p>
        <ul>
          <li>Conocer, actualizar y rectificar sus datos personales.</li>
          <li>Solicitar prueba de la autorización otorgada.</li>
          <li>Ser informado sobre el uso dado a sus datos.</li>
          <li>Presentar quejas ante la SIC por infracciones a la ley (art. 8 Ley 1581/2012).</li>
          <li>Revocar la autorización y/o solicitar la supresión del dato cuando no se respeten los
            principios, derechos y garantías constitucionales y legales.</li>
          <li>Acceder gratuitamente a sus datos personales tratados.</li>
        </ul>
        <p>
          Para usuarios bajo un marco tipo RGPD se añaden, como buena práctica global, los derechos de
          portabilidad de datos, oposición al tratamiento y limitación del procesamiento.
        </p>
        <p>
          <strong>Canal de ejercicio de derechos:</strong> correo electrónico dedicado, con respuesta
          dentro de los plazos legales colombianos (10 días hábiles para consultas, 15 días hábiles para
          reclamos, con posibilidad de prórroga de 5 días hábiles adicionales notificada al titular).
        </p>

        <h2><span class="legal__num">7</span> Transferencia y transmisión de datos</h2>
        <ul>
          <li><strong>Transmisión a Encargados:</strong> ReservaYa transmite datos a proveedores
            tecnológicos necesarios para operar (hosting en Render/Railway/Vercel, pasarelas de pago
            Stripe/Wompi/PayU/Mercado Pago, WhatsApp Business API/Twilio, servicio de correo). Con cada
            Encargado se suscribirá un contrato de transmisión de datos que exija los mismos niveles de
            seguridad y confidencialidad (art. 25 Decreto 1377/2013).</li>
          <li><strong>Transferencia internacional:</strong> dado que varios proveedores (Stripe,
            WhatsApp/Meta, servicios cloud) almacenan datos fuera de Colombia, se informará expresamente
            al titular que sus datos podrán ser transferidos a países que la SIC no haya declarado con
            nivel adecuado de protección, amparándose en las excepciones del artículo 26 de la Ley 1581
            de 2012 (autorización expresa e inequívoca del titular).</li>
          <li><strong>Arquitectura por región:</strong> conforme la Fase 3 del proyecto contempla
            despliegue multi-región (data plane por región), cada tenant tendrá asociado un país/región
            que determinará qué reglas de residencia y transferencia de datos aplican, evitando así
            conflictos normativos al escalar.</li>
        </ul>

        <h2><span class="legal__num">8</span> Seguridad, retención y minimización</h2>
        <ul>
          <li><strong>Medidas técnicas:</strong> aislamiento de tenants mediante tenant_id obligatorio en
            JWT y Row-Level Security en PostgreSQL, cifrado en tránsito (HTTPS/TLS) y en reposo, control
            de acceso por roles (dueño, profesional, cliente).</li>
          <li><strong>Medidas organizativas:</strong> políticas internas de acceso mínimo necesario,
            capacitación al equipo, gestión segura de variables de entorno y secretos.</li>
          <li><strong>Minimización de datos:</strong> solo se solicitan los campos estrictamente
            necesarios para operar el modelo "recurso-servicio-turno"; no se recolectan datos sensibles
            por defecto.</li>
          <li><strong>Retención:</strong> los datos se conservarán mientras exista una relación
            contractual con el tenant o el titular, y posteriormente durante los plazos legales de
            conservación documental/contable; superado ese plazo, se anonimizarán o eliminarán de forma
            segura.</li>
        </ul>

        <h2><span class="legal__num">9</span> Cookies y datos técnicos</h2>
        <p>
          El portal del cliente y el panel administrativo usan cookies/tokens de sesión para
          autenticación y para mantener el contexto de tenant y locale detectado del navegador. Se
          recomienda incluir un banner de cookies con opción de aceptar/rechazar cookies no esenciales
          (analítica, marketing), separado de las cookies estrictamente necesarias para el
          funcionamiento del servicio.
        </p>

        <h2><span class="legal__num">10</span> Menores de edad y datos sensibles</h2>
        <p>
          Servicios verticales como consultorios de salud o veterinarias pueden implicar datos delicados.
          Se recomienda que ReservaYa incluya en los Términos por Tenant una cláusula que obligue al
          negocio a no ingresar datos de salud detallados en campos de texto libre sin haber obtenido
          autorización específica adicional, trasladando parte de la responsabilidad de tratamiento
          sensible al tenant como Responsable frente a sus propios clientes.
        </p>

        <h2><span class="legal__num">11</span> Vigencia, cambios y contacto</h2>
        <p>
          Esta política podrá modificarse para reflejar cambios legales, nuevas funcionalidades o
          expansión a nuevos países. Los cambios sustanciales se notificarán a los titulares y, cuando la
          ley lo exija, se solicitará nueva autorización. La versión vigente estará siempre disponible en
          la plataforma con fecha de última actualización visible.
        </p>

        <p class="legal__sign">Todos los derechos reservados © ReservaYa.</p>
      </div>
    </section>
  `,
  styles: `
    .legal {
      max-width: 820px;
      margin: 0 auto;
      padding: 40px 20px 96px;
    }
    .legal__back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--mat-sys-primary);
      text-decoration: none;
      font-weight: 500;
      margin-bottom: 28px;
    }
    .legal__back:hover {
      text-decoration: underline;
    }
    .legal__back mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .legal__head {
      padding: 28px 0 24px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      margin-bottom: 12px;
    }
    .legal__badge {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--mat-sys-on-primary-container);
      background: var(--mat-sys-primary-container);
      margin-bottom: 16px;
    }
    .legal__head h1 {
      font-size: clamp(1.6rem, 4vw, 2.3rem);
      line-height: 1.15;
      letter-spacing: -0.02em;
      margin: 0 0 18px;
    }
    .legal__meta {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font-size: 14px;
      line-height: 1.6;
    }
    .legal__meta a {
      color: var(--mat-sys-primary);
    }
    .legal__body h2 {
      display: flex;
      align-items: baseline;
      gap: 12px;
      font-size: 1.35rem;
      letter-spacing: -0.01em;
      margin: 40px 0 14px;
      scroll-margin-top: 90px;
    }
    .legal__num {
      flex: none;
      display: inline-grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 700;
      color: var(--mat-sys-primary);
      background: var(--mat-sys-primary-container);
    }
    .legal__body p {
      line-height: 1.75;
      color: var(--mat-sys-on-surface);
      margin: 0 0 14px;
    }
    .legal__body ul {
      margin: 0 0 16px;
      padding-left: 22px;
      color: var(--mat-sys-on-surface);
      line-height: 1.75;
    }
    .legal__body li {
      margin-bottom: 6px;
    }
    .legal__body li ul {
      margin-top: 6px;
    }
    .legal__table-wrap {
      overflow-x: auto;
      margin: 0 0 16px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 14px;
    }
    .legal__table-wrap table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .legal__table-wrap caption {
      text-align: left;
      font-weight: 700;
      padding: 12px 16px;
      color: var(--mat-sys-on-surface-variant);
    }
    .legal__table-wrap th {
      text-align: left;
      padding: 10px 16px;
      border-top: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface-container);
      white-space: nowrap;
    }
    .legal__table-wrap td {
      padding: 10px 16px;
      border-top: 1px solid var(--mat-sys-outline-variant);
      vertical-align: top;
      line-height: 1.55;
    }
    .legal__sign {
      margin-top: 40px !important;
      font-weight: 600;
      color: var(--mat-sys-primary) !important;
    }
    @media (max-width: 640px) {
      .legal {
        padding: 24px 16px 72px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPolicyPage {
  private readonly seo = inject(SeoService);

  constructor() {
    this.seo.setPageMeta({
      title: 'Política de Privacidad y Tratamiento de Datos Personales (Habeas Data) · ReservaYa',
      description:
        'Conoce cómo ReservaYa recolecta, usa y protege tus datos personales conforme a la Ley 1581 de 2012 (Habeas Data).',
      type: 'website',
    });
  }
}