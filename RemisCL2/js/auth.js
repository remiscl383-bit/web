// Cambiar entre pestaña "Ingresar" y "Registrarse"
function mostrarSeccion(seccion) {
  const loginSec = document.getElementById('sec-login');
  const regSec = document.getElementById('sec-registro');
  const btnLogin = document.getElementById('btn-tab-login');
  const btnRegistro = document.getElementById('btn-tab-registro');

  if (seccion === 'login') {
    loginSec.classList.remove('hidden');
    regSec.classList.add('hidden');
    btnLogin.classList.add('active');
    btnRegistro.classList.remove('active');
  } else {
    loginSec.classList.add('hidden');
    regSec.classList.remove('hidden');
    btnLogin.classList.remove('active');
    btnRegistro.classList.add('active');
  }
}

// Alternar entre formulario de Pasajero y Remisero
function toggleFormularioRol() {
  const rolSeleccionado = document.querySelector('input[name="tipo_usuario"]:checked').value;
  const formPasajero = document.getElementById('form-registro-pasajero');
  const formRemisero = document.getElementById('form-registro-remisero');

  if (rolSeleccionado === 'pasajero') {
    formPasajero.classList.remove('hidden');
    formRemisero.classList.add('hidden');
  } else {
    formPasajero.classList.add('hidden');
    formRemisero.classList.remove('hidden');
  }
}

// Evento Login -> Redirige a inicio.html
document.getElementById('form-login').addEventListener('submit', function(e) {
  e.preventDefault();
  localStorage.setItem('usuario_activo', 'Pasajero');
  window.location.href = 'paginas/inicio.html';
});

// Evento Registro Pasajero -> Muestra pantalla de código
document.getElementById('form-registro-pasajero').addEventListener('submit', function(e) {
  e.preventDefault();
  document.getElementById('sec-registro').classList.add('hidden');
  document.querySelector('.tabs').classList.add('hidden');
  document.getElementById('sec-codigo').classList.remove('hidden');
});

// Evento Registro Remisero
document.getElementById('form-registro-remisero').addEventListener('submit', function(e) {
  e.preventDefault();
  alert('Solicitud enviada. Revisaremos tu documentación y te avisaremos por WhatsApp.');
});

// Validar código -> Redirige a inicio.html
function validarCodigo() {
  const codigo = document.getElementById('input-codigo').value;
  
  if (codigo.length === 4) {
    alert('¡Código verificado con éxito!');
    localStorage.setItem('usuario_activo', 'Pasajero Nuevo');
    window.location.href = 'paginas/inicio.html';
  } else {
    alert('Por favor ingresá un código válido de 4 dígitos.');
  }
}