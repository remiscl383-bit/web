import { auth, db } from './conexion-db.js';
import { signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const mensajesError = {
  'invalid-credential': 'El correo o la contraseña son incorrectos.',
  'invalid-email': 'Ingresá un correo electrónico válido.',
  'too-many-requests': 'Demasiados intentos. Probá nuevamente más tarde.',
  'permission-denied': 'No se pudo verificar el perfil del chofer. Revisá los permisos de Firestore.'
};

document.addEventListener('DOMContentLoaded', () => {
  const formulario = document.getElementById('form-login-chofer');
  const mensaje = document.getElementById('mensaje-error');
  if (!formulario) return;

  formulario.addEventListener('submit', async (event) => {
    event.preventDefault();
    mensaje.textContent = '';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
      const credencial = await signInWithEmailAndPassword(auth, email, password);
      const perfilSnapshot = await getDoc(doc(db, 'usuarios', credencial.user.uid));
      const perfil = perfilSnapshot.exists() ? perfilSnapshot.data() : null;

      if (!perfil) {
        await signOut(auth);
        mensaje.textContent = 'No se encontró el perfil de esta cuenta.';
        return;
      }

      const rol = (perfil.rol || '').toString().trim().toLowerCase();
      const estado = (perfil.estado || '').toString().trim().toLowerCase();

      if (rol === 'superadmin') {
        window.location.href = 'superadmin.html';
        return;
      }

      if (rol !== 'chofer') {
        await signOut(auth);
        mensaje.textContent = 'Esta cuenta no tiene permisos de chofer.';
        return;
      }

      if (estado === 'pendiente') {
        await signOut(auth);
        mensaje.textContent = 'Tu cuenta todavía no fue habilitada por RemisCL.';
        return;
      }

      if (estado !== 'activo') {
        await signOut(auth);
        mensaje.textContent = 'No podés iniciar sesión hasta que RemisCL habilite tu cuenta.';
        return;
      }

      window.location.href = 'panel-chofer.html';
    } catch (error) {
      console.error('Error iniciando sesión como chofer:', error);
      const codigo = error.code?.replace('auth/', '');
      mensaje.textContent = mensajesError[codigo] || 'No se pudo iniciar sesión. Intentá nuevamente.';
    }
  });
});
