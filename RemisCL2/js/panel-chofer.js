import { auth, db } from './conexion-db.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, runTransaction, where } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

let choferActual = null;
let salidas = [];
let reservas = [];
let cancelarPedidos;
let intervaloLimpiezaPaquetes;
const clientesCache = new Map();

document.addEventListener('DOMContentLoaded', () => {
  configurarBotonesDeSeccion();
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'login-chofer.html';
  });

  onAuthStateChanged(auth, (usuario) => {
    if (!usuario) {
      window.location.href = 'login-chofer.html';
      return;
    }

    choferActual = usuario;
    document.getElementById('nombre-chofer').textContent = usuario.email || 'Chofer';
    escucharSalidas();
    escucharReservas();
    escucharPedidos();
  });
});

function configurarBotonesDeSeccion() {
  document.querySelectorAll('.btn-desplazar').forEach((boton) => {
    boton.addEventListener('click', () => {
      const contenido = document.getElementById(boton.dataset.target);
      if (!contenido) return;
      const estaVisible = boton.getAttribute('aria-expanded') === 'true';
      contenido.hidden = estaVisible;
      boton.setAttribute('aria-expanded', String(!estaVisible));
      boton.textContent = estaVisible ? '↑' : '↓';
      boton.setAttribute('aria-label', estaVisible ? 'Expandir sección' : 'Contraer sección');
    });
  });
}

function actualizarContador(id, cantidad) {
  const contador = document.getElementById(id);
  if (!contador) return;
  contador.textContent = cantidad;
  contador.hidden = cantidad === 0;
  const boton = contador.closest('.seccion-heading')?.querySelector('.btn-desplazar');
  if (boton) boton.hidden = cantidad === 0;
}

function escucharSalidas() {
  const consulta = query(collection(db, 'salidas_programadas'), where('choferId', '==', choferActual.uid));
  onSnapshot(consulta, (snapshot) => {
    salidas = snapshot.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
    renderizarSalidas();
    renderizarHistorialSalidas();
  }, mostrarError('lista-salidas', 'No se pudieron cargar tus salidas.'));
}

function escucharReservas() {
  const consulta = query(collection(db, 'reservas_salidas'), where('choferId', '==', choferActual.uid));
  onSnapshot(consulta, (snapshot) => {
    reservas = snapshot.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
    renderizarSalidas();
  }, () => {
    reservas = [];
    renderizarSalidas();
  });
}

function escucharPedidos() {
  cancelarPedidos?.();
  clearInterval(intervaloLimpiezaPaquetes);
  intervaloLimpiezaPaquetes = setInterval(limpiarPaquetesDeFirestore, 60 * 1000);
  const consulta = query(collection(db, 'viajes'));
  cancelarPedidos = onSnapshot(consulta, async (snapshot) => {
    const pedidos = snapshot.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
    await limpiarPaquetesVencidos(pedidos);
    const pedidosVigentes = pedidos.filter((pedido) => !esPaqueteVencido(pedido));
    const pedidosParticulares = pedidosVigentes.filter((pedido) => normalizarEstado(pedido.tipo) === 'particular');
    const pedidosPaquetes = pedidosVigentes.filter((pedido) => normalizarEstado(pedido.tipo) === 'paquetes');
    const pedidosPendientes = pedidosParticulares.filter((pedido) => normalizarEstado(pedido.estado) === 'pendiente');
    const paquetesPendientes = pedidosPaquetes.filter((pedido) => normalizarEstado(pedido.estado) === 'pendiente');
    const pedidosAceptados = pedidosParticulares.filter((pedido) =>
      pedido.choferId === choferActual.uid && normalizarEstado(pedido.estado) === 'aceptado'
    );
    const enCurso = pedidosParticulares.filter((pedido) =>
      pedido.choferId === choferActual.uid && normalizarEstado(pedido.estado) === 'en_curso'
    );
    const paquetesEnCurso = pedidosPaquetes.filter((pedido) =>
      pedido.choferId === choferActual.uid && normalizarEstado(pedido.estado) === 'en_curso'
    );
    const historial = pedidosParticulares.filter((pedido) =>
      pedido.choferId === choferActual.uid && normalizarEstado(pedido.estado) === 'finalizado'
    );
    await renderizarPedidos([...pedidosPendientes, ...pedidosAceptados]);
    await renderizarPedidos(
      paquetesPendientes,
      'lista-paquetes',
      'No hay solicitudes de paquetería pendientes.'
    );
    await renderizarEnCurso(enCurso);
    renderizarHistorial(historial);
  }, mostrarError('lista-pedidos-particulares', 'No se pudieron cargar los pedidos.'));
}

