import { auth, db } from './conexion-db.js';
import { createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const mensajesError = {
  'email-already-in-use': 'Ese correo ya está registrado.',
  'invalid-email': 'Ingresá un correo electrónico válido.',
  'weak-password': 'La contraseña debe tener al menos 6 caracteres.'
};

document.addEventListener('DOMContentLoaded', () => {
  const formulario = document.getElementById('form-registro-cliente');
  const mensaje = document.getElementById('mensaje-registro');
  if (!formulario) return;

  formulario.addEventListener('submit', async (event) => {
    event.preventDefault();
    mensaje.textContent = '';

    const nombre = document.getElementById('nombre').value.trim();
    const apellido = document.getElementById('apellido').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const telefono = document.getElementById('telefono').value.trim();

    try {
      const credencial = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'usuarios', credencial.user.uid), {
        nombre,
        apellido,
        email,
        telefono,
        rol: 'pasajero',
        estado: 'activo',
        fechaRegistro: new Date()
      });

      window.location.href = 'inicio.html';
    } catch (error) {
      console.error('Error registrando cliente:', error);
      const codigo = error.code?.replace('auth/', '');
      mensaje.textContent = mensajesError[codigo] || 'No se pudo crear la cuenta. Intentá nuevamente.';
    }
  });
});
