import { auth, db } from './conexion-db.js';
import { createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const mensajesError = {
  'email-already-in-use': 'Ese correo ya está registrado.',
  'invalid-email': 'Ingresá un correo electrónico válido.',
  'weak-password': 'La contraseña debe tener al menos 6 caracteres.'
};

document.addEventListener('DOMContentLoaded', () => {
  const formulario = document.getElementById('form-registro-chofer');
  const mensaje = document.getElementById('mensaje-registro');
  if (!formulario) return;

  formulario.addEventListener('submit', async (event) => {
    event.preventDefault();
    mensaje.textContent = '';

    const datos = {
      nombre: document.getElementById('nombre').value.trim(),
      apellido: document.getElementById('apellido').value.trim(),
      dni: document.getElementById('dni').value.trim(),
      celular: document.getElementById('celular').value.trim(),
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value
    };

    try {
      const credencial = await createUserWithEmailAndPassword(auth, datos.email, datos.password);
      await setDoc(doc(db, 'usuarios', credencial.user.uid), {
        nombre: datos.nombre,
        apellido: datos.apellido,
        dni: datos.dni,
        celular: datos.celular,
        email: datos.email,
        rol: 'chofer',
        estado: 'pendiente',
        fechaRegistro: new Date()
      });

      await signOut(auth);
      alert('La cuenta ya fue creada. Esperá la aprobación de RemisCL.');
      window.location.href = 'login-chofer.html';
    } catch (error) {
      console.error('Error registrando chofer:', error);
      const codigo = error.code?.replace('auth/', '');
      mensaje.textContent = mensajesError[codigo] || 'No se pudo crear la cuenta. Intentá nuevamente.';
    }
  });
});