async function limpiarPaquetesDeFirestore() {
  try {
    const snapshot = await getDocs(query(collection(db, 'viajes'), where('tipo', '==', 'paquetes')));
    const paquetes = snapshot.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
    await limpiarPaquetesVencidos(paquetes);
  } catch (error) {
    console.error('No se pudieron revisar los paquetes vencidos:', error);
  }
}

async function limpiarPaquetesVencidos(pedidos) {
  await Promise.all(pedidos
    .filter((pedido) => esPaqueteVencido(pedido))
    .map((pedido) => deleteDoc(doc(db, 'viajes', pedido.id)).catch((error) => {
      console.error('No se pudo eliminar un paquete vencido:', error);
    })));
}

function esPaqueteVencido(pedido) {
  if (normalizarEstado(pedido.tipo) !== 'paquetes' || !pedido.fechaVencimiento) return false;
  const fecha = pedido.fechaVencimiento.toDate
    ? pedido.fechaVencimiento.toDate()
    : new Date(pedido.fechaVencimiento);
  return !Number.isNaN(fecha.getTime()) && fecha.getTime() <= Date.now();
}

async function renderizarSalidas() {
  const contenedor = document.getElementById('lista-salidas');
  if (!contenedor) return;
  contenedor.innerHTML = '';

  const salidasActivas = salidas.filter((salida) =>
    ['activa', 'en_curso'].includes(normalizarEstado(salida.estado))
  );
  actualizarContador('contador-salidas', salidasActivas.length);
  if (!salidasActivas.length) {
    contenedor.textContent = 'Todavía no publicaste salidas.';
    return;
  }

  const salidasConReservas = await Promise.all(salidasActivas.map(async (salida) => ({
    salida,
    reservas: await cargarReservasDeSalida(salida.id)
  })));

  salidasConReservas.forEach(({ salida, reservas: reservasSalida }) => {
    const reservados = reservasSalida.reduce((total, reserva) => total + Number(reserva.asientos || 1), 0);
    const disponibles = Math.max(0, Number(salida.asientosDisponibles || 0) - reservados);
    const tarjeta = document.createElement('article');
    tarjeta.className = 'tarjeta-panel';
    tarjeta.innerHTML = `
      <h3></h3>
      <p>Fecha y hora: <strong></strong></p>
      <p>Asientos: <strong class="asientos"></strong></p>
      <p>Precio: <strong class="precio"></strong></p>
      <span class="estado-salida"></span>
      <div class="reservas-de-salida"></div>
      <div class="acciones-salida"></div>
    `;
    tarjeta.querySelector('h3').textContent = `${salida.origen || ''} -> ${salida.destino || ''}`;
    tarjeta.querySelector('p strong').textContent = salida.fechaHora || '';
    tarjeta.querySelector('.asientos').textContent = `${disponibles} disponibles de ${salida.asientosDisponibles || 0}`;
    tarjeta.querySelector('.precio').textContent = `$${salida.precio ?? 0}`;
    const estadoSalida = normalizarEstado(salida.estado);
    const etiquetaEstado = estadoSalida === 'en_curso'
      ? 'En curso'
      : estadoSalida === 'finalizado'
        ? 'Finalizado'
        : disponibles ? 'Activa' : 'Completa';
    tarjeta.querySelector('.estado-salida').textContent = etiquetaEstado;
    tarjeta.querySelector('.estado-salida').classList.toggle('completa', !disponibles);
    tarjeta.querySelector('.estado-salida').classList.toggle('en-curso', estadoSalida === 'en_curso');
    const accionesSalida = tarjeta.querySelector('.acciones-salida');
    if ((estadoSalida === 'activa' && reservasSalida.length > 0) || estadoSalida === 'en_curso') {
      const botonEstado = document.createElement('button');
      botonEstado.type = 'button';
      botonEstado.className = `btn ${estadoSalida === 'activa' ? 'btn-principal' : 'btn-exito'}`;
      botonEstado.textContent = estadoSalida === 'activa' ? 'Comenzar viaje' : 'Finalizar viaje (solo si se llegó a destino)';
      botonEstado.addEventListener('click', () => actualizarEstadoSalida(salida.id, estadoSalida, botonEstado));
      accionesSalida.appendChild(botonEstado);
    }
    if (estadoSalida === 'activa' && reservasSalida.length === 0) {
      const botonEliminar = document.createElement('button');
      botonEliminar.type = 'button';
      botonEliminar.className = 'btn btn-peligro';
      botonEliminar.textContent = 'Eliminar publicación de viaje';
      botonEliminar.addEventListener('click', () => eliminarPublicacionSalida(salida.id, botonEliminar));
      accionesSalida.appendChild(botonEliminar);
    }
    const listaClientes = tarjeta.querySelector('.reservas-de-salida');
    listaClientes.textContent = reservasSalida.length ? 'Clientes reservados' : 'Todavía no hay clientes reservados.';
    reservasSalida.forEach((reserva) => {
      listaClientes.appendChild(crearClienteReserva(reserva));
    });
    contenedor.appendChild(tarjeta);
  });
}

