(function () {
  'use strict';

  var alertEl = document.querySelector('[data-reservaya-alert]');
  if (!alertEl) {
    return;
  }

  var type = alertEl.getAttribute('data-reservaya-alert') || 'info';
  var title = alertEl.getAttribute('data-title') || '';
  var text = (alertEl.textContent || '').trim();

  var iconMap = {
    success: 'success',
    error: 'error',
    warning: 'warning',
    info: 'info'
  };
  var icon = iconMap[type] || 'info';

  if (window.Swal && window.Swal.fire && text) {
    // Popup SweetAlert2 (el aviso inline queda oculto y como respaldo sin JS).
    alertEl.classList.add('d-none');
    window.Swal.fire({
      icon: icon,
      title: title,
      text: text,
      confirmButtonText: 'OK',
      confirmButtonColor: '#15803d',
      background: '#ffffff',
      color: '#1f2933',
      timer: icon === 'success' ? 3500 : undefined,
      timerProgressBar: icon === 'success',
      showConfirmButton: icon !== 'success'
    });
  } else {
    alertEl.classList.add('ry-alert--visible');
  }
})();