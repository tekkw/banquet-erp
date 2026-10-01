# Banquet Board Widget V1

Android 홈 화면에서 오늘의 연회 운영 일정을 보여주는 Kotlin + Jetpack Glance 위젯입니다. 웹 ERP와 데이터를 복제하지 않고 Supabase의 `event_calendar_dates`, `event_orders`, `event_schedules`를 직접 읽습니다.

## 기능

- Small / Medium / Large 반응형 Glance 위젯
- `Asia/Seoul` 기준 오늘 일정
- 캐시 우선 표시 후 최신 데이터 갱신
- 1시간 WorkManager 자동 갱신 및 즉시 새로고침
- 오프라인 시 마지막 정상 캐시 유지
- 위젯/전체보기 클릭 시 `https://banquet-erp.vercel.app/board/` 열기
- Front, Check In/Out 제외 및 Firenze 식사 일정 규칙
- 같은 공간 및 `ALL` 관계만 고려한 다음 세팅 요약

## 완료 체크

원격 Supabase 프로젝트에서 `operation_board_items`가 PostgREST schema cache에 존재하지 않아(`PGRST205`) V1은 읽기 전용입니다. 임의의 완료 키나 별도 저장소를 만들지 않았습니다. 테이블과 RLS가 실제 운영 환경에 적용된 뒤 웹의 `item_key` 규칙을 그대로 사용해 추가할 수 있습니다.

## 빌드

JDK 17과 Android SDK 35가 필요합니다. `local.properties`에 아래 값을 설정합니다. anon key만 사용하며 service role key는 사용하지 않습니다.

```properties
sdk.dir=C\:\\Users\\you\\AppData\\Local\\Android\\Sdk
supabase.anonKey=YOUR_EXISTING_WEB_ANON_KEY
```

```powershell
.\gradlew.bat :app:assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`