async function renderizarHistorialSalidas() {
  const contenedor = document.getElementById('lista-historial-salidas');
  if (!contenedor) return;
  const salidasFinalizadas = salidas.filter((salida) => normalizarEstado(salida.estado) === 'finalizado');
  actualizarContador('contador-historial', salidasFinalizadas.length);
  contenedor.innerHTML = '';

  if (!salidasFinalizadas.length) {
    contenedor.textContent = 'Todavía no hay salidas finalizadas.';
    actualizarContadorHistorial();
    return;
  }

  const salidasConReservas = await Promise.all(salidasFinalizadas.map(async (salida) => ({
    salida,
    reservas: await cargarReservasDeSalida(salida.id)
  })));

  salidasConReservas.forEach(({ salida, reservas: reservasSalida }) => {
    const tarjeta = document.createElement('article');
    tarjeta.className = 'tarjeta-panel salida-historial';
    tarjeta.innerHTML = `
      <h3></h3>
      <p>Fecha y hora: <strong></strong></p>
      <p>Asientos reservados: <strong></strong></p>
      <span class="estado-salida">Finalizado</span>
    `;
    tarjeta.querySelector('h3').textContent = `${salida.origen || ''} -> ${salida.destino || ''}`;
    tarjeta.querySelector('p strong').textContent = salida.fechaHora || '';
    tarjeta.querySelectorAll('p strong')[1].textContent = reservasSalida.reduce(
      (total, reserva) => total + Number(reserva.asientos || 1), 0
    );
    contenedor.appendChild(tarjeta);
  });
  actualizarContadorHistorial();
}

