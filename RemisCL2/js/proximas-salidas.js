import { conectarEstadoUsuario } from './auth-simple.js';
import { db, collection, addDoc, onSnapshot } from './conexion-db.js';
import {
	doc,
	getDoc,
	query
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

let usuarioActual = null;
let salidaSeleccionada = null;
let botonSeleccionado = null;
let salidasActuales = [];
let reservasActuales = [];
let salidasPorId = new Map();
let cancelarSalidas;
let cancelarReservas;
const choferesCache = new Map();

document.addEventListener('DOMContentLoaded', () => {
	conectarEstadoUsuario((usuario) => {
		usuarioActual = usuario;
		iniciarEscuchas();
	});
});

function iniciarEscuchas() {
	const contenedor = document.querySelector('#contenedor-salidas, #lista-salidas');
	if (!contenedor) return;
	if (cancelarSalidas) return;

	const consulta = query(collection(db, 'salidas_programadas'));
	cancelarSalidas = onSnapshot(consulta, (resultado) => {
		const salidas = resultado.docs.map((documento) => ({
			id: documento.id,
			...documento.data()
		}));
		salidasPorId = new Map(salidas.map((salida) => [salida.id, salida]));
		salidasActuales = salidas.filter((salida) =>
			['activa', 'en_curso'].includes(normalizarEstado(salida.estado))
		);
		renderizarSalidas(salidasActuales, contenedor);
	}, (error) => {
		console.error('Error cargando salidas programadas:', error);
		contenedor.textContent = 'No se pudieron cargar las salidas. Intentá nuevamente.';
	});

	cancelarReservas = onSnapshot(collection(db, 'reservas_salidas'), (resultado) => {
		reservasActuales = resultado.docs.map((documento) => documento.data());
		renderizarSalidas(salidasActuales, contenedor);
	}, (error) => {
		console.error('Error escuchando reservas:', error);
	});
}

async function renderizarSalidas(salidas, contenedor) {
	contenedor.innerHTML = '';

	if (salidas.length === 0) {
		contenedor.textContent = 'No hay salidas programadas en este momento.';
		return;
	}

	const salidasConChofer = await Promise.all(salidas.map(async (salida) => ({
		salida,
		datosChofer: await obtenerDatosChofer(salida.choferId)
	})));

	let cantidadSalidasDisponibles = 0;
	salidasConChofer.forEach(({ salida, datosChofer }) => {
		if (normalizarEstado(salida.estado) !== 'activa') return;
		const asientosOfrecidos = Number(salida.asientosDisponibles ?? salida.asientos ?? 0);
		const asientosReservados = reservasActuales
			.filter((reserva) => reserva.salidaId === salida.id && normalizarEstado(reserva.estado) !== 'cancelada')
			.reduce((total, reserva) => total + Number(reserva.asientos || 1), 0);
		const asientosDisponibles = Math.max(0, asientosOfrecidos - asientosReservados);
		if (asientosDisponibles === 0) return;
		cantidadSalidasDisponibles += 1;
		const yaReservado = reservasActuales.some((reserva) =>
			reserva.salidaId === salida.id &&
			reserva.clienteId === usuarioActual?.uid &&
			reservaActiva(reserva)
		);
		const tieneOtraReserva = reservasActuales.some((reserva) =>
			reserva.salidaId !== salida.id &&
			reserva.clienteId === usuarioActual?.uid &&
			reservaActiva(reserva)
		);
		const tarjeta = document.createElement('article');
		tarjeta.className = 'tarjeta-salida';
		tarjeta.innerHTML = `
			<h3 class="salida-ruta"></h3>
			<p>Chofer: <span class="salida-chofer"></span></p>
			<p>Fecha/Hora: <span class="salida-fecha-hora"></span></p>
			<p>Asientos disponibles: <span class="salida-asientos"></span></p>
			<p>Precio: <span class="salida-precio"></span></p>
			<button type="button" class="btn btn-primary btn-accion">
				Reservar Asiento
			</button>
		`;

		tarjeta.querySelector('.salida-ruta').textContent =
			`${salida.origen || ''} -> ${salida.destino || ''}`;
		tarjeta.querySelector('.salida-chofer').textContent = obtenerNombreChofer(datosChofer);
		tarjeta.querySelector('.salida-fecha-hora').textContent =
			salida.fechaHora || `${salida.fecha || ''} ${salida.hora || salida.horario || ''}`.trim();
		tarjeta.querySelector('.salida-asientos').textContent =
			`${asientosDisponibles} de ${asientosOfrecidos}`;
		tarjeta.querySelector('.salida-precio').textContent = salida.precio ?? 'No informado';

		const botonReserva = tarjeta.querySelector('.btn-accion');
		if (!usuarioActual) botonReserva.classList.add('btn-deshabilitado');
		if (yaReservado) {
			botonReserva.classList.add('reserva-confirmada');
			botonReserva.disabled = true;
			botonReserva.textContent = 'Reservado';
		} else if (tieneOtraReserva) {
			botonReserva.disabled = true;
			botonReserva.textContent = 'Ya tenés una reserva activa';
		}
		salida.asientosDisponiblesReales = asientosDisponibles;
		botonReserva.addEventListener('click', () => abrirModalReserva(salida, botonReserva));
		contenedor.appendChild(tarjeta);
	});

	if (cantidadSalidasDisponibles === 0) {
		const hayViajesEnCurso = salidas.some((salida) => normalizarEstado(salida.estado) === 'en_curso');
		const haySalidasCompletas = salidas.some((salida) => normalizarEstado(salida.estado) === 'activa');
		contenedor.textContent = hayViajesEnCurso || haySalidasCompletas
			? 'Todos los viajes programados ya están reservados o se encuentran en curso.'
			: 'No hay salidas disponibles en este momento.';
	}
}

async function obtenerDatosChofer(choferId) {
	if (!choferId) return null;
	if (choferesCache.has(choferId)) return choferesCache.get(choferId);

	try {
		const documento = await getDoc(doc(db, 'usuarios', choferId));
		const datos = documento.exists() ? documento.data() : null;
		choferesCache.set(choferId, datos);
		return datos;
	} catch (error) {
		console.error('Error cargando datos del chofer:', error);
		return null;
	}
}

function obtenerNombreChofer(datosChofer) {
	if (!datosChofer) return 'Chofer no informado';
	return [datosChofer.nombre, datosChofer.apellido]
		.filter(Boolean)
		.join(' ') || datosChofer.email || 'Chofer no informado';
}

function abrirModalReserva(salida, botonReserva) {
	if (botonReserva.disabled || botonReserva.classList.contains('btn-deshabilitado') || !usuarioActual) return;
	if (reservasActuales.some((reserva) => reserva.clienteId === usuarioActual.uid && reservaActiva(reserva))) {
		alert('Ya tenés una reserva activa. Esperá a que finalice antes de reservar otro viaje.');
		return;
	}

	salidaSeleccionada = salida;
	botonSeleccionado = botonReserva;
	const maximo = Number(salida.asientosDisponiblesReales || 0);
	if (maximo < 1) return;
	const cantidad = document.getElementById('cantidad-asientos');
	cantidad.max = maximo;
	cantidad.value = 1;
	document.getElementById('detalle-modal-reserva').textContent =
		`${salida.origen || ''} -> ${salida.destino || ''} | Hasta ${maximo} asiento${maximo === 1 ? '' : 's'}`;
	actualizarTotalReserva();
	document.getElementById('modal-reserva-salida').classList.remove('oculto');
	cantidad.focus();
}

function cerrarModalReserva() {
	document.getElementById('modal-reserva-salida')?.classList.add('oculto');
	salidaSeleccionada = null;
	botonSeleccionado = null;
}

function actualizarTotalReserva() {
	if (!salidaSeleccionada) return;
	const cantidad = Number(document.getElementById('cantidad-asientos').value) || 1;
	const precio = Number(salidaSeleccionada.precio) || 0;
	document.getElementById('total-reserva').textContent = `Total: $${(precio * cantidad).toLocaleString('es-AR')}`;
}

async function reservarAsiento() {
	if (!salidaSeleccionada || !botonSeleccionado || !usuarioActual) return;
	if (reservasActuales.some((reserva) => reserva.clienteId === usuarioActual.uid && reservaActiva(reserva))) {
		cerrarModalReserva();
		alert('Ya tenés una reserva activa. Esperá a que finalice antes de reservar otro viaje.');
		return;
	}

	const cantidad = Number(document.getElementById('cantidad-asientos').value);
	const maximo = Number(document.getElementById('cantidad-asientos').max);
	if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > maximo) {
		alert(`Elegí entre 1 y ${maximo} asientos.`);
		return;
	}

	botonSeleccionado.disabled = true;
	try {
		await addDoc(collection(db, 'reservas_salidas'), {
			salidaId: salidaSeleccionada.id,
			choferId: salidaSeleccionada.choferId || '',
			clienteId: usuarioActual.uid,
			origen: salidaSeleccionada.origen || '',
			destino: salidaSeleccionada.destino || '',
			fechaHora: salidaSeleccionada.fechaHora || `${salidaSeleccionada.fecha || ''} ${salidaSeleccionada.hora || salidaSeleccionada.horario || ''}`.trim(),
			asientos: cantidad,
			precioUnitario: Number(salidaSeleccionada.precio) || 0,
			precioTotal: (Number(salidaSeleccionada.precio) || 0) * cantidad,
			estado: 'pendiente',
			fechaCreacion: new Date()
		});

		botonSeleccionado.textContent = 'Reservado';
		botonSeleccionado.classList.add('reserva-confirmada');
		botonSeleccionado.disabled = true;
		cerrarModalReserva();
		alert('¡Reserva solicitada con éxito!');
	} catch (error) {
		console.error('Error guardando la reserva:', error);
		botonSeleccionado.disabled = false;
		alert('No se pudo guardar la reserva. Intentá nuevamente.');
	}
}

function reservaActiva(reserva) {
	const estadoSalida = normalizarEstado(salidasPorId.get(reserva.salidaId)?.estado);
	if (estadoSalida === 'finalizado') return false;
	return ['pendiente', 'en_curso'].includes(normalizarEstado(reserva.estado));
}

function normalizarEstado(estado) {
	return (estado || '').toString().trim().toLowerCase();
}

document.addEventListener('DOMContentLoaded', () => {
	document.getElementById('cantidad-asientos')?.addEventListener('input', actualizarTotalReserva);
	document.getElementById('confirmar-reserva')?.addEventListener('click', reservarAsiento);
	document.getElementById('cerrar-modal-reserva')?.addEventListener('click', cerrarModalReserva);
	document.getElementById('cancelar-modal-reserva')?.addEventListener('click', cerrarModalReserva);
});
