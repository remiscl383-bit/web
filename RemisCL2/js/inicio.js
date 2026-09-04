import { conectarEstadoUsuario } from './auth-simple.js';
import { auth, db } from './conexion-db.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
	const nombreUsuario = document.getElementById('nombre-usuario');
	const correoUsuario = document.getElementById('correo-usuario');
	const botonLogin = document.getElementById('btn-login');
	const botonLogout = document.getElementById('btn-logout');

	conectarEstadoUsuario(async (user) => {
		if (user) {
			let nombre = user.displayName || user.email || 'Cliente';
			const usuarioSnapshot = await getDoc(doc(db, 'usuarios', user.uid));
			if (usuarioSnapshot.exists()) {
				const datosUsuario = usuarioSnapshot.data();
				nombre = datosUsuario.nombre || datosUsuario.name || nombre;
			}

			if (nombreUsuario) nombreUsuario.textContent = `¡Hola, ${nombre}!`;
			if (correoUsuario) {
				correoUsuario.textContent = user.email || '';
				correoUsuario.classList.toggle('oculto', !user.email);
			}
			if (botonLogout) botonLogout.hidden = false;
			if (botonLogin) botonLogin.hidden = true;
			return;
		}

		if (nombreUsuario) nombreUsuario.textContent = '¡Bienvenido a RemisCL!';
		if (correoUsuario) {
			correoUsuario.textContent = '';
			correoUsuario.classList.add('oculto');
		}
		if (botonLogout) botonLogout.hidden = true;
		if (botonLogin) botonLogin.hidden = false;
	});

	botonLogin?.addEventListener('click', () => {
		window.location.href = 'login-cliente.html';
	});

	botonLogout?.addEventListener('click', async () => {
		try {
			await signOut(auth);
			window.location.reload();
		} catch (error) {
			console.error('Error cerrando sesión:', error);
		}
	});
});