async function actualizarEstadoSalida(idSalida, estadoActual, boton) {
  const estadoSiguiente = estadoActual === 'activa' ? 'en_curso' : 'finalizado';
  boton.disabled = true;

  try {
    await runTransaction(db, async (transaccion) => {
      const referencia = doc(db, 'salidas_programadas', idSalida);
      const salida = await transaccion.get(referencia);
      const datos = salida.data() || {};
      if (!salida.exists() || datos.choferId !== choferActual.uid || normalizarEstado(datos.estado) !== estadoActual) {
        throw new Error('SALIDA_NO_DISPONIBLE');
      }
      const reservasSalida = await transaccion.get(query(
        collection(db, 'reservas_salidas'),
        where('salidaId', '==', idSalida)
      ));
      transaccion.update(referencia, {
        estado: estadoSiguiente,
        [`fecha${estadoSiguiente === 'en_curso' ? 'Inicio' : 'Finalizacion'}`]: new Date()
      });
      reservasSalida.forEach((reserva) => {
        if (normalizarEstado(reserva.data().estado) !== 'cancelada') {
          transaccion.update(reserva.ref, { estado: estadoSiguiente });
        }
      });
    });
  } catch (error) {
    boton.disabled = false;
    if (error.message === 'SALIDA_NO_DISPONIBLE') {
      alert('El estado de esta salida cambió. Actualizá la página para continuar.');
      return;
    }
    console.error('Error actualizando la salida:', error);
    alert(error.code === 'permission-denied'
      ? 'Firebase rechazó el cambio de estado. Revisá las reglas de permisos de salidas_programadas y reservas_salidas.'
      : 'No se pudo actualizar el estado del viaje. Intentá nuevamente.');
  }
}

async function eliminarPublicacionSalida(idSalida, boton) {
  if (!window.confirm('¿Querés eliminar esta publicación de viaje?')) return;
  boton.disabled = true;

  try {
    const referencia = doc(db, 'salidas_programadas', idSalida);
    const salida = await getDoc(referencia);
    if (!salida.exists() || salida.data().choferId !== choferActual.uid ||
      normalizarEstado(salida.data().estado) !== 'activa') {
        throw new Error('SALIDA_NO_DISPONIBLE');
    }

    const reservasSalida = await getDocs(query(
      collection(db, 'reservas_salidas'),
      where('salidaId', '==', idSalida)
    ));
    const tieneClientes = reservasSalida.docs.some((reserva) =>
      normalizarEstado(reserva.data().estado) !== 'cancelada'
    );
    if (tieneClientes) throw new Error('SALIDA_CON_RESERVAS');
    await deleteDoc(referencia);
  } catch (error) {
    boton.disabled = false;
    if (error.message === 'SALIDA_CON_RESERVAS') {
      alert('No se puede eliminar la publicación porque ya tiene un cliente reservado.');
      return;
    }
    if (error.message === 'SALIDA_NO_DISPONIBLE') {
      alert('La publicación ya no está disponible para eliminar.');
      return;
    }
    console.error('Error eliminando publicación:', error);
    alert(error.code === 'permission-denied'
      ? 'No tenés permisos para eliminar esta publicación. Revisá las reglas de Firestore.'
      : 'No se pudo eliminar la publicación. Intentá nuevamente.');
  }
}

async function cargarReservasDeSalida(salidaId) {
  return Promise.all(reservas
    .filter((reserva) => reserva.salidaId === salidaId && normalizarEstado(reserva.estado) !== 'cancelada')
    .map(async (reserva) => ({
      ...reserva,
      datosCliente: await obtenerDatosCliente(reserva.clienteId)
    })));
}

async function obtenerDatosCliente(clienteId) {
  if (!clienteId) return null;
  if (clientesCache.has(clienteId)) return clientesCache.get(clienteId);
  const documento = await getDoc(doc(db, 'usuarios', clienteId));
  const datos = documento.exists() ? documento.data() : null;
  clientesCache.set(clienteId, datos);
  return datos;
}

