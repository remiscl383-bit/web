import { conectarEstadoUsuario } from './auth-simple.js';
import { auth, db } from './conexion-db.js';
import { collection, doc, getDoc, onSnapshot, query, runTransaction, where } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

let cancelarReservas;
let cancelarPedidos;

conectarEstadoUsuario((usuario) => {
  cancelarReservas?.();
  const contenedor = document.getElementById('contenedor-reservas-salidas');
  if (!contenedor) return;

  if (!usuario) {
    contenedor.textContent = 'Iniciá sesión para ver tus reservas.';
    return;
  }

  escucharPedidosParticulares(usuario.uid);

  const consulta = query(collection(db, 'reservas_salidas'), where('clienteId', '==', usuario.uid));
  cancelarReservas = onSnapshot(consulta, async (snapshot) => {
    const reservas = await Promise.all(snapshot.docs.map(async (documento) => {
      const reserva = { id: documento.id, ...documento.data() };
      const perfilChofer = reserva.choferId
        ? await getDoc(doc(db, 'usuarios', reserva.choferId))
        : null;
      const salidaProgramada = reserva.salidaId
        ? await getDoc(doc(db, 'salidas_programadas', reserva.salidaId))
        : null;
      const datosSalida = salidaProgramada?.exists() ? salidaProgramada.data() : null;
      return {
        ...reserva,
        chofer: perfilChofer?.exists() ? perfilChofer.data() : null,
        estadoViaje: datosSalida?.estado || reserva.estado
      };
    }));
    renderizarReservas(reservas.filter((reserva) => {
      const estadoReserva = (reserva.estado || '').toString().trim().toLowerCase();
      const estadoViaje = (reserva.estadoViaje || '').toString().trim().toLowerCase();
      return estadoReserva !== 'cancelada' && estadoViaje !== 'finalizado';
    }), contenedor);
  }, (error) => {
    console.error('Error escuchando reservas:', error);
    contenedor.textContent = 'No se pudieron cargar tus reservas.';
  });
});

function escucharPedidosParticulares(clienteId) {
  const contenedor = document.getElementById('contenedor-pedidos-particulares');
  if (!contenedor) return;

  cancelarPedidos?.();
  const consulta = query(collection(db, 'viajes'), where('clienteId', '==', clienteId));
  cancelarPedidos = onSnapshot(consulta, (snapshot) => {
    const pedidos = snapshot.docs
      .map((documento) => ({ id: documento.id, ...documento.data() }))
      .filter((pedido) => (pedido.tipo || '').toString().toLowerCase() === 'particular');
    renderizarPedidosParticulares(pedidos.filter((pedido) => {
      const estado = (pedido.estado || '').toString().trim().toLowerCase();
      return estado !== 'finalizado' && estado !== 'cancelada';
    }), contenedor);
  }, (error) => {
    console.error('Error escuchando pedidos particulares:', error);
    contenedor.textContent = 'No se pudieron cargar tus pedidos particulares.';
  });
}

