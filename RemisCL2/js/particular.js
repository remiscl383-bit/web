import { conectarEstadoUsuario } from './auth-simple.js';
import { db, collection, addDoc } from './conexion-db.js';
import { doc, getDoc, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

let usuarioActual = null;
let ubicacionGPS = null;

document.addEventListener('DOMContentLoaded', () => {
	const formulario = document.getElementById('form-particular');
	const botonUbicacion = document.getElementById('btn-ubicacion');
	if (!formulario) return;

	conectarEstadoUsuario((usuario) => {
		usuarioActual = usuario;
	});

	formulario.addEventListener('submit', enviarSolicitud);
	botonUbicacion?.addEventListener('click', usarUbicacionActual);
});

function usarUbicacionActual() {
	const boton = document.getElementById('btn-ubicacion');
	const mensaje = document.getElementById('mensaje-ubicacion');

	if (!navigator.geolocation) {
		mostrarMensaje(mensaje, 'Tu navegador no permite obtener la ubicación actual.');
		return;
	}

	boton.disabled = true;
	mostrarMensaje(mensaje, 'Obteniendo tu ubicación...');
	navigator.geolocation.getCurrentPosition((posicion) => {
		const { latitude, longitude, accuracy } = posicion.coords;
		ubicacionGPS = { latitud: latitude, longitud: longitude, precisionMetros: accuracy };
		mostrarMensaje(mensaje, 'Ubicación GPS agregada como dato extra del origen.');
		boton.disabled = false;
	}, () => {
		mostrarMensaje(mensaje, 'No se pudo obtener tu ubicación. Revisá los permisos del navegador.');
		boton.disabled = false;
	}, {
		enableHighAccuracy: true,
		timeout: 10000,
		maximumAge: 0
	});
}


async function tieneSolicitudActiva() {
	const consultaReservas = query(
		collection(db, 'reservas_salidas'),
		where('clienteId', '==', usuarioActual.uid)
	);
	const consultaPedidos = query(
		collection(db, 'viajes'),
		where('clienteId', '==', usuarioActual.uid)
	);
	const [snapshotReservas, snapshotPedidos] = await Promise.all([
		getDocs(consultaReservas),
		getDocs(consultaPedidos)
	]);
	const reservasActualizadas = snapshotReservas.docs.map((documento) => documento.data());
	const reservasActivas = reservasActualizadas.filter((reserva) =>
		['pendiente', 'aceptado', 'en_curso'].includes(normalizarEstado(reserva.estado))
	);
	const estadosSalidas = await Promise.all(reservasActivas.map(async (reserva) => {
		if (!reserva.salidaId) return '';
		const salida = await getDoc(doc(db, 'salidas_programadas', reserva.salidaId));
		return salida.exists() ? normalizarEstado(salida.data().estado) : '';
	}));
	if (estadosSalidas.some((estado) => estado !== 'finalizado')) return true;
	return snapshotPedidos.docs.some((documento) => {
		const pedido = documento.data();
		return normalizarEstado(pedido.tipo) === 'particular' &&
			['pendiente', 'aceptado', 'en_curso'].includes(normalizarEstado(pedido.estado));
	});
}

async function enviarSolicitud(event) {
	event.preventDefault();
	const formulario = event.currentTarget;
	const mensaje = document.getElementById('mensaje-confirmacion');

	if (mensaje) mensaje.textContent = '';
	if (!usuarioActual) {
		mostrarMensaje(mensaje, 'Iniciá sesión para poder realizar esta solicitud.');
		return;
	}
	if (await tieneSolicitudActiva()) {
		mostrarMensaje(mensaje, 'No podés solicitar otro viaje mientras tengas una reserva o solicitud activa.');
		return;
	}

	const datosSolicitud = {
		clienteId: usuarioActual.uid,
		tipo: 'particular',
		origen: document.getElementById('origen').value.trim(),
		ubicacionGPS,
		destino: document.getElementById('destino').value.trim(),
		fecha: document.getElementById('fecha').value,
		hora: document.getElementById('hora').value,
		pasajeros: document.getElementById('pasajeros').value,
		observaciones: document.getElementById('observaciones').value.trim() || 'Sin observaciones',
		estado: 'pendiente',
		fechaCreacion: new Date()
	};

	try {
		await addDoc(collection(db, 'viajes'), datosSolicitud);
		formulario.reset();
		ubicacionGPS = null;
		mostrarMensaje(document.getElementById('mensaje-ubicacion'), '');
		mostrarMensaje(mensaje, 'Solicitud enviada correctamente.');
	} catch (error) {
		console.error('Error guardando solicitud particular:', error);
		mostrarMensaje(mensaje, 'Ocurrió un error al enviar la solicitud. Intentá nuevamente.');
	}
}

function mostrarMensaje(elemento, texto) {
	if (elemento) elemento.textContent = texto;
}

function normalizarEstado(estado) {
	return (estado || '').toString().trim().toLowerCase();
}