function crearClienteReserva(reserva) {
  const datos = reserva.datosCliente || {};
  const nombre = [datos.nombre || reserva.nombre, datos.apellido || reserva.apellido]
    .filter(Boolean).join(' ') || 'Cliente no informado';
  const telefono = datos.telefono || datos.celular || datos.whatsapp || reserva.telefono || '';
  const cliente = document.createElement('div');
  cliente.className = 'cliente-reserva';

  const texto = document.createElement('span');
  texto.textContent = `${nombre} - ${reserva.asientos || 1} asiento${Number(reserva.asientos || 1) === 1 ? '' : 's'}`;
  cliente.appendChild(texto);

  if (telefono) {
    const whatsapp = document.createElement('a');
    whatsapp.className = 'btn btn-whatsapp';
    whatsapp.href = `https://wa.me/${telefono.replace(/\D/g, '')}`;
    whatsapp.target = '_blank';
    whatsapp.rel = 'noopener';
    whatsapp.textContent = 'WhatsApp';
    cliente.appendChild(whatsapp);
  }

  if (reserva.cancelacionSolicitada) {
    const solicitud = document.createElement('div');
    solicitud.className = 'solicitud-cancelacion';
    solicitud.textContent = 'Solicito cancelar viaje';

    const acciones = document.createElement('div');
    acciones.className = 'acciones-cancelacion';
    ['Aprobar', 'Denegar'].forEach((textoBoton) => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = `btn ${textoBoton === 'Aprobar' ? 'btn-exito' : 'btn-peligro'}`;
      boton.textContent = textoBoton;
      boton.addEventListener('click', () => resolverCancelacion(reserva.id, textoBoton === 'Aprobar', boton));
      acciones.appendChild(boton);
    });
    solicitud.appendChild(acciones);
    cliente.appendChild(solicitud);
  }

  return cliente;
}

async function resolverCancelacion(idReserva, aprobar, boton) {
  boton.disabled = true;
  try {
    await runTransaction(db, async (transaccion) => {
      const referencia = doc(db, 'reservas_salidas', idReserva);
      const reserva = await transaccion.get(referencia);
      const datos = reserva.data() || {};
      if (!reserva.exists() || datos.choferId !== choferActual.uid || !datos.cancelacionSolicitada) {
        throw new Error('CANCELACION_NO_DISPONIBLE');
      }
      transaccion.update(referencia, {
        cancelacionSolicitada: false,
        cancelacionResuelta: aprobar,
        cancelacionDenegada: !aprobar,
        estado: aprobar ? 'cancelada' : datos.estado,
        fechaResolucionCancelacion: new Date()
      });
    });
  } catch (error) {
    boton.disabled = false;
    if (error.message === 'CANCELACION_NO_DISPONIBLE') return;
    console.error('Error resolviendo cancelación:', error);
    alert('No se pudo resolver la solicitud de cancelación.');
  }
}

async function renderizarPedidos(pedidos, idContenedor = 'lista-pedidos-particulares', mensajeVacio = 'No hay pedidos particulares pendientes.') {
  const pedidosConCliente = await cargarDatosClientes(pedidos);
  const contenedor = document.getElementById(idContenedor);
  if (!contenedor) return;
  contenedor.innerHTML = '';
  if (!pedidosConCliente.length) {
    contenedor.textContent = mensajeVacio;
    actualizarContador(idContenedor === 'lista-paquetes' ? 'contador-paquetes' : 'contador-pedidos', 0);
    return;
  }

  actualizarContador(idContenedor === 'lista-paquetes' ? 'contador-paquetes' : 'contador-pedidos', pedidosConCliente.length);

  pedidosConCliente.forEach((pedido) => {
    const datosCliente = pedido.datosCliente || {};
    const nombre = [datosCliente.nombre || pedido.nombre, datosCliente.apellido || pedido.apellido]
      .filter(Boolean).join(' ') || 'Cliente';
    const telefono = datosCliente.telefono || datosCliente.celular || datosCliente.whatsapp || pedido.telefono || '';
    const tarjeta = crearTarjetaPedido(pedido, nombre, telefono, true);
    if (normalizarEstado(pedido.estado) === 'en_curso') {
      const botonTerminar = document.createElement('button');
      botonTerminar.type = 'button';
      botonTerminar.className = 'btn btn-exito';
      botonTerminar.textContent = 'Finalizar envío';
      botonTerminar.addEventListener('click', () => terminarViaje(pedido.id, botonTerminar));
      tarjeta.querySelector('.acciones-pedido').appendChild(botonTerminar);
    }
    contenedor.appendChild(tarjeta);
  });
}

