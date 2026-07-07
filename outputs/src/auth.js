/*
 * 역할:
 * - 내부 아이디/비밀번호 로그인, 로그아웃, 로그인 상태 복원을 담당한다.
 *
 * 왜 분리했는지:
 * - 인증 코드는 ERP의 모든 화면 앞단에서 공통으로 쓰이는 출입문 역할을 한다.
 * - 캘린더, 자산관리, 엑셀 업로드 코드 안에 로그인 처리가 섞이면 권한 변경이나 계정 정책 수정이 어려워진다.
 *
 * 다른 파일과 어떻게 연결되는지:
 * - constants.js의 계정 목록과 localStorage key를 받아 로그인 가능 여부를 확인한다.
 * - event-order-preview.html은 로그인 성공 후 캘린더/자산 데이터를 불러오는 콜백만 넘겨준다.
 *
 * 향후 추가 예정:
 * - Supabase Auth, 부서별 권한, 감사 로그, 비밀번호 변경 같은 호텔 ERP 공통 인증 기능으로 확장할 수 있다.
 */
(function registerBanquetErpAuth() {
  /*
   * 왜 이 함수를 만들었는지:
   * - 인증 상태를 다루는 함수들을 하나의 컨트롤러로 묶어 앱 스크립트가 필요한 메서드만 사용하게 하기 위해 만들었다.
   *
   * 왜 여기 있어야 하는지:
   * - 로그인 화면 표시, 현재 사용자 표시, localStorage 복원은 모두 인증 모듈의 책임이다.
   *
   * 실무 설계 이유:
   * - 인증 모듈은 캘린더나 자산관리의 내부 구현을 몰라야 한다. 대신 로그인 성공/로그아웃 콜백으로 앱 쪽 흐름을 연결한다.
   */
  function createAuthController({ authStorageKey, loginAccounts, elements, state, callbacks = {} }) {
    const {
      loginScreen,
      hotelTopbar,
      appMain,
      mobileBottomNav,
      currentUserBadge,
      loginForm,
      loginIdInput,
      loginPasswordInput,
      loginError,
    } = elements;

    /*
     * 왜 이 함수를 만들었는지:
     * - 새로고침 후 localStorage에 남은 로그인 정보를 검증된 계정 정보로 복원하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 저장된 사용자를 믿기 전에 현재 앱이 허용하는 계정 목록과 다시 대조하는 일은 인증 책임이다.
     *
     * 실무 설계 이유:
     * - localStorage 값은 사용자가 수정할 수 있으므로, 화면에 적용하기 전 반드시 서버나 계정 정책 기준으로 재검증해야 한다.
     */
    function readStoredUser() {
      try {
        const stored = JSON.parse(localStorage.getItem(authStorageKey) || "null");
        if (!stored?.id || !stored?.role) return null;
        const account = loginAccounts.find((item) => item.id === stored.id && item.role === stored.role);
        return account ? { id: account.id, role: account.role, label: account.label } : null;
      } catch {
        return null;
      }
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 로그인 성공 후 새로고침해도 같은 사용자를 유지하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 인증 저장 형식은 인증 모듈이 소유해야 다른 기능이 저장 구조에 의존하지 않는다.
     *
     * 실무 설계 이유:
     * - 나중에 토큰 방식이나 세션 만료 시간이 추가되어도 이 함수만 중심으로 변경할 수 있다.
     */
    function persistCurrentUser(user) {
      localStorage.setItem(authStorageKey, JSON.stringify({ id: user.id, role: user.role, label: user.label }));
    }

    function clearStoredUser() {
      localStorage.removeItem(authStorageKey);
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 로그인 여부에 따라 로그인 화면과 ERP 본문을 동시에 전환하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 화면 접근 제어는 인증 상태와 직접 연결되어 있다.
     *
     * 실무 설계 이유:
     * - 접근 제어 UI가 흩어져 있으면 로그아웃 후 일부 패널이 남는 문제가 생기기 쉽다.
     */
    function setAppVisibility(isLoggedIn) {
      loginScreen.hidden = isLoggedIn;
      hotelTopbar.hidden = !isLoggedIn;
      appMain.hidden = !isLoggedIn;
      mobileBottomNav.hidden = !isLoggedIn;
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 상단 헤더에 현재 로그인 사용자를 항상 같은 형식으로 표시하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 사용자 표시는 인증 상태를 반영하는 UI이므로 auth.js가 관리한다.
     *
     * 실무 설계 이유:
     * - 여러 화면에서 같은 사용자 정보를 보여줄 때 표시 규칙을 한곳에 두면 일관성이 유지된다.
     */
    function updateCurrentUserBadge() {
      const currentUser = state.getCurrentUser();
      if (!currentUser) {
        currentUserBadge.textContent = "로그인 필요";
        return;
      }
      currentUserBadge.textContent = `${currentUser.label} · ${currentUser.id}`;
    }

    function focusLoginInput() {
      loginIdInput.focus();
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 자산관리처럼 관리자만 가능한 기능에서 현재 사용자의 권한을 간단히 확인하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - role 판정 규칙은 인증 모듈에 있어야 기능별 코드가 role 문자열을 반복해서 직접 다루지 않는다.
     *
     * 실무 설계 이유:
     * - 권한 체계가 admin/user에서 더 세분화되어도 이 함수의 내부 규칙을 바꾸면 된다.
     */
    function isAdminUser() {
      return state.getCurrentUser()?.role === "admin";
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 로그인 폼 제출 시 계정을 검증하고 앱 시작 흐름으로 넘기기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 아이디/비밀번호 비교와 로그인 오류 메시지는 인증 모듈의 핵심 책임이다.
     *
     * 실무 설계 이유:
     * - 이벤트 핸들러를 모듈 안에 두면 로그인 방식이 바뀌어도 HTML 앱 스크립트 수정이 작아진다.
     */
    function handleLogin(event) {
      event.preventDefault();
      const id = loginIdInput.value.trim();
      const password = loginPasswordInput.value;
      const account = loginAccounts.find((item) => item.id === id && item.password === password);
      if (!account) {
        loginError.textContent = "아이디 또는 비밀번호가 올바르지 않습니다.";
        return;
      }
      const user = { id: account.id, role: account.role, label: account.label };
      state.setCurrentUser(user);
      persistCurrentUser(user);
      loginError.textContent = "";
      loginForm.reset();
      callbacks.onAuthenticated?.();
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 로그아웃 시 사용자 정보와 화면 상태를 한 번에 초기화하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 세션 제거와 로그인 화면 복귀는 인증 모듈이 책임지는 흐름이다.
     *
     * 실무 설계 이유:
     * - 로그아웃 후 민감한 업무 화면이 남지 않게 하려면 인증 모듈이 화면 전환까지 확실히 처리해야 한다.
     */
    function handleLogout() {
      state.setCurrentUser(null);
      clearStoredUser();
      callbacks.onLoggedOut?.();
      setAppVisibility(false);
      updateCurrentUserBadge();
      focusLoginInput();
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 페이지가 열릴 때 저장된 로그인 정보를 읽고 ERP 시작 여부를 결정하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 앱의 첫 진입 판단은 인증 상태에서 출발한다.
     *
     * 실무 설계 이유:
     * - 초기화 진입점을 인증 모듈에 두면 로그인 전 접근 차단과 자동 복원이 한 흐름으로 관리된다.
     */
    function initialize() {
      const storedUser = readStoredUser();
      state.setCurrentUser(storedUser);
      if (!storedUser) {
        setAppVisibility(false);
        updateCurrentUserBadge();
        focusLoginInput();
        return;
      }
      callbacks.onAuthenticated?.();
    }

    return {
      handleLogin,
      handleLogout,
      initialize,
      isAdminUser,
      setAppVisibility,
      updateCurrentUserBadge,
      readStoredUser,
      persistCurrentUser,
    };
  }

  window.BANQUET_ERP_AUTH = {
    createAuthController,
  };
})();
