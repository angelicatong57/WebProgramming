(function () {
  async function fetchMe() {
    try {
      const response = await fetch('/api/auth/me');
      if (!response.ok) {
        return { authenticated: false, user: null };
      }
      return await response.json();
    } catch (error) {
      return { authenticated: false, user: null };
    }
  }

  function renderAuthStatus(payload) {
    const userSlot = document.getElementById('auth-status');
    if (!userSlot) return;

    const linksSlot = document.getElementById('auth-links');
    const mountLinks = linksSlot || userSlot;

    const authenticated = payload && payload.authenticated && payload.user;
    const displayName = authenticated
      ? (payload.user.user_name || payload.user.email)
      : 'guest';

    userSlot.innerHTML = '';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'auth-user-label';
    labelSpan.textContent = 'User: ';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'auth-user-name';
    nameSpan.textContent = displayName;
    userSlot.appendChild(labelSpan);
    userSlot.appendChild(nameSpan);

    if (linksSlot) {
      linksSlot.innerHTML = '';
    }

    if (authenticated) {
      const logoutLink = document.createElement('a');
      logoutLink.href = '#';
      logoutLink.textContent = 'Logout';
      logoutLink.addEventListener('click', async function (event) {
        event.preventDefault();
        await window.csrfFetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/home.html';
      });
      mountLinks.appendChild(logoutLink);

      const changePwdLink = document.createElement('a');
      changePwdLink.href = '/change-password.html';
      changePwdLink.textContent = 'Change Password';
      mountLinks.appendChild(changePwdLink);

      const myOrdersLink = document.createElement('a');
      myOrdersLink.href = '/member.html';
      myOrdersLink.textContent = 'My Orders';
      mountLinks.appendChild(myOrdersLink);
    } else {
      const loginLink = document.createElement('a');
      loginLink.href = '/login.html';
      loginLink.textContent = 'Login';
      mountLinks.appendChild(loginLink);

      const registerLink = document.createElement('a');
      registerLink.href = '/register.html';
      registerLink.textContent = 'Register';
      mountLinks.appendChild(registerLink);
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    const me = await fetchMe();
    renderAuthStatus(me);
  });
})();