async function renderizarEnCurso(pedidos) {
  const pedidosConCliente = await cargarDatosClientes(pedidos);
  const contenedor = document.getElementById('lista-en-curso');
  if (!contenedor) return;
  contenedor.innerHTML = '';
  if (!pedidosConCliente.length) {
    contenedor.textContent = 'No tenés viajes en curso.';
    actualizarContador('contador-en-curso', 0);
    return;
  }
  actualizarContador('contador-en-curso', pedidosConCliente.length);

  pedidosConCliente.forEach((pedido) => {
    const datosCliente = pedido.datosCliente || {};
    const nombre = [datosCliente.nombre || pedido.nombre, datosCliente.apellido || pedido.apellido]
      .filter(Boolean).join(' ') || 'Cliente';
    const telefono = datosCliente.telefono || datosCliente.celular || datosCliente.whatsapp || pedido.telefono || '';
    const tarjeta = crearTarjetaPedido(pedido, nombre, telefono, false);
    const botonTerminar = document.createElement('button');
    botonTerminar.type = 'button';
    botonTerminar.className = 'btn btn-exito';
    botonTerminar.textContent = 'Viaje terminado';
    botonTerminar.addEventListener('click', () => terminarViaje(pedido.id, botonTerminar));
    tarjeta.querySelector('.acciones-pedido').appendChild(botonTerminar);
    contenedor.appendChild(tarjeta);
  });
}

async function cargarDatosClientes(pedidos) {
  return Promise.all(pedidos.map(async (pedido) => {
    if (!pedido.clienteId) return pedido;
    const usuario = await getDoc(doc(db, 'usuarios', pedido.clienteId));
    return usuario.exists() ? { ...pedido, datosCliente: usuario.data() } : pedido;
  }));
}

function renderizarHistorial(historial) {
  renderizarLista('lista-historial', historial, 'Todavía no hay pedidos en el historial.');
  actualizarContadorHistorial();
}

function actualizarContadorHistorial() {
  const pedidos = document.querySelectorAll('#lista-historial > .tarjeta-panel').length;
  const salidas = document.querySelectorAll('#lista-historial-salidas > .tarjeta-panel').length;
  actualizarContador('contador-historial', pedidos + salidas);
}

function renderizarLista(id, elementos, vacio) {
  const contenedor = document.getElementById(id);
  if (!contenedor) return;
  contenedor.innerHTML = '';
  if (!elementos.length) {
    contenedor.textContent = vacio;
    return;
  }

  elementos.forEach((elemento) => {
    const tarjeta = document.createElement('article');
    tarjeta.className = 'tarjeta-panel';
    tarjeta.innerHTML = `
      <h3></h3>
      <p class="detalle-trayecto"></p>
      <p>Pasajeros: <strong></strong></p>
      <span class="estado-salida"></span>
    `;
    tarjeta.querySelector('h3').textContent = elemento.clienteNombre || elemento.nombre || 'Cliente';
    tarjeta.querySelector('.detalle-trayecto').textContent = `${elemento.origen || ''} -> ${elemento.destino || ''}`;
    tarjeta.querySelector('p strong').textContent = elemento.pasajeros || 'No informado';
    tarjeta.querySelector('.estado-salida').textContent = elemento.estado || 'pendiente';
    contenedor.appendChild(tarjeta);
  });
}

