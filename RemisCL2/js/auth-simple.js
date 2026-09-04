import { auth } from "./conexion-db.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export function conectarEstadoUsuario(alCambiarEstado) {
	onAuthStateChanged(auth, (user) => {
		document.querySelectorAll(".btn-accion").forEach((boton) => {
			if (user) {
				boton.classList.remove("btn-deshabilitado");
			} else {
				boton.classList.add("btn-deshabilitado");
			}
		});

		if (user) {
			alCambiarEstado(user);
		} else {
			alCambiarEstado(null);
		}
	});
}

document.addEventListener("click", (event) => {
	const botonDeshabilitado = event.target.closest(".btn-deshabilitado");
	if (!botonDeshabilitado) return;

	event.preventDefault();
	event.stopPropagation();
	alert("Iniciá sesión para realizar esta acción.");
}, true);