function renderizarReservas(reservas, contenedor) {
  contenedor.innerHTML = '';
  if (!reservas.length) {
    contenedor.textContent = 'Todavía no tenés reservas de salidas programadas.';
    return;
  }

  reservas.forEach((reserva) => {
    const chofer = reserva.chofer || {};
    const nombreChofer = [chofer.nombre, chofer.apellido].filter(Boolean).join(' ') || 'Chofer no informado';
    const telefono = chofer.celular || chofer.telefono || chofer.whatsapp || '';
    const tarjeta = document.createElement('article');
    tarjeta.className = 'reserva-salida tarjeta';
    tarjeta.innerHTML = `
      <h3 class="reserva-ruta"></h3>
      <p>Fecha y hora: <strong class="reserva-fecha"></strong></p>
      <p>Asientos reservados: <strong class="reserva-asientos"></strong></p>
      <p>Total: <strong class="reserva-total"></strong></p>
      <p>Chofer: <strong class="reserva-chofer"></strong></p>
      <p class="reserva-estado"></p>
      <p class="reserva-aviso-cancelacion"></p>
      <div class="reserva-acciones"></div>
    `;
    tarjeta.querySelector('.reserva-ruta').textContent = `${reserva.origen || ''} -> ${reserva.destino || ''}`;
    tarjeta.querySelector('.reserva-fecha').textContent = reserva.fechaHora || '';
    tarjeta.querySelector('.reserva-asientos').textContent = reserva.asientos || 1;
    tarjeta.querySelector('.reserva-total').textContent = `$${reserva.precioTotal ?? 0}`;
    tarjeta.querySelector('.reserva-chofer').textContent = nombreChofer;
    const estadoVisible = reserva.estadoViaje || reserva.estado || 'pendiente';
    tarjeta.querySelector('.reserva-estado').textContent = `Estado: ${estadoVisible}`;
    const avisoCancelacion = tarjeta.querySelector('.reserva-aviso-cancelacion');
    const puedeSolicitarCancelacion = ['pendiente', 'en_curso'].includes(
      (reserva.estado || '').toString().trim().toLowerCase()
    );
    if (reserva.cancelacionSolicitada) {
      avisoCancelacion.textContent = 'Solicitud de cancelación enviada al chofer.';
    } else if (reserva.cancelacionDenegada) {
      avisoCancelacion.textContent = 'El chofer no aprobó la solicitud de cancelación.';
    } else if (puedeSolicitarCancelacion) {
      const botonCancelacion = document.createElement('button');
      botonCancelacion.type = 'button';
      botonCancelacion.className = 'btn btn-peligro';
      botonCancelacion.textContent = 'Solicitar cancelación del viaje';
      botonCancelacion.addEventListener('click', () => solicitarCancelacion(reserva.id, botonCancelacion, avisoCancelacion));
      tarjeta.querySelector('.reserva-acciones').appendChild(botonCancelacion);
    }

    if (telefono) {
      const whatsapp = document.createElement('a');
      whatsapp.className = 'btn btn-exito';
      whatsapp.href = `https://wa.me/${telefono.replace(/\D/g, '')}`;
      whatsapp.target = '_blank';
      whatsapp.rel = 'noopener';
      whatsapp.textContent = 'Contactar por WhatsApp';
      tarjeta.querySelector('.reserva-acciones').appendChild(whatsapp);
    }
    contenedor.appendChild(tarjeta);
  });
}

function renderizarPedidosParticulares(pedidos, contenedor) {
  contenedor.innerHTML = '';
  if (!pedidos.length) {
    contenedor.textContent = 'Todavía no tenés pedidos de remis particular.';
    return;
  }

  pedidos
    .sort((primero, segundo) => obtenerTiempo(segundo.fechaCreacion) - obtenerTiempo(primero.fechaCreacion))
    .forEach((pedido) => {
      const tarjeta = document.createElement('article');
      tarjeta.className = 'reserva-salida tarjeta pedido-particular';
      tarjeta.innerHTML = `
        <h3 class="reserva-ruta"></h3>
        <p>Fecha y hora: <strong class="reserva-fecha"></strong></p>
        <p>Pasajeros: <strong class="reserva-asientos"></strong></p>
        <p>Observaciones: <strong class="reserva-observaciones"></strong></p>
        <p class="reserva-estado"></p>
        <p class="reserva-aviso-cancelacion"></p>
        <div class="reserva-acciones"></div>
      `;
      tarjeta.querySelector('.reserva-ruta').textContent = `${pedido.origen || ''} -> ${pedido.destino || ''}`;
      tarjeta.querySelector('.reserva-fecha').textContent = `${pedido.fecha || ''} ${pedido.hora || ''}`.trim();
      tarjeta.querySelector('.reserva-asientos').textContent = pedido.pasajeros || 1;
      tarjeta.querySelector('.reserva-observaciones').textContent = pedido.observaciones || 'Sin observaciones';
      const estadoPedido = (pedido.estado || 'pendiente').toString().trim().toLowerCase();
      tarjeta.querySelector('.reserva-estado').textContent = `Estado: ${estadoPedido}`;
      const aviso = tarjeta.querySelector('.reserva-aviso-cancelacion');
      const acciones = tarjeta.querySelector('.reserva-acciones');
      if (pedido.cancelacionSolicitada) {
        aviso.textContent = 'Solicitud de cancelación enviada al chofer.';
      } else if (estadoPedido === 'pendiente') {
        const botonRetirar = document.createElement('button');
        botonRetirar.type = 'button';
        botonRetirar.className = 'btn btn-peligro';
        botonRetirar.textContent = 'Retirar pedido de remis particular';
        botonRetirar.addEventListener('click', () => retirarPedidoParticular(pedido.id, botonRetirar, aviso));
        acciones.appendChild(botonRetirar);
      } else if (['aceptado', 'en_curso'].includes(estadoPedido)) {
        const botonCancelar = document.createElement('button');
        botonCancelar.type = 'button';
        botonCancelar.className = 'btn btn-peligro';
        botonCancelar.textContent = 'Solicitar cancelación del viaje';
        botonCancelar.addEventListener('click', () => solicitarCancelacionPedido(pedido.id, botonCancelar, aviso));
        acciones.appendChild(botonCancelar);
      }
      contenedor.appendChild(tarjeta);
    });
}

