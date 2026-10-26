// Services/welcomeService.js - Mensaje de bienvenida según el rol del número
function welcomeByRole(identity, name) {
  const n = name || '';
  const role = identity?.role;

  if (role === 'owner') {
    return {
      message:
        `¡Hola${n ? ` ${n}` : ''}! 🚀\n` +
        `Te saluda ReservaYa. Este es el canal oficial de WhatsApp de *${identity.tenantName || 'tu negocio'}*.\n` +
        `Aquí recibirás en tiempo real cada *nueva reserva* de tus clientes, y tus profesionales también serán notificados.\n\n` +
        `_Tip:_ los recordatorios de las citas se envían 8h y 1h antes del horario.`
    };
  }

  if (role === 'professional') {
    return {
      message:
        `¡Hola${n ? ` ${n}` : ''}! 👋\n` +
        `Gracias por formar parte de *${identity.tenantName || 'ReservaYa'}*.\n` +
        `Te avisaremos aquí cada vez que tengas una *nueva reserva* y te enviaremos recordatorios 8h y 1h antes de cada cita. Mejora tu agenda sin esfuerzo. 💪`
    };
  }

  return {
    message:
      `¡Hola${n ? ` ${n}` : ''}! 👋\n` +
      `Bienvenido a *ReservaYa*, la forma más fácil de agendar citas y servicios en tu ciudad.\n` +
      `Cuéntame qué necesitas para empezar: peluquería, café, clínica, restaurante... ☕💈🩺`
  };
}

module.exports = { welcomeByRole };