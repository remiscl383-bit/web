import { auth } from './conexion-db.js';
import { signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

const mensajesError = {
	'invalid-credential': 'El correo o la contraseña son incorrectos.',
	'invalid-email': 'Ingresá un correo electrónico válido.',
	'user-disabled': 'Esta cuenta está deshabilitada.',
	'too-many-requests': 'Demasiados intentos. Probá nuevamente más tarde.'
};

document.addEventListener('DOMContentLoaded', () => {
	const formulario = document.getElementById('form-login-cliente');
	if (!formulario) return;

	const emailInput = document.getElementById('email');
	const passwordInput = document.getElementById('password');
	const mensajeError = document.getElementById('mensaje-error');

	formulario.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (mensajeError) mensajeError.textContent = '';

		try {
			await signInWithEmailAndPassword(
				auth,
				emailInput.value.trim(),
				passwordInput.value
			);
			window.location.href = 'inicio.html';
		} catch (error) {
			if (mensajeError) {
				const codigo = error.code?.replace('auth/', '');
				mensajeError.textContent = mensajesError[codigo] || 'No se pudo iniciar sesión. Intentá nuevamente.';
			}
		}
	});
});
