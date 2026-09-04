import { conectarEstadoUsuario } from './auth-simple.js';
import { auth, db } from './conexion-db.js';
import { collection, deleteDoc, doc, getDoc, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

let cancelarHistorial;
let cancelarPedidos;
let reservasHistorial = [];
let pedidosHistorial = [];
let enviosHistorial = [];

conectarEstadoUsuario((usuario) => {
  cancelarHistorial?.();
  cancelarPedidos?.();
  const contenedor = document.getElementById('contenedor-historial');
  const contenedorEnvios = document.getElementById('contenedor-envios');
  if (!contenedor) return;
  if (!usuario) {
    contenedor.textContent = 'Iniciá sesión para ver tu historial.';
    return;
  }

  const consulta = query(collection(db, 'reservas_salidas'), where('clienteId', '==', usuario.uid));
  cancelarHistorial = onSnapshot(consulta, (snapshot) => {
    reservasHistorial = snapshot.docs.map((documento) => documento.data());
    actualizarHistorial(contenedor);
  }, () => {
    contenedor.textContent = 'No se pudo cargar el historial.';
  });

  const consultaPedidos = query(collection(db, 'viajes'), where('clienteId', '==', usuario.uid));
  cancelarPedidos = onSnapshot(consultaPedidos, (snapshot) => {
    pedidosHistorial = snapshot.docs
      .map((documento) => ({ id: documento.id, ...documento.data() }))
      .filter((pedido) =>
        (pedido.tipo || '').toString().trim().toLowerCase() === 'particular' &&
        (pedido.estado || '').toString().trim().toLowerCase() === 'finalizado'
      );
    actualizarHistorial(contenedor);
    enviosHistorial = snapshot.docs
      .map((documento) => ({ id: documento.id, ...documento.data() }))
      .filter((pedido) => (pedido.tipo || '').toString().trim().toLowerCase() === 'paquetes');
    renderizarEnvios(enviosHistorial, contenedorEnvios);
  }, () => {
    contenedor.textContent = 'No se pudo cargar el historial.';
  });
});

async function actualizarHistorial(contenedor) {
  const viajes = await Promise.all(reservasHistorial.map(async (datosReserva) => {
      const reserva = { ...datosReserva };
      const salida = reserva.salidaId
        ? await getDoc(doc(db, 'salidas_programadas', reserva.salidaId))
        : null;
      const datosSalida = salida?.exists() ? salida.data() : null;
      const perfilChofer = datosSalida?.choferId
        ? await getDoc(doc(db, 'usuarios', datosSalida.choferId))
        : null;
      return {
        ...reserva,
        datosSalida,
        datosChofer: perfilChofer?.exists() ? perfilChofer.data() : null
      };
    }));
  renderizarHistorial([...viajes, ...pedidosHistorial].filter((viaje) => {
      const estadoReserva = (viaje.estado || '').toString().trim().toLowerCase();
      const estadoSalida = (viaje.datosSalida?.estado || '').toString().trim().toLowerCase();
      return estadoReserva === 'cancelada' || estadoReserva === 'finalizado' || estadoSalida === 'finalizado';
    }), contenedor);
}

function renderizarHistorial(viajes, contenedor) {
  contenedor.innerHTML = '';
  if (!viajes.length) {
    contenedor.textContent = 'Todavía no tenés viajes finalizados.';
    return;
  }

  viajes.forEach((viaje) => {
    const salida = viaje.datosSalida || {};
    const chofer = viaje.datosChofer || {};
    const nombreChofer = [chofer.nombre, chofer.apellido]
      .filter(Boolean).join(' ') || viaje.choferNombre || 'Chofer no informado';
    const tarjeta = document.createElement('article');
    tarjeta.className = 'reserva-salida tarjeta tarjeta-historial';
    tarjeta.innerHTML = `
      <div class="historial-ruta">
        <span class="historial-icono">✓</span>
        <h3></h3>
      </div>
      <div class="historial-detalles">
        <p><span>Fecha y hora</span><strong class="fecha"></strong></p>
        <p><span>Asientos</span><strong class="asientos"></strong></p>
        <p><span>Total abonado</span><strong class="total"></strong></p>
      </div>
      <div class="historial-pie">
        <p>Chofer: <strong class="chofer"></strong></p>
        <span class="reserva-estado"></span>
      </div>
    `;
    tarjeta.querySelector('h3').textContent = `${salida.origen || viaje.origen || ''} -> ${salida.destino || viaje.destino || ''}`;
    tarjeta.querySelector('.fecha').textContent = salida.fechaHora || viaje.fechaHora ||
      `${viaje.fecha || ''} ${viaje.hora || ''}`.trim();
    tarjeta.querySelector('.asientos').textContent = viaje.asientos || 1;
    tarjeta.querySelector('.total').textContent = `$${viaje.precioTotal ?? 0}`;
    tarjeta.querySelector('.chofer').textContent = nombreChofer;
    tarjeta.querySelector('.reserva-estado').textContent =
      (viaje.estado || '').toString().trim().toLowerCase() === 'cancelada'
        ? 'Viaje cancelado'
        : 'Viaje finalizado';
    contenedor.appendChild(tarjeta);
  });
}

function renderizarEnvios(envios, contenedor) {
  if (!contenedor) return;
  contenedor.innerHTML = '';
  if (!envios.length) {
    contenedor.textContent = 'Todavía no tenés solicitudes de envíos.';
    return;
  }

  envios
    .sort((primero, segundo) => obtenerTiempo(segundo.fechaCreacion) - obtenerTiempo(primero.fechaCreacion))
    .forEach((envio) => {
      const tarjeta = document.createElement('article');
      tarjeta.className = 'tarjeta-envio';
      tarjeta.innerHTML = `
        <div class="historial-ruta"><span class="historial-icono">↗</span><h3></h3></div>
        <p><strong>Remitente:</strong> <span class="remitente"></span></p>
        <p><strong>Destinatario:</strong> <span class="destinatario"></span></p>
        <p><strong>Paquete:</strong> <span class="descripcion"></span></p>
        <span class="reserva-estado"></span>
        <div class="envio-acciones"></div>
      `;
      tarjeta.querySelector('h3').textContent = `${envio.origen || ''} -> ${envio.destino || ''}`;
      tarjeta.querySelector('.remitente').textContent = envio.remitente || 'No informado';
      tarjeta.querySelector('.destinatario').textContent = envio.destinatario || 'No informado';
      tarjeta.querySelector('.descripcion').textContent = envio.descripcion || 'No informado';
      tarjeta.querySelector('.reserva-estado').textContent = `Estado: ${envio.estado || 'pendiente'}`;
      if ((envio.estado || '').toString().trim().toLowerCase() === 'pendiente') {
        const botonRetirar = document.createElement('button');
        botonRetirar.type = 'button';
        botonRetirar.className = 'btn btn-peligro';
        botonRetirar.textContent = 'Retirar publicación';
        botonRetirar.addEventListener('click', () => retirarPublicacion(envio.id, botonRetirar));
        tarjeta.querySelector('.envio-acciones').appendChild(botonRetirar);
      }
      contenedor.appendChild(tarjeta);
    });
}

function obtenerTiempo(fecha) {
  if (fecha?.toDate) return fecha.toDate().getTime();
  return fecha ? new Date(fecha).getTime() || 0 : 0;
}

async function retirarPublicacion(idEnvio, boton) {
  if (!window.confirm('¿Querés retirar esta publicación de paquetería?')) return;
  boton.disabled = true;
  try {
    const referencia = doc(db, 'viajes', idEnvio);
    const envio = await getDoc(referencia);
    const datos = envio.data() || {};
    if (!envio.exists() || datos.clienteId !== auth.currentUser?.uid ||
      datos.tipo !== 'paquetes' || (datos.estado || '').toLowerCase() !== 'pendiente') {
      throw new Error('ENVIO_NO_DISPONIBLE');
    }
    await deleteDoc(referencia);
  } catch (error) {
    boton.disabled = false;
    alert(error.message === 'ENVIO_NO_DISPONIBLE'
      ? 'La publicación ya no se puede retirar.'
      : 'No se pudo retirar la publicación. Intentá nuevamente.');
  }
}
