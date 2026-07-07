/*
 * 역할:
 * - Supabase REST API와 Storage 업로드처럼 외부 저장소와 통신하는 공통 함수를 담당한다.
 *
 * 왜 분리했는지:
 * - 저장/조회/업로드 코드는 화면 구성 코드와 성격이 다르다.
 * - 실무에서는 외부 서비스 연결 규칙을 한 파일에 모아야 인증 헤더, 오류 처리, 로그 방식을 일관되게 유지할 수 있다.
 *
 * 다른 파일과 어떻게 연결되는지:
 * - constants.js의 supabaseConfig를 받아 실제 Supabase 주소, anon key, bucket 이름을 사용한다.
 * - event-order-preview.html의 기존 앱 스크립트는 여기서 만든 함수를 받아 저장, 조회, 업로드 작업에 사용한다.
 *
 * 향후 추가 예정:
 * - DB 테이블별 저장 함수를 더 세분화하거나, 객실/식음/시설 ERP 모듈이 같은 저장 규칙을 재사용할 수 있다.
 */
(function registerBanquetErpStorage() {
  /*
   * 왜 이 함수를 만들었는지:
   * - storage.js가 전역 함수 이름을 직접 만들면 기존 앱 스크립트와 이름이 충돌할 수 있다.
   * - createStorageService는 필요한 설정만 받아 독립적인 저장 서비스를 만들어 준다.
   *
   * 왜 여기 있어야 하는지:
   * - Supabase 연결 설정을 클로저에 보관하면 다른 화면 로직이 anon key나 bucket 이름을 반복해서 다루지 않아도 된다.
   *
   * 실무 설계 이유:
   * - 외부 API 연결부를 서비스 객체로 만들면 테스트와 교체가 쉬워지고, 나중에 Supabase 외 저장소로 바뀌어도 영향 범위가 작아진다.
   */
  function createStorageService({ supabaseConfig }) {
    /*
     * 왜 이 함수를 만들었는지:
     * - Supabase REST 요청에 필요한 인증 헤더를 매번 직접 작성하지 않기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 헤더는 저장 계층의 규칙이며, 화면 코드가 알 필요 없는 반복 세부사항이다.
     *
     * 실무 설계 이유:
     * - 인증 방식이 바뀌거나 헤더가 추가될 때 한 곳만 수정하면 된다.
     */
    function supabaseHeaders(extra = {}) {
      return {
        apikey: supabaseConfig.anonKey,
        Authorization: `Bearer ${supabaseConfig.anonKey}`,
        ...extra,
      };
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - Supabase는 DELETE나 빈 응답에서 body가 없을 수 있으므로 무조건 JSON 파싱하면 오류가 난다.
     *
     * 왜 여기 있어야 하는지:
     * - 응답 파싱은 모든 Supabase 요청이 공유하는 저장 계층의 공통 규칙이다.
     *
     * 실무 설계 이유:
     * - API 응답 형식이 달라도 공통 파서가 흡수하면 업무 로직은 성공/실패만 다루면 된다.
     */
    async function parseSupabaseResponse(response) {
      const text = await response.text();
      if (!text.trim()) return null;
      try {
        return JSON.parse(text);
      } catch (error) {
        console.error("Supabase response JSON parse error:", error, text);
        throw new Error(`Supabase 응답을 읽지 못했습니다. ${error.message}`);
      }
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - Supabase 오류 응답의 message, details, hint, code를 보존해 화면과 콘솔에 실제 원인을 보여주기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 오류 해석은 요청 함수와 함께 있어야 저장 단계별 실패 원인을 일관되게 추적할 수 있다.
     *
     * 실무 설계 이유:
     * - 운영 도구에서는 "저장 실패"보다 Supabase가 준 정확한 오류 메시지가 문제 해결 시간을 크게 줄인다.
     */
    async function supabaseErrorFromResponse(response, fallbackMessage) {
      const body = await parseSupabaseResponse(response).catch(() => null);
      const message = body?.message || body?.error_description || body?.error || response.statusText || fallbackMessage;
      const error = new Error(message);
      error.status = response.status;
      error.details = body?.details || "";
      error.hint = body?.hint || "";
      error.code = body?.code || "";
      error.supabaseBody = body;
      return error;
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - DB 요청의 URL 조립, 헤더 적용, 오류 확인, 응답 파싱을 한 번에 처리하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - event_orders, schedules, assets 같은 여러 기능이 같은 Supabase REST 규칙을 사용한다.
     *
     * 실무 설계 이유:
     * - 네트워크 요청 코드를 중복 작성하면 오류 처리 방식이 기능마다 달라져 유지보수가 어려워진다.
     */
    async function supabaseRequest(path, options = {}) {
      const response = await fetch(`${supabaseConfig.url}/rest/v1/${path}`, {
        ...options,
        headers: supabaseHeaders(options.headers),
      });
      if (!response.ok) {
        const error = await supabaseErrorFromResponse(response, "Supabase Database error");
        console.error("Supabase Database request 실패:", error);
        throw error;
      }
      return parseSupabaseResponse(response);
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 저장 단계별 시작/성공/실패 로그를 같은 형식으로 남기기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 로그 형식은 Supabase 요청 실행부와 가까이 있어야 누락 없이 적용된다.
     *
     * 실무 설계 이유:
     * - 여러 테이블에 순서대로 저장하는 업무에서는 어느 단계에서 실패했는지 바로 보여야 한다.
     */
    async function loggedSupabaseRequest(stepName, path, options = {}) {
      console.log(`${stepName} 시작`);
      try {
        const data = await supabaseRequest(path, options);
        console.log(`${stepName} 성공`, data || "");
        return data;
      } catch (error) {
        console.error(`${stepName} 실패:`, error);
        throw error;
      }
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 여러 줄 insert에서 빈 배열을 안전하게 건너뛰고, 실제 저장할 때만 요청을 보내기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - schedule/items/notes처럼 반복 저장되는 데이터가 모두 같은 insert 규칙을 쓴다.
     *
     * 실무 설계 이유:
     * - 빈 배열 insert는 DB 오류나 불필요한 요청이 될 수 있으므로 저장 계층에서 공통 처리하는 편이 안전하다.
     */
    async function insertRowsWithLog(stepName, tableName, rows, prefer = "") {
      if (!rows.length) {
        console.log(`${stepName} 시작: 저장할 데이터 없음`);
        console.log(`${stepName} 성공: 저장할 데이터 없음`);
        return null;
      }
      const headers = { "Content-Type": "application/json" };
      if (prefer) headers.Prefer = prefer;
      return loggedSupabaseRequest(stepName, tableName, {
        method: "POST",
        headers,
        body: JSON.stringify(rows),
      });
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 원본 이벤오더 엑셀을 Supabase Storage에 업로드하고, DB에 저장할 publicUrl과 storagePath를 반환하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 파일 업로드는 화면 상태가 아니라 저장소와 직접 통신하는 작업이다.
     *
     * 실무 설계 이유:
     * - 원본 파일 보관 규칙을 한 곳에 두면 향후 버킷명, 파일명 정책, private URL 방식으로 바뀌어도 수정 범위가 작다.
     */
    async function uploadOriginalFile(file) {
      const storagePath = `event_${Date.now()}.xlsx`;
      const originalFilename = file.name;
      const encodedPath = encodeURIComponent(storagePath);
      const uploadUrl = `${supabaseConfig.url}/storage/v1/object/${supabaseConfig.bucket}/${encodedPath}`;

      console.log("storagePath:", storagePath);
      console.log("originalFilename:", originalFilename);
      console.log("storage upload 시작:", storagePath);

      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          apikey: supabaseConfig.anonKey,
          Authorization: `Bearer ${supabaseConfig.anonKey}`,
          "Content-Type": file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "x-upsert": "false",
        },
        body: file,
      });

      if (!response.ok) {
        const error = await supabaseErrorFromResponse(response, "Storage upload failed");
        console.error("storage upload 실패:", error);
        throw error;
      }

      console.log("storage upload 성공:", storagePath);

      return {
        storagePath,
        publicUrl: buildPublicStorageUrl(storagePath),
      };
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 저장된 원본 엑셀을 보기/다운로드할 때 사용할 public URL을 같은 방식으로 만들기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - URL 생성 규칙은 Storage bucket 경로 정책과 함께 관리되어야 한다.
     *
     * 실무 설계 이유:
     * - 파일 열기 기능이 늘어나도 URL 인코딩과 bucket 경로 실수를 줄일 수 있다.
     */
    function buildPublicStorageUrl(storagePath) {
      const encodedPath = encodeURIComponent(storagePath);
      return `${supabaseConfig.url}/storage/v1/object/public/${supabaseConfig.bucket}/${encodedPath}`;
    }

    return {
      supabaseHeaders,
      parseSupabaseResponse,
      supabaseErrorFromResponse,
      supabaseRequest,
      loggedSupabaseRequest,
      insertRowsWithLog,
      uploadOriginalFile,
      buildPublicStorageUrl,
    };
  }

  window.BANQUET_ERP_STORAGE = {
    createStorageService,
  };
})();
