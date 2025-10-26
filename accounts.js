// accounts.js — общий модуль аккаунтов для HexaShop.
// Безопасно: в куки кладём только несекретные данные для UI.

(function (global) {
  function setCookie(name, value, days = 30) {
    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
  }
  function delCookie(name) {
    document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
  }

  async function ensureProfileIfMissing(sb) {
    const { data: { session } } = await sb.auth.getSession();
    const user = session?.user;
    if (!user) return;
    const { data: pr } = await sb.from('profiles').select('id').eq('id', user.id).maybeSingle();
    if (!pr) {
      try {
        await sb.rpc('upsert_my_profile', {
          p_username: user.user_metadata?.username || '',
          p_display_name: user.user_metadata?.full_name || user.email || ''
        });
      } catch (e) {
        console.warn('upsert_my_profile error:', e);
      }
    }
  }

  async function syncUiCookies(sb) {
    const { data: { session } } = await sb.auth.getSession();
    const user = session?.user;
    if (user) {
      setCookie('hexashop_logged', '1', 30);
      setCookie('hexashop_uid', user.id, 30);
      const name = user.user_metadata?.full_name || user.email || '';
      setCookie('hexashop_name', name, 30);
    } else {
      delCookie('hexashop_logged');
      delCookie('hexashop_uid');
      delCookie('hexashop_name');
    }
  }

  // Главная функция — вешаем шапку и следим за сессией
  function mountHeaderAuth(sb, backPage) {
    const link = document.getElementById('authLink');   // <a id="authLink" href="auth.html">
    const actions = document.getElementById('hdrActions');
    if (!link || !actions) return;

    link.addEventListener('click', () => {
      if (link.getAttribute('href') === 'auth.html') {
        const here = backPage || (location.pathname.split('/').pop() || 'index.html');
        localStorage.setItem('postLoginRedirect', here);
      }
    });

    async function refreshHeader() {
      const { data: { session } } = await sb.auth.getSession();
      const user = session?.user;

      // гарантируем профиль + куки для UI
      if (user) await ensureProfileIfMissing(sb);
      await syncUiCookies(sb);

      // прибираем старую кнопку "Выйти"
      const old = actions.querySelector('button[data-logout]');
      if (old) old.remove();

      if (user) {
        link.textContent = 'Профиль';
        link.setAttribute('href', 'profile.html');

        const out = document.createElement('button');
        out.type = 'button';
        out.className = 'btn';
        out.dataset.logout = '1';
        out.textContent = 'Выйти';
        out.onclick = async () => {
          await sb.auth.signOut();
          delCookie('hexashop_logged');
          delCookie('hexashop_uid');
          delCookie('hexashop_name');
          location.reload();
        };
        actions.appendChild(out);
      } else {
        link.textContent = 'Войти';
        link.setAttribute('href', 'auth.html');
      }
    }

    // 1) первичная отрисовка
    refreshHeader();

    // 2) подписка: если сессия появилась/изменилась — перерисовать
    sb.auth.onAuthStateChange((_event) => {
      refreshHeader();
    });

    // 3) подстраховка: ещё раз через секунду (если браузер лениво восстанавливает сессию)
    setTimeout(refreshHeader, 1000);
  }

  global.Accounts = { mountHeaderAuth };
})(window);
