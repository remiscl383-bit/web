import { conectarEstadoUsuario } from './auth-simple.js';
import { db, collection, addDoc } from './conexion-db.js';
import { deleteDoc, doc, getDocs, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

let usuarioActual = null;
let publicacionActual = null;
let cancelarPublicacion;

document.addEventListener('DOMContentLoaded', () => {
	const formulario = document.getElementById('form-paqueteria');
	const botonPublicar = document.getElementById('btn-enviar-paquete');
	if (!formulario) return;

	conectarEstadoUsuario((usuario) => {
		usuarioActual = usuario;
		cancelarPublicacion?.();
		publicacionActual = null;
		if (usuario) escucharPublicacion(usuario.uid);
	});

	formulario.addEventListener('submit', enviarSolicitudPaqueteria);
	botonPublicar?.addEventListener('click', (event) => {
		if (publicacionActual) {
			event.preventDefault();
			retirarPublicacion();
		}
	});
});

function escucharPublicacion(clienteId) {
	const consulta = query(
		collection(db, 'viajes'),
		where('clienteId', '==', clienteId)
	);
	cancelarPublicacion = onSnapshot(consulta, (snapshot) => {
		const documento = snapshot.docs.find((docSnapshot) => {
			const datos = docSnapshot.data();
			return (datos.tipo || '').toString().toLowerCase() === 'paquetes' &&
				(datos.estado || '').toString().toLowerCase() === 'pendiente';
		});
		publicacionActual = documento ? { id: documento.id, ...documento.data() } : null;
		const campoOrigen = document.getElementById('paq-origen');
		const botonPublicar = document.getElementById('btn-enviar-paquete');
		if (publicacionActual) {
			campoOrigen.value = publicacionActual.origen || '';
			document.getElementById('paq-hora-retiro').value = publicacionActual.horaRetiro || '';
			campoOrigen.disabled = true;
			document.getElementById('paq-hora-retiro').disabled = true;
			botonPublicar.type = 'button';
			botonPublicar.textContent = 'Retirar publicación';
			botonPublicar.disabled = false;
			botonPublicar.classList.remove('btn-primary');
			botonPublicar.classList.add('btn-secondary');
		} else {
			campoOrigen.disabled = false;
			document.getElementById('paq-hora-retiro').disabled = false;
			botonPublicar.type = 'submit';
			botonPublicar.textContent = 'Hacer publicación';
			botonPublicar.disabled = false;
			botonPublicar.classList.remove('btn-secondary');
			botonPublicar.classList.add('btn-primary');
		}
	}, (error) => {
		console.error('Error escuchando publicación de paquetería:', error);
	});
}

async function enviarSolicitudPaqueteria(event) {
	event.preventDefault();
	const formulario = event.currentTarget;
	const mensaje = document.getElementById('mensaje-confirmacion');

	if (mensaje) mensaje.textContent = '';

	if (!usuarioActual) {
		mostrarMensaje(mensaje, 'Iniciá sesión para enviar una solicitud.');
		return;
	}

	const datosSolicitud = {
		clienteId: usuarioActual.uid,
		tipo: 'paquetes',
		origen: document.getElementById('paq-origen').value.trim(),
		horaRetiro: document.getElementById('paq-hora-retiro').value,
		estado: 'pendiente',
		fechaCreacion: new Date(),
		fechaVencimiento: new Date(Date.now() + 6 * 60 * 60 * 1000)
	};

	try {
		const botonPublicar = document.getElementById('btn-enviar-paquete');
		botonPublicar.disabled = true;
		await addDoc(collection(db, 'viajes'), datosSolicitud);
		mostrarMensaje(mensaje, 'Publicación realizada correctamente.');
	} catch (error) {
		console.error('Error guardando solicitud de paquetería:', error);
		mostrarMensaje(mensaje, 'No se pudo enviar la solicitud. Intentá nuevamente.');
	} finally {
		const botonPublicar = document.getElementById('btn-enviar-paquete');
		if (!publicacionActual) botonPublicar.disabled = false;
	}
}

async function retirarPublicacion() {
	const mensaje = document.getElementById('mensaje-confirmacion');
	if (!usuarioActual) {
		mostrarMensaje(mensaje, 'Iniciá sesión para retirar tu publicación.');
		return;
	}
	if (!window.confirm('¿Querés retirar tu publicación de paquetería?')) return;

	const boton = document.getElementById('btn-enviar-paquete');
	boton.disabled = true;
	try {
		const consulta = query(
			collection(db, 'viajes'),
			where('clienteId', '==', usuarioActual.uid)
		);
		const snapshot = await getDocs(consulta);
		const publicaciones = snapshot.docs
			.map((documento) => ({ id: documento.id, ...documento.data() }))
			.filter((publicacion) =>
				(publicacion.tipo || '').toString().toLowerCase() === 'paquetes' &&
				(publicacion.estado || '').toString().toLowerCase() === 'pendiente'
			)
			.sort((primera, segunda) => obtenerTiempo(segundo.fechaCreacion) - obtenerTiempo(primera.fechaCreacion));

		if (!publicaciones.length) {
			mostrarMensaje(mensaje, 'No tenés una publicación pendiente para retirar.');
			return;
		}

		await deleteDoc(doc(db, 'viajes', publicaciones[0].id));
		mostrarMensaje(mensaje, 'Publicación retirada correctamente.');
	} catch (error) {
		console.error('Error retirando publicación de paquetería:', error);
		mostrarMensaje(mensaje, 'No se pudo retirar la publicación. Intentá nuevamente.');
	} finally {
		boton.disabled = false;
	}
}

function obtenerTiempo(fecha) {
	if (fecha?.toDate) return fecha.toDate().getTime();
	return fecha ? new Date(fecha).getTime() || 0 : 0;
}

function mostrarMensaje(elemento, texto) {
	if (elemento) elemento.textContent = texto;
}