function crearTarjetaPedido(pedido, nombre, telefono, permiteTomar) {
  const esPaqueteria = normalizarEstado(pedido.tipo) === 'paquetes';
  const tarjeta = document.createElement('article');
  tarjeta.className = 'tarjeta-panel pedido-panel';
  tarjeta.innerHTML = esPaqueteria
    ? `
      <p class="detalle-trayecto">Localidad o barrio de retiro: <strong></strong></p>
      <p>Hora de retiro: <strong class="fecha-pedido"></strong></p>
      <div class="acciones-pedido"></div>
    `
    : `
      <h3></h3>
      <p class="detalle-trayecto"></p>
      <p>Fecha y hora: <strong class="fecha-pedido"></strong></p>
      <p class="detalle-paquete"></p>
      <p class="pasajeros-linea">Pasajeros: <strong class="pasajeros-pedido"></strong></p>
      <p>Teléfono: <strong class="telefono-pedido"></strong></p>
      <div class="acciones-pedido"></div>
    `;
  if (esPaqueteria) {
    tarjeta.querySelector('.detalle-trayecto strong').textContent = pedido.origen || 'No informado';
    tarjeta.querySelector('.fecha-pedido').textContent = pedido.horaRetiro || 'A coordinar';
  } else {
    tarjeta.querySelector('h3').textContent = nombre;
    tarjeta.querySelector('.detalle-trayecto').textContent = `${pedido.origen || ''} -> ${pedido.destino || ''}`;
    tarjeta.querySelector('.fecha-pedido').textContent = `${pedido.fecha || ''} ${pedido.hora || ''}`.trim();
    tarjeta.querySelector('.pasajeros-pedido').textContent = pedido.pasajeros || 'No informado';
    tarjeta.querySelector('.telefono-pedido').textContent = telefono || 'No informado';
  }

  const acciones = tarjeta.querySelector('.acciones-pedido');
  if (!esPaqueteria && pedido.cancelacionSolicitada) {
    const solicitud = document.createElement('div');
    solicitud.className = 'solicitud-cancelacion';
    solicitud.textContent = 'El pasajero solicita cancelar el viaje';

    const accionesCancelacion = document.createElement('div');
    accionesCancelacion.className = 'acciones-cancelacion';
    ['Aprobar', 'Denegar'].forEach((textoBoton) => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = `btn ${textoBoton === 'Aprobar' ? 'btn-exito' : 'btn-peligro'}`;
      boton.textContent = textoBoton;
      boton.addEventListener('click', () => resolverCancelacionPedido(
        pedido.id,
        textoBoton === 'Aprobar',
        boton
      ));
      accionesCancelacion.appendChild(boton);
    });
    solicitud.appendChild(accionesCancelacion);
    acciones.appendChild(solicitud);
  }

  const estadoPedido = normalizarEstado(pedido.estado);
  const pedidoTomado = pedido.tipo === 'paquetes' || ['aceptado', 'en_curso'].includes(estadoPedido);
  if (telefono && pedidoTomado) {
    const whatsapp = document.createElement('a');
    whatsapp.className = 'btn btn-whatsapp';
    whatsapp.href = `https://wa.me/${telefono.replace(/\D/g, '')}`;
    whatsapp.target = '_blank';
    whatsapp.rel = 'noopener';
    whatsapp.textContent = pedido.tipo === 'paquetes'
      ? 'Contactar por WhatsApp'
      : 'Ir a WhatsApp';
    acciones.appendChild(whatsapp);
  }
  if (!esPaqueteria && pedidoTomado && tieneUbicacionGPS(pedido.ubicacionGPS)) {
    const ubicacion = pedido.ubicacionGPS;
    const mapa = document.createElement('a');
    mapa.className = 'btn btn-principal';
    mapa.href = `https://www.google.com/maps/search/?api=1&query=${ubicacion.latitud},${ubicacion.longitud}`;
    mapa.target = '_blank';
    mapa.rel = 'noopener';
    mapa.textContent = 'Ver ubicación del cliente';
    acciones.appendChild(mapa);
  }
  if (permiteTomar && pedido.tipo !== 'paquetes' && estadoPedido === 'pendiente') {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn btn-principal';
    boton.textContent = 'Tomar pedido';
    boton.addEventListener('click', () => tomarPedido(pedido.id, boton));
    acciones.appendChild(boton);
  } else if (estadoPedido === 'aceptado') {
    const botonIniciar = document.createElement('button');
    botonIniciar.type = 'button';
    botonIniciar.className = 'btn btn-principal';
    botonIniciar.textContent = 'Iniciar viaje';
    botonIniciar.addEventListener('click', () => iniciarViaje(pedido.id, botonIniciar));
    acciones.appendChild(botonIniciar);
  }
  return tarjeta;
}

function tieneUbicacionGPS(ubicacion) {
  return ubicacion && Number.isFinite(Number(ubicacion.latitud)) && Number.isFinite(Number(ubicacion.longitud));
}

