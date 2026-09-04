import { db, auth } from './conexion-db.js';
import { collection, getDoc, onSnapshot, doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { onAuthStateChanged, sendPasswordResetEmail, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, async (usuario) => {
    if (!usuario) {
      window.location.href = 'login-chofer.html';
      return;
    }

    const perfilSnapshot = await getDoc(doc(db, 'usuarios', usuario.uid));
    const perfil = perfilSnapshot.exists() ? perfilSnapshot.data() : null;
    if (!perfil || perfil.rol !== 'superadmin') {
      await signOut(auth);
      window.location.href = 'login-chofer.html';
      return;
    }

  const tbodyPendientes = document.getElementById('tbody-choferes-pendientes');
  const tbodyTodos = document.getElementById('tbody-choferes-todos');
  const tbodyClientes = document.getElementById('tbody-clientes');
  const btnLogout = document.getElementById('btn-logout');
  const usuarios = new Map();
  const modal = document.getElementById('modal-editar-usuario');
  const formularioEdicion = document.getElementById('form-editar-usuario');

  if (btnLogout) btnLogout.addEventListener('click', async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Error signOut', err);
    }
    window.location.href = 'login.html';
  });

  document.getElementById('cancelar-edicion')?.addEventListener('click', cerrarEdicion);
  document.getElementById('restablecer-contrasena')?.addEventListener('click', enviarRestablecimiento);
  formularioEdicion?.addEventListener('submit', guardarEdicion);
  configurarVentanas();
  configurarBusquedas();

  const usuariosCol = collection(db, 'usuarios');
  onSnapshot(usuariosCol, snapshot => {
    usuarios.clear();
    if (tbodyPendientes) tbodyPendientes.innerHTML = '';
    if (tbodyTodos) tbodyTodos.innerHTML = '';
    if (tbodyClientes) tbodyClientes.innerHTML = '';

    snapshot.forEach(snap => {
      const data = snap.data();
      const id = snap.id;
      if (!data) return;
      usuarios.set(id, data);

      const rol = (data.rol || '').toString().toLowerCase();
      const estado = (data.estado || '').toLowerCase();

      if (rol === 'chofer') {
        // Pending list
        if (estado === 'pendiente' && tbodyPendientes) {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${texto(obtenerNombre(data))}</td>
            <td>${texto(data.dni)}</td>
            <td>${texto(data.email)}</td>
            <td>${texto(data.whatsapp || data.celular)}</td>
            <td>${texto(data.vehiculo)}</td>
            <td>${texto(data.patente)}</td>
            <td><button class="btn-aprobar" data-id="${id}">Dar de alta</button> <button class="btn-editar" data-id="${id}">Editar</button></td>
          `;
          tbodyPendientes.appendChild(tr);
        }

        // All drivers list
        if (tbodyTodos) {
          const tr = document.createElement('tr');
          const estadoLabel = `<span class="badge ${estado === 'activo' ? 'badge-activo' : estado === 'suspendido' ? 'badge-suspendido' : 'badge-pendiente'}">${texto(estado || 'Sin estado')}</span>`;
          const acciones = estado === 'activo'
            ? `<button class="btn-suspender" data-id="${id}">Suspender</button>`
            : `<button class="btn-aprobar" data-id="${id}">Dar de alta</button>`;
          tr.innerHTML = `
            <td>${texto(obtenerNombre(data))}</td>
            <td>${texto(data.dni)}</td>
            <td>${texto(data.email)}</td>
            <td>${texto(data.whatsapp || data.celular)}</td>
            <td>${texto(data.vehiculo)}</td>
            <td>${texto(data.patente)}</td>
            <td>${estadoLabel} ${acciones}</td>
          `;
          tbodyTodos.appendChild(tr);
        }
      } else if (rol === 'cliente' || rol === 'pasajero') {
        if (tbodyClientes) {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${texto(data.nombre)}</td>
            <td>${texto(data.apellido)}</td>
            <td>${texto(data.email)}</td>
            <td>${texto(data.telefono || data.whatsapp)}</td>
            <td><span class="badge ${estado === 'activo' ? 'badge-activo' : estado === 'suspendido' ? 'badge-suspendido' : 'badge-pendiente'}">${texto(estado || 'Sin estado')}</span> <button class="btn-${estado === 'activo' ? 'suspender' : 'aprobar'}" data-id="${id}">${estado === 'activo' ? 'Suspender' : 'Activar'}</button> <button class="btn-editar" data-id="${id}">Editar</button></td>
          `;
          tbodyClientes.appendChild(tr);
        }
      }
    });

    // Attach event listeners for approve/suspend buttons (delegation)
    if (tbodyPendientes) {
      tbodyPendientes.querySelectorAll('.btn-aprobar').forEach(b => {
        b.addEventListener('click', () => aprobarChofer(b.dataset.id));
      });
      tbodyPendientes.querySelectorAll('.btn-editar').forEach(b => b.addEventListener('click', () => abrirEdicion(b.dataset.id)));
    }
    if (tbodyTodos) {
      tbodyTodos.querySelectorAll('.btn-aprobar').forEach(b => {
        b.addEventListener('click', () => aprobarChofer(b.dataset.id));
      });
      tbodyTodos.querySelectorAll('.btn-suspender').forEach(b => {
        b.addEventListener('click', () => suspenderChofer(b.dataset.id));
      });
      tbodyTodos.querySelectorAll('.btn-editar').forEach(b => b.addEventListener('click', () => abrirEdicion(b.dataset.id)));
    }
    if (tbodyClientes) {
      tbodyClientes.querySelectorAll('.btn-aprobar').forEach(b => b.addEventListener('click', () => cambiarEstado(b.dataset.id, 'activo')));
      tbodyClientes.querySelectorAll('.btn-suspender').forEach(b => b.addEventListener('click', () => cambiarEstado(b.dataset.id, 'suspendido')));
      tbodyClientes.querySelectorAll('.btn-editar').forEach(b => b.addEventListener('click', () => abrirEdicion(b.dataset.id)));
    }

  }, err => {
    console.error('Error listening usuarios:', err);
  });

  async function aprobarChofer(id) {
    try {
      await updateDoc(doc(db, 'usuarios', id), { estado: 'activo' });
    } catch (err) {
      console.error('Error aprobando chofer:', err);
      alert('No se pudo aprobar el chofer. Intentá nuevamente.');
    }
  }

  async function suspenderChofer(id) {
    await cambiarEstado(id, 'suspendido');
  }

  async function cambiarEstado(id, estado) {
    try {
      await updateDoc(doc(db, 'usuarios', id), { estado });
    } catch (err) {
      console.error('Error suspendiendo chofer:', err);
      alert('No se pudo cambiar el estado del usuario. Intentá nuevamente.');
    }
  }

  function abrirEdicion(id) {
    const data = usuarios.get(id);
    if (!data || !modal) return;
    document.getElementById('editar-id').value = id;
    ['nombre', 'apellido', 'dni', 'email', 'whatsapp', 'telefono', 'vehiculo', 'patente', 'direccion']
      .forEach((campo) => {
        document.getElementById(`editar-${campo}`).value = data[campo] || '';
      });
    document.getElementById('restablecer-contrasena').hidden = data.rol !== 'chofer';
    modal.classList.remove('oculto');
  }

  function cerrarEdicion() {
    modal?.classList.add('oculto');
  }

  async function guardarEdicion(event) {
    event.preventDefault();
    const id = document.getElementById('editar-id').value;
    const campos = ['nombre', 'apellido', 'dni', 'email', 'whatsapp', 'telefono', 'vehiculo', 'patente', 'direccion'];
    const cambios = Object.fromEntries(campos.map((campo) => [campo, document.getElementById(`editar-${campo}`).value.trim()]));
    try {
      await updateDoc(doc(db, 'usuarios', id), cambios);
      cerrarEdicion();
    } catch (err) {
      console.error('Error editando usuario:', err);
      alert('No se pudieron guardar los cambios. Intentá nuevamente.');
    }
  }

  async function enviarRestablecimiento() {
    const id = document.getElementById('editar-id').value;
    const data = usuarios.get(id);
    if (!data?.email) {
      alert('El chofer no tiene un correo electrónico registrado.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, data.email);
      alert('Se envió un correo para que el chofer establezca una nueva contraseña.');
    } catch (err) {
      console.error('Error enviando restablecimiento:', err);
      alert('No se pudo enviar el restablecimiento de contraseña.');
    }
  }

  function texto(valor) {
    return String(valor || '').replace(/[&<>"']/g, (caracter) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[caracter]));
  }

  function obtenerNombre(data) {
    const nombre = [data.nombre, data.apellido].filter(Boolean).join(' ').trim();
    return nombre || data.nombreCompleto || 'Sin nombre informado';
  }

  function configurarVentanas() {
    document.querySelectorAll('.btn-ventana').forEach((boton) => {
      boton.addEventListener('click', () => {
        const contenido = document.getElementById(boton.dataset.target);
        if (!contenido) return;
        const abierto = boton.getAttribute('aria-expanded') === 'true';
        contenido.hidden = abierto;
        boton.setAttribute('aria-expanded', String(!abierto));
        boton.textContent = abierto ? '↑' : '↓';
      });
    });
  }

  function configurarBusquedas() {
    const busquedas = [
      ['buscar-choferes', ['tbody-choferes-pendientes']],
      ['buscar-choferes-todos', ['tbody-choferes-todos']],
      ['buscar-clientes', ['tbody-clientes']]
    ];
    busquedas.forEach(([idBusqueda, idsTablas]) => {
      document.getElementById(idBusqueda)?.addEventListener('input', (event) => {
        const termino = event.target.value.trim().toLowerCase();
        idsTablas.forEach((idTabla) => {
          document.querySelectorAll(`#${idTabla} tr`).forEach((fila) => {
            const nombre = fila.cells[0]?.textContent.toLowerCase() || '';
            const apellido = fila.cells[1]?.textContent.toLowerCase() || '';
            fila.hidden = termino !== '' && !`${nombre} ${apellido}`.includes(termino);
          });
        });
      });
    });
  }

  });
});