function obtenerTiempo(fecha) {
  if (fecha?.toDate) return fecha.toDate().getTime();
  return fecha ? new Date(fecha).getTime() || 0 : 0;
}

async function retirarPedidoParticular(idPedido, boton, aviso) {
  if (!window.confirm('¿Querés retirar este pedido de remis particular?')) return;
  boton.disabled = true;
  try {
    await runTransaction(db, async (transaccion) => {
      const referencia = doc(db, 'viajes', idPedido);
      const pedido = await transaccion.get(referencia);
      const datos = pedido.data() || {};
      if (!pedido.exists() || datos.clienteId !== auth.currentUser?.uid ||
        datos.tipo !== 'particular' || (datos.estado || '').toLowerCase() !== 'pendiente') {
        throw new Error('PEDIDO_NO_DISPONIBLE');
      }
      transaccion.delete(referencia);
    });
    aviso.textContent = 'Pedido retirado correctamente.';
  } catch (error) {
    boton.disabled = false;
    aviso.textContent = error.message === 'PEDIDO_NO_DISPONIBLE'
      ? 'El pedido ya no se puede retirar.'
      : 'No se pudo retirar el pedido.';
  }
}

async function solicitarCancelacionPedido(idPedido, boton, aviso) {
  if (!window.confirm('¿Querés solicitar la cancelación de este viaje?')) return;
  boton.disabled = true;
  try {
    await runTransaction(db, async (transaccion) => {
      const referencia = doc(db, 'viajes', idPedido);
      const pedido = await transaccion.get(referencia);
      const datos = pedido.data() || {};
      if (!pedido.exists() || datos.clienteId !== auth.currentUser?.uid ||
        datos.tipo !== 'particular' || !['aceptado', 'en_curso'].includes((datos.estado || '').toLowerCase()) || datos.cancelacionSolicitada) {
        throw new Error('CANCELACION_NO_DISPONIBLE');
      }
      transaccion.update(referencia, {
        cancelacionSolicitada: true,
        fechaSolicitudCancelacion: new Date()
      });
    });
    aviso.textContent = 'Solicitud de cancelación enviada al chofer.';
  } catch (error) {
    boton.disabled = false;
    aviso.textContent = error.message === 'CANCELACION_NO_DISPONIBLE'
      ? 'El viaje ya no permite solicitar cancelación.'
      : 'No se pudo enviar la solicitud de cancelación.';
  }
}

async function solicitarCancelacion(idReserva, boton, aviso) {
  const confirmar = window.confirm(
    'Esta solicitud debe realizarse con anticipación. El chofer evaluará la cancelación, ya que la reserva implica una coordinación y un costo para el servicio. ¿Querés continuar?'
  );
  if (!confirmar) return;

  boton.disabled = true;
  try {
    await runTransaction(db, async (transaccion) => {
      const referencia = doc(db, 'reservas_salidas', idReserva);
      const reserva = await transaccion.get(referencia);
      const datos = reserva.data() || {};
      if (!reserva.exists() || datos.clienteId !== auth.currentUser?.uid ||
        !['pendiente', 'en_curso'].includes((datos.estado || '').toLowerCase()) || datos.cancelacionSolicitada) {
        throw new Error('CANCELACION_NO_DISPONIBLE');
      }
      transaccion.update(referencia, {
        cancelacionSolicitada: true,
        fechaSolicitudCancelacion: new Date()
      });
    });
    aviso.textContent = 'Solicitud de cancelación enviada al chofer.';
  } catch (error) {
    boton.disabled = false;
    if (error.message === 'CANCELACION_NO_DISPONIBLE') {
      aviso.textContent = 'La reserva ya no permite solicitar cancelación.';
      return;
    }
    console.error('Error solicitando cancelación:', error);
    aviso.textContent = 'No se pudo enviar la solicitud de cancelación.';
  }
}