async function resolverCancelacionPedido(idPedido, aprobar, boton) {
  boton.disabled = true;
  try {
    await runTransaction(db, async (transaccion) => {
      const referencia = doc(db, 'viajes', idPedido);
      const pedido = await transaccion.get(referencia);
      const datos = pedido.data() || {};
      if (!pedido.exists() || datos.choferId !== choferActual.uid || !datos.cancelacionSolicitada) {
        throw new Error('CANCELACION_NO_DISPONIBLE');
      }
      if (aprobar) {
        transaccion.delete(referencia);
      } else {
        transaccion.update(referencia, {
          cancelacionSolicitada: false,
          cancelacionResuelta: false,
          cancelacionDenegada: true,
          estado: datos.estado,
          fechaResolucionCancelacion: new Date()
        });
      }
    });
  } catch (error) {
    boton.disabled = false;
    if (error.message === 'CANCELACION_NO_DISPONIBLE') return;
    console.error('Error resolviendo cancelación del pedido:', error);
    alert('No se pudo resolver la solicitud de cancelación.');
  }
}

async function tomarPedido(idPedido, boton) {
  boton.disabled = true;
  try {
    await runTransaction(db, async (transaccion) => {
      const referencia = doc(db, 'viajes', idPedido);
      const pedido = await transaccion.get(referencia);
      if (!pedido.exists() || normalizarEstado(pedido.data().estado) !== 'pendiente') {
        throw new Error('PEDIDO_YA_TOMADO');
      }

      transaccion.update(referencia, {
        estado: 'aceptado',
        choferId: choferActual.uid,
        choferNombre: choferActual.displayName || choferActual.email || 'Chofer',
        fechaToma: new Date()
      });
    });
  } catch (error) {
    boton.disabled = false;
    if (error.message === 'PEDIDO_YA_TOMADO') {
      alert('Este pedido ya fue tomado por otro chofer.');
      return;
    }
    console.error('Error tomando pedido:', error);
    alert('No se pudo tomar el pedido. Intentá nuevamente.');
  }
}

async function iniciarViaje(idPedido, boton) {
  boton.disabled = true;
  try {
    await runTransaction(db, async (transaccion) => {
      const referencia = doc(db, 'viajes', idPedido);
      const pedido = await transaccion.get(referencia);
      const datos = pedido.data() || {};
      if (!pedido.exists() || datos.choferId !== choferActual.uid || normalizarEstado(datos.estado) !== 'aceptado') {
        throw new Error('PEDIDO_NO_DISPONIBLE');
      }
      transaccion.update(referencia, {
        estado: 'en_curso',
        fechaInicio: new Date()
      });
    });
  } catch (error) {
    boton.disabled = false;
    if (error.message === 'PEDIDO_NO_DISPONIBLE') {
      alert('El pedido ya no está disponible para iniciar.');
      return;
    }
    console.error('Error iniciando viaje:', error);
    alert('No se pudo iniciar el viaje. Intentá nuevamente.');
  }
}

async function terminarViaje(idPedido, boton) {
  boton.disabled = true;
  try {
    await runTransaction(db, async (transaccion) => {
      const referencia = doc(db, 'viajes', idPedido);
      const pedido = await transaccion.get(referencia);
      const datos = pedido.data() || {};
      if (!pedido.exists() || normalizarEstado(datos.estado) !== 'en_curso' || datos.choferId !== choferActual.uid) {
        throw new Error('VIAJE_NO_DISPONIBLE');
      }
      transaccion.update(referencia, {
        estado: 'finalizado',
        fechaFinalizacion: new Date()
      });
    });
  } catch (error) {
    boton.disabled = false;
    if (error.message === 'VIAJE_NO_DISPONIBLE') {
      alert('Este viaje ya no está disponible para finalizar.');
      return;
    }
    console.error('Error finalizando viaje:', error);
    alert('No se pudo finalizar el viaje. Intentá nuevamente.');
  }
}

function normalizarEstado(estado) {
  return (estado || '').toString().toLowerCase();
}

function mostrarError(id, mensaje) {
  return () => {
    const contenedor = document.getElementById(id);
    if (contenedor) contenedor.textContent = mensaje;
  };
}