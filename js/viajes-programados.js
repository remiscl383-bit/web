import { auth, db } from './conexion-db.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { addDoc, collection, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

let choferActual = null;
let tieneViajeActivo = false;
let cancelarEscuchaSalidas;

document.addEventListener('DOMContentLoaded', () => {
  const formulario = document.getElementById('form-publicar-salida');
  const mensaje = document.getElementById('mensaje-salida');
  if (!formulario) return;

  onAuthStateChanged(auth, (usuario) => {
    choferActual = usuario;
    if (!usuario) {
      window.location.href = 'login-chofer.html';
      return;
    }

    escucharViajeActual();
  });

  formulario.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!choferActual) {
      mensaje.textContent = 'Necesitás iniciar sesión como chofer.';
      return;
    }

    if (tieneViajeActivo) {
      mensaje.textContent = 'No podés publicar otra salida mientras tengas un viaje activo.';
      return;
    }

    const botonPublicar = formulario.querySelector('button[type="submit"]');
    botonPublicar.disabled = true;

    try {
      await addDoc(collection(db, 'salidas_programadas'), {
        choferId: choferActual.uid,
        origen: document.getElementById('salida-origen').value.trim(),
        destino: document.getElementById('salida-destino').value.trim(),
        fechaHora: document.getElementById('salida-fecha-hora').value,
        asientosDisponibles: Number(document.getElementById('salida-asientos').value),
        precio: Number(document.getElementById('salida-precio').value),
        estado: 'activa'
      });

      formulario.reset();
      mensaje.textContent = 'Viaje publicado correctamente.';
    } catch (error) {
      console.error('Error publicando salida:', error);
      botonPublicar.disabled = false;
      mensaje.textContent = 'No se pudo publicar la salida. Intentá nuevamente.';
    }
  });
});

function escucharViajeActual() {
  cancelarEscuchaSalidas?.();
  const consulta = query(
    collection(db, 'salidas_programadas'),
    where('choferId', '==', choferActual.uid)
  );

  cancelarEscuchaSalidas = onSnapshot(consulta, (snapshot) => {
    tieneViajeActivo = snapshot.docs.some((documento) => {
      const estado = (documento.data().estado || '').toString().toLowerCase();
      return ['activa', 'pendiente', 'en_curso'].includes(estado);
    });
    actualizarFormulario();
  }, (error) => {
    console.error('Error verificando viajes del chofer:', error);
  });
}

function actualizarFormulario() {
  const formulario = document.getElementById('form-publicar-salida');
  const mensaje = document.getElementById('mensaje-salida');
  const botonPublicar = formulario?.querySelector('button[type="submit"]');
  if (!formulario || !botonPublicar) return;

  botonPublicar.disabled = tieneViajeActivo;
  if (tieneViajeActivo && mensaje) {
    mensaje.textContent = 'Ya tenés un viaje publicado. Finalizalo antes de crear otro.';
  }
}