(() => {
  const temaGuardado = localStorage.getItem('remiscl-tema');
  const temaClaro = temaGuardado === 'claro';
  const raiz = document.documentElement;

  document.body.classList.toggle('tema-claro', temaClaro);
  raiz.classList.toggle('tema-claro', temaClaro);

  function iniciarSelectorTema() {
    const boton = document.getElementById('btn-tema');
    if (!boton) return;

    actualizarBoton(boton);
    boton.addEventListener('click', () => {
      const claro = document.body.classList.toggle('tema-claro');
      raiz.classList.toggle('tema-claro', claro);
      localStorage.setItem('remiscl-tema', claro ? 'claro' : 'oscuro');
      actualizarBoton(boton);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarSelectorTema, { once: true });
  } else {
    iniciarSelectorTema();
  }

  function actualizarBoton(boton) {
    const estaClaro = document.body.classList.contains('tema-claro');
    boton.textContent = estaClaro ? '☾' : '☼';
    boton.setAttribute('aria-label', estaClaro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
    boton.title = estaClaro ? 'Tema oscuro' : 'Tema claro';
  }
})();
