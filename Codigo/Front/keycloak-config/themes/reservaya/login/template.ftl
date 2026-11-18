<#-- Marioneta del login de ReservaYa, construida con Bootstrap 5.           -->
<#-- Mantiene el contrato de secciones (header / form / info /               -->
<#-- socialProviders) que definen las plantillas base (login.ftl, etc.).    -->
<#-- Los mensajes/flash se muestran como popup de SweetAlert2 y, sin JS,     -->
<#-- como alerta inline (ry-alert).                                          -->
<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
<#-- Título del popup de SweetAlert2 según el tipo de mensaje -->
<#assign _alertTitle = msg('reservaya.title.info') />
<#if message?has_content>
  <#switch message.type>
    <#case "success">  <#assign _alertTitle = msg('reservaya.title.success') /><#break>
    <#case "error">    <#assign _alertTitle = msg('reservaya.title.error')   /><#break>
    <#case "warning">  <#assign _alertTitle = msg('reservaya.title.warning') /><#break>
    <#default>         <#assign _alertTitle = msg('reservaya.title.info') />
  </#switch>
</#if>
<!DOCTYPE html>
<html class="ry-html" lang="${lang}"<#if realm.internationalizationEnabled> dir="${(locale.rtl)?then('rtl','ltr')}"</#if>>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${(title!'')}</title>
  <link rel="icon" href="${url.resourcesPath}/img/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
  <link href="${url.resourcesPath}/css/bootstrap.min.css" rel="stylesheet">
  <link href="${url.resourcesPath}/css/reservaya.css" rel="stylesheet">
  <script src="${url.resourcesPath}/js/sweetalert2.min.js" defer></script>
  <script src="${url.resourcesPath}/js/theme.js" defer></script>
  <script type="module" src="${url.resourcesPath}/js/passwordVisibility.js"></script>
</head>
<body class="ry-body ${bodyClass!''}" data-page-id="login-${pageId}">
  <div class="ry-shell d-flex flex-column align-items-center justify-content-center min-vh-100 px-3 py-4">
    <a class="ry-brand mb-1" href="${properties.portalUrl!'/'}" aria-label="${msg('reservaya.brand')}">
      <span class="ry-brand__mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="20" height="20" role="img" aria-hidden="true">
          <defs>
            <linearGradient id="ryg" x1="0" y1="0" x2="32" y2="32">
              <stop offset="0" stop-color="#22c55e"/>
              <stop offset="1" stop-color="#15803d"/>
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="9" fill="url(#ryg)"/>
          <text x="16" y="22" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-size="18" font-weight="700" fill="#fff">R</text>
        </svg>
      </span>
      <span class="ry-brand__name">${msg('reservaya.brand')}</span>
    </a>

    <main class="ry-card card border-0 shadow-lg rounded-4 w-100 p-4 p-sm-5" aria-labelledby="kc-page-title">
      <header class="ry-card__head">
        <h1 class="h3 fw-bold lh-sm mb-1" id="kc-page-title"><#nested "header"></h1>
        <#if displayRequiredFields>
          <p class="ry-card__hint mb-0"><span class="ry-required">*</span> ${msg("requiredFields")}</p>
        </#if>
        <#if realm.internationalizationEnabled && locale.supported?size gt 1>
          <div class="ry-locale mt-3">
            <label class="ry-locale__label" for="ry-locale" role="presentation">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </label>
            <select id="ry-locale" aria-label="${msg("languages")}" onchange="if (this.value) window.location.href=this.value">
              <#list locale.supported?sort_by("label") as l>
                <option value="${l.url}" ${(l.languageTag == locale.currentLanguageTag)?then('selected','')}>${l.label}</option>
              </#list>
            </select>
          </div>
        </#if>
      </header>

      <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
        <div class="ry-alert ry-alert--${message.type}" role="alert" aria-live="polite"
             data-reservaya-alert="${message.type}" data-title="${_alertTitle}">
          <span class="ry-alert__text">${kcSanitize(message.summary)?no_esc}</span>
        </div>
      </#if>

      <div class="ry-card__body">
        <#nested "form">
      </div>

      <#if auth?has_content && auth.showTryAnotherWayLink()>
        <form id="kc-select-try-another-way-form" action="${url.loginAction}" method="post" novalidate>
          <input type="hidden" name="tryAnotherWay" value="on">
          <a href="#" class="ry-link d-inline-block mt-3" id="try-another-way"
             onclick="document.forms['kc-select-try-another-way-form'].requestSubmit();return false;">${msg("doTryAnotherWay")}</a>
        </form>
      </#if>

      <#nested "socialProviders">

      <#if displayInfo>
        <div class="ry-callout" id="kc-info">
          <#nested "info">
        </div>
      </#if>
    </main>

    <p class="ry-foot mb-0">
      <a class="ry-link" href="${properties.portalUrl!'/'}">${msg('reservaya.backToSite')}</a>
    </p>
  </div>
</body>
</html>
</#macro>